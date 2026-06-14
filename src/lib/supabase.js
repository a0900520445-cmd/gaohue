// src/lib/supabase.js
// Supabase client — two instances:
//   supabase  = anon key  (for user-level RLS queries)
//   supabaseAdmin = service key (for server-side admin ops, bypasses RLS)

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
}

// Public client (respects Row Level Security)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client (bypasses RLS — only use server-side!)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

module.exports = { supabase, supabaseAdmin };
