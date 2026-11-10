"""Blob storage for call recordings and uploaded files.

Every operation takes the ``tenant_id`` and stores under ``<tenant_id>/<key>`` (:func:`blob_path`),
so a caller can only reach its own tenant's blobs whatever key it passes: keys that are absolute or
contain ``..`` are rejected. Only the interface and a fake exist so far; the Azure Blob
implementation comes with the Azure environment it needs.
"""

import uuid
from typing import Literal, Protocol

from ember.core.errors import NotFound

SignedUrlPermission = Literal["read", "write"]


class InvalidBlobKey(ValueError):
    """The key is empty, absolute, or tries to leave its tenant's folder (a programming error)."""


class BlobNotFound(NotFound):
    """No blob with that key for that tenant."""


def blob_path(tenant_id: uuid.UUID, key: str) -> str:
    """The storage path for ``key``: ``<tenant_id>/<key>``.

    Raises:
        InvalidBlobKey: ``key`` is empty, starts with ``/``, uses ``\\``, or has an empty, ``.``
            or ``..`` part.
    """
    parts = key.split("/")
    if not key or "\\" in key or any(part in ("", ".", "..") for part in parts):
        raise InvalidBlobKey(f"Blob key {key!r} is not allowed.")
    return f"{tenant_id}/{key}"


class BlobStorage(Protocol):
    async def upload(
        self, *, tenant_id: uuid.UUID, key: str, data: bytes, content_type: str
    ) -> None:
        """Store ``data`` under ``key``, replacing any blob already there."""
        ...

    async def download(self, *, tenant_id: uuid.UUID, key: str) -> bytes:
        """Return the blob's bytes.

        Raises:
            BlobNotFound: there is no such blob.
        """
        ...

    async def signed_url(
        self,
        *,
        tenant_id: uuid.UUID,
        key: str,
        permission: SignedUrlPermission,
        expires_in_seconds: int,
    ) -> str:
        """A time-limited URL that lets its holder read (or write) this one blob.

        The URL grants access: never log it.
        """
        ...
