// src/middleware/auth.js
// Verifies JWT from Authorization header and attaches req.user

const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../lib/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// ── verifyToken ──────────────────────────────────────────────────
// Attaches req.user = { id, username, role, ... }
// Returns 401 if token is missing or invalid
async function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登入，請先取得 Token' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Optionally re-fetch user from DB to ensure they still exist
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, role, is_premium')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: '帳號不存在或已被停用' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效或已過期，請重新登入' });
  }
}

// ── requireStar ──────────────────────────────────────────────────
// Must be used AFTER verifyToken
// Only allows users with role === 'star'
function requireStar(req, res, next) {
  if (!req.user || req.user.role !== 'star') {
    return res.status(403).json({ error: '此操作僅限明星帳號' });
  }
  next();
}

// ── requirePremium ───────────────────────────────────────────────
// Must be used AFTER verifyToken
// Allows stars + fans who have unlocked a group
function requirePremium(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登入' });
  if (req.user.role === 'star' || req.user.is_premium) return next();
  return res.status(403).json({ error: '此內容需要解鎖高會才能查看' });
}

// ── optionalToken ────────────────────────────────────────────────
// Same as verifyToken but doesn't fail if no token — sets req.user = null
async function optionalToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, role, is_premium')
      .eq('id', decoded.id)
      .single();
    req.user = user || null;
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { verifyToken, requireStar, requirePremium, optionalToken };
