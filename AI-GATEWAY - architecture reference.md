# AI Gateway architecture reference

## Purpose and source of truth

This document records the architecture and conventions observable in the repository, current implementation status, and the next handoff context. Application source remains the authority when this reference and the code differ.

The repository instructions in `AGENTS.md` reserve project file changes for this reference document. Application code is returned in chat for the user to apply. Status terms follow `AGENTS.md`: **APPLIED** means code is present or the user confirmed it; **VERIFIED** requires a stated check and evidence; **PROPOSED** means returned in chat but not confirmed; **BLOCKED** means required information or action is missing; **SUPERSEDED** means replaced by a newer decision.

This reference was created from source inspection on 2026-10-30. The working tree was clean before the document was added. Source presence and inspection do not establish runtime correctness.

## Project goal

Build a low cost, self hosted gateway in front of Microsoft Foundry Azure OpenAI. It replaces APIM for a small team using coding harnesses and OpenAI clients. Backend APIs come first; an admin dashboard is later work.

The gateway must provide:

1. Admin only management APIs to create, list, update, and delete team members.
2. Multiple independent API keys per member. Store only a one way hash, reveal a new key once, and allow an individual key to be revoked or deleted without affecting other keys.
3. Per key model allowlists and configurable tokens per minute, weekly token, and monthly token limits.
4. OpenAI compatible proxying to Foundry. Accept the client key, authenticate it, select an allowed deployment, use the Foundry credential only on the server, and support streaming as well as non streaming requests.
5. A durable usage record for every request with user, key, model, input, output and total tokens, timestamp, status, and latency. Provide user and key usage reports, including usage recovered from streamed responses.
6. Clear client errors. Invalid or revoked keys return 401. Limit rejections return 429 with `Retry-After`.
7. Accurate, efficient shared rate and quota accounting suitable for a small VPS or PaaS.

Model catalog convention: selectable GPT model identifiers use the Foundry deployment name, which appends `-1` to the model name. Examples include `gpt-6-luna-1` and `gpt-6-sol-1`. Per key model grants and client model values use this identifier. Do not remove the suffix or copy the old APIM alias rewrite into the gateway by default.

Implementation preference: keep the design simple, clean, and efficient. Reuse the current stack where it fits, add only the abstractions needed for correctness, and avoid treating an in memory cache as an authoritative quota ledger.

The gateway API and Foundry proxy are **PROPOSED**; no corresponding gateway implementation was found in the inspected source. The existing Auth endpoint is only a readiness scaffold. The dashboard is intentionally outside the first backend milestone.

## Administrator roles and permissions

The requested RBAC model has two roles:

1. **SUPER_ADMIN** has every platform permission, including deletion.
2. **ADMIN** has every platform permission except deleting a resource.

Roles and permission records are seeded on application startup. The initial SUPER_ADMIN username and password come from environment configuration. The source includes idempotent role seeding and creates the bootstrap administrator only when missing; the password is hashed before storage. The current source also includes Admin login, current identity, and SUPER_ADMIN only ADMIN creation routes. This code is present and inspected, but has not been built or behaviorally tested.

The permission catalogue can be derived from the requested platform operations: read, create, and update members; read, create, update, revoke, and delete API keys; view and change per key model grants; view and change per key limits; and read usage reports by member and key. Delete permissions apply to member, key, and other persisted resources. The SUPER_ADMIN role receives all catalogued actions; ADMIN receives the nondelete actions.

ADMIN may create ordinary team member accounts, but only SUPER_ADMIN may create ADMIN accounts. Runtime role assignment, promotion, and demotion are out of scope. User creation must not accept an arbitrary role from ADMIN; the ADMIN creation path creates a member account, while the SUPER_ADMIN path may create an ADMIN account.

Startup now requires MongoDB and completes the RBAC seed before listening. The source change is present; startup behavior has not been tested.

## System shape

The project is a TypeScript service using Express 5, Node ESM, MongoDB through Mongoose, and provider adapters for cache, object storage, and email. Auth remains a readiness scaffold. The Admin router is mounted and contains login, current identity, and ADMIN creation endpoints. Infrastructure and middleware are primarily scaffolding for future endpoints.

