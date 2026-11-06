# 0005. Module template and the identity module

- Status: accepted
- Date: 2026-11-06

## Context

Every business module has the same layout and the same boundary rule (AGENTS.md section 2).
F4 turns that into a generator and builds the first module, `identity`, as the reference
example. Tenants and users were deferred from ADR 0003 and ADR 0004 to this module.

## Decision

- **Generator:** `scripts/new_module.py <name>` writes the standard files, a test folder with
  skipped placeholder tests (they show up in the test report as a reminder), and one
  import-linter contract. It refuses to overwrite a module and checks `pyproject.toml` before
  writing anything.
- **No registration step:** the API mounts every `ember.modules.<name>.router.router` under
  `/api/v1` by discovery, the same way Alembic already discovers `models.py`. Routers declare
  full paths and the role they require.
- **Boundary contract, one per module:** `source_modules = ["ember.modules.*"]`, the module's
  private files as `forbidden_modules`, and `allow_indirect_imports = true`.
  - A plain `ember.modules` source passes while checking nothing: import-linter skips a source
    that contains the forbidden modules. The wildcard gives one source per module, and the skip
    then correctly lets a module import its own files.
  - Indirect imports are allowed, because reaching private files through `public` is the
    intended route; direct imports of private files are what is forbidden.
  - `tests/test_import_contracts.py` runs import-linter on a throwaway project built from the
    generator's contract text, so this cannot silently stop working again.
- **Tenants table:** `tenants` is the registry that tenant scoping comes from, so it has no
  `tenant_id` and `TenantRepository` is not tenant-scoped. It is the only such repository.
  `users.tenant_id` is a real foreign key to `tenants.id`. Other modules' tables may add the
  same foreign key by table name, without importing identity's models.
- **Users:** email (lower-cased, unique per tenant), roles (text array), status
  (`invited`, `active`, `disabled`) and the Entra object id (unique per tenant). Admins invite
  users; there is no password. `disabled` is refused at sign-in; no endpoint sets it yet.
- **First sign-in:** an invited user is linked and activated when someone signs in through the
  tenant's Entra directory with a matching email (the `email` or `preferred_username` claim).
  A user who is already linked is never taken over by an email match. The match is only as
  trustworthy as the customer's directory, which is fine for one company's own Entra tenant and
  must be revisited for multi-tenant Entra (ADR 0004).
- **Sign-in transaction:** `IdentityUserDirectory` runs before the request has a session, so it
  opens a short session of its own and commits, because the link must be saved. This is the one
  place identity commits outside the request session.
- **Tenant settings:** one JSON column read through a `TenantSettings` model that ignores
  unknown keys. It has only `timezone` (default UTC). Modules add fields with defaults the client
  has confirmed; no business thresholds are guessed in code.
- **Email validation:** a simple pattern, not `EmailStr`, to avoid a new dependency
  (`email-validator`). Entra proves the address when the person signs in.
- **Bootstrap:** `scripts/create_tenant.py` creates a tenant and an invited admin, because there
  is no other way to create the first tenant.

## Consequences

- A new module gets the boundary check for free, but its contract is generated into
  `pyproject.toml`; deleting a module means removing its contract by hand.
- Placeholder tests are skipped, not failing, so a module can merge before they are written.
  Reviewers should look for skipped placeholders.
- Roles on a user are stored as plain text, so adding a role means a code change only. A role
  removed from the code would make existing rows unreadable.
- Disabling or removing users, changing roles and editing tenant settings have no endpoints yet.

## Alternatives considered

- **One contract with an explicit list of other modules:** needs editing every time a module is
  added.
- **Registering routers in `entrypoints/api.py` by hand:** simple, but a step that is easy to
  forget and that every generated module would need to patch.
- **`EmailStr`:** better validation, one more dependency to justify and keep current.
- **Linking invited users by an invitation code instead of email:** safer for multi-tenant
  directories, but needs an email-sending adapter that does not exist yet.
