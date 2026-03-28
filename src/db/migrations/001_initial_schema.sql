-- LoomPress initial schema
-- All tables prefixed with lp_ to avoid collisions

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- lp_sites
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  tagline TEXT,
  logo_url TEXT,
  base_url TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  permalink_pattern TEXT DEFAULT 'slug',
  theme TEXT DEFAULT 'default',
  custom_css TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- lp_users
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'author',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- ============================================================
-- lp_site_users
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_site_users (
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES lp_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'author',
  PRIMARY KEY (site_id, user_id)
);

-- ============================================================
-- lp_sessions (managed by connect-pg-simple)
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lp_sessions_expire ON lp_sessions (expire);

-- ============================================================
-- lp_posts
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  author_id UUID REFERENCES lp_users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'post',
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  featured_image_id UUID,
  meta_title TEXT,
  meta_description TEXT,
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lp_posts_site_status ON lp_posts (site_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_posts_site_slug ON lp_posts (site_id, slug);

-- ============================================================
-- lp_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES lp_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  UNIQUE (site_id, slug)
);

-- ============================================================
-- lp_tags
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE (site_id, slug)
);

-- ============================================================
-- lp_post_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_post_categories (
  post_id UUID NOT NULL REFERENCES lp_posts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES lp_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

-- ============================================================
-- lp_post_tags
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_post_tags (
  post_id UUID NOT NULL REFERENCES lp_posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES lp_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- ============================================================
-- lp_media
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES lp_users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key for featured image after media table exists
ALTER TABLE lp_posts
  ADD CONSTRAINT fk_posts_featured_image
  FOREIGN KEY (featured_image_id) REFERENCES lp_media(id) ON DELETE SET NULL;

-- ============================================================
-- Triggers for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION lp_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lp_sites_updated
  BEFORE UPDATE ON lp_sites
  FOR EACH ROW EXECUTE FUNCTION lp_update_timestamp();

CREATE TRIGGER trg_lp_posts_updated
  BEFORE UPDATE ON lp_posts
  FOR EACH ROW EXECUTE FUNCTION lp_update_timestamp();

