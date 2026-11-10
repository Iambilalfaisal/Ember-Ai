"""Knowledge search for the harness: the seam the real ``knowledge`` module will fill.

``KnowledgeSearch`` is what the runner calls. ``KeywordSearch`` is the fake: it splits each document
into paragraphs and scores a paragraph by the share of the question's meaningful words it contains,
counting the words of the paragraph and of the heading it sits under.
The spike S2 adds real implementations (pgvector, full-text, reranking) behind the same protocol.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from ember_eval.text import content_words, coverage


@dataclass(frozen=True, slots=True)
class Passage:
    doc: str
    text: str
    score: float
    """0 to 1. How well the passage matches the question; the confidence gate reads it."""


class KnowledgeSearch(Protocol):
    def search(self, query: str, *, k: int) -> list[Passage]:
        """The ``k`` best passages for ``query``, best first."""
        ...


class KeywordSearch:
    def __init__(self, documents: Mapping[str, str]) -> None:
        self._chunks: list[tuple[str, str, frozenset[str]]] = []
        for name, text in documents.items():
            heading = ""
            for paragraph in text.split("\n\n"):
                lines = paragraph.splitlines()
                headings = [line.lstrip("# ").strip() for line in lines if line.startswith("#")]
                heading = headings[-1] if headings else heading
                body = "\n".join(line for line in lines if not line.startswith("#")).strip()
                if body:
                    self._chunks.append((name, body, content_words(f"{heading} {body}")))

    def search(self, query: str, *, k: int) -> list[Passage]:
        wanted = content_words(query)
        scored = [
            Passage(doc=name, text=body, score=coverage(wanted, words))
            for name, body, words in self._chunks
        ]
        # Stable sort: equal scores keep document order, so a run is reproducible.
        return sorted(scored, key=lambda passage: -passage.score)[:k]
