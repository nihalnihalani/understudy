.PHONY: help install install-py install-web dev api worker web test test-py typecheck lint clean redis docker-up docker-down

PY ?= python3
PIP ?= $(PY) -m pip

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: install-py install-web ## Install Python + Node deps

install-py: ## Install Python runtime + dev dependencies (uses --break-system-packages on PEP 668 systems)
	$(PIP) install --break-system-packages -e '.[dev]' || $(PIP) install -e '.[dev]'

install-web: ## Install web workspace deps
	cd apps/web && npm install

redis: ## Start Redis on :6379 (uses already-running container if present)
	@docker ps --filter "publish=6379" --format '{{.Names}}' | grep -q . \
		|| docker run -d --rm --name understudy-redis -p 6379:6379 redis:8

api: ## Run FastAPI synthesis API on :8080
	$(PY) -m uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8080

worker: ## Run synthesis worker (consumes jobs:synthesis from Redis Streams)
	cd apps/synthesis-worker && $(PY) main.py

web: ## Run Vite dev server on :5173
	cd apps/web && npm run dev

dev: ## Start Redis + API + Worker + Web together (blocks; ctrl-c stops all)
	@$(MAKE) -j4 redis api worker web

test: test-py ## Run all tests

test-py: ## Run Python test suite
	REDIS_URL=$${REDIS_URL:-redis://localhost:6379/15} pytest -rs

typecheck: ## TypeScript typecheck for web workspace
	cd apps/web && npx tsc --noEmit

lint: ## Lint Python (ruff) + JS (eslint, when configured)
	-ruff check .
	-cd apps/web && npm run lint

docker-up: ## Bring up the full docker-compose stack (redis + cosmo-router + insforge stub)
	docker compose up -d

docker-down: ## Tear down docker-compose
	docker compose down

clean: ## Remove caches and tmp uploads
	rm -rf .pytest_cache .ruff_cache **/__pycache__ /tmp/understudy-recordings
