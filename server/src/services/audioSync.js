/**
 * audioSync.js — Server-side audio fingerprinting for a single stream.
 *
 * Pipeline:
 *   ytdl (audio-only container) → fluent-ffmpeg (decode → s16le PCM) →
 *   FFT per 1-second window → top-10 frequency peaks → rolling fingerprint
 *
 * Cross-correlation compares two fingerprint arrays to estimate the time
 * offset (in seconds) between two streams. Called by syncManager every 4s.
 *
 * Usage:
 *   const job = new AudioSyncJob(streamId, youtubeUrl, onFingerprint, onError);
 *   job.start();
 *   job.stop();
 */

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import ytdl from '@distube/ytdl-core';
import fft from 'fft-js';

// Point fluent-ffmpeg at the bundled static binary — no system install needed
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const { fft: FFT } = fft;

// ─── Constants ───────────────────────────────────────────────────────────────

const SAMPLE_RATE             = 16000; // Hz — downsample for efficiency; still fine for fingerprinting
const CHANNELS                = 1;     // mono
const BYTES_PER_SAMPLE        = 2;     // s16le = 16-bit signed little-endian
const WINDOW_SECONDS          = 1;
const WINDOW_SAMPLES          = SAMPLE_RATE * WINDOW_SECONDS;
const WINDOW_BYTES            = WINDOW_SAMPLES * BYTES_PER_SAMPLE;
const FFT_SIZE                = 4096;  // power-of-2, ≤ WINDOW_SAMPLES
const TOP_PEAKS               = 10;    // frequency peaks to keep per window
const MAX_FINGERPRINT_WINDOWS = 60;    // 60s rolling history

// ─── DSP helpers ─────────────────────────────────────────────────────────────

/**
 * Convert s16le Buffer → Float32Array normalised to [-1, 1].
 * This is now receiving real decoded PCM so every value is a genuine audio sample.
 */
function pcmToFloat32(buffer) {
  const samples = new Float32Array(buffer.length / BYTES_PER_SAMPLE);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(i * BYTES_PER_SAMPLE) / 32768;
  }
  return samples;
}

/**
 * Apply a Hann window to reduce spectral leakage before FFT.
 */
