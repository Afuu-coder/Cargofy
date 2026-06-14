"""
Axon — SQLAlchemy Database Session
Provides a synchronous session factory (psycopg2 driver, easy to run with FastAPI).
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# PostgreSQL connect args — sslmode handled via URL query string for Supabase
_pg_connect_args = {}
if settings.DATABASE_URL.startswith("postgresql"):
    # Supabase requires SSL; sslmode=require is in the URL already
    _pg_connect_args = {"options": "-c search_path=public"}

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args=_pg_connect_args,
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
