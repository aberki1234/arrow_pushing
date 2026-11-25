-- The editor's and submissions' tables (docs/schema-design.md §8), in the schema arrowpush.
-- The schema itself and arrowpush.applied_migrations are made by migrationRunning.ts.
-- Row-level security is on with no policies: only the server's own role (the tables' owner)
-- reads and writes them, never Supabase's Data API.

CREATE TABLE arrowpush.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  oauth_provider text NOT NULL,
  oauth_subject text NOT NULL,
  site_role text NOT NULL CHECK (site_role IN ('contributor', 'reviewer', 'owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (oauth_provider, oauth_subject)
);

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

-- Sign-in sessions: the id is the random value of the session cookie.
CREATE TABLE arrowpush.sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES arrowpush.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE arrowpush.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.reaction_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrowpush.sessions ENABLE ROW LEVEL SECURITY;
