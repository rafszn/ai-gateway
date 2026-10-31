# AI Gateway architecture reference

## Purpose and source of truth

This document records the architecture and conventions observable in the repository, current implementation status, and the next handoff context. Application source remains the authority when this reference and the code differ.

The repository instructions in `AGENTS.md` reserve project file changes for this reference document. Application code is returned in chat for the user to apply. Status terms follow `AGENTS.md`: **APPLIED** means code is present or the user confirmed it; **VERIFIED** requires a stated check and evidence; **PROPOSED** means returned in chat but not confirmed; **BLOCKED** means required information or action is missing; **SUPERSEDED** means replaced by a newer decision.

This reference was created from source inspection on 2026-10-30. The working tree was clean before the document was added. Source presence and inspection do not establish runtime correctness.

## Project goal

Build a low cost, self hosted gateway in front of Microsoft Foundry Azure OpenAI. It replaces APIM for a small team using coding harnesses and OpenAI clients. Backend APIs come first; an admin dashboard is later work.

The gateway must provide:

1. Admin only management APIs to create, list, update, and delete team members.
2. Multiple independent, named API keys per member. Store only a one way hash, show the secret once at creation, and allow individual revoke and delete without affecting other keys. A lost secret is replaced with a new key; there is no endpoint to retrieve it later.
3. Per key model allowlists and configurable tokens per minute, daily token, weekly token, and monthly token limits. Limits are stored but not yet enforced. The 30 day expiry and administrator reactivation lifecycle is present in source but remains unverified.
4. OpenAI compatible proxying to Foundry. Accept the client key, authenticate it, select an allowed deployment, use the Foundry credential only on the server, and support streaming as well as non streaming requests.
5. A durable usage record for every request with user, key, model, input, output and total tokens, timestamp, status, and latency. Provide user and key usage reports, including usage recovered from streamed responses.
6. Clear client errors. Invalid or revoked keys return 401. Limit rejections return 429 with `Retry-After`.
7. Accurate, efficient shared rate and quota accounting suitable for a small VPS or PaaS.

Model catalog convention: selectable GPT model identifiers use the Foundry deployment name, which appends `-1` to the model name. Examples include `gpt-6-luna-1` and `gpt-6-sol-1`. Per key model grants and client model values use this identifier. Do not remove the suffix or copy the old APIM alias rewrite into the gateway by default.

Implementation preference: keep the design simple, clean, and efficient. Reuse the current stack where it fits, add only the abstractions needed for correctness, and avoid treating an in memory cache as an authoritative quota ledger.

The Admin, member, API key, quota reservation, and Codex Responses proxy code is present in the working tree but unverified. The Responses route is mounted and connects API key authentication, model authorization, quota reservation, Foundry forwarding, streaming usage parsing, and usage finalization. The three reported type fixes are now present in source: the HTTP 413 status constant, distinct Express and Fetch response types, and raw Mongoose usage schema generics. They are APPLIED by source presence but have not been typechecked. The separate Auth endpoint is only a readiness scaffold. The dashboard is intentionally outside the first backend milestone.

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

