# ✈️ Airport Sentiment: source code

The project overview, screenshots, architecture and full setup guide are in the **[main README](../README.md)**.

Quick start from this folder (requires a running MySQL server with a database named `airport_satisfaction`):

```bash
pip install -r requirements.txt
python -m backend.main                            # API → http://localhost:8000
python -m ai_pipeline.pipeline                    # AI pipeline
python -m http.server 5500 --directory frontend   # Dashboard → http://localhost:5500
```
