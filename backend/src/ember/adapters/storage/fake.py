"""Blob storage in memory, for tests."""

import uuid

from ember.adapters.storage.interface import (
    BlobNotFound,
    SignedUrlPermission,
    blob_path,
)


class FakeBlobStorage:
    def __init__(self) -> None:
        self.blobs: dict[str, tuple[bytes, str]] = {}
        """Storage path (``<tenant_id>/<key>``) to ``(data, content_type)``."""

    async def upload(
        self, *, tenant_id: uuid.UUID, key: str, data: bytes, content_type: str
    ) -> None:
        self.blobs[blob_path(tenant_id, key)] = (data, content_type)

    async def download(self, *, tenant_id: uuid.UUID, key: str) -> bytes:
        try:
            return self.blobs[blob_path(tenant_id, key)][0]
        except KeyError:
            raise BlobNotFound from None

    async def signed_url(
        self,
        *,
        tenant_id: uuid.UUID,
        key: str,
        permission: SignedUrlPermission,
        expires_in_seconds: int,
    ) -> str:
        path = blob_path(tenant_id, key)
        return f"https://fake-storage.test/{path}?permission={permission}&expires_in={expires_in_seconds}"