The health endpoint reports process uptime and a timestamp. Feature routes are mounted by `src/Routes.ts`. Current mounts include `/v1/auth/`, `/v1/admin/`, `/v1/members/`, and `/v1/responses`. Admin routes include `POST /auth/login`, `GET /auth/me`, and SUPER_ADMIN protected `POST /`. Member routes are mounted at `/v1/members` and all require Admin authentication. `POST /v1/responses` uses API key authentication. Documentation endpoints are `/docs`, `/docs:v2`, and `/docs.json`.

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
5. **Scheduled jobs: APPLIED by source presence, unverified.** The cron initializer runs the API key expiry job at startup and schedules it hourly. The earlier empty schedule has been removed.
6. **Build and tests: UNVERIFIED.** `package.json` defines build, development, module generation, and start scripts, but no test script was defined and no test or build command was run for this reference.
7. **Admin authentication and RBAC: APPLIED by source presence, unverified.** The working tree contains the required environment fields, fail fast MongoDB initialization, startup seed, password hashed login, bearer authentication, database backed current principal and permissions, and SUPER_ADMIN only ADMIN creation. Mutating Admin repository methods accept an optional opaque session, and both Admin collections define explicit indexes. The current Admin routes and OpenAPI paths agree under the `/v1/admin` server prefix.
8. **Member management: APPLIED by source presence, unverified.** The working tree contains member create, paginated list, get, partial update, and delete operations. All member routes use Admin authentication and action permissions; the permission catalogue leaves deletion to SUPER_ADMIN. User records now contain username, email, optional name and phone fields, with explicit indexes. The `/v1/members` routes and OpenAPI paths agree. No build or tests were run, so compilation and behavior remain unverified.
9. **Quota reservation engine and Responses integration: APPLIED by source presence, unverified.** MongoDB per key counters and durable reservations are present. The Responses controller calls reserve before forwarding, releases reservations for pre upstream rejection, and settles from Foundry usage or the reserved estimate. `src/Routes.ts` mounts `/responses`; there is no Quotas router import or mount. Typechecking and behavior remain unverified.

Additional source level observations for future review: the error handler replaces its duplicate key and Mongoose validation messages with the original `Error.message`; the request logger records `originalUrl`, including query strings; and the attachment helper resolves a caller supplied name under `public/assets` without an explicit containment check. These behaviors have not been exercised.

## Admin authentication and RBAC

**APPLIED by source presence, not verified.** The working tree contains Admin login, current identity, permission enforcement, and SUPER_ADMIN only creation of ADMIN accounts. Role permissions are stored on role records and seeded at startup. The bootstrap SUPER_ADMIN is created only when absent; changing the environment password does not rotate an existing account. Its password is hashed with Argon2, and Admin JWTs last one hour. The middleware looks up the current administrator and role permissions for each authenticated request.

Observed paths: `src/core/Modules/Admins/controller.ts`, `docs.ts`, `dto.ts`, `permissions.ts`, `routes.ts`, `service.ts`, `types.d.ts`, `src/data/models/admin/admin.types.ts`, `admin.repository.ts`, `admin.mongoose-repository.ts`, `index.ts`, `src/data/seed/admin.seed.ts`, and `src/global/middlewares/authenticate-admin.ts`. Startup and validated configuration changes are present in `src/Bootstrap.ts`, `src/data/init.ts`, and `src/global/environment.config.ts`. These files were inspected only. No build or tests were run.

The Admin writes in this slice do not require `withTransaction()`: account creation is one document and startup role writes are idempotent and complete before listening. Mutating repository methods accept optional sessions for future multi record workflows. Avoiding a mandatory transaction also permits a standalone MongoDB deployment.

## Member management

**APPLIED by source presence, not verified.** The API provides paginated listing, retrieval by ID, creation, partial update, and hard deletion. The current route mount is `/v1/members`. All endpoints require Admin authentication and their respective permissions. ADMIN can read, create, and update members; only SUPER_ADMIN has the delete permission. Member records contain username, email, optional first name, last name, and phone number. They have no password or login recovery fields because clients authenticate with API keys.

Observed paths: `src/core/Modules/Members/controller.ts`, `docs.ts`, `dto.ts`, `routes.ts`, and `service.ts`; `src/data/models/user/user.types.ts`, `user.repository.ts`, and `user.mongoose-repository.ts`; `src/global/middlewares/validator.ts`; and `src/Routes.ts`. The User repository's mutating methods accept optional transaction sessions. Its Mongoose schema defines explicit unique username and email indexes and a newest first listing index.

The current OpenAPI paths match the mounts: member paths use `/members` and `/members/{id}`, while Admin paths use `/admin`. The Swagger server supplies the `/v1` prefix. These corrections are present in the current source; no build or documentation generation was run.

The API key collection and management routes are present. Member deletion revokes linked keys in the same transaction and preserves key history, as agreed.

## Suggested starting work

The following work reflects current progress and remaining work:

