// src/lib/supabase.js
// Supabase client — two instances:
//   supabase      = anon key  (respects RLS)
//   supabaseAdmin = service key (bypasses RLS, server-side only)
//
// ⚠️  On Render / Railway / Fly.io: set env vars in the platform dashboard,
//     NOT in a .env file (which is not deployed).

require('dotenv').config(); // loads .env locally; no-op on Render

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '\n⚠️  WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set.\n' +
    '   API endpoints that need the database will return 503.\n' +
    '   → On Render: set these in Dashboard → Environment → Environment Variables.\n' +
    '   → Locally: copy .env.example to .env and fill in your values.\n'
  );
}

// Placeholder client that returns a helpful error when env vars are missing
function makeErrorClient() {
  const handler = {
    get(_, prop) {
      if (prop === 'storage') return makeErrorClient();
      return () => ({ data: null, error: new Error('Supabase not configured — check environment variables') });
    },
  };
  return new Proxy({}, handler);
}

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : makeErrorClient();

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : makeErrorClient();

module.exports = { supabase, supabaseAdmin };
