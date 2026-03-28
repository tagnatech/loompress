-- LoomPress migration 002: Comments, Pages, Search, Settings, Scheduled Publishing
-- ============================================================

-- ============================================================
-- lp_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES lp_posts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES lp_comments(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_url TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lp_comments_post ON lp_comments (post_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_lp_comments_site ON lp_comments (site_id, status);

-- ============================================================
-- lp_settings (key-value per site)
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  UNIQUE (site_id, key)
);

-- ============================================================
-- Full-text search index on posts
-- ============================================================
ALTER TABLE lp_posts ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_lp_posts_search ON lp_posts USING gin(search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION lp_posts_search_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(
      regexp_replace(NEW.body, '<[^>]*>', ' ', 'g'), ''
    )), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lp_posts_search
  BEFORE INSERT OR UPDATE OF title, excerpt, body ON lp_posts
  FOR EACH ROW EXECUTE FUNCTION lp_posts_search_update();

-- Backfill existing posts
UPDATE lp_posts SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(excerpt, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(
    regexp_replace(body, '<[^>]*>', ' ', 'g'), ''
  )), 'C');

-- ============================================================
-- Add comment count to sites for quick dashboard access
-- ============================================================
-- (we use a query, not a materialized column)

-- ============================================================
-- lp_menus (navigation menus per site)
-- ============================================================
CREATE TABLE IF NOT EXISTS lp_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES lp_sites(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'primary',
  items JSONB NOT NULL DEFAULT '[]',
  UNIQUE (site_id, location)
);