1. **Lock the client contract.** Start with the actual Codex configuration: confirm its effective `/v1/responses` path, streaming format, `api-key` header, query, and JSON model field. Then confirm OpenCode's selected adapter and whether it calls Chat Completions or Responses. Use the exact current client settings as the compatibility baseline, changing only base URL and key where possible.
2. **Check the Responses proxy type corrections.** The reported fixes are present in the HTTP status constants, controller, and usage Mongoose adapter. They are **APPLIED by source presence, unverified** because no compiler check has been run.
3. **Review request lifecycle logging and latency.** The correlated logs are present. Successful non streaming and streaming Postman traces are available. The streaming trace parsed and persisted Foundry usage and settled quota. The non streaming trace still shows a duration discrepancy between persisted usage latency and full HTTP request duration; clarify this metric before usage reporting. Real Codex behavior remains unverified.
4. **Add usage reporting.** Expose paginated usage summaries by member and key, including the agreed 80 percent daily and weekly warnings.
5. **Capture a real Codex request and run acceptance checks when authorized.** Confirm the effective URL, headers, query, streaming events, model field, quota boundaries, concurrency, upstream errors, and client disconnect behavior. Non streaming and streaming usage settlement have been observed through Postman; no live Codex request has been verified.

## Unresolved requirement boundaries

The supplied APIM policy screenshots show hourly and daily token quotas, request per minute limits, concurrency limits, and sample subscription tier values. Daily caps are now part of the agreed gateway requirements. The screenshot's other limits and sample values are examples, not agreed gateway requirements.

## Quota and key expiry design

**AGREED windows.** Each key's TPM uses a rolling 60 second window. Usage ages out continuously instead of resetting on a minute boundary. Weekly usage uses the UTC calendar week from Monday 00:00 through the next Monday 00:00. Monthly usage uses the UTC calendar month, resetting at 00:00 on its first day.

**AGREED quota policy.** Each key has independent TPM, daily, weekly, and monthly limits and counters. Daily usage resets at 00:00 UTC. A request must reserve room under all four limits before it is sent upstream. A rejected request returns 429, identifies the exhausted limit or limits as `tpm`, `daily`, `weekly`, or `monthly`, and includes a `Retry-After` value. If more than one limit blocks the request, the retry value must wait until all blocking limits have room, not just the first one checked. The exact retry time must reflect when enough capacity becomes available, particularly for the rolling TPM window.

Agreed starting tier presets, stored as editable limit values on each key rather than as a permanent tier dependency:

| Monthly preset | Weekly cap | Daily cap | TPM |
| --- | ---: | ---: | ---: |
| 2B | 600M | 140M | 500k |
| 1B | 300M | 70M | 250k |
| 600M | 180M | 40M | 150k |
| 300M | 90M | 20M | 150k |

The caps roughly follow weekly usage at 30% of monthly and daily usage at about twice the monthly fair share. These figures are starting presets and are expected to be tuned upward or customized per key. At the initial values, the first two TPM settings would take about 4 hours 40 minutes and 4 hours 27 minutes of sustained maximum use to spend their daily caps. The 300M preset's 150k TPM could spend its 20M daily cap in about 2 hours 13 minutes. This is accepted as a starting value because lowering TPM to roughly 67k to 83k for a 4 to 5 hour drain time could reject some expected large requests.

The counting basis is Foundry's reported `total_tokens`, with cached input already included in that total. Cached tokens must not be added a second time. Key reports should flag use at or above 80% of daily or weekly caps. Tiers are creation presets only; administrators can customize the concrete values per key. The starting figures can be raised as usage patterns become clear.

**AGREED enforcement rules.** Check and reserve capacity for all four limits atomically. An atomic increment by itself is insufficient if checking and incrementing are separate operations, because concurrent requests could both pass the check. Reserve a conservative estimate before proxying, then reconcile to Foundry's reported usage. If a request reached Foundry but finishes without usage data, including an interrupted stream, charge the reserved estimate. Release a reservation only when the gateway rejects the request before sending it upstream. Add a per request ceiling for input context and output tokens, and reject oversized requests rather than silently changing the requested output. The reservation estimator and explicit per request ceiling values remain to be set when the proxy is implemented.

