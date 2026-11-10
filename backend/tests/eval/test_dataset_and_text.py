"""The golden file, the documents and the text helpers."""

import json
from pathlib import Path

import pytest

from ember_eval.dataset import (
    DatasetError,
    GoldenItem,
    check_sources,
    inputs_fingerprint,
    load_documents,
    load_golden,
)
from ember_eval.text import content_words, coverage
from tests.eval.conftest import EVAL


def write_lines(path: Path, *objects: object) -> Path:
    path.write_text("\n".join(json.dumps(o) for o in objects) + "\n", encoding="utf-8")
    return path


ANSWERABLE = {
    "id": "a1",
    "question": "How much?",
    "expected_answer": "Ten dollars.",
    "source_doc": "p.md",
    "answerable": True,
}
UNANSWERABLE = {
    "id": "a2",
    "question": "Why?",
    "expected_answer": None,
    "source_doc": None,
    "answerable": False,
}


def test_the_sample_golden_set_is_valid_and_every_source_document_exists() -> None:
    items = load_golden(EVAL / "golden" / "sample.jsonl")
    documents = load_documents(EVAL / "golden" / "docs")

    check_sources(items, documents)

    assert any(item.answerable for item in items)
    assert any(not item.answerable for item in items), "needs unanswerable questions too"


def test_a_valid_file_loads(tmp_path: Path) -> None:
    items = load_golden(write_lines(tmp_path / "g.jsonl", ANSWERABLE, UNANSWERABLE))

    assert [item.id for item in items] == ["a1", "a2"]
    assert items[0].answerable and not items[1].answerable


def test_blank_lines_are_ignored(tmp_path: Path) -> None:
    path = tmp_path / "g.jsonl"
    path.write_text(json.dumps(ANSWERABLE) + "\n\n   \n", encoding="utf-8")

    assert len(load_golden(path)) == 1


BAD = {**ANSWERABLE, "id": "bad", "question": "SECRET-QUESTION-TEXT"}
BAD_UNANSWERABLE = {**UNANSWERABLE, "id": "bad", "question": "SECRET-QUESTION-TEXT"}


@pytest.mark.parametrize(
    "bad",
    [
        {**BAD, "expected_answer": None},
        {**BAD, "source_doc": ""},
        {**BAD_UNANSWERABLE, "expected_answer": "something"},
        {**BAD_UNANSWERABLE, "source_doc": "p.md"},
        {**BAD, "id": "has space"},
        {**BAD, "question": ""},
        {**BAD, "unknown_field": 1},
        {"id": "bad", "question": "SECRET-QUESTION-TEXT"},
    ],
)
def test_a_malformed_item_is_rejected_without_repeating_its_content(
    tmp_path: Path, bad: dict[str, object]
) -> None:
    path = write_lines(tmp_path / "g.jsonl", ANSWERABLE, bad)

    with pytest.raises(DatasetError, match="line 2") as error:
        load_golden(path)

    assert "SECRET" not in str(error.value)


def test_broken_json_names_the_line_only(tmp_path: Path) -> None:
    path = tmp_path / "g.jsonl"
    path.write_text(json.dumps(ANSWERABLE) + "\n{not json SECRET\n", encoding="utf-8")

    with pytest.raises(DatasetError, match="line 2") as error:
        load_golden(path)

    assert "SECRET" not in str(error.value)


def test_a_repeated_id_an_empty_file_and_a_missing_file_are_errors(tmp_path: Path) -> None:
    with pytest.raises(DatasetError, match="repeats an id"):
        load_golden(write_lines(tmp_path / "a.jsonl", ANSWERABLE, ANSWERABLE))
    empty = tmp_path / "empty.jsonl"
    empty.write_text("\n", encoding="utf-8")
    with pytest.raises(DatasetError, match="no items"):
        load_golden(empty)
    with pytest.raises(DatasetError, match=r"Cannot read"):
        load_golden(tmp_path / "missing.jsonl")


def test_a_source_document_that_does_not_exist_is_reported() -> None:
    item = GoldenItem.model_validate(ANSWERABLE)

    with pytest.raises(DatasetError, match=r"p\.md"):
        check_sources([item], {"other.md": "x"})
    check_sources([item], {"p.md": "x"})


def test_documents_come_from_markdown_files_in_name_order(tmp_path: Path) -> None:
    (tmp_path / "b.md").write_text("B", encoding="utf-8")
    (tmp_path / "a.md").write_text("A", encoding="utf-8")
    (tmp_path / "ignored.txt").write_text("no", encoding="utf-8")

    assert list(load_documents(tmp_path).items()) == [("a.md", "A"), ("b.md", "B")]
    with pytest.raises(DatasetError, match=r"No documents"):
        load_documents(tmp_path / "nothing-here")


def test_the_fingerprint_changes_with_the_questions_or_the_documents_but_not_line_endings(
    tmp_path: Path,
) -> None:
    golden = write_lines(tmp_path / "g.jsonl", ANSWERABLE)
    docs = {"p.md": "Ten dollars.\n"}
    base = inputs_fingerprint(golden, docs)

    assert inputs_fingerprint(golden, {"p.md": "Ten dollars.\r\n"}) == base
    assert inputs_fingerprint(golden, {"p.md": "Twenty dollars.\n"}) != base
    assert inputs_fingerprint(golden, {"q.md": "Ten dollars.\n"}) != base
    write_lines(golden, {**ANSWERABLE, "question": "How much now?"})
    assert inputs_fingerprint(golden, docs) != base


def test_content_words_drop_stop_words_and_plurals() -> None:
    assert content_words("How much do the Plans cost?") == {"much", "plan", "cost"}
    assert content_words("1,000 requests per minute") == {"1,000", "request", "per", "minute"}
    assert content_words("") == frozenset()


def test_coverage_is_the_share_of_the_needles_found() -> None:
    assert coverage(frozenset({"a", "b"}), frozenset({"a", "c"})) == 0.5
    assert coverage(frozenset(), frozenset({"a"})) == 0.0