function applyHannWindow(samples) {
  const N = samples.length;
  for (let i = 0; i < N; i++) {
    samples[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return samples;
}

/**
 * Extract the top-N peak frequency bin indices from a magnitude spectrum.
 * Returns a sorted array of bin indices (ascending) for deterministic comparison.
 */
function extractPeaks(magnitudes, topN) {
  return magnitudes
    .map((m, i) => [m, i])
    .sort((a, b) => b[0] - a[0])
    .slice(0, topN)
    .map(([, i]) => i)
    .sort((a, b) => a - b);
}

/**
 * Fingerprint a 1-second window of real PCM samples.
 * Returns the top-N frequency bin indices as the fingerprint for this window.
 */
function fingerprintWindow(float32Window) {
  // Apply Hann window before FFT to reduce spectral leakage
  const windowed = applyHannWindow(Float32Array.from(float32Window.subarray(0, FFT_SIZE)));

  // fft-js expects array of [real, imag] pairs
  const complexInput  = Array.from(windowed).map((v) => [v, 0]);
  const complexOutput = FFT(complexInput);

  // Magnitude spectrum — positive frequencies only (0..FFT_SIZE/2)
  const magnitudes = [];
  for (let i = 0; i < FFT_SIZE / 2; i++) {
    const re = complexOutput[i][0];
    const im = complexOutput[i][1];
    magnitudes.push(Math.sqrt(re * re + im * im));
  }

  return extractPeaks(magnitudes, TOP_PEAKS);
}

// ─── Cross-correlation ────────────────────────────────────────────────────────

/**
 * Estimate the time offset (in whole seconds) between two fingerprint arrays.
 *
 * Algorithm (Shazam-inspired peak-intersection cross-correlation):
 *   For each lag d ∈ [-(lenB-1), +(lenA-1)]:
 *     score(d) = Σ |peaks_A[i] ∩ peaks_B[i+d]|
 *   bestLag = argmax score(d)
 *
 * Returns { offsetSeconds, confidence } where confidence ∈ [0, 1].
 * offsetSeconds > 0 means B started that many seconds AFTER A.
 * offsetSeconds < 0 means B started that many seconds BEFORE A.
 */
export function crossCorrelate(fingerprintsA, fingerprintsB) {
  const lenA = fingerprintsA.length;
  const lenB = fingerprintsB.length;
  if (lenA === 0 || lenB === 0) return { offsetSeconds: 0, confidence: 0 };

  const maxLag = Math.max(lenA, lenB) - 1;
  let bestScore = -1;
  let bestLag   = 0;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let score = 0;
    let count = 0;
    for (let i = 0; i < lenA; i++) {
      const j = i + lag;
      if (j < 0 || j >= lenB) continue;
      const setA = new Set(fingerprintsA[i]);
      score += fingerprintsB[j].filter((p) => setA.has(p)).length;
      count++;
    }
    if (count > 0 && score > bestScore) {
      bestScore = score;
      bestLag   = lag;
    }
  }

  const maxPossible = Math.min(lenA, lenB) * TOP_PEAKS;
  const confidence  = maxPossible > 0 ? Math.min(bestScore / maxPossible, 1) : 0;

  return {
    offsetSeconds: bestLag * WINDOW_SECONDS,
    confidence,
  };
}

// ─── AudioSyncJob ─────────────────────────────────────────────────────────────

/**
 * Manages audio pull + fingerprinting for a single YouTube stream.
 *
 * Pipeline: ytdl (audio container) → ffmpeg (decode + resample → s16le 16kHz mono PCM)
 *           → 1-second window accumulator → FFT fingerprinting → crossCorrelate
 *
 * @param {string}   streamId      - DB UUID of the stream row
 * @param {string}   youtubeUrl    - Full YouTube watch URL
 * @param {Function} onFingerprint - (streamId, fingerprints[]) called after each new window
 * @param {Function} onError       - (streamId, Error) called on fatal failure
 */
const MAX_RETRIES = 5; // give up after this many consecutive failures

export class AudioSyncJob {
  constructor(streamId, youtubeUrl, onFingerprint, onError) {
    this.streamId      = streamId;
    this.youtubeUrl    = youtubeUrl;
    this.onFingerprint = onFingerprint;
    this.onError       = onError;
    this.fingerprints  = [];
    this.buffer        = Buffer.alloc(0);
    this.ytStream      = null;
    this.ffmpegCmd     = null;
    this.stopped       = false;
    this.retryTimer    = null;
    this.retryCount    = 0;
  }

  start() {
    if (this.stopped) return;
    this.fingerprints = [];
    this.buffer       = Buffer.alloc(0);

    console.log(`[AudioSync] Starting pipeline for stream ${this.streamId.slice(0, 8)}`);

    try {
      // 1. Pull audio-only from YouTube (lowest quality — we only need the audio)
      this.ytStream = ytdl(this.youtubeUrl, {
        quality: 'lowestaudio',
        filter: 'audioonly',
      });

      this.ytStream.on('error', (err) => {
        if (this.stopped) return;
        console.error(`[AudioSync] ytdl error ${this.streamId.slice(0, 8)}:`, err.message);
        this._scheduleRetry();
      });

      // 2. Pipe through ffmpeg: any audio codec → s16le PCM at SAMPLE_RATE mono
      //    fluent-ffmpeg reads from the ytdl stream via pipe:0 and writes decoded
      //    PCM to stdout which we capture via the 'data' event on .pipe()
      this.ffmpegCmd = ffmpeg(this.ytStream)
        .noVideo()
        .audioFrequency(SAMPLE_RATE)
        .audioChannels(CHANNELS)
        .audioCodec('pcm_s16le')
        .format('s16le')
        .on('error', (err) => {
          if (this.stopped) return;
          // ffmpeg exits when the stream ends (live streams send a few minutes of DVR buffer)
          // Only treat as error if it's not a clean end-of-stream exit or a ytdl passthrough
          if (!err.message.includes('Exiting normally') && !err.message.includes('Failed to find')) {
            console.error(`[AudioSync] ffmpeg error ${this.streamId.slice(0, 8)}:`, err.message);
            this._scheduleRetry();
          }
        })
        .on('end', () => {
          if (this.stopped) return;
          console.log(`[AudioSync] ffmpeg ended ${this.streamId.slice(0, 8)}, scheduling retry`);
          this._scheduleRetry();
        });

      // 3. Read the PCM stream as a Node.js Readable and accumulate into 1-second windows
      const pcmStream = this.ffmpegCmd.pipe();

      pcmStream.on('data', (chunk) => {
        if (this.stopped) return;
        this.retryCount = 0; // reset on successful data
        this.buffer = Buffer.concat([this.buffer, chunk]);

        // Process every complete 1-second window
        while (this.buffer.length >= WINDOW_BYTES) {
          const windowBuf = this.buffer.subarray(0, WINDOW_BYTES);
          this.buffer     = this.buffer.subarray(WINDOW_BYTES);

          const float32 = pcmToFloat32(windowBuf);
          const peaks   = fingerprintWindow(float32);

          this.fingerprints.push(peaks);
          if (this.fingerprints.length > MAX_FINGERPRINT_WINDOWS) {
            this.fingerprints.shift();
          }

          this.onFingerprint(this.streamId, [...this.fingerprints]);
        }
      });

      pcmStream.on('error', (err) => {
        if (this.stopped) return;
        console.error(`[AudioSync] PCM stream error ${this.streamId.slice(0, 8)}:`, err.message);
        this._scheduleRetry();
      });

    } catch (err) {
      console.error(`[AudioSync] Failed to start ${this.streamId.slice(0, 8)}:`, err.message);
      this.onError(this.streamId, err);
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);

    if (this.ffmpegCmd) {
      try { this.ffmpegCmd.kill('SIGKILL'); } catch (_) {}
      this.ffmpegCmd = null;
    }
    if (this.ytStream) {
      try { this.ytStream.destroy(); } catch (_) {}
      this.ytStream = null;
    }

    this.buffer       = Buffer.alloc(0);
    this.fingerprints = [];
    console.log(`[AudioSync] Stopped ${this.streamId.slice(0, 8)}`);
  }

  _scheduleRetry() {
    clearTimeout(this.retryTimer);
    // Tear down current streams before retrying
    if (this.ffmpegCmd) { try { this.ffmpegCmd.kill('SIGKILL'); } catch (_) {} this.ffmpegCmd = null; }
    if (this.ytStream)  { try { this.ytStream.destroy(); }        catch (_) {} this.ytStream  = null; }
    this.buffer = Buffer.alloc(0);

    this.retryCount += 1;
    if (this.retryCount >= MAX_RETRIES) {
      console.warn(`[AudioSync] Giving up on ${this.streamId.slice(0, 8)} after ${MAX_RETRIES} retries (audio sync disabled for this stream — L1 timestamp sync still active)`);
      this.stopped = true;
      return;
    }

    // Exponential backoff: 8s, 16s, 32s, 64s …
    const delay = 8000 * Math.pow(2, this.retryCount - 1);
    console.log(`[AudioSync] Retry ${this.retryCount}/${MAX_RETRIES} for ${this.streamId.slice(0, 8)} in ${delay / 1000}s`);
    this.retryTimer = setTimeout(() => {
      if (!this.stopped) this.start();
    }, delay);
  }

  getFingerprints() {
    return [...this.fingerprints];
  }
}
