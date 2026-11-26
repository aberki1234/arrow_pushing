-- Personal access tokens (item 10b, docs/SPEC.md §6 "Drafting with an assistant"): a token stands
-- for one user and may only read that user's reactions and save drafts (backendServer/
-- accessTokenRequests.ts). Only the token's SHA-256 is stored; the token itself is shown once.
CREATE TABLE arrowpush.access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES arrowpush.users (id) ON DELETE CASCADE,
  token_name text NOT NULL,
  token_sha256 text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);

ALTER TABLE arrowpush.access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_only_select ON arrowpush.access_tokens
  FOR SELECT TO arrowpush_readonly USING (true);
