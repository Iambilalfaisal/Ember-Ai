"""HTTP routes of the identity module: parse input, call the service, return a schema."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ember.core.db import SessionDep
from ember.core.schemas import CursorPage, Pagination
from ember.core.security import CurrentUser, Role, require_role
from ember.modules.identity.schemas import InviteUser, MeRead, UserRead
from ember.modules.identity.service import IdentityService

router = APIRouter(tags=["identity"])


def get_service(session: SessionDep) -> IdentityService:
    return IdentityService.for_session(session)


ServiceDep = Annotated[IdentityService, Depends(get_service)]

admin_only = [Depends(require_role(Role.ADMIN))]


@router.get("/me", summary="The signed-in user and their tenant")
async def read_me(user: CurrentUser, service: ServiceDep) -> MeRead:
    return await service.get_me(user.user_id)


@router.get("/users", dependencies=admin_only, summary="List the tenant's users")
async def list_users(service: ServiceDep, page: Pagination) -> CursorPage[UserRead]:
    return await service.list_users(cursor=page.cursor, limit=page.limit)


@router.post(
    "/users",
    status_code=201,
    dependencies=admin_only,
    summary="Invite a user to the tenant",
)
async def invite_user(body: InviteUser, service: ServiceDep) -> UserRead:
    return await service.invite_user(body)
