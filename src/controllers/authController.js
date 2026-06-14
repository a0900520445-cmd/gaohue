// src/controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { supabaseAdmin } = require('../lib/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { username, password, display_name, bio = '' } = req.body;

    if (!username || !password || !display_name) {
      return res.status(400).json({ error: '請填寫帳號、密碼、暱稱' });
    }
    if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: '帳號至少 3 碼，只能英數字與底線' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '密碼至少 4 碼' });
    }

    // Check duplicate username
    const { data: exists } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', username.toLowerCase())
      .single();

    if (exists) return res.status(409).json({ error: '此帳號已被使用' });

    const hashed = await bcrypt.hash(password, 10);
    const avatar = `https://api.dicebear.com/8.x/notionists/svg?seed=${username}&backgroundColor=7c3aed`;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert([{
        id: uuidv4(),
        username: username.toLowerCase(),
        password_hash: hashed,
        display_name: display_name.trim(),
        bio: bio.trim(),
        role: 'fan',
        avatar,
        followers: 0,
        following: 1,
        is_premium: false,
      }])
      .select('id, username, display_name, bio, role, avatar, followers, following, is_premium, created_at')
      .single();

    if (error) throw error;

    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: '伺服器錯誤，請稍後再試' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '請填寫帳號和密碼' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('username', username.toLowerCase())
      .single();

    if (error || !user) return res.status(401).json({ error: '帳號或密碼錯誤' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: '帳號或密碼錯誤' });

    // Remove sensitive field before returning
    delete user.password_hash;

    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
}

// GET /api/auth/me
async function me(req, res) {
  // req.user is set by verifyToken middleware
  res.json({ user: req.user });
}

module.exports = { register, login, me };
