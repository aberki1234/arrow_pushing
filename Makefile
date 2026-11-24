# Run inside the project environment: conda activate mech_training (see environment.yml).

.PHONY: lint
lint:
	ruff check .
	mypy tools tests
	python tools/check_limits.py
	python tools/check_layers.py

.PHONY: test
test:
	python -m pytest -q

# What to run before reporting work done (and, once this is a git repo, the pre-push hook).
.PHONY: check
check: lint test
