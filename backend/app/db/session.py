"""
Axon — SQLAlchemy Database Session
Provides a synchronous session factory (psycopg2 driver, easy to run with FastAPI).
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# PostgreSQL-specific options (not compatible with SQLite)
_pg_args = {"options": "-c search_path=public"} if settings.DATABASE_URL.startswith("postgresql") else {}

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,       # drop stale connections automatically
    connect_args=_pg_args,
)

# ── Session factory ───────────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)

# ── Base ──────────────────────────────────────────────────────────────────────
Base = declarative_base()


# ── Dependency ────────────────────────────────────────────────────────────────
def get_db():
    """FastAPI dependency: yields a DB session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
