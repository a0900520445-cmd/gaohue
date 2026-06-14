-- ============================================================
--  IAM 高會  ─  Supabase SQL Schema
--  Run this in Supabase → SQL Editor
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        TEXT          UNIQUE NOT NULL,
  password_hash   TEXT          NOT NULL,
  display_name    TEXT          NOT NULL,
  bio             TEXT          DEFAULT '',
  avatar          TEXT          DEFAULT '',
  cover           TEXT          DEFAULT '',
  role            TEXT          NOT NULL DEFAULT 'fan'  CHECK (role IN ('fan','star','admin')),
  followers       BIGINT        DEFAULT 0,
  following       BIGINT        DEFAULT 0,
  is_premium      BOOLEAN       DEFAULT FALSE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 2. groups ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groups (
  id              TEXT          PRIMARY KEY,          -- e.g. 'iam'
  name            TEXT          NOT NULL,
  description     TEXT          DEFAULT '',
  star_id         UUID          REFERENCES users(id) ON DELETE SET NULL,
  price           INTEGER       DEFAULT 500,           -- TWD
  cover_url       TEXT          DEFAULT '',
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 3. group_members ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_members (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        TEXT          REFERENCES groups(id) ON DELETE CASCADE,
  user_id         UUID          REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- ── 4. payments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          REFERENCES users(id) ON DELETE CASCADE,
  group_id        TEXT          REFERENCES groups(id) ON DELETE SET NULL,
  amount          INTEGER       NOT NULL,
  currency        TEXT          DEFAULT 'TWD',
  status          TEXT          DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  method          TEXT          DEFAULT 'demo',
  provider_txn_id TEXT,         -- Stripe/ECPay transaction ID
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 5. posts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id              BIGINT        PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  author_id       UUID          REFERENCES users(id) ON DELETE CASCADE,
  group_id        TEXT          REFERENCES groups(id) ON DELETE CASCADE,
  content         TEXT          DEFAULT '',
  media_url       TEXT          DEFAULT '',
  media_type      TEXT          DEFAULT 'text' CHECK (media_type IN ('text','image','video')),
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 6. post_likes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_likes (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id         BIGINT        REFERENCES posts(id) ON DELETE CASCADE,
  user_id         UUID          REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- ── 7. post_comments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_comments (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id         BIGINT        REFERENCES posts(id) ON DELETE CASCADE,
  user_id         UUID          REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT          NOT NULL,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 8. bubble_messages ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bubble_messages (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id       UUID          REFERENCES users(id) ON DELETE CASCADE,
  receiver_id     UUID          REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT          NOT NULL,
  is_broadcast    BOOLEAN       DEFAULT FALSE,
  is_read         BOOLEAN       DEFAULT FALSE,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_posts_group       ON posts(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author      ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_likes_post        ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post     ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_bubble_receiver   ON bubble_messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bubble_sender     ON bubble_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_members     ON group_members(user_id);

-- ── Auto-update updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_posts_updated
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bubble_messages  ENABLE ROW LEVEL SECURITY;

-- Users: anyone can read public info; only owner can update
CREATE POLICY "users_select" ON users FOR SELECT USING (true);
CREATE POLICY "users_update" ON users FOR UPDATE USING (auth.uid() = id);

-- Groups: public read
CREATE POLICY "groups_select" ON groups FOR SELECT USING (true);

-- Group members: members see their own rows
CREATE POLICY "gm_select" ON group_members FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "gm_insert" ON group_members FOR INSERT WITH CHECK (user_id = auth.uid());

-- Posts: premium members + stars can read; only stars can insert
CREATE POLICY "posts_select" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'star')
);
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (author_id = auth.uid());

-- Post likes/comments: premium users
CREATE POLICY "likes_all"    ON post_likes    FOR ALL USING (true);
CREATE POLICY "comments_all" ON post_comments FOR ALL USING (true);

-- Bubble: sender or receiver only
CREATE POLICY "bubble_select" ON bubble_messages FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "bubble_insert" ON bubble_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Payments: only owner
CREATE POLICY "payments_select" ON payments FOR SELECT USING (user_id = auth.uid());