Startup in `src/Bootstrap.ts` creates the application, installs middleware and routes through `App.initialize()`, initializes MongoDB, calls `seedAdminAccess()`, schedules cron jobs, and starts listening. The configured port defaults to 5000. The current environment schema requires `MONGO_URL`; `dbInit()` rejects when it is absent. The seed exists at `src/data/seed/admin.seed.ts`, matching the bootstrap import. No shutdown handling is defined. This startup path has not been built or run.

Requests pass through this order in `src/app.ts`:

1. Proxy trust setting, Helmet, CORS, compression, HPP, cookie parsing, and JSON or URL encoded body parsing.
2. Request logging, the global rate limiter, the request guard, and static files from `public`.
3. Health and root endpoints, then feature routes under `/v1`.
4. Swagger UI and API reference routes, followed by not found and error handlers.

The health endpoint reports process uptime and a timestamp. Feature routes are mounted by `src/Routes.ts`. Current mounts are `/v1/auth/`, `/v1/admin/`, and `/v1/members/`. Admin routes include `POST /auth/login`, `GET /auth/me`, and SUPER_ADMIN protected `POST /`. Member routes are mounted at `/v1/members` and all require Admin authentication. Documentation endpoints are `/docs`, `/docs:v2`, and `/docs.json`.

## Client and Foundry endpoint compatibility

Codex is the primary client for the first compatibility milestone. There is no single endpoint shared by every coding harness; the selected SDK adapter determines the wire protocol.

1. The supplied Codex configuration sets `wire_api = "responses"`. Codex custom providers use the Responses API under their configured base URL. The screenshot's APIM base URL ends in `/gpt-6-luna/openai`, adds `api-version=2025-03-01-preview`, and sends the client credential in an `api-key` header. Treat that as an observed compatibility contract to verify with a live request capture; it is an APIM facade and does not reveal the APIM backend URL.
2. OpenCode's current provider documentation uses `@ai-sdk/openai-compatible` for `/v1/chat/completions`. When a model uses `/v1/responses`, its documented configuration uses `@ai-sdk/openai`. Supporting both routes is therefore the compatibility target for the stated Codex and OpenCode use cases.
3. The OpenAI Responses route is `POST /v1/responses`; Chat Completions is `POST /v1/chat/completions`. Microsoft Foundry's current Azure OpenAI v1 Responses route is `POST https://{resource}.openai.azure.com/openai/v1/responses`, with the deployment name supplied as `model` and an `api-key` header for key authentication. The screenshot's preview `api-version` query belongs to its APIM client contract; it does not establish which version or route APIM uses upstream.
4. Standard OpenAI clients commonly send `Authorization: Bearer <key>`, while the supplied Codex setup explicitly sends `api-key`. To satisfy the stated drop in constraint, gateway authentication should accept both header forms and never forward the gateway key to Foundry. The upstream Foundry key stays in server configuration.
5. Model aliases and Azure deployment names must be distinguished. The APIM example extracts the requested model and maps an approved alias to a Foundry deployment. The gateway should enforce the key's allowlist before mapping and proxying.

### Proposed Codex profile

For the gateway, use a standard OpenAI base URL ending in `/v1`, with `wire_api = "responses"`. Codex then sends `POST /v1/responses`. Preserve the current `api-key` header name and change its value to the gateway key. Standard Bearer authentication remains supported for other OpenAI clients. The configured client model is currently `gpt-6-luna-1`; keep that public identifier stable and resolve it to the authorized Foundry deployment on the server. This profile is **PROPOSED** until a real Codex request confirms the effective URL, headers, query, and JSON model field.

The current Codex config includes `api-version=2025-03-01-preview` in `query_params`, so changing only the base URL and key leaves that query in place. The gateway must tolerate it for ingress compatibility. The upstream Foundry version behavior must be confirmed from the APIM trace or a direct Foundry call; do not assume that an APIM query parameter proves which backend route or API version is used.

The APIM policy sample uses an unsuffixed alias and rewrites it to a deployment name. That is legacy APIM behavior, not the gateway model catalog convention. The gateway target is the suffixed deployment identifier shown in the Codex model configuration. No live Codex request has been captured yet.

