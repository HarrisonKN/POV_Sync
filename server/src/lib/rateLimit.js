function buildKey(prefix, rawKey) {
  return `${prefix}:${rawKey || 'unknown'}`;
}

function createRateLimitCheck({ windowMs, max, keyPrefix = 'rate-limit', keyGenerator }) {
  const buckets = new Map();
  let callCount = 0;

  return (context) => {
    const now = Date.now();
    const rawKey = keyGenerator(context);
    const key = buildKey(keyPrefix, rawKey);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    bucket.count += 1;

    callCount += 1;
    if (callCount % 100 === 0) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }
    }

    if (bucket.count > max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  };
}

export function createExpressRateLimit({
  windowMs,
  max,
  keyPrefix,
  keyGenerator = (req) => req.ip || 'unknown',
  message = 'Too many requests',
  statusCode = 429,
}) {
  const check = createRateLimitCheck({ windowMs, max, keyPrefix, keyGenerator });

  return (req, res, next) => {
    const result = check(req);
    if (result.allowed) {
      return next();
    }

    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    return res.status(statusCode).json({ error: message });
  };
}

export function createWebSocketRateLimit({
  windowMs,
  max,
  keyPrefix,
  keyGenerator,
}) {
  const check = createRateLimitCheck({ windowMs, max, keyPrefix, keyGenerator });

  return (context) => check(context);
}