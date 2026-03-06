"""
models.py
─────────
SQLAlchemy ORM models for MySQL.
"""

from sqlalchemy import Column, String, Float, Integer, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class LiveStatus(Base):
    """One row per camera — always overwritten with the latest frame data."""
    __tablename__ = "live_status"

    camera_id     = Column(String(10), primary_key=True)
    camera_name   = Column(String(50))
    happy         = Column(Float, default=0.0)
    neutral       = Column(Float, default=0.0)
    sad           = Column(Float, default=0.0)
    total_persons = Column(Integer, default=0)
    updated_at    = Column(DateTime, default=datetime.utcnow)


class History(Base):
    """Aggregated snapshot written every 15 minutes per camera."""
    __tablename__ = "history"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    camera_id     = Column(String(10), index=True)
    happy         = Column(Float, default=0.0)
    neutral       = Column(Float, default=0.0)
    sad           = Column(Float, default=0.0)
    total_persons = Column(Integer, default=0)
    recorded_at   = Column(DateTime, default=datetime.utcnow, index=True)
