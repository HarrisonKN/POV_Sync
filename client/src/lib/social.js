import { supabase } from './supabase';

export const USER_CARD_SELECT = 'id, display_name, avatar_url, created_at';
export const SESSION_CARD_SELECT = 'id, status, created_at, ended_at, host_id, streams!streams_session_id_fkey(id, display_name, user_id, youtube_url, is_active, left_at, users(avatar_url, display_name))';

function uniqueIds(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function mapProfilesById(profiles) {
  return (profiles || []).reduce((accumulator, profile) => {
    accumulator[profile.id] = profile;
    return accumulator;
  }, {});
}

function sortNewestFirst(items) {
  return [...items].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

export async function fetchUsersByIds(userIds) {
  const ids = uniqueIds(userIds);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('users')
    .select(USER_CARD_SELECT)
    .in('id', ids);

  if (error) throw error;
  return data || [];
}

export async function searchUsersByName(query, excludeUserId) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Escape LIKE wildcards so user input like '%' or '_' is treated literally
  const escaped = trimmed.replace(/[%_\\]/g, (ch) => `\\${ch}`);

  const { data, error } = await supabase
    .from('users')
    .select(USER_CARD_SELECT)
    .ilike('display_name', `%${escaped}%`)
    .order('display_name', { ascending: true })
    .limit(8);

  if (error) throw error;

  return (data || []).filter((profile) => profile.id !== excludeUserId);
}

export async function followUser(followerId, followingId) {
  const { error } = await supabase
    .from('follows')
    .upsert({ follower_id: followerId, following_id: followingId }, { onConflict: 'follower_id,following_id' });

  if (error) throw error;
}

export async function unfollowUser(followerId, followingId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) throw error;
}

export async function fetchFollowLists(targetUserId, viewerUserId) {
  const [followersResult, followingResult, viewerResult] = await Promise.all([
    supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', targetUserId)
      .order('created_at', { ascending: false }),
    supabase
      .from('follows')
      .select('following_id, created_at')
      .eq('follower_id', targetUserId)
      .order('created_at', { ascending: false }),
    viewerUserId
      ? supabase
          .from('follows')
          .select('follower_id', { head: true, count: 'exact' })
          .eq('follower_id', viewerUserId)
          .eq('following_id', targetUserId)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (followersResult.error) throw followersResult.error;
  if (followingResult.error) throw followingResult.error;
  if (viewerResult.error) throw viewerResult.error;

  const followerIds = uniqueIds((followersResult.data || []).map((row) => row.follower_id));
  const followingIds = uniqueIds((followingResult.data || []).map((row) => row.following_id));
  const relatedProfiles = await fetchUsersByIds([...followerIds, ...followingIds]);
  const profilesById = mapProfilesById(relatedProfiles);

  return {
    followerIds,
    followingIds,
    followerCount: followerIds.length,
    followingCount: followingIds.length,
    followers: followerIds.map((id) => profilesById[id]).filter(Boolean),
    following: followingIds.map((id) => profilesById[id]).filter(Boolean),
    viewerFollowsTarget: Boolean(viewerResult.count),
  };
}

export async function fetchProfileSessions(targetUserId) {
  const [{ data: hosted, error: hostedError }, { data: streamRows, error: streamRowsError }] = await Promise.all([
    supabase
      .from('sessions')
      .select(SESSION_CARD_SELECT)
      .eq('host_id', targetUserId)
      .order('created_at', { ascending: false }),
    supabase
      .from('streams')
      .select('session_id')
      .eq('user_id', targetUserId),
  ]);

  if (hostedError) throw hostedError;
  if (streamRowsError) throw streamRowsError;

  let participated = [];
  const sessionIds = uniqueIds((streamRows || []).map((row) => row.session_id));
  if (sessionIds.length) {
    const { data, error } = await supabase
      .from('sessions')
      .select(SESSION_CARD_SELECT)
      .in('id', sessionIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    participated = data || [];
  }

  return {
    hostedSessions: hosted || [],
    participatedSessions: participated,
  };
}

export async function fetchSessionsForUsers(userIds) {
  const ids = uniqueIds(userIds);
  if (!ids.length) return [];

  const [{ data: hosted, error: hostedError }, { data: streamRows, error: streamRowsError }] = await Promise.all([
    supabase
      .from('sessions')
      .select(SESSION_CARD_SELECT)
      .in('host_id', ids)
      .order('created_at', { ascending: false })
      .limit(18),
    supabase
      .from('streams')
      .select('session_id')
      .in('user_id', ids),
  ]);

  if (hostedError) throw hostedError;
  if (streamRowsError) throw streamRowsError;

  let participatedSessions = [];
  const sessionIds = uniqueIds((streamRows || []).map((row) => row.session_id));
  if (sessionIds.length) {
    const { data, error } = await supabase
      .from('sessions')
      .select(SESSION_CARD_SELECT)
      .in('id', sessionIds)
      .order('created_at', { ascending: false })
      .limit(24);

    if (error) throw error;
    participatedSessions = data || [];
  }

  const sessionMap = new Map();
  [...(hosted || []), ...participatedSessions].forEach((session) => {
    if (!sessionMap.has(session.id)) {
      sessionMap.set(session.id, session);
    }
  });

  return sortNewestFirst([...sessionMap.values()]);
}