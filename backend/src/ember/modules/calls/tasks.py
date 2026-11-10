"""Taskiq tasks of the calls module (verbs, e.g. ``ingest_document``).

Declare them with ``@task("calls.<verb>")`` from ``ember.core.tasks``. A task takes
``tenant_id`` first and may take ``session: JobSession``.
"""