Official references checked on 2026-10-30: [Codex advanced configuration](https://developers.openai.com/codex/config-advanced/), [OpenCode providers](https://opencode.ai/docs/providers/), and [Microsoft Foundry Responses API](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses).

## Repository conventions

TypeScript uses strict checking, `NodeNext` module resolution, ES2022 output, `src` as the source root, and `dist` as the build output. Source imports use `.js` suffixes for ESM compatibility.

Feature code lives under `src/core/Modules/<Feature>` and generally separates `routes.ts`, `controller.ts`, `service.ts`, `dto.ts`, `docs.ts`, and `types.d.ts`. Routes attach middleware and controllers, controllers shape HTTP responses and pass errors to `next`, services own behavior, and Zod schemas define request validation. `src/Routes.ts` explicitly mounts each feature router.

Cross cutting middleware and shared helpers live under `src/global`. Infrastructure lives under `src/core/infrastructure`. Provider facing capabilities use a contract, one or more adapters, and a service or composition module. Each data model follows its own folder pattern under `src/data/models/<name>/`, with `<name>.types.ts`, `<name>.repository.ts`, `<name>.mongoose-repository.ts`, and `index.ts`. Repository methods with multiple inputs take one `params` object. Every mutating repository method accepts optional `session?: TransactionContext`, an opaque database session alias declared with that model's data types. Adapter classes do not include the database engine in their class names. Define indexes with explicit `schema.index()` calls and review them for every model.

The User schema uses explicit unique indexes for username and email, plus an index for newest first listing.

The `scripts/make-module.ts` helper creates a feature folder and adds its route to `src/Routes.ts`. Its generated route validates the body by default and uses a GET handler, so generated modules need review when the intended input is query data or when the endpoint is not a read operation. Its pluralization is simple suffix based.

## Configuration and provider behavior

`src/global/environment.config.ts` loads `.env.<NODE_ENV>` and validates the configured application, port, MongoDB, Resend, Cloudinary, R2, and cache settings with Zod. `.env` files are ignored by Git. No checked in environment example was present during inspection.

The current validated configuration requires `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD`, and `ADMIN_JWT_SECRET`; the username is normalized to lowercase, the password must be at least 12 characters, and the JWT secret at least 32 characters. The following settings are still read outside that validated configuration: `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, and `STORAGE_PROVIDER`. Token helpers call dotenv with its default `.env` path, while the main configuration explicitly loads `.env.<NODE_ENV>`; token settings may therefore be sourced differently. Missing token secrets are converted to the string `undefined`, and startup validation does not currently require them. Storage selects R2 by default and constructs the selected adapter when `storageService` is imported. The selected adapter requires its provider credentials at construction time.

Cache is selected by `CACHE_DRIVER`, defaulting to in memory. Redis is used only when selected and a Redis URL is configured; otherwise the cache composition falls back to memory. Both adapters expose key creation, get, set with millisecond TTL, get or set, delete, prefix deletion, and clear. Redis errors are logged and treated as cache misses or no operation by the adapter. The rate limiter does not configure a shared store, so its counters use the library default process local store.

MongoDB connection is initialized in `src/data/init.ts`. Registered models have `syncIndexes()` called after connection. The User repository supports member lookup, paginated listing, creation, update, and deletion through Mongoose; all mutating methods accept an optional transaction context. The transaction helper is `src/data/transactions/mongo/index.ts`; use it when a service operation must atomically mutate multiple records. A single document write does not need a transaction.

Storage uses `StorageContract`, `StorageService`, and either the R2 or Cloudinary adapter. Image compression uses Sharp and emits WebP. Mail uses a Resend adapter behind `MailServiceContract`; a missing Resend API key is reported as a failed send result. Local attachments are read from `public/assets` by `getAttachmentContent`.

## Current implementation and gaps

All items below are **APPLIED** because corresponding source is present. They were inspected, not built, run, or behaviorally tested. No item is marked **VERIFIED**.

1. **HTTP application and middleware: APPLIED.** Express setup, health and root routes, route mounting, Swagger configuration, request validation, logging, rate limiting, request guarding, and error handling are present.
2. **Auth module: APPLIED as a scaffold.** `GET /v1/auth/` calls a service that returns a cached readiness object. It does not implement registration, login, token issuance, or a complete authentication flow. The route uses the validator's default body target even though it is a GET route; the DTO requires `type` in the body, while the OpenAPI comment describes `type` as a query parameter.
3. **Authentication helpers: APPLIED as utilities.** JWT access and refresh token helpers and a fingerprint helper exist. Their secrets are not part of the validated environment schema. The `authenticate` middleware returns without responding or calling `next` when the Authorization header is absent or malformed; if mounted in that state it can leave the request unresolved. The middleware is not currently mounted on the Auth route.
4. **Persistence and infrastructure: APPLIED as provider scaffolding.** Cache, MongoDB, mail, and storage implementations exist. Member management now uses the User repository. Storage and mail are not used by the current feature routes.
5. **Scheduled jobs: APPLIED as a placeholder.** The hourly cron callback is empty.
6. **Build and tests: UNVERIFIED.** `package.json` defines build, development, module generation, and start scripts, but no test script was defined and no test or build command was run for this reference.
7. **Admin authentication and RBAC: APPLIED by source presence, unverified.** The working tree contains the required environment fields, fail fast MongoDB initialization, startup seed, password hashed login, bearer authentication, database backed current principal and permissions, and SUPER_ADMIN only ADMIN creation. Mutating Admin repository methods accept an optional opaque session, and both Admin collections define explicit indexes. The actual create Admin route is `POST /v1/admin/`, while its OpenAPI document describes `/v1/admin/admins`.
8. **Member management: APPLIED by source presence, unverified.** The working tree contains member create, paginated list, get, partial update, and delete operations. All member routes use Admin authentication and action permissions; the permission catalogue leaves deletion to SUPER_ADMIN. User records now contain username, email, optional name and phone fields, with explicit indexes. The actual mount is `/v1/members`, while the OpenAPI document describes `/v1/admin/members`. No build or tests were run, so compilation and behavior remain unverified.

Additional source level observations for future review: the error handler replaces its duplicate key and Mongoose validation messages with the original `Error.message`; the request logger records `originalUrl`, including query strings; and the attachment helper resolves a caller supplied name under `public/assets` without an explicit containment check. These behaviors have not been exercised.

## Admin authentication and RBAC

**APPLIED by source presence, not verified.** The working tree contains Admin login, current identity, permission enforcement, and SUPER_ADMIN only creation of ADMIN accounts. Role permissions are stored on role records and seeded at startup. The bootstrap SUPER_ADMIN is created only when absent; changing the environment password does not rotate an existing account. Its password is hashed with Argon2, and Admin JWTs last one hour. The middleware looks up the current administrator and role permissions for each authenticated request.

Observed paths: `src/core/Modules/Admins/controller.ts`, `docs.ts`, `dto.ts`, `permissions.ts`, `routes.ts`, `service.ts`, `types.d.ts`, `src/data/models/admin/admin.types.ts`, `admin.repository.ts`, `admin.mongoose-repository.ts`, `index.ts`, `src/data/seed/admin.seed.ts`, and `src/global/middlewares/authenticate-admin.ts`. Startup and validated configuration changes are present in `src/Bootstrap.ts`, `src/data/init.ts`, and `src/global/environment.config.ts`. These files were inspected only. No build or tests were run.

The Admin writes in this slice do not require `withTransaction()`: account creation is one document and startup role writes are idempotent and complete before listening. Mutating repository methods accept optional sessions for future multi record workflows. Avoiding a mandatory transaction also permits a standalone MongoDB deployment.

## Member management

**APPLIED by source presence, not verified.** The API provides paginated listing, retrieval by ID, creation, partial update, and hard deletion. The current route mount is `/v1/members`. All endpoints require Admin authentication and their respective permissions. ADMIN can read, create, and update members; only SUPER_ADMIN has the delete permission. Member records contain username, email, optional first name, last name, and phone number. They have no password or login recovery fields because clients authenticate with API keys.

Observed paths: `src/core/Modules/Members/controller.ts`, `docs.ts`, `dto.ts`, `routes.ts`, and `service.ts`; `src/data/models/user/user.types.ts`, `user.repository.ts`, and `user.mongoose-repository.ts`; `src/global/middlewares/validator.ts`; and `src/Routes.ts`. The User repository's mutating methods accept optional transaction sessions. Its Mongoose schema defines explicit unique username and email indexes and a newest first listing index.

Two documentation mismatches remain: the member OpenAPI paths say `/admin/members` although the router is mounted at `/v1/members`; the create Admin OpenAPI path says `/admin/admins` although the route is mounted at `/v1/admin/`. The source route paths are recorded as authoritative until corrected. No build or tests were run.

**PROPOSED documentation correction:** change the member OpenAPI paths to `/members` and `/members/{id}`, and the create Admin path to `/admin/`. The Swagger server already supplies the `/v1` prefix. The source documentation has not yet been updated.

No API key collection exists yet. Until it does, member deletion removes only the member record. Before API keys are added, choose whether deletion rejects members with keys or deletes linked keys in a transaction.

## Suggested starting work

The following work is **PROPOSED** and ordered to reduce compatibility and accounting rework:

1. **Lock the client contract.** Start with the actual Codex configuration: confirm its effective `/v1/responses` path, streaming format, `api-key` header, query, and JSON model field. Then confirm OpenCode's selected adapter and whether it calls Chat Completions or Responses. Use the exact current client settings as the compatibility baseline, changing only base URL and key where possible.
2. **Implement API key lifecycle and model authorization.** Add key management for the applied member records, hash based key lookup, individual revocation, and per key model allowlists. Reject invalid keys and disallowed models before contacting Foundry. Resolve the member deletion policy for linked keys before enabling key persistence. First reconcile the member and create Admin OpenAPI paths with their source routes.
3. **Implement quota accounting.** Use the accepted rolling 60 second TPM window, Monday to Monday UTC weekly window, and UTC calendar month. Decide how rejected, failed, disconnected, and partially streamed requests count. Use atomic shared counters so concurrent requests cannot exceed limits through races. Return a useful `Retry-After` value on rejection. The existing memory cache is not sufficient as the source of truth for this requirement.
4. **Add the streaming proxy and usage finalization.** Forward Responses and Chat Completions to Foundry with the server credential, preserve streaming without buffering the full answer, map allowed model aliases to deployments, and record final token usage, status, and latency even when a stream ends abnormally.
5. **Add reporting and acceptance checks.** Expose paginated usage summaries by user and key. Check invalid and revoked keys, independent key revocation, model denial, each quota boundary, concurrent requests, `Retry-After`, non streaming responses, streaming usage, upstream errors, and client disconnects with both coding harnesses.

## Unresolved requirement boundaries

The supplied APIM policy screenshots show additional hourly and daily token quotas, request per minute limits, concurrency limits, and sample subscription tier values. The written project requirements currently require TPM, weekly, and monthly limits only. Treat the additional APIM values as examples, not committed gateway requirements, unless the user adds them to scope.

## Quota window convention

**AGREED.** Per key TPM uses a rolling 60 second window. At each request, recent token usage is counted over the preceding 60 seconds; it ages out continuously rather than resetting at a minute boundary. Weekly quota uses a calendar week from Monday 00:00 UTC through the next Monday 00:00 UTC. Monthly quota uses the UTC calendar month, resetting at 00:00 UTC on the first day. This keeps the longer quota counters simple while avoiding bursts around fixed minute boundaries. Quota reservation and reconciliation, error and disconnect accounting, and exact retry timing remain open for implementation design.

Other decisions still needed before quota and management implementation: whether key revocation and removing a model grant are nondelete updates; how to reserve estimated prompt and output tokens versus reconciling actual usage; and how failed, disconnected, and partially streamed requests count. Use a shared atomic counter store so concurrent requests cannot exceed limits through races.

## Handoff

Before future implementation, inspect the affected source and Git state again, then reconcile findings with this reference. Admin authentication and member management code are present but have not been built or behaviorally tested. Apply the proposed OpenAPI path corrections before publishing docs. API key lifecycle and model authorization are next. Confirm the member deletion policy before enabling key persistence. Confirm the bootstrap password lifecycle before adding password management. Confirm the intended deployment origins before treating the current CORS allow list as production behavior. Add or run checks only when the user authorizes them; no project build or test result is recorded here.