**APPLIED by source presence, not verified.** The quota engine is in `src/data/models/quota/quota.types.ts`, `quota.repository.ts`, `quota.mongoose-repository.ts`, and `index.ts`, with service operations in `src/core/Modules/Quotas/service.ts`. Each key has a MongoDB counter document containing rolling TPM events and current UTC daily, weekly, and monthly buckets. Accepted reservations have durable records. Reserve, settle, charge estimate, and release update the counter and reservation in a transaction. Per key requests serialize through that key's counter document; unrelated keys remain independent. The Responses controller now calls the quota service; neither quota nor proxy behavior has been tested. Transaction support requires a MongoDB replica set or compatible deployment. Settlement copies typed event fields directly rather than calling `event.toObject()`.

The current implementation assigns quota usage to the UTC periods at reservation time. TPM events start at reservation time and age out after 60 seconds. This is the current source behavior; confirm it remains the intended accounting basis when the proxy is connected.

There is no Quotas controller or route module, and `src/Routes.ts` no longer imports or mounts one. The Responses router is mounted separately. Static review confirms the quota event fields are copied directly. No typecheck or build was run.

**AGREED key expiry policy.** A new key starts active and expires 30 days after creation or activation. An expiry worker marks overdue active keys expired, while authentication also checks the expiry timestamp synchronously so a delayed worker cannot permit expired credentials. The worker is scheduled hourly. The current service only reactivates an expired key, setting its next expiry to 30 days after that action; revoked keys remain revoked and require a new key. Expiry and quota windows use different clocks. For example, if a key has a 300M monthly cap and has used 80M in November before expiring, reactivating it later in November leaves 220M for November. On December 1, its monthly allowance resets because the UTC calendar month changed, whether or not the key was active at midnight. If the key expires in May and is reactivated in June after the June 1 reset, its June counter starts at zero because of the calendar boundary. Reactivation itself does not reset any counter. A 30 day active period can cross a calendar month boundary: a key created on October 20 and expiring November 19 receives a new monthly quota on November 1 while it remains active. Daily and weekly counters likewise reset at their own UTC boundaries. This prevents reactivation from restoring quota several times within one calendar period. The source records who reactivated a key and when. These lifecycle behaviors are present but unverified.

**APPLIED by source presence, not verified.** Member deletion now removes the User record and revokes linked keys in the same transaction, preserving key records and usage history. The transaction helper is used by `src/core/Modules/Members/service.ts`; no build or behavior check has been run.

**APPLIED by source presence, not verified.** The working tree now contains the API key model, repository, Admin routes, limit presets, and expiry worker. The implementation stores a secret hash and returns the generated secret during creation; no later secret retrieval route is present. A lost key is replaced by creating another key and revoking the old one. Quota values are stored, but quota enforcement and the Foundry proxy are not implemented.

## API key lifecycle and model administration

**APPLIED by source presence, not verified.** Current paths are `src/data/models/api-key/api-key.types.ts`, `api-key.repository.ts`, `api-key.mongoose-repository.ts`, and `index.ts`; `src/core/Modules/Apikeys/dto.ts`, `service.ts`, `controller.ts`, `routes.ts`, `docs.ts`, and `types.d.ts`; `src/global/constants/default-tiers.ts`; `src/cron-jobs/expire-api-keys.ts` and `index.ts`; and updates to `src/Routes.ts`, `src/core/Modules/Members/service.ts`, `controller.ts`, and `docs.ts`. The feature is mounted under `/members/{memberId}/keys`. Model identifiers are checked for the GPT deployment name pattern ending in `-1`; the Foundry deployment catalogue is not present, so actual deployment existence cannot yet be checked.

