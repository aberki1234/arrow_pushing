# Run inside the project environment: conda activate mech_training (see environment.yml),
# or: conda run -n mech_training make check
#
# The conda environment provides Python and Node.js. A shell profile (nvm) may put another Node.js
# earlier on PATH, so the active conda environment's bin folder is put first.
ifdef CONDA_PREFIX
export PATH := $(CONDA_PREFIX)/bin:$(PATH)
endif

.PHONY: lint
lint: lint-python lint-typescript lint-reactions

.PHONY: lint-python
lint-python:
	ruff check .
	mypy tools tests python
	python tools/check_limits.py
	python tools/check_layers.py

# The reaction linter (python/reaction_linting) on the example reactions: they must stay clean.
.PHONY: lint-reactions
lint-reactions:
	PYTHONPATH=python python -m reaction_linting lint fixtures/reactions/*.json

# Build the learner site's catalogue (python/catalogue_building) from the example reactions into
# build/site/, a fresh calendar each time; the real build passes --previous-catalogue instead.
.PHONY: catalogue
catalogue:
	rm -rf build/site
	PYTHONPATH=python python -m catalogue_building build fixtures/reactions/*.json \
		--out build/site --start-new-calendar

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

# The files Prettier formats: TypeScript/JavaScript, Svelte and the site's CSS (fixtures, docs and
# mockups keep their own layout).
PRETTIER_FILES = "**/*.ts" "**/*.js" "**/*.cjs" "**/*.svelte" "src/**/*.css"

.PHONY: lint-typescript
lint-typescript:
	npx prettier --check $(PRETTIER_FILES)
	npx eslint .
	npx tsc --noEmit
	npx svelte-check --tsconfig tsconfig.json --fail-on-warnings --threshold warning
	npx depcruise src

.PHONY: test
test:
	python -m pytest -q
	npx vitest run

# Rewrite the TypeScript/JavaScript files in Prettier's layout (lint only checks it).
.PHONY: format
format:
	npx prettier --write $(PRETTIER_FILES)

# What to run before reporting work done, and what the pre-push hook runs.
.PHONY: check
check: lint test
