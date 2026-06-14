// src/controllers/userController.js

const { supabaseAdmin } = require('../lib/supabase');

// GET /api/users/:username
async function getProfile(req, res) {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, bio, avatar, cover, role, followers, following, is_premium, created_at')
      .eq('username', req.params.username.toLowerCase())
      .single();

    if (error || !user) return res.status(404).json({ error: '使用者不存在' });

    res.json({ user });
  } catch (err) {
    console.error('[getProfile]', err);
    res.status(500).json({ error: '取得個人資料失敗' });
  }
}

// PATCH /api/users/me
async function updateProfile(req, res) {
  try {
    const allowed = ['display_name', 'bio', 'avatar', 'cover'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '沒有可更新的欄位' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, username, display_name, bio, avatar, cover, role, followers, following, is_premium')
      .single();

    if (error) throw error;
    res.json({ user });
  } catch (err) {
    console.error('[updateProfile]', err);
    res.status(500).json({ error: '更新個人資料失敗' });
  }
}

// GET /api/users — list all users (star only, for admin)
async function listUsers(req, res) {
  try {
    const { page = 1, limit = 50, role } = req.query;
    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;

    let query = supabaseAdmin
      .from('users')
      .select('id, username, display_name, avatar, role, is_premium, followers, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (role) query = query.eq('role', role);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ users: data || [], total: count });
  } catch (err) {
    console.error('[listUsers]', err);
    res.status(500).json({ error: '取得用戶列表失敗' });
  }
}

module.exports = { getProfile, updateProfile, listUsers };
