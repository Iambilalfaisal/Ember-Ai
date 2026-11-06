"""Pydantic v2 request, response and DTO models of the identity module."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from ember.core.security import Role
from ember.modules.identity.models import UserStatus

# Trimmed and lower-cased before the checks run. The pattern is deliberately simple: the real
# proof of an address is the person signing in through Entra.
Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]


class TenantSettings(BaseModel):
    """Per-tenant configuration.

    Modules add their own fields here, each with a default the client has confirmed (for example
    the "stalled" threshold for nurturing). Business thresholds never live in code. Unknown keys
    in the stored JSON are ignored when reading.
    """

    model_config = ConfigDict(extra="ignore")

    timezone: str = "UTC"
    """IANA time zone name used for the tenant's "today" (My Day)."""


class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    settings: TenantSettings


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str | None
    roles: list[Role]
    status: UserStatus
    created_at: datetime


DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
# Order-preserving de-duplication, so ["rep", "rep"] is stored once.
UniqueRoles = Annotated[
    list[Role], Field(min_length=1), AfterValidator(lambda roles: list(dict.fromkeys(roles)))
]


class InviteUser(BaseModel):
    email: Email
    display_name: DisplayName | None = None
    roles: UniqueRoles


class MeRead(BaseModel):
    """The signed-in user and their tenant."""

    user: UserRead
    tenant: TenantRead
