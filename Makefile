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

# The TypeScript/JavaScript files Prettier formats (fixtures, docs and mockups keep their own layout).
PRETTIER_FILES = "**/*.ts" "**/*.js" "**/*.cjs"

.PHONY: lint-typescript
lint-typescript:
	npx prettier --check $(PRETTIER_FILES)
	npx eslint .
	npx tsc --noEmit
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
