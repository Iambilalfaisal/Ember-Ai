"""The golden set: one JSON object per line.

```json
{"id": "q01", "question": "...", "expected_answer": "...", "source_doc": "a.md", "answerable": true}
```

An unanswerable question has no ``expected_answer`` and no ``source_doc``: the right reply is
"Not confirmed". Real sets never go into git (AGENTS.md section 9); this folder holds an
anonymised sample only.
"""

import hashlib
import json
from collections.abc import Iterable
from pathlib import Path
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class DatasetError(ValueError):
    """The golden file or the documents are missing or malformed."""


class GoldenItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[A-Za-z0-9._-]{1,64}$")
    question: str = Field(min_length=1)
    expected_answer: str | None = None
    source_doc: str | None = None
    answerable: bool

    @model_validator(mode="after")
    def _answer_fields_match_answerable(self) -> Self:
        has_answer = bool(self.expected_answer and self.expected_answer.strip())
        has_source = bool(self.source_doc and self.source_doc.strip())
        if self.answerable and not (has_answer and has_source):
            raise ValueError("an answerable item needs expected_answer and source_doc")
        if not self.answerable and (self.expected_answer or self.source_doc):
            raise ValueError("an unanswerable item must not have expected_answer or source_doc")
        return self


def load_golden(path: Path) -> list[GoldenItem]:
    """Read and validate a golden file.

    Raises:
        DatasetError: the file is missing, empty, has a bad line, or repeats an id.
    """
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise DatasetError(f"Cannot read the golden file {path}.") from exc
    items: list[GoldenItem] = []
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            items.append(GoldenItem.model_validate(json.loads(line)))
        except (json.JSONDecodeError, ValidationError) as exc:
            # Only the line number: the message could repeat a (real) question.
            raise DatasetError(f"{path.name} line {number} is not a valid golden item.") from exc
    if not items:
        raise DatasetError(f"{path.name} has no items.")
    ids = [item.id for item in items]
    if len(set(ids)) != len(ids):
        raise DatasetError(f"{path.name} repeats an id.")
    return items


def load_documents(directory: Path) -> dict[str, str]:
    """The knowledge base the questions are asked against: every ``*.md`` file, by file name.

    Raises:
        DatasetError: there are no documents.
    """
    documents = {
        path.name: path.read_text(encoding="utf-8") for path in sorted(directory.glob("*.md"))
    }
    if not documents:
        raise DatasetError(f"No documents (*.md) in {directory}.")
    return documents


def check_sources(items: Iterable[GoldenItem], documents: dict[str, str]) -> None:
    """Every ``source_doc`` must exist, or the item can never be answered.

    Raises:
        DatasetError: a source document is missing.
    """
    missing = sorted(
        {
            item.source_doc
            for item in items
            if item.source_doc is not None and item.source_doc not in documents
        }
    )
    if missing:
        raise DatasetError(f"source_doc not found among the documents: {', '.join(missing)}")


def inputs_fingerprint(golden: Path, documents: dict[str, str]) -> str:
    """A hash of the golden file and the documents, so a report says what it was measured on.

    Two reports are comparable only when this matches.
    """
    digest = hashlib.sha256(golden.read_bytes().replace(b"\r\n", b"\n"))
    for name, text in sorted(documents.items()):
        digest.update(name.encode())
        digest.update(text.replace("\r\n", "\n").encode())
    return digest.hexdigest()
