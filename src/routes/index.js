// src/routes/index.js
// Mounts all sub-routers

const express = require('express');
const router = express.Router();

const { register, login, me } = require('../controllers/authController');
const { getPosts, createPost, deletePost, toggleLike, getComments, addComment } = require('../controllers/postController');
const { getMessages, sendMessage, getFanList } = require('../controllers/bubbleController');
const { listGroups, getGroup, unlockGroup } = require('../controllers/groupController');
const { getProfile, updateProfile, listUsers } = require('../controllers/userController');
const { upload, uploadFile } = require('../controllers/uploadController');
const { verifyToken, requireStar, requirePremium, optionalToken } = require('../middleware/auth');

// ── Auth ────────────────────────────────────────────────────────
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', verifyToken, me);

// ── Users ───────────────────────────────────────────────────────
router.get('/users', verifyToken, requireStar, listUsers);
router.get('/users/:username', getProfile);
router.patch('/users/me', verifyToken, updateProfile);

// ── Posts ───────────────────────────────────────────────────────
router.get('/posts', optionalToken, getPosts);
router.post('/posts', verifyToken, requireStar, createPost);
router.delete('/posts/:id', verifyToken, deletePost);
router.post('/posts/:id/like', verifyToken, requirePremium, toggleLike);
router.get('/posts/:id/comments', optionalToken, getComments);
router.post('/posts/:id/comments', verifyToken, requirePremium, addComment);

// ── Bubble ──────────────────────────────────────────────────────
router.get('/bubble/messages', verifyToken, requirePremium, getMessages);
router.post('/bubble/send', verifyToken, requirePremium, sendMessage);
router.get('/bubble/fans', verifyToken, requireStar, getFanList);

// ── Groups ──────────────────────────────────────────────────────
router.get('/groups', optionalToken, listGroups);
router.get('/groups/:id', optionalToken, getGroup);
router.post('/groups/:id/unlock', verifyToken, unlockGroup);

// ── Upload ──────────────────────────────────────────────────────
router.post('/upload', verifyToken, upload.single('file'), uploadFile);

// ── Health check ────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

module.exports = router;