The current source adds a 2B tier to the agreed 1B, 600M, and 300M starting presets. Selected tier values are stored on each key with optional per limit overrides. Keys start active with a 30 day expiry. The worker marks overdue keys expired, and the authentication lookup also checks the expiry timestamp. Only expired keys can be reactivated; reactivation extends expiry 30 days and does not reset quota counters. Revoked keys cannot be reactivated. The cron initializer now has one hourly key expiry schedule; the old empty schedule has been removed.

The API key Mongoose adapter converts the member and administrator reference strings to ObjectIds on create and update. The user confirmed applying the full adapter replacement, and these conversions are present in the current source. This is **APPLIED by source presence, not verified**; no build or tests have been run. The Responses proxy now calls the quota reservation service. Usage reporting remains future work.

An expired, revoked, or otherwise inactive key should receive the same generic 401 response as an invalid key. A 404 would misrepresent the credential failure and could expose key state. Limit exhaustion remains a 429. The source schedules expiry hourly and permits reactivation only after expiry. The reserved estimate is supplied by the future proxy; the exact tokenizer or estimator and the explicit per request maximum are not selected.

## Handoff

The Responses proxy and usage model files are now present in the working tree, including `src/core/Modules/Responses/routes.ts`, `controller.ts`, `service.ts`, `dto.ts`, `docs.ts`; `src/core/Modules/Usage/service.ts`; and `src/data/models/usage/usage.types.ts`, `usage.repository.ts`, `usage.mongoose-repository.ts`, and `index.ts`. `src/Routes.ts` mounts the Responses router, and its router applies API key authentication. Static inspection confirms quota reservation and response usage finalization are connected in the controller. These findings establish source presence only, not successful typechecking or runtime behavior.

The user reported TypeScript errors for `HTTP_STATUS.PAYLOAD_TOO_LARGE`, Fetch response header access being typed as Express `Response`, and the `model` path rejected by the Mongoose usage schema definition. All three corrections are present in `src/global/constants/http-status-codes.ts`, `src/core/Modules/Responses/controller.ts`, and `src/data/models/usage/usage.mongoose-repository.ts`. This is **APPLIED by source presence, not verified**; no build or tests were run. The user is testing with `FOUNDRY_MAX_REQUEST_TOKENS=10000000` and `FOUNDRY_DEFAULT_MAX_OUTPUT_TOKENS=10000000`. A text request reserves the configured output amount plus a positive input estimate, so this configuration correctly rejects the request at the gateway with 413 before quota reservation or Foundry forwarding.

Request ID logging is **APPLIED by source presence** in `src/global/middlewares/authenticate-api-key.ts` and `src/core/Modules/Responses/controller.ts`. User supplied a successful non streaming Postman trace: Foundry returned 200 with usage 13 input, 7 output, 20 total tokens; the gateway reserved 296 estimated tokens, settled to the Foundry total, and persisted the usage record. The user also supplied a successful streaming trace: Foundry returned 200 as `text/event-stream`; the gateway parsed 13 input, 11 output, and 24 total tokens, settled the 16,423 token reservation to 24, and persisted the usage record. These verify the observed non streaming and streaming Postman paths only; no build or tests were run.

A second Postman request included `additionalProp1`, which the Responses DTO deliberately permits through with `.loose()`. Foundry returned 400 for that unknown parameter. Since the request reached Foundry without a usage payload, the gateway charged the 306 token reservation estimate, consistent with the agreed fallback policy. Remove the placeholder property for the next request. The usage latency in the first non streaming trace was 3,920 ms while the full HTTP request logger reported 4,981 ms. In the streaming trace, persisted usage latency was 3,620 ms and the HTTP duration was 3,619 ms, although quota and usage finalization log events followed the HTTP finish event. Clarify these timing semantics before using usage latency for reporting. Direct Codex behavior remains outstanding. Proposed request defaults remain 150,000 estimated total tokens and 16,384 default output tokens, configurable. Text input uses a byte based estimate; previous response references and multimodal input reserve the full per request ceiling. These estimates are assumptions, not tokenizer verified. Confirm the bootstrap password lifecycle before adding password management. Confirm deployment origins before treating the current CORS allow list as production behavior.
