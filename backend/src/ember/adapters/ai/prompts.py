"""Versioned prompt files (AGENTS.md section 7).

A prompt lives in ``modules/<module>/prompts/<name>.v<N>.md`` and is referenced by name and
version, never built from long inline strings. A module passes its own folder, because adapters
may not import modules::

    prompts = PromptLibrary(Path(__file__).parent / "prompts")
    prompt = prompts.load("live_answer", version=2)
    text = prompt.render(question=question, context=context)

Placeholders are ``{{name}}``. Values are substituted in a single pass, so a value that itself
contains ``{{other}}`` (a transcript is untrusted input) is inserted as plain text and never
expanded. A prompt is changed by adding a new version file, not by editing a released one.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from ember.adapters.ai.interface import PromptRef

_NAME = re.compile(r"^[a-z][a-z0-9_]*$")
_PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


class PromptError(ValueError):
    """A prompt file is missing, or it was rendered with the wrong values."""


@dataclass(frozen=True, slots=True)
class Prompt:
    name: str
    version: int
    text: str

    @property
    def ref(self) -> PromptRef:
        return PromptRef(name=self.name, version=self.version)

    @property
    def variables(self) -> frozenset[str]:
        """The placeholder names this prompt needs."""
        return frozenset(_PLACEHOLDER.findall(self.text))

    def render(self, **values: str) -> str:
        """Fill the placeholders.

        Raises:
            PromptError: a placeholder has no value, or a value matches no placeholder.
        """
        return self._fill(values)

    def _fill(self, values: Mapping[str, str]) -> str:
        needed = self.variables
        missing = needed - values.keys()
        unused = values.keys() - needed
        if missing or unused:
            problems = []
            if missing:
                problems.append(f"missing {sorted(missing)}")
            if unused:
                problems.append(f"unused {sorted(unused)}")
            raise PromptError(f"Prompt {self.name} v{self.version}: {', '.join(problems)}.")
        return _PLACEHOLDER.sub(lambda match: values[match.group(1)], self.text)


class PromptLibrary:
    """Loads and caches the prompt files of one folder."""

    def __init__(self, directory: Path) -> None:
        self._directory = directory
        self._cache: dict[tuple[str, int], Prompt] = {}

    def load(self, name: str, *, version: int) -> Prompt:
        """Return ``<name>.v<version>.md``.

        Raises:
            PromptError: the name or version is malformed, or the file does not exist.
        """
        if not _NAME.match(name):
            raise PromptError(f"Prompt name {name!r} must be snake_case.")
        if version < 1:
            raise PromptError("Prompt versions start at 1.")
        key = (name, version)
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        path = self._directory / f"{name}.v{version}.md"
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise PromptError(f"Prompt {name} v{version} was not found.") from exc
        prompt = Prompt(name=name, version=version, text=text)
        self._cache[key] = prompt
        return prompt
