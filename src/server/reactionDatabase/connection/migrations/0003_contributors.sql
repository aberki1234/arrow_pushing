-- Contributors and review (item 8e, docs/SPEC.md §6 "Contributors").
--   - site role 'blocked': can sign in and see their drafts, not save or submit
--     (reactionDatabase/sitePermissions.ts);
--   - a submission's note for the reviewer;
--   - a review's notes pinned to a change, beside its overall comment: a JSON list of
--     {"changeKey": text, "note": text}.
ALTER TABLE arrowpush.users DROP CONSTRAINT users_site_role_check;
ALTER TABLE arrowpush.users ADD CONSTRAINT users_site_role_check
  CHECK (site_role IN ('contributor', 'reviewer', 'owner', 'blocked'));

ALTER TABLE arrowpush.reaction_versions ADD COLUMN submission_note text;

ALTER TABLE arrowpush.reviews ADD COLUMN pinned_notes jsonb NOT NULL DEFAULT '[]';
