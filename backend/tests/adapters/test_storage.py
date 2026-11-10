import uuid

import pytest

from ember.adapters.storage.fake import FakeBlobStorage
from ember.adapters.storage.interface import BlobNotFound, InvalidBlobKey, blob_path

TENANT_A = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
TENANT_B = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


async def test_a_blob_can_be_uploaded_and_downloaded() -> None:
    storage = FakeBlobStorage()

    await storage.upload(
        tenant_id=TENANT_A, key="calls/1/audio.mp3", data=b"audio", content_type="audio/mpeg"
    )

    assert await storage.download(tenant_id=TENANT_A, key="calls/1/audio.mp3") == b"audio"
    assert storage.blobs[f"{TENANT_A}/calls/1/audio.mp3"] == (b"audio", "audio/mpeg")


async def test_uploading_to_an_existing_key_replaces_it() -> None:
    storage = FakeBlobStorage()
    await storage.upload(tenant_id=TENANT_A, key="a", data=b"old", content_type="text/plain")

    await storage.upload(tenant_id=TENANT_A, key="a", data=b"new", content_type="text/plain")

    assert await storage.download(tenant_id=TENANT_A, key="a") == b"new"


async def test_a_tenant_cannot_reach_another_tenants_blob_with_the_same_key() -> None:
    storage = FakeBlobStorage()
    await storage.upload(tenant_id=TENANT_A, key="secret.txt", data=b"A", content_type="text/plain")

    with pytest.raises(BlobNotFound):
        await storage.download(tenant_id=TENANT_B, key="secret.txt")


async def test_a_missing_blob_is_a_not_found_problem() -> None:
    with pytest.raises(BlobNotFound) as caught:
        await FakeBlobStorage().download(tenant_id=TENANT_A, key="nope")

    assert caught.value.status_code == 404


@pytest.mark.parametrize(
    "key",
    ["", "/absolute", "../other-tenant/x", "a/../../b", "a//b", "a/./b", "a\\b", "a/", "."],
)
def test_keys_that_could_leave_the_tenants_folder_are_rejected(key: str) -> None:
    with pytest.raises(InvalidBlobKey):
        blob_path(TENANT_A, key)


def test_the_storage_path_is_the_tenant_then_the_key() -> None:
    assert blob_path(TENANT_A, "calls/1/audio.mp3") == f"{TENANT_A}/calls/1/audio.mp3"


async def test_a_bad_key_is_rejected_by_every_operation() -> None:
    storage = FakeBlobStorage()

    with pytest.raises(InvalidBlobKey):
        await storage.upload(tenant_id=TENANT_A, key="../x", data=b"", content_type="text/plain")
    with pytest.raises(InvalidBlobKey):
        await storage.download(tenant_id=TENANT_A, key="../x")
    with pytest.raises(InvalidBlobKey):
        await storage.signed_url(
            tenant_id=TENANT_A, key="../x", permission="read", expires_in_seconds=60
        )


async def test_a_signed_url_names_one_blob_its_permission_and_its_lifetime() -> None:
    url = await FakeBlobStorage().signed_url(
        tenant_id=TENANT_A, key="calls/1/audio.mp3", permission="write", expires_in_seconds=900
    )

    assert f"{TENANT_A}/calls/1/audio.mp3" in url
    assert "permission=write" in url
    assert "expires_in=900" in url
