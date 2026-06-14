// src/controllers/postController.js

const { supabaseAdmin } = require('../lib/supabase');

// GET /api/posts?group_id=iam&page=1&limit=20
async function getPosts(req, res) {
  try {
    const { group_id = 'iam', page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;

    const { data: posts, error, count } = await supabaseAdmin
      .from('posts')
      .select(`
        id, author_id, group_id, content, media_url, media_type, created_at,
        users:author_id ( id, display_name, avatar, role ),
        post_likes ( count ),
        post_comments ( count )
      `, { count: 'exact' })
      .eq('group_id', group_id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // Attach like/comment counts + whether current user liked
    const userId = req.user ? req.user.id : null;
    let likedIds = new Set();

    if (userId && posts && posts.length > 0) {
      const postIds = posts.map(p => p.id);
      const { data: likes } = await supabaseAdmin
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds);
      if (likes) likes.forEach(l => likedIds.add(l.post_id));
    }

    const formatted = (posts || []).map(p => ({
      ...p,
      like_count: p.post_likes?.[0]?.count ?? 0,
      comment_count: p.post_comments?.[0]?.count ?? 0,
      liked_by_me: likedIds.has(p.id),
      post_likes: undefined,
      post_comments: undefined,
    }));

    res.json({ posts: formatted, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[getPosts]', err);
    res.status(500).json({ error: '取得貼文失敗' });
  }
}

// POST /api/posts
async function createPost(req, res) {
  try {
    const { group_id = 'iam', content = '', media_url = '', media_type = 'text' } = req.body;

    if (!content.trim() && !media_url.trim()) {
      return res.status(400).json({ error: '貼文內容不能為空' });
    }

    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .insert([{
        author_id: req.user.id,
        group_id,
        content: content.trim(),
        media_url: media_url.trim(),
        media_type,
      }])
      .select(`
        id, author_id, group_id, content, media_url, media_type, created_at,
        users:author_id ( id, display_name, avatar )
      `)
      .single();

    if (error) throw error;
    res.status(201).json({ post });
  } catch (err) {
    console.error('[createPost]', err);
    res.status(500).json({ error: '發布貼文失敗' });
  }
}

// DELETE /api/posts/:id
async function deletePost(req, res) {
  try {
    const { id } = req.params;

    // Only author or star can delete
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('author_id')
      .eq('id', id)
      .single();

    if (!post) return res.status(404).json({ error: '貼文不存在' });
    if (post.author_id !== req.user.id && req.user.role !== 'star') {
      return res.status(403).json({ error: '無法刪除此貼文' });
    }

    await supabaseAdmin.from('post_likes').delete().eq('post_id', id);
    await supabaseAdmin.from('post_comments').delete().eq('post_id', id);
    await supabaseAdmin.from('posts').delete().eq('id', id);

    res.json({ success: true });
  } catch (err) {
    console.error('[deletePost]', err);
    res.status(500).json({ error: '刪除貼文失敗' });
  }
}

// POST /api/posts/:id/like
async function toggleLike(req, res) {
  try {
    const { id: post_id } = req.params;
    const user_id = req.user.id;

    const { data: existing } = await supabaseAdmin
      .from('post_likes')
      .select('id')
      .eq('post_id', post_id)
      .eq('user_id', user_id)
      .single();

    if (existing) {
      await supabaseAdmin.from('post_likes').delete().eq('id', existing.id);
      res.json({ liked: false });
    } else {
      await supabaseAdmin.from('post_likes').insert([{ post_id, user_id }]);
      res.json({ liked: true });
    }
  } catch (err) {
    console.error('[toggleLike]', err);
    res.status(500).json({ error: '按讚失敗' });
  }
}

// GET /api/posts/:id/comments
async function getComments(req, res) {
  try {
    const { id: post_id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('post_comments')
      .select(`
        id, post_id, content, created_at,
        users:user_id ( id, display_name, avatar )
      `)
      .eq('post_id', post_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ comments: data || [] });
  } catch (err) {
    console.error('[getComments]', err);
    res.status(500).json({ error: '取得留言失敗' });
  }
}

// POST /api/posts/:id/comments
async function addComment(req, res) {
  try {
    const { id: post_id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '留言內容不能為空' });
    }

    const { data: comment, error } = await supabaseAdmin
      .from('post_comments')
      .insert([{ post_id, user_id: req.user.id, content: content.trim() }])
      .select(`
        id, post_id, content, created_at,
        users:user_id ( id, display_name, avatar )
      `)
      .single();

    if (error) throw error;
    res.status(201).json({ comment });
  } catch (err) {
    console.error('[addComment]', err);
    res.status(500).json({ error: '留言失敗' });
  }
}

module.exports = { getPosts, createPost, deletePost, toggleLike, getComments, addComment };
