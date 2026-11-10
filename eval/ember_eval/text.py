"""Tiny text helpers shared by the search, the fake model and the scorers.

Words are lower-cased alphanumeric runs. Stop words are dropped and a plural ``s`` is stripped,
so "plans" matches "plan". This is deliberately crude: it is a deterministic stand-in for the real
search and judge, whose job here is to exercise the harness, not to be good.
"""

import re
from typing import Final

STOP_WORDS: Final = frozenset(
    [
        "a",
        "an",
        "and",
        "any",
        "are",
        "as",
        "at",
        "be",
        "been",
        "by",
        "can",
        "could",
        "do",
        "does",
        "for",
        "from",
        "have",
        "has",
        "how",
        "i",
        "if",
        "in",
        "is",
        "it",
        "its",
        "me",
        "my",
        "of",
        "on",
        "or",
        "our",
        "please",
        "so",
        "than",
        "that",
        "the",
        "their",
        "them",
        "there",
        "these",
        "they",
        "this",
        "to",
        "us",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
    ]
)
_WORD: Final = re.compile(r"[a-z0-9]+(?:[.,][0-9]+)*")


def _stem(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


def content_words(text: str) -> frozenset[str]:
    """The distinct meaningful words of ``text``."""
    words = (match.group(0) for match in _WORD.finditer(text.lower()))
    return frozenset(_stem(word) for word in words if word not in STOP_WORDS)


def coverage(needles: frozenset[str], haystack: frozenset[str]) -> float:
    """The share of ``needles`` found in ``haystack`` (0 when there are no needles)."""
    return len(needles & haystack) / len(needles) if needles else 0.0
