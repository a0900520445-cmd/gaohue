// server.js  ─ IAM 高會 主伺服器
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // disabled so the SPA can load CDN scripts
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS: origin not allowed → ' + origin));
  },
  credentials: true,
}));

// ── Body parsers ─────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────────────
// General API: 200 req / 15 min per IP
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '請求過於頻繁，請稍後再試' },
}));

// Auth endpoints: 20 req / 15 min per IP (brute-force protection)
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '登入嘗試次數過多，請 15 分鐘後再試' },
}));

// Upload: 10 req / 15 min per IP
app.use('/api/upload', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '上傳次數過多，請稍後再試' },
}));

// ── Static files (SPA) ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ────────────────────────────────────────────────────
app.use('/api', routes);

// ── SPA fallback ─────────────────────────────────────────────────
// All non-API routes serve index.html so client-side routing works
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: '伺服器錯誤' });
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   IAM 高會 Server                   ║
  ║   http://localhost:${PORT}            ║
  ║   ENV: ${(process.env.NODE_ENV || 'development').padEnd(28)}║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
