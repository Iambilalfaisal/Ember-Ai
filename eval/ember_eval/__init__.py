"""The Ember evaluation harness (F9): golden questions in, a dated report out.

Run it with ``uv run poe eval`` from ``backend/``; see ``eval/README.md`` for the report format.
It reuses the backend's AI gateway and prompt files, so what it measures is what the live
pipeline will run. It is never imported by ``src/`` (AGENTS.md section 11).
"""
