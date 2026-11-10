from pathlib import Path

import pytest

from ember.adapters.ai.interface import PromptRef
from ember.adapters.ai.prompts import PromptError, PromptLibrary


@pytest.fixture
def library(tmp_path: Path) -> PromptLibrary:
    (tmp_path / "live_answer.v1.md").write_text("Answer {{question}} using {{ context }}.")
    (tmp_path / "live_answer.v2.md").write_text("v2: {{question}}")
    (tmp_path / "plain.v1.md").write_text('Return JSON like {"ok": true}.')
    return PromptLibrary(tmp_path)


def test_a_prompt_is_found_by_name_and_version(library: PromptLibrary) -> None:
    first = library.load("live_answer", version=1)
    second = library.load("live_answer", version=2)

    assert first.text.startswith("Answer")
    assert second.text.startswith("v2")
    assert first.ref == PromptRef(name="live_answer", version=1)


def test_there_is_no_latest(library: PromptLibrary) -> None:
    with pytest.raises(PromptError, match="v3 was not found"):
        library.load("live_answer", version=3)


def test_placeholders_are_filled_whatever_the_spacing(library: PromptLibrary) -> None:
    prompt = library.load("live_answer", version=1)

    assert prompt.variables == {"question", "context"}
    assert prompt.render(question="the price?", context="the price list") == (
        "Answer the price? using the price list."
    )


def test_a_missing_value_is_an_error(library: PromptLibrary) -> None:
    with pytest.raises(PromptError, match=r"missing \['context'\]"):
        library.load("live_answer", version=1).render(question="x")


def test_an_unused_value_is_an_error(library: PromptLibrary) -> None:
    with pytest.raises(PromptError, match=r"unused \['extra'\]"):
        library.load("live_answer", version=2).render(question="x", extra="y")


def test_values_are_inserted_as_text_and_never_expanded(library: PromptLibrary) -> None:
    # A transcript is untrusted: a value that looks like a placeholder must stay inert.
    rendered = library.load("live_answer", version=1).render(
        question="{{context}}", context="SECRET CONTEXT"
    )

    assert rendered == "Answer {{context}} using SECRET CONTEXT."


def test_braces_that_are_not_placeholders_are_left_alone(library: PromptLibrary) -> None:
    assert library.load("plain", version=1).render() == 'Return JSON like {"ok": true}.'


@pytest.mark.parametrize("name", ["", "Live", "../secret", "a/b", "a.b", "1abc", "a-b"])
def test_names_that_could_escape_the_folder_are_rejected(library: PromptLibrary, name: str) -> None:
    with pytest.raises(PromptError, match="snake_case"):
        library.load(name, version=1)


def test_versions_start_at_one(library: PromptLibrary) -> None:
    with pytest.raises(PromptError, match="start at 1"):
        library.load("live_answer", version=0)


def test_a_loaded_prompt_is_cached(library: PromptLibrary, tmp_path: Path) -> None:
    first = library.load("live_answer", version=2)
    (tmp_path / "live_answer.v2.md").write_text("changed on disk")

    assert library.load("live_answer", version=2) is first
