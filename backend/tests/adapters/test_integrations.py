"""The ClickUp and Microsoft Graph fakes: paging, filtering, drafts."""

from datetime import UTC, datetime

import pytest

from ember.adapters.clickup.fake import FakeClickUpClient
from ember.adapters.clickup.interface import ClickUpTask
from ember.adapters.msgraph.fake import FakeGraphMailClient
from ember.adapters.msgraph.interface import EmailMessage
from ember.core.errors import NotFound


def at(day: int) -> datetime:
    return datetime(2026, 11, day, 9, 0, tzinfo=UTC)


def task(task_id: str, *, list_id: str = "list-1", day: int = 1) -> ClickUpTask:
    return ClickUpTask(
        id=task_id, name=f"Deal {task_id}", status="open", list_id=list_id, updated_at=at(day)
    )


def mail(message_id: str, day: int) -> EmailMessage:
    return EmailMessage(
        id=message_id,
        subject=f"Re: {message_id}",
        sender="buyer@client.test",
        recipients=("rep@ours.test",),
        sent_at=at(day),
        body_text="Thanks.",
    )


# --- ClickUp -----------------------------------------------------------------------


async def test_clickup_tasks_come_back_page_by_page() -> None:
    client = FakeClickUpClient([task(str(i)) for i in range(5)], page_size=2)

    seen: list[str] = []
    cursor = None
    pages = 0
    while True:
        page = await client.list_tasks(list_id="list-1", cursor=cursor)
        seen += [t.id for t in page.tasks]
        pages += 1
        cursor = page.next_cursor
        if cursor is None:
            break

    assert seen == ["0", "1", "2", "3", "4"]
    assert pages == 3


async def test_clickup_only_lists_the_requested_list_changed_since_the_given_time() -> None:
    client = FakeClickUpClient(
        [
            task("old", day=1),
            task("new", day=5),
            task("elsewhere", list_id="list-2", day=5),
        ],
        page_size=10,
    )

    page = await client.list_tasks(list_id="list-1", updated_since=at(3))

    assert [t.id for t in page.tasks] == ["new"]
    assert page.next_cursor is None


async def test_a_clickup_task_can_be_fetched_by_id_and_a_missing_one_is_not_found() -> None:
    client = FakeClickUpClient([task("a")])

    assert (await client.get_task("a")).name == "Deal a"
    with pytest.raises(NotFound):
        await client.get_task("missing")


# --- Microsoft Graph ------------------------------------------------------------------


async def test_graph_messages_come_back_oldest_first_since_the_given_time() -> None:
    client = FakeGraphMailClient([mail("c", 9), mail("a", 2), mail("b", 5)], page_size=10)

    page = await client.list_messages(mailbox="rep@ours.test", since=at(3))

    assert [m.id for m in page.messages] == ["b", "c"]
    assert page.next_cursor is None


async def test_graph_messages_are_paged() -> None:
    client = FakeGraphMailClient([mail(str(i), i + 1) for i in range(3)], page_size=2)

    first = await client.list_messages(mailbox="rep@ours.test", since=at(1))
    second = await client.list_messages(
        mailbox="rep@ours.test", since=at(1), cursor=first.next_cursor
    )

    assert [m.id for m in first.messages] == ["0", "1"]
    assert [m.id for m in second.messages] == ["2"]
    assert second.next_cursor is None


async def test_a_draft_is_saved_for_the_rep_to_review_not_sent() -> None:
    client = FakeGraphMailClient()

    ref = await client.create_draft(
        mailbox="rep@ours.test", to=["buyer@client.test"], subject="Following up", body="Hi"
    )

    assert ref.web_link.endswith(ref.id)
    (saved,) = client.drafts
    assert (saved.mailbox, saved.to, saved.subject) == (
        "rep@ours.test",
        ("buyer@client.test",),
        "Following up",
    )
