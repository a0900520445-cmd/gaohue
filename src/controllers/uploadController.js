// src/controllers/uploadController.js
// Handles media uploads (images/videos) → Supabase Storage

const multer = require('multer');
const { supabaseAdmin } = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

const BUCKET = process.env.STORAGE_BUCKET || 'iam-media';

// Multer: memory storage (buffer upload to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支援的檔案格式'));
  },
});

// POST /api/upload
// field: file
async function uploadFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: '請選擇要上傳的檔案' });

    const ext = req.file.originalname.split('.').pop();
    const path = `${req.user.id}/${uuidv4()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(path);

    const media_type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    res.status(201).json({ url: publicUrl, media_type, path });
  } catch (err) {
    console.error('[uploadFile]', err);
    res.status(500).json({ error: err.message || '上傳失敗' });
  }
}

module.exports = { upload, uploadFile };
