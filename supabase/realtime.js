// supabase/realtime.js
// 前端引入使用：import { subscribePosts, subscribeBubble } from './supabase/realtime.js'
// 讓 posts 和 bubble_messages 即時更新，不需要 polling

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 訂閱貼文變更（INSERT）
 * @param {string} groupId - 'iam'
 * @param {function} onNew - callback(newPost)
 * @returns unsubscribe function
 */
export function subscribePosts(groupId, onNew) {
  const channel = supabase
    .channel('posts:' + groupId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'posts', filter: `group_id=eq.${groupId}` },
      payload => onNew(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * 訂閱泡泡訊息（粉絲用）
 * @param {string} userId - 當前使用者 ID
 * @param {function} onNew - callback(newMessage)
 * @returns unsubscribe function
 */
export function subscribeBubble(userId, onNew) {
  const channel = supabase
    .channel('bubble:' + userId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bubble_messages', filter: `receiver_id=eq.${userId}` },
      payload => onNew(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * 訂閱所有泡泡訊息（明星後台用）
 * @param {function} onNew - callback(newMessage)
 * @returns unsubscribe function
 */
export function subscribeAllBubbles(onNew) {
  const channel = supabase
    .channel('bubble:all')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bubble_messages' },
      payload => onNew(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * 訂閱按讚變更
 * @param {number} postId
 * @param {function} onChange - callback({ count, liked })
 */
export function subscribeLikes(postId, onChange) {
  const channel = supabase
    .channel('likes:' + postId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_likes', filter: `post_id=eq.${postId}` },
      async () => {
        const { count } = await supabase
          .from('post_likes')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', postId);
        onChange({ count });
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
