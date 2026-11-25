# Run inside the project environment: conda activate mech_training (see environment.yml),
# or: conda run -n mech_training make check
#
# The conda environment provides Node.js. A shell profile (nvm) may put another Node.js earlier on
# PATH, so the active conda environment's bin folder is put first.
ifdef CONDA_PREFIX
export PATH := $(CONDA_PREFIX)/bin:$(PATH)
endif

# The two Node command-line tools (TypeScript run by tsx): the reaction linter and the catalogue
# build (src/reactionLinting, src/catalogueBuilding).
REACTION_LINTING = npx tsx src/reactionLinting/runFromShell.ts
CATALOGUE_BUILDING = npx tsx src/catalogueBuilding/runFromShell.ts

# Tests run at the lowest priority and, where systemd's user manager runs (WSL with systemd, most
# Linux desktops), in a memory-capped scope without swap: past TEST_MEMORY the kernel kills the
# test run alone (exit 137) instead of freezing the machine. TEST_MEMORY=8G make test to raise it.
TEST_MEMORY ?= 5G
MEMORY_CAP := $(shell systemd-run --user --scope -q true >/dev/null 2>&1 && \
	echo systemd-run --user --scope -q -p MemoryMax=$(TEST_MEMORY) -p MemorySwapMax=0)
LOW_PRIORITY_CAPPED = $(MEMORY_CAP) nice -n 19

# The files Prettier formats: TypeScript/JavaScript, Svelte and the site's CSS (fixtures, docs and
# mockups keep their own layout).
PRETTIER_FILES = "**/*.ts" "**/*.js" "**/*.cjs" "**/*.svelte" "src/**/*.css"

.PHONY: lint
lint: lint-typescript lint-reactions

.PHONY: lint-typescript
lint-typescript:
	npx prettier --check $(PRETTIER_FILES)
	npx eslint .
	npx tsc --noEmit
	npx svelte-check --tsconfig tsconfig.json --fail-on-warnings --threshold warning
	npx depcruise src

# The reaction linter on the example reactions: they must stay clean.
.PHONY: lint-reactions
lint-reactions:
	$(REACTION_LINTING) lint fixtures/reactions/*.json

# Build the learner site's catalogue from the example reactions into build/site/, a fresh calendar
# each time; the real build passes --previous-catalogue instead.
.PHONY: catalogue
catalogue:
	rm -rf build/site
	$(CATALOGUE_BUILDING) build fixtures/reactions/*.json --out build/site --start-new-calendar

# The learner site (src/learnerSite, Vite): the app built into build/app/, then merged with a
# fresh catalogue in build/site/ (open it with a static server, e.g. npx vite preview).
.PHONY: site
site: catalogue
	npx vite build
	cp -r build/app/. build/site/

# The development server, reading the catalogue from build/site/ (run make catalogue first).
.PHONY: dev
dev:
	npx vite

# The reaction editor (src/reactionEditor), served with its reaction-file server: drafts are read
# from and saved to content/reactions/. Development only; open http://localhost:5174/.
.PHONY: editor
editor:
	npx vite --config vite.editor.config.ts

# The editor built for the backend server, into build/editor/ (it saves to the server's database).
.PHONY: editor-build
editor-build:
	npx vite build --config vite.editor.config.ts

# The backend server (src/backendServer): sign-in, the reaction API and the built editor. Settings
# come from environment variables (src/backendServer/serverSettings.ts); it applies migrations first.
.PHONY: server
server:
	npx tsx src/backendServer/runFromShell.ts serve

.PHONY: test
test:
	$(LOW_PRIORITY_CAPPED) npx vitest run

# Rewrite the TypeScript/JavaScript files in Prettier's layout (lint only checks it).
.PHONY: format
format:
	npx prettier --write $(PRETTIER_FILES)

# What to run before reporting work done, and what the pre-push hook runs.
.PHONY: check
check: lint test
