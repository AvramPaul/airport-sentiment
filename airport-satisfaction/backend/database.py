"""
database.py
───────────
SQLAlchemy engine + session factory.
Call init_db() once at startup to create tables.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config import DATABASE_URL
from backend.models import Base

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready.")


@contextmanager
def get_db() -> Session:
    """Context manager for DB sessions — always closes on exit."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
