# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize MySQL database (run once)
python -c "from backend.database import init_db; init_db()"

# Start the FastAPI backend (terminal 1)
python -m backend.main
# API at http://localhost:8000

# Start the AI pipeline (terminal 2)
python -m ai_pipeline.pipeline
```

The frontend is a static `frontend/index.html` — open it directly in a browser or serve it with any static file server.

## Configuration

All settings live in `config.py`:
- `DB_PASSWORD` — MySQL password (default: `"changeme"`)
- `CAMERAS` — dict mapping camera IDs to names and MP4 video paths (place videos in `videos/`)
- `NTFY_TOPIC` — ntfy.sh topic for push alert notifications
- `FRAME_INTERVAL_SECONDS`, `ALERT_SAD_THRESHOLD`, `ALERT_CONSECUTIVE_FRAMES`, `ALERT_COOLDOWN_MINUTES` — pipeline and alert tuning

## Architecture

Two separate Python processes communicate over HTTP:

**AI Pipeline** (`ai_pipeline/`) — runs in its own process:
1. `frame_extractor.py` — `CameraSimulator` threads read MP4 files in a loop, yielding one frame every `FRAME_INTERVAL_SECONDS` (5s default)
2. `face_detector.py` — RetinaFace detects faces in each frame
3. `emotion_classifier.py` — DeepFace (AffectNet backend) classifies emotions; raw emotions are mapped to `happy / neutral / sad` via `EMOTION_MAP` in `config.py`
4. `pipeline.py` — orchestrates the above and POSTs results to `POST /api/update`

**Backend** (`backend/`) — FastAPI app:
- `main.py` — REST endpoints; `POST /api/update` is the ingestion point from the pipeline
- `models.py` — two SQLAlchemy tables: `live_status` (one row per camera, always overwritten) and `history` (15-min aggregated snapshots)
- `aggregator.py` — APScheduler background job that runs every 15 min, computes a person-count-weighted average across buffered frames, and writes to `history`; also purges rows older than `DATA_RETENTION_DAYS` daily at 03:00
- `alerts.py` — stateful in-memory alert logic; fires ntfy.sh push notification when `sad > 50%` for 3 consecutive frames, with 10-min cooldown per camera; alert state is lost on backend restart
- `database.py` — SQLAlchemy engine and `get_db()` context manager

**Frontend** (`frontend/`) — vanilla JS + HTML dashboard polling the live and history endpoints.
