-- The editor's and submissions' tables (docs/schema-design.md §8), in the schema arrowpush.
-- The schema itself and arrowpush.applied_migrations are made by migrationRunning.ts.
-- Row-level security is on with no policies: only the server's own role (the tables' owner)
-- reads and writes them, never Supabase's Data API.

-- Sign-in (Better Auth; docs/SPEC.md §5, backend, "Sign-in"): users, sessions, accounts and
-- verifications have the columns Better Auth expects (checked in migrationRunning.test.ts with
-- its getMigrations()), plus site_role. A user signs in through an account: GitHub's numeric user
-- id is accounts.account_id where provider_id = 'github'.
CREATE TABLE arrowpush.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL,
  image text,
  site_role text NOT NULL CHECK (site_role IN ('contributor', 'reviewer', 'owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- token is the session cookie's value before Better Auth signs it with BETTER_AUTH_SECRET.
CREATE TABLE arrowpush.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES arrowpush.users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id ON arrowpush.sessions (user_id);

-- Access tokens are stored encrypted (account.encryptOAuthTokens); password stays null (GitHub
-- sign-in only).
CREATE TABLE arrowpush.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES arrowpush.users (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL,
  UNIQUE (provider_id, account_id)
);
CREATE INDEX accounts_user_id ON arrowpush.accounts (user_id);

-- Short-lived values of the sign-in flow (Better Auth's OAuth state).
CREATE TABLE arrowpush.verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verifications_identifier ON arrowpush.verifications (identifier);

CREATE TABLE arrowpush.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reaction_slug text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES arrowpush.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE arrowpush.reaction_versions (
  reaction_id uuid NOT NULL REFERENCES arrowpush.reactions (id),
  reaction_version integer NOT NULL CHECK (reaction_version >= 1),
  submission_status text NOT NULL
    CHECK (submission_status IN ('draft', 'submitted', 'changes_requested', 'published')),
  reaction_document jsonb NOT NULL,
  format_version integer NOT NULL,
  content_hash text,
  author_user_id uuid NOT NULL REFERENCES arrowpush.users (id),
  licence_agreed_at timestamptz,
  latest_lint_report jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  published_at timestamptz,
  PRIMARY KEY (reaction_id, reaction_version)
);

-- At most one unpublished version per reaction.
CREATE UNIQUE INDEX reaction_versions_one_unpublished
  ON arrowpush.reaction_versions (reaction_id)
  WHERE submission_status <> 'published';

-- Published versions are immutable: learner progress points at them.
CREATE FUNCTION arrowpush.refuse_change_to_published_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submission_status = 'published' THEN
    RAISE EXCEPTION 'version % of reaction % is published and cannot change',
      OLD.reaction_version, OLD.reaction_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER reaction_versions_published_are_immutable
  BEFORE UPDATE OR DELETE ON arrowpush.reaction_versions
  FOR EACH ROW EXECUTE FUNCTION arrowpush.refuse_change_to_published_version();

-- Unused until contributors arrive (item 8d).
CREATE TABLE arrowpush.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reaction_id uuid NOT NULL,
  reaction_version integer NOT NULL,
  reviewer_user_id uuid NOT NULL REFERENCES arrowpush.users (id),
  review_decision text NOT NULL CHECK (review_decision IN ('publish', 'changes_requested')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (reaction_id, reaction_version)
    REFERENCES arrowpush.reaction_versions (reaction_id, reaction_version)
);

ALTER TABLE arrowpush.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.reaction_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.verifications ENABLE ROW LEVEL SECURITY;
