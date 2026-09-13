-- Chat persistence: workspace conversations survive page refreshes.
-- Sessions are user-owned and scoped to a knowledge base (KB chat mode).
-- The legacy document mode intentionally does not persist conversations.

CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kb_id      UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,               -- client-generated message id
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  sources    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
  ON chat_sessions (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_kb
  ON chat_sessions (kb_id) WHERE kb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages (session_id, created_at ASC);
