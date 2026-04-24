"""FastAPI ingest — accepts 60s recordings and orchestrates synthesis (architecture.md §3)."""

from .main import app

__all__ = ["app"]
