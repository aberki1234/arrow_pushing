# Security

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately through GitHub instead: the
repository's **Security** tab → **Report a vulnerability**. Only the maintainer sees the report.

Include what you found, how to reproduce it, and what an attacker could do with it. You should hear back within a
week. Once a fix is deployed, you are welcome to be credited in the fix's notes if you'd like.

## What is in scope

- **Create** (create.arrowpushing.com) and the backend server in `src/server/`: sign-in, access tokens, who may
  read, save, submit, review or publish which reaction, and the database.
- **The learner site** (arrowpushing.com): for example, script injection through reaction content, or progress
  import.
- **The GitHub workflows** in `.github/workflows/`, and the build and deploy tooling.

Please test only against your own instance: `make server` with your own Postgres and settings
(see [`.env.example`](.env.example)). Don't probe the live sites, read other people's data, or run load tests
against them.

## Supported versions

Only the current `main` branch, which is what the live sites run, gets fixes.
