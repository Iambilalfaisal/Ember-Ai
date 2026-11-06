"""Wiring shared by the entrypoints: find what every module contributes.

A module contributes by having the file (``router.py``, ``events.py``, ``tasks.py``). Adding a
module needs no change here or in an entrypoint. Modules are visited in name order. Only
entrypoints do this; ``core`` never imports modules.
"""

import importlib
import importlib.util
import pkgutil
from types import ModuleType

from fastapi import FastAPI

import ember.modules
from ember.core.events import EventBus

API_PREFIX = "/api/v1"


def _module_file(module_name: str, file: str) -> ModuleType | None:
    """Import ``ember.modules.<module_name>.<file>`` if the module has that file."""
    dotted = f"ember.modules.{module_name}.{file}"
    return importlib.import_module(dotted) if importlib.util.find_spec(dotted) else None


def _module_names() -> list[str]:
    return [module.name for module in pkgutil.iter_modules(ember.modules.__path__)]


def include_module_routers(app: FastAPI) -> None:
    """Mount every module's ``router.router`` under ``/api/v1``."""
    for name in _module_names():
        if (router_module := _module_file(name, "router")) is not None:
            app.include_router(router_module.router, prefix=API_PREFIX)


def register_module_event_handlers(bus: EventBus) -> None:
    """Call every module's ``events.register_handlers(bus)``."""
    for name in _module_names():
        events_module = _module_file(name, "events")
        register = getattr(events_module, "register_handlers", None)
        if register is not None:
            register(bus)


def import_module_tasks() -> None:
    """Import every module's ``tasks.py``, which declares its tasks as a side effect."""
    for name in _module_names():
        _module_file(name, "tasks")
