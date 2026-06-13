-- ════════════════════════════════════════════════
-- UnitedOasis — Supabase Schema
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════

-- Enable UUID extension (already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Profiles ──────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  username     TEXT PRIMARY KEY,
  bio          TEXT DEFAULT '',
  badge        TEXT,
  status       TEXT DEFAULT 'Hey, I''m on UnitedOasis!',
  avatar_color TEXT,
  banner_color TEXT,
  joined_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Wallets ───────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  username TEXT PRIMARY KEY,
  balance  INTEGER DEFAULT 500,
  address  TEXT,
  tx_count INTEGER DEFAULT 0
);

-- ── Transactions ──────────────────────────────
-- (using 'sender'/'receiver' to avoid SQL reserved words 'from'/'to')
CREATE TABLE IF NOT EXISTS transactions (
  id         TEXT PRIMARY KEY,
  sender     TEXT NOT NULL,
  receiver   TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  type       TEXT NOT NULL,
  memo       TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_sender   ON transactions (sender);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver ON transactions (receiver);

-- ── Social Posts ──────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id         TEXT PRIMARY KEY,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  liked_by   TEXT[] DEFAULT '{}',
  comments   JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts (author);

-- ── Forum Posts ───────────────────────────────
CREATE TABLE IF NOT EXISTS forum_posts (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  author     TEXT NOT NULL,
  likes      INTEGER DEFAULT 0,
  replies    JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Topics ────────────────────────────────────
CREATE TABLE IF NOT EXISTS topics (
  id           TEXT PRIMARY KEY,
  text         TEXT NOT NULL,
  submitted_by TEXT,
  upvotes      INTEGER DEFAULT 0,
  downvotes    INTEGER DEFAULT 0,
  voters       TEXT[] DEFAULT '{}',
  status       TEXT DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Friends ───────────────────────────────────
CREATE TABLE IF NOT EXISTS friends (
  username TEXT PRIMARY KEY,
  friends  TEXT[] DEFAULT '{}',
  pending  TEXT[] DEFAULT '{}',
  received TEXT[] DEFAULT '{}'
);

-- ── Profile Comments ──────────────────────────
CREATE TABLE IF NOT EXISTS profile_comments (
  id              TEXT PRIMARY KEY,
  target_username TEXT NOT NULL,
  author          TEXT NOT NULL,
  body            TEXT NOT NULL,
  likes           TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profile_comments_target ON profile_comments (target_username);

-- ── Leaderboard ───────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboard (
  username TEXT PRIMARY KEY,
  wins     INTEGER DEFAULT 0,
  losses   INTEGER DEFAULT 0,
  tips     INTEGER DEFAULT 0,
  score    INTEGER DEFAULT 0
);

-- ── Tournaments ───────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  topic      TEXT,
  max_players INTEGER DEFAULT 8,
  entry_fee  INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  status     TEXT DEFAULT 'open',
  players    TEXT[] DEFAULT '{}',
  bracket    JSONB DEFAULT '[]',
  bets       JSONB DEFAULT '[]',
  prize_pool INTEGER DEFAULT 0,
  winner     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Disable Row Level Security (server uses service key) ──
ALTER TABLE profiles          DISABLE ROW LEVEL SECURITY;
ALTER TABLE wallets           DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts      DISABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts       DISABLE ROW LEVEL SECURITY;
ALTER TABLE topics            DISABLE ROW LEVEL SECURITY;
ALTER TABLE friends           DISABLE ROW LEVEL SECURITY;
ALTER TABLE profile_comments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard       DISABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments       DISABLE ROW LEVEL SECURITY;
