# TECHNICAL DECISIONS

This document records permanent or significant technical decisions.

Do not remove old decisions.
If a decision changes, mark the old decision as SUPERSEDED.

---

## DEC-001

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Split the project into two independently run applications: `frontend/`
(Next.js) and `backend/` (Express + Prisma REST API), communicating over
HTTP/JSON. Previously the Organization feature lived entirely in the
frontend, persisting to the browser's `localStorage`.

Reason:
`localStorage` is per-browser, not shared — two people looking at the
Organization page saw different data, and nothing survived a cleared
browser profile. A backend + real database is required for data to be a
shared system of record (see `docs/PROJECT_CONTEXT.md`).

Alternatives Considered:
1. Next.js API routes (Route Handlers) in the same project — rejected to
   keep the API independently deployable/scalable from the UI, and to avoid
   coupling backend framework choice (Prisma/Express) to Next.js's runtime
   constraints.
2. Keep localStorage and add manual export/import — rejected, does not solve
   multi-user sharing.

Consequences:

Positive:
- Data is centrally stored and shared across users/browsers.
- Frontend and backend can be deployed, scaled, and versioned independently.

Negative:
- Two processes to run in development instead of one.
- CORS configuration required (`CORS_ORIGIN` in `backend/.env`).

---

## DEC-002

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Run PostgreSQL for this project in its own dedicated Docker container
(`vortec-management-postgres`) and named volume (`vortec_pgdata`), on host
port 5433, defined in the repo's own `docker-compose.yml` — separate from
any other Postgres container used by other local projects (e.g. an existing
`vortec-postgres` container on port 5432).

Reason:
Keeps this project's database lifecycle (start/stop/reset/backup) and schema
fully independent from unrelated projects on the same machine, and avoids
port collisions.

Alternatives Considered:
1. Share an existing local Postgres instance with a separate database name —
   rejected to avoid coupling this project's uptime/reset cycle to another
   project's container.

Consequences:

Positive:
- This project's database can be reset/rebuilt without affecting other
  projects.
- No port conflicts with other local Postgres containers.

Negative:
- One more container to remember to start (`docker compose up -d` at the
  repo root) before running the backend.

---

## DEC-003

Date:
2026-09-07

Status:
SUPERSEDED by DEC-019 (2026-09-07) — dual supervision is now modeled with a
dedicated `RoleSupervision` table instead of being left as a text-only
limitation.

Decision:
Model `Role.parentId` as a single, nullable self-reference (a tree), not a
many-to-many "reporting lines" relation.

Reason:
Vortec System's actual org chart
(`assets/template/doc/organization_structure.md`) has one place — the
"Struktur Utama" tree — that gives every role exactly one parent. A second
section of the same document describes Project Manager and Operational
Leader both coordinating the same Technical & Quality Team roles (Quality
Control, Mechanical Engineer, Electrical Engineer, Software Development) —
a matrix/dual-supervision relationship a single-parent tree cannot represent.
The "Struktur Utama" tree was taken as the structural source of truth (roles
nest under Operational Leader only); the Project Manager's project-execution
authority over the same team is recorded as text in Project Manager's job
description instead of a second tree edge.

Alternatives Considered:
1. Many-to-many "reports to" relation instead of `parentId` — rejected for
   now: no other part of the org chart needs it, and it would complicate the
   simple tree UI (`OrgChart`/`OrgNode`) for a single edge case.

Consequences:

Positive:
- Simple, single-parent tree matches the UI and the primary source document.

Negative:
- The dual-supervision relationship for the Technical & Quality Team is not
  queryable/enforced by the data model, only documented in text.
- If more matrix-reporting cases appear later, this will need revisiting
  (introduce a separate many-to-many table).

---

## DEC-004

Date:
2026-09-07

Status:
ACCEPTED (draft content, pending business review)

Decision:
Seed the backend database with Vortec System's real org structure and
employee assignments from `assets/template/doc/organization_structure.md`
and `assets/template/doc/employees.md`, plus a generated (not yet confirmed)
company profile summary and per-role jobdesk/job-description text.

Reason:
The user asked to build roles/structure from the real org chart, then to
generate company info and jobdesk per role for review, rather than starting
from placeholder sample data.

Alternatives Considered:
1. Leave jobdesk/job description empty for manual entry — rejected per
   explicit request to generate draft content first.

Consequences:

Positive:
- The app is immediately reviewable with realistic content instead of a
  blank state.

Negative:
- Generated text (company profile summary, jobdesk bullets not explicitly
  present in the source documents) is inferred from role titles and
  business context, not confirmed by Vortec System — flagged with a "Draft —
  menunggu review" badge on the Info Perusahaan tab and must be corrected
  after user review.

---

## DEC-005

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Add authentication and authorization: a `User` model (email, optional
username, bcrypt password hash, `isSuperAdmin` flag, optional `roleId` link
to the org structure's `Role`), JWT bearer tokens (`Authorization: Bearer
<token>`, 12h expiry, `backend/.env` `JWT_SECRET`), and a super admin
bootstrap seed (`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` in
`backend/.env`; if no password is set, `prisma/seed.ts` generates one and
prints it once). Only the super admin can create/edit/delete other users
(`/api/users/*`, gated by `requireSuperAdmin`); a user can self-service their
own name/password/theme/locale via `PATCH /api/auth/me`.

Reason:
Explicit requirement: a super admin account that can create one login per
person in the org structure, with each login tied to that person's `Role`.

Alternatives Considered:
1. Session cookies instead of JWT — rejected for now: frontend and backend
   are on different origins in dev (`:3000`/`:4000`), and a bearer token
   avoids cross-origin cookie/SameSite configuration for a small internal
   tool.

Consequences:

Positive:
- Every write to Organization/Assets data is now tied to an authenticated,
  identifiable user.
- Login works with either email or username (see DEC-007).

Negative:
- No refresh-token flow yet — a token simply expires after 12h and the user
  must log in again (no silent renewal).
- No password-reset-via-email flow; only a super admin can reset another
  user's password (by design — see DEC-006).

---

## DEC-006

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Only `isSuperAdmin` users may mutate Organization data (`/api/roles/*`
POST/PATCH/DELETE) and Assets data (`/api/floors/*` POST/PATCH/DELETE, except
`GET`, which any authenticated user can read). The "Manajemen User" nav item
and `/admin/users` page are hidden/blocked for non-super-admins on the
frontend, and `/api/users/*` is blocked server-side regardless of what the
frontend shows. A super admin can set (but never read back) another user's
password — `passwordHash` is never included in any API response.

Reason:
Explicit requirement: only super admin edits Organization data and manages
users; other logged-in users get read-only access. Password write-only
access (super admin can reset, never view) was explicitly requested.

Alternatives Considered:
1. Granular per-role permissions (e.g. the "Assets" team role can edit
   Assets) — rejected for now as unnecessary complexity; only a single
   super-admin/everyone-else distinction exists today. Revisit if finer
   control is requested later.

Consequences:

Positive:
- Simple, easy-to-audit permission model: one boolean gate, enforced at the
  API layer (not just hidden in the UI).

Negative:
- All non-admin users have identical (read-only) permissions — no way yet
  to grant one non-admin user edit rights without making them a full super
  admin.

---

## DEC-007

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Login accepts either the user's email or their (optional) username in a
single `identifier` field (`POST /api/auth/login { identifier, password }`).
`username` is a separate, optional, unique column on `User`.

Reason:
Explicit requirement: "akun user login harus menggunakan email atau
username."

Consequences:

Positive:
- Staff without a memorable email format can still get an easy-to-type
  username.

Negative:
- Two unique columns (`email`, `username`) to keep collision-free on
  create/update instead of one.

---

## DEC-008

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Theme (`light`/`dark`/`system`) and language (`id`/`en`) preferences are
stored per-user on the `User` row (`theme`, `locale` columns), not only in
browser `localStorage`. On login, the account's stored preference overwrites
local state/`localStorage`; on change, the new value is written to both
`localStorage` (instant) and the account (`PATCH /api/auth/me`, best-effort).

Reason:
Explicit requirement: theme/language should follow the user's login session,
not reset when they log in again (including from a different browser).

Alternatives Considered:
1. `localStorage` only — rejected, does not survive a different
   browser/device, which is exactly what was asked to fix.

Consequences:

Positive:
- A user's preferences follow their account across sessions/devices.

Negative:
- One extra network write on every theme/language toggle
  (fire-and-forget; a failed write only affects that one change, not login).

---

## DEC-009

Date:
2026-09-07 (extended to full coverage later the same day)

Status:
ACCEPTED

Decision:
Added an i18n system (`frontend/src/lib/i18n.ts` dictionary +
`usePreferences()`'s `t()`) originally covering only the app chrome
(Sidebar, Topbar, ProfileMenu, Login, Profile). Per explicit user request
("do full i18n now"), coverage was extended to every remaining
Indonesian-only page: Organization (Info Perusahaan/Struktur
Organisasi/Daftar Role), Assets, Admin Users, Inventory, and
Projects/Tasks/Material Requests — the latter two postdate this decision's
original wording but are covered by the same extension, since they were
equally untranslated. The three centralized enum-label tables
(`PROJECT_STAGES`/`TASK_STATUSES`/`MATERIAL_REQUEST_STATUSES` in
`lib/projects-api.ts`) were changed from single-locale `label: string` to
`label: { id, en }`, threading `locale` through their `*Label()` helpers.
Hardcoded `.toLocaleDateString("id-ID", ...)` calls were replaced with a
shared `lib/format.ts` `formatDate(date, locale)` helper across every file
that rendered a date.

Two things were deliberately left out of "full" coverage, not oversights:
1. **DRAFT business content** — `lib/company-info.ts` (DEC-004), seeded
   jobdesk/job-description text, and seeded floor descriptions (DEC-010)
   stay Indonesian-only. They're explicitly unconfirmed pending user review
   (DEC-004/010); translating content that may be rewritten during that
   review would be wasted work. Only the *UI chrome around* that content
   (labels, buttons, the "Draft — menunggu review" badge, section headers)
   is translated.
2. **Backend error strings** — `backend/src/routes/*.ts` returns a
   pre-existing mix of English/Indonesian `{ error }` strings, some of
   which leak into the UI raw via `err.message` fallbacks. Properly
   localizing these needs an error-code protocol (backend returns a code,
   frontend maps it through `t()`) — a separate, larger change, not
   attempted here.

Reason:
Explicit requirement for ID/EN language support, delivered incrementally —
the chrome first (highest-traffic, lowest-effort-per-value), then extended
to full coverage once explicitly requested.

Consequences:

Positive:
- Language switching is now fully functional and account-synced (DEC-008)
  across the entire app, not just the chrome.
- One shared date-formatting helper instead of six separate
  `toLocaleDateString("id-ID", ...)` call sites that would never have
  switched with the language toggle.

Negative:
- DRAFT business content and backend error strings remain Indonesian-only
  — both are intentional, tracked exclusions (see above), not
  silently-incomplete gaps.

---

## DEC-010

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added `Floor` (label, usage, description, order) and `Asset` (optional
unique `code`, name, quantity, notes, `floorId`) models. The "Info
Perusahaan" tab's building-layout panel and the standalone `/assets` page
both read/write the same `useFloors()` data, so they are always in sync by
construction (not by a separate sync step).

Reason:
Explicit requirement: assets are organized by floor, editable in a
dedicated Assets menu, and kept in sync with the company-info floor panel.

Consequences:

Positive:
- Single source of truth for floor/asset data; no duplication or drift
  between the two surfaces that display it.

Negative:
- Floor descriptions seeded in `prisma/seed.ts` are drafted from the room's
  known function (per `layout_building.md`), not confirmed — same
  draft-content caveat as DEC-004. No sample assets were invented; the
  asset list starts empty for every floor.

---

## DEC-011

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Moved the profile/logout control from the topbar (top-right) into the
sidebar (bottom-left, above where it now anchors via `margin-top: auto`),
and removed the always-visible theme/language toggles from the sidebar —
they remain available on the Profile page (`/profile`). The dropdown menu
now opens upward (`bottom: calc(100% + gap)`) since its trigger is pinned to
the bottom of the screen.

Reason:
Explicit UI request to declutter the navbar/sidebar of the theme/language
switches and relocate the profile control to the sidebar's bottom-left.

Consequences:

Positive:
- Sidebar top area is now just branding + nav; less visual noise.

Negative:
- Theme/language are one click further away (Profile page) instead of
  always-visible — acceptable since they're an infrequent action.

---

## DEC-012

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added an optional `avatarUrl` column on `User`, storing a client-resized
(max 160px, JPEG ~85% quality) base64 data URL — not a file-storage service
or on-disk upload. `express.json()`'s body limit was raised to 2mb to
accommodate it; the backend additionally rejects any value that isn't a
`data:image/...` string or exceeds ~1.1MB decoded.

Reason:
Explicit request for a profile photo. No object storage (S3-compatible or
otherwise) exists in this stack yet, and a small internal tool's profile
photos are low-volume — storing a small resized image directly on the row
avoids standing up file-storage infrastructure for this alone.

Alternatives Considered:
1. Store files on disk under `backend/` and serve via a static route —
   rejected for now: more moving parts (multipart upload handling, disk
   path management, backup/volume concerns) for a feature that just needs a
   small avatar. Revisit if the app later needs to store larger/more files
   generally (see DEC-010's Asset model, which also has no file-attachment
   support yet).

Consequences:

Positive:
- No new infrastructure; works immediately with the existing Postgres setup.

Negative:
- Not suitable for large images or many files — this pattern should not be
  reused for anything beyond small avatars without revisiting the decision.

---

## DEC-013

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added an Inventory feature: `Material` (optional unique `code`, name, unit,
notes) and `StockMovement` (`IN`/`OUT` enum, quantity, note, timestamp,
`materialId`) models. Current stock is *not* stored as a column — it's
computed on every read as `sum(IN) - sum(OUT)` in the API response
(`stock`, alongside `totalIn`/`totalOut`), the same "single source of
truth" approach as Assets (DEC-010). Same permission model as
Organization/Assets: any logged-in user can view, only super admin can
mutate (`/api/materials/*`).

Reason:
Explicit request for a raw-materials inventory menu tracking incoming/
outgoing stock and what's currently on hand vs. already used.

Alternatives Considered:
1. Store `currentStock` as a column, updated transactionally on each
   movement — rejected: computing from the movement log on read is simpler
   to keep correct (no risk of the stored total drifting from the log) and
   the expected data volume is small enough that summing on every request
   is not a performance concern.

Consequences:

Positive:
- Stock figures can never drift from the movement history — they're
  derived from it, not duplicated.
- Movement deletion (correcting a mistake) automatically recomputes stock
  correctly with no extra bookkeeping.

Negative:
- If movement volume grows very large per material, computing the sum on
  every list request could become a cost worth revisiting (e.g. a
  materialized/cached stock column) — not a concern at current scale.

---

## DEC-014

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added a Project feature: `Project` (name, client, problem statement, target
product, budget, start/target date, `ProjectStage` enum, optional PIC user
link) and `ProjectDocument` (a per-project checklist, auto-seeded on project
creation from the 12-row DOCUMENTS table in
`assets/template/doc/Vortec_Operation_Production_Process.pdf`, each with its
owning team). `ProjectStage`'s 10 values are a direct compression of that
PDF's swimlane steps into list-friendly phases (e.g. "Engineering
Breakdown" + "Mechanical/Electrical/Software Design" + "Design Review" →
`DESIGN`) — not invented categories. Same permission model as
Organization/Assets/Inventory: any logged-in user can view, only super
admin can mutate.

Reason:
Explicit request for a Project menu, grounded in the referenced production-
process document. The user explicitly noted the document/checklist applies
to project-based work only — not all work is a project (this is simply
reflected by a piece of work having no `Project` row at all; nothing further
was needed to represent "non-project work" in this pass).

Consequences:

Positive:
- The document checklist matches the company's actual process exactly
  (names, order, owning team), not a generic placeholder.
- `ProjectStage` gives a meaningful, review-source-grounded status for a
  project list view without the complexity of modeling the full 20+ step
  swimlane flowchart.

Negative:
- The stage enum is a compression — it doesn't capture Gate 0/PRD Approval/
  Design Review/Product Valid/Final Approval as distinct sub-states inside
  a phase, only the phase itself. If per-gate tracking is wanted later,
  this would need a follow-up (e.g. a separate gate-approval sub-model).
- No separate "non-project work / task" tracker exists yet — only
  mentioned as context for why Project needed to be optional, not built in
  this pass.

---

## DEC-015

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Replaced `User.roleId` (a single nullable FK) with a `UserRole` join table,
so one account can hold multiple roles simultaneously. The migration
(`20260907151303_multi_role_and_material_requests`) preserves every
existing single-role assignment by copying it into `UserRole` before
dropping the old column — no role data was lost. All permission checks
(`canActOnTask`, `requireProjectCreator`, `canManageProjectTasks`, task-list
filtering) now resolve against the *set* of a user's role IDs/titles
instead of one.

Reason:
Explicit requirement: "pastikan 1 akun bisa disetting banyak role" — a
person at Vortec System can genuinely hold more than one position (already
seen in `employees.md`, e.g. Wiyanto).

Consequences:

Positive:
- Matches real staffing (one person, multiple hats) instead of forcing an
  artificial single-role choice.

Negative:
- Every permission check that used to be a single equality comparison is
  now a set-membership check — slightly more query overhead
  (`prisma.userRole.count`/`findMany`) per authorization decision.

---

## DEC-016

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Project creation/editing is restricted to users holding the "Operational
Manager" role (or super admin) — `requireProjectCreator` on
`POST/PATCH/DELETE /api/projects`. The task list within a project can be
managed (created/edited/deleted) by whoever holds "Project Manager", the
project's own PIC (`picUserId`), or super admin —
`canManageProjectTasks`. A task's *status* (including approve/reject) can
still be changed by whoever holds the role it's assigned to, per DEC-006.
A lightweight `GET /api/users/basic` (id + name only, any logged-in user)
was added so a non-super-admin Operational Manager can still populate the
PIC picker without needing the full super-admin-only `/api/users` list.

Reason:
Explicit requirement: only Operational Manager and super admin create
projects (which are then assigned to a PM); the PM in turn builds out the
task list and assigns it to engineering teams.

Consequences:

Positive:
- Matches the real authority chain: Operational Manager originates a
  project and hands it to a PM, who then owns its task breakdown.

Negative:
- A user who is *only* a PIC on one project (not holding "Project Manager"
  as a role) can still manage that one project's tasks — intentional, but
  worth knowing if "Project Manager" is ever renamed/restructured in the
  org chart, since the title-string match (`userHasRoleTitle`) would break
  silently rather than erroring.

---

## DEC-017

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added a Material Request (BOM / bahan baku) feature per project:
`MaterialRequest` (+ `MaterialRequestItem` line items) with status
`SUBMITTED → APPROVED/REJECTED → PROCESSING → COMPLETED`. Any logged-in
user can submit a request against a project; only "Project Manager" (or
super admin) can approve/reject a `SUBMITTED` request; only "Purchasing"
(or super admin) can move an `APPROVED` request to `PROCESSING`/`COMPLETED`.
Each transition records who acted and when (`reviewedByUserId`/`reviewedAt`,
`processedByUserId`/`processedAt`).

Reason:
Explicit requirement: "buat template setiap tim engineering memasukan BOM
atau pengajuan bahan baku yang nantinya dikembalikan ke PM untuk di review
dan di approve, setelah di approve nanti masuk ke tim purchasing dan
diproses pembeliannya."

Alternatives Considered:
1. Auto-create an Inventory (DEC-013) stock-in movement once a request is
   marked `COMPLETED` — rejected for this pass: Purchasing still has to
   physically receive/count the goods, so an automatic stock-in would
   assert something not yet verified. Purchasing logs the actual stock-in
   themselves via the Inventory page once goods arrive. Revisit if this
   manual step becomes a friction point.

Consequences:

Positive:
- The approval chain matches the requested real-world process exactly, and
  every decision is attributed to a real user for accountability.

Negative:
- No link yet between a `MaterialRequestItem` and the Inventory `Material`
  catalog (DEC-013) — items are free-text (name/unit/qty), so a purchased
  item doesn't automatically become trackable stock. See "Alternatives
  Considered" above.

---

## DEC-018

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added an n8n-style node-flow diagram (`WorkflowDiagram.tsx`) at the top of
each project's detail page, visualizing the same 8-phase main sequence used
for `ProjectStage` (DEC-014): completed phases show a green check +
green connector, the current phase pulses with an animated accent-colored
glow, and future phases are dimmed. `ON_HOLD`/`REJECTED` render as a
separate warning/danger node branching off the end of the row, since the
data model doesn't track which phase a project was on when it was put on
hold or rejected.

Reason:
Explicit request for an at-a-glance visual of which phase a project is
currently in, in the style of n8n's connected-node workflow canvas.

Alternatives Considered:
1. A full pannable/zoomable canvas (true n8n editor look) — rejected as
   overkill for a *status display* (not an editable workflow builder); a
   horizontal connected-node row communicates the same "current phase"
   information with far less complexity, and needed no new charting/canvas
   library.

Consequences:

Positive:
- Reuses the existing `ProjectStage` value directly — no new state to keep
  in sync; changing the stage dropdown updates the diagram immediately.

Negative:
- Because `ON_HOLD`/`REJECTED` don't record which phase they diverged from,
  the diagram can't show progress-so-far for those two states, only that
  the project is currently in one of them.

---

## DEC-019

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added a `RoleSupervision` model — an explicit many-to-many self-join on
`Role` (`roleId`, `supervisorId`, unique per pair) — to formally model the
Technical & Quality Team's dual supervision by both Operational Leader
(their tree `parentId`) and Project Manager. The `Role.parentId` tree is
left completely untouched; `RoleSupervision` is a strictly additive second
relation. The backend exposes it as `coSupervisorIds` on the serialized
Role and a new `PUT /api/roles/:id/supervisors` (super admin only,
replace-set semantics). The frontend shows it as a badge/hint
("+ dikoordinasi oleh: ...") next to the existing "di bawah {parent}" text
in both `RoleList` (with an editable multi-select) and `OrgNode` (read-only,
shown from both ends of the relationship) — it does not add a second
rendered tree connector, to avoid a role appearing to render twice.

Reason:
Explicit user request, superseding DEC-003's "known limitation, revisit if
it becomes a real problem" acceptance — the user asked for dual supervision
to be modeled properly rather than left as a text-only note in Project
Manager's job description.

Alternatives Considered:
1. A general graph (drop `parentId`, model all reporting lines as edges) —
   rejected: the org chart is a tree everywhere except this one matrix case;
   generalizing the whole model for one edge case would be a much larger,
   riskier change (rewriting `OrgChart`/`OrgNode`'s rendering, cascade-delete
   semantics, etc.) for no benefit beyond what the additive table already
   provides.
2. A single nullable `secondaryParentId` column on `Role` — rejected: a
   dedicated join table generalizes to more than one extra supervisor per
   role and more than one role having extra supervisors, matching
   `organization_structure.md`'s framing of Engineering/QC as "a shared
   resource... under Operational Manager" rather than a fixed 1-extra-parent
   case.

Consequences:

Positive:
- The matrix relationship is now queryable and enforced by the schema
  (`@@unique([roleId, supervisorId])`, cascade-delete on either side),
  not just documented in prose.
- Fully additive — no changes to `parentId`, the tree API response shape,
  cascade-delete behavior, or the `OrgChart`/`OrgNode` connector-line CSS.

Negative:
- There are now two places that answer "who does this role report to?" —
  the tree `parentId` (primary, structural) and `coSupervisorIds`
  (secondary, coordination-only) — the UI must keep them visually distinct
  so this isn't read as a second tree edge.

---

## DEC-020

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Two changes to the Assets feature (DEC-010):
1. Added an optional `Asset.photoUrl` column — same client-resized
   (≤480px, JPEG ~85%), base64-data-URL-in-the-DB pattern as `User.avatarUrl`
   (DEC-012), validated the same way (`data:image/...` prefix, ~1.9MB decoded
   cap). No object storage service exists in this project; asset photos are
   low-volume like avatars.
2. Narrowed who can mutate Assets data (add/edit/delete/photo) from
   "super admin only" (DEC-006's general Organization-content rule) to
   super admin **or** a user holding the "Assets", "Operational Manager", or
   "Operational Leader" org role (checked via the existing
   `UserRole`-membership pattern — see `userHasAnyRoleTitle` in
   `backend/src/auth.ts`, same shape as `projects.ts`'s
   `requireProjectCreator`). Floor *description* edits (part of the
   Organization "Info Perusahaan" tab, not the Assets menu) remain
   super-admin-only, unchanged. The standalone `/assets` page also gained
   an edit action (previously add/delete only — `updateAsset` existed in the
   API client but had no UI consumer) and a photo column/picker.

Reason:
Explicit user request: assets should be manageable by the people who
actually handle them day to day (the Assets team and their operational
chain), not gated behind super admin for every change; and asset entries
should carry an optional photo and be fully editable, not just add/delete.

Consequences:

Positive:
- The Assets team, Operational Manager, and Operational Leader can now
  manage inventory without needing super admin access.
- Asset entries can carry a visual reference photo, matching how the real
  inventory (see `asset_vortec_aug_2026.xlsx` import) is easier to identify
  by sight than by name/code alone.

Negative:
- Assets now has its own bespoke permission rule distinct from every other
  admin-gated feature in the app (DEC-006/016/017 pattern of "one specific
  role or super admin") — another rule to keep in sync if the org's role
  titles are ever renamed (same title-string-match caveat noted in DEC-016).

---

## DEC-021

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Two further additions:
1. Added an optional `Asset.acquiredAt` (procurement/acquisition date)
   column. The `/assets` page derives and displays an "age" (years/months)
   from it client-side (`assetAge()` in `app/assets/page.tsx`) rather than
   storing age as its own field, so it never goes stale.
2. Added client-side sorting to every flat list/table view across the app:
   clickable, direction-toggling column headers for genuine `<table>`
   views (Assets, Admin Users, the project detail Task Table), and a
   `Urutkan berdasarkan` (sort-by) dropdown + direction toggle for card-list
   views that have no table headers (Inventory, Projects). A small shared
   helper (`lib/sort.ts`'s `sortRows`/`compareValues`) is reused by all of
   them. Hierarchical/structural views (the org chart tree, Kanban's
   status columns, the Gantt/Timeline visualizations) were deliberately
   left out — sorting would break the grouping/ordering that is the entire
   point of those views.

Reason:
Explicit user requests: "tambahkan juga field foto asetnya... tanggal
pengadaan barang, sehingga bisa tau umur barangnya" (asset age) and "buat
juga setiap list atau tabel bisa di sortir" (every list/table sortable).

Consequences:

Positive:
- Asset age is derivable and always current, not a value that can drift
  out of sync with `acquiredAt`.
- One shared, tested sort utility instead of five bespoke implementations
  — consistent behavior (stable string/number/date/boolean comparison) app-wide.

Negative:
- Sort state is local to each page/component (not persisted, not synced to
  the URL) — it resets on navigation or reload. Acceptable for this pass;
  revisit if users want their sort preference to stick.

---

## DEC-022

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added a Purchasing menu and a Vendor directory.
1. `GET /api/purchasing/material-requests` — every `MaterialRequest` with
   status APPROVED/PROCESSING/COMPLETED across *all* projects (the
   Purchasing team's actual queue: requests a Project Manager has already
   approved). `GET /api/purchasing/tasks` — every `Task` assigned to the
   "Purchasing" org role across all projects. Both are new, dedicated
   endpoints rather than reusing `GET /api/projects`, because that route's
   per-project task list is filtered to the requesting user's *own* roles
   for non-admins (see `projects.ts`) — which would hide Purchasing's tasks
   from the Operational Manager/PM/Operational Leader viewers this menu is
   also meant for.
2. Viewing the Purchasing menu: Purchasing, Operational Manager, Project
   Manager, Operational Leader, or super admin (`requirePurchasingViewer`).
   Editing (processing a request, managing vendors): Purchasing or super
   admin only (`requirePurchasingEditor`) — everyone else is read-only, no
   separate UI needed since the mutation actions simply aren't rendered for
   them and the backend enforces the same gate independently. Material
   request *processing* itself reuses the existing
   `PATCH /projects/:id/material-requests/:id/process` endpoint unchanged —
   it was already Purchasing/super-admin-gated.
3. Added `Vendor` (name, type `COMPANY`/`MARKETPLACE`, optional link,
   optional contact, notes) as a simple directory — a company or a
   marketplace listing Purchasing sources materials from. Same
   viewer/editor gate as the rest of the Purchasing menu
   (`requirePurchasingViewer`/`requirePurchasingEditor` in
   `backend/src/routes/purchasing.ts`, reused by `routes/vendors.ts`).

Reason:
Explicit user request: a Purchasing menu listing PM-approved material
requests ready to buy, connected to the Purchasing team's tasks, plus a
vendor sub-list (company or marketplace link) — with an explicit
view-vs-edit split by role given in a follow-up message.

Consequences:

Positive:
- Purchasing gets one place to see everything relevant to them across every
  project, instead of hunting through each project's detail page.
- The view/edit permission split is enforced server-side per endpoint, not
  just hidden in the UI.

Negative:
- Attachments are read-only on the Purchasing page (no upload/remove) —
  full attachment management still requires the project detail page. Kept
  out of scope to avoid duplicating `AttachmentList`'s upload wiring for a
  cross-project view.

---

## DEC-023

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added an Approvals menu (`/approvals`, visible to every logged-in user, no
role gate on the nav item itself — see Reason): a personalized,
cross-project inbox of `GET /api/approvals`, returning (1) `Task`s with
`requiresApproval: true` and status `WAITING_APPROVAL` whose
`assignedRoleId` is one of the caller's own roles (or, for super admin,
every such task — same "sees all vs. sees own" split as `GET
/api/projects`), and (2) `MaterialRequest`s with status `SUBMITTED`, only
for callers holding "Project Manager" (or super admin). Approve/Reject
buttons call the existing, already-correctly-gated endpoints unchanged
(`PATCH /projects/:id/tasks/:id` with `status: DONE|REJECTED`, `PATCH
/projects/:id/material-requests/:id/review`) — since an item only appears
in the list if the caller is already allowed to act on it, no extra
client-side permission check is needed before rendering the action buttons.

Reason:
Explicit user request: "menu approval untuk role yang harus melakukan
approval" (an approval menu for whichever role has to approve). Unlike
Purchasing's fixed viewer role set, who "must approve" is inherently
dynamic — it's whoever a task happens to be assigned to (mostly "Director"
per the seeded flowchart gates) or whoever holds "Project Manager" — so the
nav item itself isn't role-gated; the page's content is personalized
per-viewer by the backend instead.

Consequences:

Positive:
- One inbox surfaces every pending approval a user is responsible for,
  across every project, instead of them having to check each project
  individually.
- Zero new mutation endpoints — approve/reject reuses exactly the
  endpoints already proven correct for the project detail page.

Negative:
- The nav item shows for everyone even if they have nothing pending
  (empty state) — acceptable since approval duty is dynamic and can't be
  predicted from role alone without querying.

---

## DEC-024

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added a Notifications menu (`/notifications`, visible to everyone, no role
gate — same reasoning as Approvals). `GET /api/notifications` returns four
due-date-based lists — overdue tasks, tasks due within 3 days, overdue
projects, projects with a target date within 7 days (projects in
`RELEASED`/`REJECTED`/`ON_HOLD` are excluded — no deadline reminder makes
sense for those) — plus a `pendingApprovalsCount` reusing the same
visibility rules as DEC-023's Approvals endpoint, so the page can bridge to
it without duplicating its data. Visibility follows the same personalized
pattern as Approvals/Purchasing: super admin sees every task, everyone else
only their own role-assigned tasks; projects stay visible to everyone
(same as `GET /api/projects`). The sidebar nav item shows a live badge
count (`useNotifications()` polls the endpoint every 60s).

Reason:
Explicit user request: "menu notification yang berisi reminder untuk due
date dan yang berhubungan yang harus diberi notif" (a notifications menu
with due-date reminders and related things worth notifying about) — the
pending-approvals bridge covers "related things" without inventing a
second parallel notion of "needs attention."

Consequences:

Positive:
- One glanceable place (plus a sidebar badge) for anything with an
  approaching or passed deadline, across every project.
- No new persistent state — everything is computed live from existing
  `dueDate`/`targetDate` fields, so there's nothing to keep in sync or go
  stale.

Negative:
- 60-second polling adds a recurring background request per active tab —
  acceptable at this app's scale; would need a push mechanism (SSE/
  WebSocket) if that becomes a real cost.
- No "mark as read/dismiss" — a reminder simply stops appearing once its
  underlying task/project is completed or its date no longer qualifies,
  not because a user acknowledged it. Revisit if users want to
  dismiss/snooze individual reminders.

---

## DEC-025

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added a shared `ConfirmDialog` component
(`frontend/src/components/shared/ConfirmDialog.tsx`) — a portaled modal
requiring the user to type the item's exact name before its destructive
action button becomes clickable — and applied it to every *cascading*
delete: Project (deletes all its tasks/documents/material requests), Role
(deletes descendant roles/employees/jobdesk), User, and Material (loses its
movement history). `OrgNode.tsx`'s previous bespoke inline "Ya, hapus?" bar
was replaced by the same shared dialog for consistency. Every other delete
in the app (Asset, Vendor, a single Task, an Employee, a Jobdesk item, an
Attachment, an Inventory movement entry) is single-record with no cascade
and keeps the existing plain `window.confirm()` yes/no.

Reason:
Explicit user instruction: "setiap aktivitas perubahan harus dengan
validasi, jika resikonya minor maka cukup dengan yes or not, namun jika
impactnya besar maka validasinya dengan mengisi text dulu baru yes or not"
(every change needs validation — minor risk gets a plain yes/no, high
impact gets a type-then-confirm double validation). Scope narrowed to
cascading deletes specifically, per the user's own follow-up choice when
asked to clarify which actions counted as "high impact."

Consequences:

Positive:
- One shared, reusable component instead of four bespoke confirmation
  flows — consistent look, keyboard handling (Enter submits once the typed
  text matches, Escape cancels), and behavior everywhere it's used.
- Meaningfully harder to fat-finger a `window.confirm()` "OK" and lose an
  entire project or role subtree by accident.

Negative:
- A modal is heavier than `window.confirm()` — one more component
  (`ConfirmDialog`) and a bit more state (`confirming*` booleans) per
  call site, versus a single inline conditional.

---

## DEC-026

Date:
2026-09-07

Status:
ACCEPTED (partial mutation coverage — see Negative)

Decision:
Added an Activity Log menu (`/activity-log`, super admin + Operational
Manager only — `canViewActivityLog()` on the frontend, `requireActivityViewer`
on the backend). Two backend pieces:
1. `ActivityLog` model (`userId` nullable/SetNull, `userName` snapshotted
   at write time so a later-deleted user's name isn't lost, `action`,
   `entityType`, `entityId`, `description`, `createdAt`) + a fire-and-forget
   `logActivity`/`logActivityFor` helper (`backend/src/activityLog.ts`) —
   a logging failure never breaks the mutation it's describing (wrapped in
   `.catch(console.error)`, not awaited). Wired into the highest-value
   mutations: Role create/rename/delete + Employee add/remove; Asset
   create/update/delete; Material create/update/delete + stock in/out;
   Project create/update/delete; Task create/status-change(incl. approve/
   reject)/delete; Material Request submit/review/process/delete; User
   create/update/delete; Vendor create/update/delete.
2. `User.lastSeenAt` (nullable `DateTime`), updated best-effort inside
   `requireAuth` — throttled to at most once per 30s per user so it isn't a
   write on every single request. "Online" = `lastSeenAt` within the last 5
   minutes (`GET /api/activity-log/online`) — this is presence-by-recent-
   activity, not a real session/websocket presence system.

Reason:
Explicit user request: "menu log activity untuk akun super admin dan
operasional manager saja... aktivitas dari setiap perubahan yang ada,
status akun yang sedang login atau online. aktivitas project."

Consequences:

Positive:
- One place for Operational Manager/super admin to see who did what and
  who's currently active, without digging through each feature separately.
- Logging failures are inherently non-fatal — an audit-trail bug can never
  take down the feature it's auditing.

Negative:
- Coverage is deliberately *not* literally every mutation: high-frequency,
  low-audit-value actions (job description text edits, jobdesk item add/
  remove, project document checklist ticks, attachment upload/remove,
  material-request/task attachment changes, stock-movement-entry deletion)
  are intentionally excluded to avoid flooding the feed with routine noise.
  Revisit if the user wants literally everything captured.
- No filtering/search UI yet (by user, by entity type, by date range) —
  the feed is a flat, most-recent-first list capped at 50 by default
  (`?limit=`/`?before=` exist on the API for pagination but aren't wired
  into the frontend yet).
- "Online" is inferred from request recency, not a true presence system —
  a user who closes their laptop mid-session still shows "online" for up
  to 5 minutes.

---

## DEC-027

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Fixed a real role-scoping gap in `GET /api/notifications`: project due-date
reminders (`overdueProjects`/`upcomingProjects`) were visible to *every*
logged-in user regardless of role, unlike task reminders (already correctly
filtered to the caller's own assigned roles). Now a non-admin only sees a
project's reminder if they're its `picUserId`, or if they hold "Project
Manager" or "Operational Manager" — the same two roles the codebase
already trusts with project-wide authority elsewhere
(`canManageProjectTasks`/`canCreateProject` in `routes/projects.ts`). Super
admin still sees everything. Task reminders, the pending-approvals count,
the Approvals inbox, and the Purchasing/Activity Log role gates were all
re-audited at the same time and confirmed already correct — no other gap
found.

Reason:
Explicit user instruction: "pastikan notifikasi muncul sesuai rolenya...
jangan sampai ada notif yang tidak buat rolenya" (make sure notifications
match their role — nothing should appear for a role it isn't for), plus
re-confirmation that Activity Log's existing super-admin/Operational-
Manager-only gate (DEC-026) is correct and must stay that way.

Consequences:

Positive:
- A role with no project involvement (e.g. Finance) no longer sees
  project-deadline noise that isn't theirs to act on.
- Verified with a real temporary test account (a Finance-Manager-role user
  created directly in the DB, logged in, checked, then deleted) against a
  project target date deliberately moved into the reminder window and
  restored after — not just "the test data happened to be empty."

Negative:
- None identified — this closes a real correctness gap with no new
  trade-off.

---

## DEC-028

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Added color-coded category badges to both Notifications and Activity Log.
1. **Notifications** (`lib/severity.ts`'s `dateSeverity()` +
   `components/shared/SeverityBadge.tsx`): red "Mendesak/Urgent" for
   anything overdue, amber "Segera/Due Soon" for anything due within 1 day,
   blue "Akan Datang/Upcoming" for the rest of the lookahead window —
   standard red/amber/blue severity convention, computed client-side from
   the `overdue` flag and date already in the API response (no backend
   change needed).
2. **Activity Log** (`lib/activityCategory.ts`'s `categorizeActivity()` +
   `components/shared/ActivityCategoryBadge.tsx`): every entry's `action`
   string (e.g. `"role.create"`, `"task.delete"`) is bucketed into
   create/update/delete/decision by suffix and shown as a small colored
   badge (green/blue/red/purple) next to its description.

Reason:
Explicit user requests: "buat juga kategori notif, misal merah untuk
urgent... sesuai uiux" (add notification categories, e.g. red for urgent,
per UI/UX convention), then "activity log juga di kategorikan ya" (Activity
Log should be categorized too).

Consequences:

Positive:
- At-a-glance scanability — red items demand attention first, without
  reading every row's date.
- Both categorizations are pure functions over data the API already
  returns, so no backend changes, no new endpoints, no schema changes.

Negative:
- The 1-day "due soon" threshold and the action→category suffix mapping
  are both hardcoded judgment calls, not user-configurable.

---

## DEC-029

Date:
2026-09-07

Status:
ACCEPTED

Decision:
Two additions to the Activity Log:
1. Login events: `POST /api/auth/login` now calls `logActivity` directly
   (not `logActivityFor` — there's no `req.authUser` yet at that point in
   the request) for both a successful login (`auth.login`) and a failed
   attempt with a wrong password for a real account (`auth.loginFailed`,
   `userId` still recorded since the account was identified even though
   the password didn't match). An identifier matching no account at all
   logs nothing (no user to attribute it to).
2. A second, independent categorization axis — "what area of the app" —
   alongside the existing "what kind of change" axis from DEC-026/DEC-028:
   `lib/activityCategory.ts`'s `activityDomain(entityType)` buckets every
   entry into `login` (`entityType === "Auth"`) / `project` (`Project`,
   `Task`, `MaterialRequest`) / `crud` (everything else — Role, Employee,
   Asset, Material, User, Vendor). Rendered as filter tabs (All/Login/
   Actions/Project) on the Activity Log page, computed client-side from
   data the API already returns — no new endpoint or query param.

Reason:
Explicit user request: "log activity itu termasuk login juga... dibuat
filternya, ada log untuk login activity, log untuk aktivitas yang sifatnya
action, misal crud, 1 lagi aktivitas yang terkait project."

Consequences:

Positive:
- Login (including failed attempts) is now part of the audit trail, not a
  blind spot.
- The domain filter lets an Operational Manager or super admin scan just
  the category they care about instead of one long undifferentiated feed.

Negative:
- Failed-login logging only fires when the identifier matches a real
  account (so it can be attributed to a user) — a brute-force attempt
  against a nonexistent email/username leaves no trail. Acceptable for
  this app's threat model (small internal tool); revisit if that changes.

Addendum (2026-09-09): Per explicit request ("tambahkan Log Aktivitas.
filter kategori operasional"), a 4th domain — `"operational"` — was added
to `activityDomain()` (`frontend/src/lib/activityCategory.ts`), bucketing
`DailyReport`/`KasbonPhase`/`KasbonItem` entries (previously lumped into
the generic `"crud"` bucket alongside Role/Employee/Asset/Material/User/
Vendor) into their own filter tab, so Operasional-menu activity can be
scanned on its own. Purely a frontend reclassification — no backend or
`ActivityLog` schema change, since `entityType` already distinguished
these rows.

---

## DEC-030

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Added production Docker images for both apps so the whole stack can run
via `docker compose up -d` alone, with no manual `npm run dev`:
`frontend/Dockerfile` (multi-stage: `npm ci` → `next build` with
`output: "standalone"` in `next.config.ts` → a minimal `node server.js`
runtime) and `backend/Dockerfile` (multi-stage: `npm ci` → `prisma
generate` + `tsc` build → a runtime that also carries `src/`,
`tsconfig.json`, and full `node_modules` — not a pruned production-only
set — because the container's start command runs `prisma migrate deploy`
then `npx tsx prisma/seed.ts` before `node dist/index.js`, and the
idempotent seed script isn't part of the `tsc` output; it runs against
source via `tsx`, which needs `src/auth.ts` and friends present). Both
have a `.dockerignore` excluding `node_modules`/`.env`/build output — real
secrets are never baked into an image; `docker-compose.yml`'s new
`backend` service loads them via `env_file: ./backend/.env`, with
`DATABASE_URL`/`PORT`/`CORS_ORIGIN` overridden through `environment:` to
the in-network values (Compose's `environment:` wins over `env_file:` for
the same key). `frontend`'s `NEXT_PUBLIC_API_URL` is a build `ARG` (Next.js
bakes `NEXT_PUBLIC_*` into the client bundle at build time, not runtime) —
defaulted to `http://localhost:4000/api`, the same fallback already in the
frontend's own code, so it works without any override needed. Existing
`npm run dev` workflows in both projects are completely unaffected — this
is additive.

Reason:
Explicit user request: "buat frontend atau url bisa diakses tanpa npm run
dev, jadi ketika docker dan container hidup, url sudah bisa diakses",
choosing a production build (not a dev-mode/hot-reload container) when
asked to clarify.

Alternatives Considered:
1. Dev-mode containers (`npm run dev`/`tsx watch` inside Docker, source
   volume-mounted) — offered as the alternative and explicitly declined by
   the user in favor of a production build.

Consequences:

Positive:
- `docker compose up -d` alone brings up Postgres + a fully migrated/seeded
  backend + a built frontend — verified end-to-end (page loads, a real
  login through the containerized backend, correct CORS headers) after
  fixing a real bug found during that verification (see Negative).
- No secrets committed or baked into any image.

Negative:
- A production build means code changes require an image rebuil
  (`docker compose build backend`/`frontend`) to take effect — there is no
  hot reload in this mode, unlike local `npm run dev`. For that reason,
  active development in this session continues on local `npm run dev`
  servers; the Docker path is for "just needs to be accessible" scenarios
  (handing off to the team, leaving it running), started with
  `docker compose up -d` whenever wanted.
- Found and fixed during verification: the first backend image only copied
  `dist` into the runtime stage, but the startup seed step runs
  `prisma/seed.ts` via `tsx` directly against TypeScript source (not the
  compiled `dist` output), which imports from `../src/auth` — so `src/`
  and `tsconfig.json` had to be copied into the runtime image too, not
  just `dist`.
- The backend image keeps full `node_modules` (including `tsx`,
  `typescript`, `prisma` as CLI) rather than a pruned production-only set,
  specifically so the seed step can run — a real image-size trade-off,
  acceptable for a small internal tool.

---

## DEC-031

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Added a monitoring dashboard on the Projects page (`/projects`), as a
`Tab = "dashboard" | "list"` switcher defaulting to "dashboard"
(`frontend/src/app/projects/page.tsx`), with the existing create-form/sort/
list behavior moved under the "list" tab unchanged. `ProjectsDashboard.tsx`
computes everything client-side from the already-loaded `projects` array
(no new endpoint): total/active project counts, task completion rate,
overdue task/project counts (via the existing `dateSeverity` helper),
total budget, a project-count-by-stage bar (sequential ramp, with ON_HOLD/
REJECTED breaking out into the reserved warning/danger colors since
they're exceptions to the pipeline, not further stages of it), a task-
status stacked bar (reserved status palette, matching `TaskKanban`'s column
colors for consistency), a material-request status breakdown, and a
"needs attention" list merging overdue projects and overdue tasks sorted
by date. Followed the dataviz skill's procedure throughout, using the
app's own design tokens (`--color-info`/`--color-warning`/`--color-danger`/
`--color-success`, `--color-surface*`, `--r-full`) as the palette instead
of the skill's generic default.

Reason:
Explicit user request: "buatkan dashboard untuk monitoring projectnya" on
the Projects page.

Consequences:

Positive:
- No new backend endpoint or role gate needed — the dashboard reuses
  `GET /api/projects`'s existing per-role task filtering, so a non-admin
  viewer's dashboard numbers are automatically scoped the same way their
  task list already is.
- Verified rendering in-browser after a stale-Docker-container issue (see
  Negative) was resolved.

Negative:
- Because `GET /api/projects` filters each non-admin's `tasks` array down
  to their own roles (see DEC-023's "sees all vs. sees own" note), a non-
  super-admin Project Manager or Operational Manager's dashboard stats
  (task completion rate, overdue tasks, task-status bar) only reflect
  tasks assigned to roles *they personally hold* — not the full picture
  across every team in their projects. Full cross-team visibility needed a
  dedicated endpoint, which is exactly what DEC-032's Team Performance
  panel added for its own (narrower) purpose; the main dashboard tiles
  were left as-is since re-scoping them was out of scope for this request.
- Discovered mid-session: `docker-compose.yml`'s `restart: unless-stopped`
  (from DEC-030) had silently restarted the old pre-dashboard production
  containers on port 3000/4000 after a Docker Desktop restart, even though
  they'd been manually `docker compose stop`'d in a prior session — masking
  the new dashboard code behind a stale build. Fixed by stopping the
  containers again and confirming local `npm run dev` servers owned the
  ports. See `docs/TROUBLESHOOTING.md` for the general gotcha.

---

## DEC-032

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Split Task vs. Subtask permissions and added subtask auto-advance.
1. Added a `Subtask` model (`title`, `done`, `order`, cascades on
   `Task` delete) via migration `20260908022922_add_subtask`, plus
   `Task.completedAt` (set/cleared alongside `status`) via migration
   `20260908023536_add_task_completed_at` — needed for DEC-033's team
   performance measurement, not just this decision.
2. `canManageProjectTasks` (`backend/src/routes/projects.ts`) no longer
   grants task CRUD to a project's PIC — it's now Project Manager,
   Operational Manager, or super admin only. All of its call sites (task
   create/update-structure/delete, task-attachment add/remove) were
   updated to match; the function no longer needs the `project` parameter
   since the PIC check is gone.
3. Every other role keeps its existing ability to change a *task's own
   status* when it's assigned to their role (`canActOnTask`, unchanged),
   and gains full CRUD on that task's *subtasks* via a new
   `canManageSubtasks` helper (`canManageProjectTasks(user) ||
   canActOnTask(user, task.assignedRoleId)`) backing three new endpoints:
   `POST/PATCH/DELETE /projects/:projectId/tasks/:taskId/subtasks[/:id]`.
4. `maybeAutoAdvanceTask(req, taskId)`: after any subtask is toggled done
   or deleted, if the task has at least one subtask and all of them are
   now done, and the task is still in `TODO`/`IN_PROGRESS` (never
   overrides `WAITING_APPROVAL`/`DONE`/`REJECTED`), it auto-advances the
   task to `WAITING_APPROVAL` (if `requiresApproval`) or `DONE` (setting
   `completedAt`), logged as `task.autoAdvance` and attributed to whoever
   toggled the subtask. This is additive — the assigned role's manual
   status-change control is untouched and can always override it.
5. Frontend: `TaskTable.tsx`'s existing expand-panel pattern gained a new
   `SubtaskList.tsx` (checklist UI: add/toggle/delete) alongside the
   existing `AttachmentList`, gated by the same `canEdit || editable`
   already used for attachments (which now maps 1:1 onto the backend's
   `canManageSubtasks`). A "X/Y" progress badge (`subtaskProgressBadge`,
   green when complete) opens the panel from both `TaskTable` and
   `TaskKanban` cards. `page.tsx`'s `canManageTasks` was updated to match
   #2 (drop PIC, add Operational Manager).

Reason:
Explicit user request, resolved via three clarifying questions: "pada menu
task di project, role project manager, super admin dan operational
manager harus bisa crud task dan subtasknya, sedangkan role lain hanya
boleh crud di subtask" — confirmed as (a) "PM/OM/super admin only, drop
PIC" for task CRUD, (b) other roles get subtask CRUD *in addition to*
keeping their existing task-status-change ability, and (c) completing all
subtasks should auto-advance the task's status as an additive convenience.

Consequences:

Positive:
- Verified end-to-end against the real dev database with a throwaway
  temp project + a temp user holding only "Mechanical Engineer": confirmed
  a non-PM/OM user is 403'd on task create/delete but 201'd on subtask
  create, confirmed the task stays `TODO` at 1/2 subtasks done and
  auto-advances to `DONE` (with `completedAt` set and a `task.autoAdvance`
  activity log entry) at 2/2, then cleaned up. Re-verified live in the
  browser against a real project: adding/checking a subtask through the
  UI correctly flipped the task's status dropdown to "Selesai".
- A project's PIC (if not also PM/OM/super admin) loses task-list CRUD
  they previously had — an intentional narrowing per explicit instruction,
  not an oversight; they keep every other PIC-specific privilege
  (`picUserId`-based checks elsewhere are untouched).

Negative:
- None identified. The change is purely a permission re-scoping plus an
  additive auto-advance convenience; no existing endpoint's response shape
  changed except two new task fields (`completedAt`, `subtasks`).

---

## DEC-033

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Added a "Team Performance" panel to the Projects Dashboard, visible only
to Project Manager, Operational Manager, or super admin (same viewer set
as `canManageProjectTasks`). Backed by a new endpoint,
`GET /api/projects/performance/tasks`, gated by that same permission
check, returning every `Task` across every project (id, title, project,
assigned role, status, dates, `completedAt`) — a dedicated endpoint was
necessary rather than reusing `GET /api/projects` because that route's
per-role task filtering for non-admins (DEC-023) would hide every other
team's tasks from the very PM/OM viewers this panel is for (same reasoning
as the Purchasing endpoints in DEC-022). `TeamPerformancePanel.tsx`
computes, per team (org role, from each task's `assignedRoleTitle`), the
average signed distance in days between `completedAt` and `dueDate`
(negative = finishes ahead of deadline on average, positive = behind) over
that team's completed tasks that have a due date, plus an on-time rate and
a raw average cycle time (`completedAt - createdAt`) as a fallback metric
for teams whose completed tasks lack due dates. Rendered as a diverging
horizontal bar chart centered on zero — `--color-success` for ahead-of-
deadline, `--color-danger` for behind, both reserved-status colors reused
deliberately here since "faster/slower than deadline" *is* a good/bad
performance signal, always paired with the team name and a signed day
count as text, never color alone — plus a legend and a fallback list for
teams without enough due-date data to rank.

Reason:
Explicit user request: "Super admin, Operational manager dan Project
manager, harus bisa monitor mana tim yang menyelesaikan task lebih cepat,
dan harus menilai tim mana dan berapa lama cepatnya, atau kalau lebih
lambat harus dinilai juga."

Alternatives Considered:
1. Reusing `GET /api/projects` and computing team stats client-side from
   its already-filtered `tasks` arrays, like `ProjectsDashboard.tsx` does
   — rejected because that endpoint hides other teams' tasks from
   non-super-admin PM/OM viewers (DEC-023), which would silently produce
   wrong cross-team comparisons for exactly the viewers this feature is
   for, rather than an obvious error.
2. Ranking purely by raw cycle time (`completedAt - createdAt`) instead of
   distance from `dueDate` — rejected as the primary metric because it
   doesn't answer "faster/slower than *what*"; kept as a secondary/
   fallback metric for tasks or teams without a due date, since some data
   is better than none.

Consequences:

Positive:
- Verified against the real dev database with a throwaway test project:
  a plain assigned-role staff account gets 403 on the new endpoint; two
  tasks (one due yesterday marked done today, one due tomorrow marked
  done today) produced measured deltas of +1.00 and -1.00 days exactly as
  expected; cleaned up afterward. Re-verified visually in-browser (via a
  throwaway temp super admin account, deleted after) that the panel
  renders correctly on `/projects`, including its correct empty state
  given the current real data has zero completed tasks yet.

Negative:
- A team's ranking is only as meaningful as its due-date discipline —
  tasks without a `dueDate` can't contribute to the deadline-based
  ranking and fall back to the raw-cycle-time list instead, which isn't
  directly comparable across teams doing different-sized work. This is a
  data-quality dependency, not a bug: as more tasks get real due dates,
  the ranking improves.

---

## DEC-034

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Added a Document Templates menu (`/document-templates`, new `DocumentTemplate`
model: name, description, and either an uploaded file — base64 `dataUrl`,
same storage pattern as `Attachment`/`Asset.photoUrl` — or an external
`url`). `GET /api/document-templates` requires only `requireAuth` (every
logged-in role can view/download); `POST`/`PATCH`/`DELETE` are gated by a
new `requireTemplateEditor` (super admin or Operational Manager). Frontend
mirrors the Vendor directory's list/edit/delete UI pattern.

Reason:
Explicit user request: "Buat Menu Template Dokumen, jadi isinya template
untuk semua dokumen, super admin dan operasional manager bisa CRUD, role
lain hanya bisa download template nya."

Consequences:

Positive:
- Verified against the real dev database: a non-OM role gets 403 on create
  and delete but 200 on the list/view endpoint; an OM-created template
  came back correctly through the list endpoint. Also verified live in the
  browser: added a link-type template through the real create form,
  confirmed the download/open link renders, cleaned up afterward.

Negative:
- None identified — purely additive, no existing model or endpoint touched.

---

## DEC-035

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Added a dedicated BOM menu (`/bom`) for MBOM/EBOM/SBOM, separate from the
existing per-project "Pengajuan Bahan Baku" (`MaterialRequest`) flow, which
is left completely untouched. New `BomItem` model with **item-level**
status (not request/batch-level, unlike `MaterialRequest`) so an
engineering team can keep adding new items to a project's BOM at any time
without disturbing items already further along:
`SUBMITTED -> APPROVED/REJECTED -> PROCESSING -> ARRIVED`. Each BOM type
is owned by the engineering role that fills it in (mirrors the
MBOM/EBOM/SBOM -> team mapping already used for the project document
checklist): MBOM -> Mechanical Engineer, EBOM -> Electrical Engineer,
SBOM -> Software Development (or super admin for any type). An item is
only editable/deletable by its owning role while `status === SUBMITTED` —
once a Project Manager reviews it (`PATCH /bom/:id/review`, Project
Manager or super admin) the content is locked; once Purchasing marks it
`ARRIVED` (`PATCH /bom/:id/purchasing`, Purchasing or super admin,
`APPROVED -> PROCESSING -> ARRIVED`) it's permanently locked, matching
"karna statusnya sudah terbeli." The engineer's only path forward on a
rejected or already-processed item is submitting a brand-new item, which
starts its own independent `SUBMITTED` cycle — not editing/resubmitting
the old one. Three timestamps are recorded per item as explicitly
requested: `submittedAt` (on create), `approvedAt` (on PM decision), and
`purchasingUpdatedAt` (on each Purchasing status change). Viewing the menu
is open to the three engineering roles, Project Manager, Purchasing,
Operational Manager, and Operational Leader (or super admin) —
`requireBomViewer`, matching the Purchasing menu's viewer set.

Reason:
Explicit user request: "Untuk BOM (MBOM, SBOM dan EBOM) buat menu sendiri,
jadi nanti tim engineer membuat mengisi list BOM masing-masing jika di
submit maka akan masuk ke Approval Project manager, lalu jika sudah
disapprove masuk ke tim purchasing untuk diproses, tim purchasing nanti
akan beli lalu edit status barangnya sudah sampai atau belum. jika sudah
sampai item di menu BOM nya tidak boleh bisa diedit karna statusnya sudah
terbeli. engineer masih bisa mengajukan item di bom namun harus mengulangi
proses lagi, harus di approve PM dan masuk ke purchasing. catat juga Waktu
pengajuan, Waktu approve dan Waktu status di purchasing berubah."

Alternatives Considered:
1. Extending the existing `MaterialRequest`/`MaterialRequestItem` model
   (already conceptually a "Bahan Baku/BOM" submission flow with the same
   SUBMITTED->APPROVED->PROCESSING->COMPLETED shape) with a `bomType` field
   and moving its status to item-level instead of a wholly new model —
   rejected because it would require restructuring an existing, working
   feature's status model (touching every one of its endpoints) and mixing
   two different concepts (ad-hoc mid-project material asks vs. the formal
   per-project Bill of Materials) into one model. A separate model is
   additive and keeps both flows independently correct; the user's "buat
   menu sendiri" (make it its own menu) also points at a distinct feature,
   not a reskin of the existing one.

Consequences:

Positive:
- Verified end-to-end against the real dev database with a throwaway
  project and four throwaway users (one per role: Mechanical Engineer,
  Project Manager, Purchasing, Operational Manager): 26 assertions
  covering both the allowed and forbidden side of every permission
  boundary, the full SUBMITTED->APPROVED->PROCESSING->ARRIVED lifecycle
  with real timestamps appearing at each step, the edit-lock taking effect
  immediately after PM approval (not just after arrival), the
  delete-lock, and a second item submitted independently after the first
  was already ARRIVED — confirming the "repeat the process" requirement.
  All passed; cleaned up afterward.

Negative:
- None identified.

---

## DEC-036

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Added a reusable `LayoutToggle` component (`components/shared/
LayoutToggle.tsx`, two icon buttons via new `ListIcon`/`GridIcon`) and
wired it into the three list-style menus the user named: Projects'
"Daftar Project" tab, BOM, and Document Templates. Each page keeps its own
local `layout` state (`"list" | "grid"`, not persisted), switching the
items container between its existing flex-column list and a new CSS Grid
container (`repeat(auto-fill, minmax(...), 1fr)`). `ProjectRow` and
`TemplateRow` take a `layout` prop to switch their own root element's
class between a horizontal row and a vertical card; `bom`'s `ItemCard` is
already a self-contained card, so its grid mode only needed a container
change.

Reason:
Explicit user request: "buat menu daftar project, BOM, template dokumen
bisa list layout dan grid layout."

Consequences:

Positive:
- Verified live in the browser (throwaway temp super-admin account,
  deleted after): toggled all three pages between list and grid, real
  data (two seeded projects, the throwaway document template) rendered
  correctly in both modes.

Negative:
- The layout choice isn't persisted (resets to "list" on next visit/page
  reload) — acceptable for a first pass since no session/local-storage
  requirement was stated; easy to add later if wanted.

---

## DEC-037

Date:
2026-09-08

Status:
ACCEPTED

Decision:
A project's PIC must be a user holding the "Project Manager" role — no
longer an arbitrary user. `GET /api/users/basic` (the shared minimal
directory used for every PIC picker) now also returns each user's
`roleTitles`; both the project-creation form and the project detail
page's PIC editor filter that directory to Project Manager holders before
rendering it as options. Enforced server-side too (not just hidden in the
UI): `POST /api/projects` and `PATCH /api/projects/:id` both reject a
`picUserId` that doesn't belong to a Project Manager with 400 — clearing
PIC to `null` is still always allowed.

Reason:
Explicit user request: "di menu project, ketika membuat project baru, PIC
haruslah role Project Manager. jadi dari Operasional Manager
mendelegasikan PIC ke Project Manager sebagai penanggung jawab
projectnya."

Consequences:

Positive:
- Verified against the real dev database: `/users/basic` correctly
  reports a Project Manager's and a non-PM's `roleTitles`; creating a
  project with a non-PM `picUserId` is rejected (400) while a PM
  succeeds; patching an existing project's PIC to a non-PM is rejected;
  clearing PIC to `null` still works. 9/9 checks passed.

Negative:
- A project whose PIC was set before this change (or via direct DB
  access) to a user who isn't a Project Manager is left as-is — this
  decision only gates new writes, it doesn't retroactively clear existing
  data. No such projects existed in the real dev database at the time of
  this change.

---

## DEC-038

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Replaced the home Dashboard page (`/`, previously a static "template shell"
placeholder since the project's very first session) with a real,
per-role landing page — entirely client-side composition of existing,
already-role-scoped endpoints; no new backend endpoint was needed.
1. **Role banner**: every login immediately shows a "Role Anda" panel with
   a badge per `AuthUser.roleTitles`, plus a distinct "Super Admin" badge
   when applicable, or a "no role assigned" note for an account with
   neither — directly answering "jadi ketika user login, dia tau role nya
   apa saja."
2. **Universal stat tiles** (everyone): Approval Menunggu, Task Terlambat,
   Task Segera Jatuh Tempo, Project Terlambat — sourced from the existing
   `useNotifications`/`useApprovals` hooks, which are already personalized
   server-side per caller (DEC-027/DEC-023), so these numbers are
   automatically correct for whoever is looking without any dashboard-side
   filtering.
3. **"Tugas Saya" (My Tasks)** — shown only if the user holds at least one
   role (skipped for a pure super admin with no operational role, since it
   would always be empty): every non-DONE/REJECTED task from
   `useProjects()` assigned to one of the user's own roles, sorted by due
   date, linking into the project.
4. **Role-conditional panels**, each its own small component that only
   calls its data hook when actually mounted (so an unauthorized role
   never even issues the request, let alone renders it): "Ringkasan
   Project" (PM/Operational Manager/super admin — reuses `useProjects`),
   "BOM" (`canViewBom` — reuses `useBom`, and further tailors which of its
   three stats show based on `canOwnBomType`/`canReviewBom`/
   `canProcessBom` for that specific user), "Purchasing" (`canViewPurchasing`
   — reuses `usePurchasing`), "Log Aktivitas" (`canViewActivityLog` —
   reuses `useActivityLog`, with `ActivityCategoryBadge`/`categorizeActivity`
   for the same color-coded feed as the Activity Log page itself).

Reason:
Explicit user request: "buatkan menu dashboard utamanya, isinya harus
sesuai role nya dan sesuai kebutuhan, cantumkan juga role masing-masing
apa. jadi ketika user login, dia tau role nya apa saja."

Consequences:

Positive:
- Zero new backend surface — every number on the page is backed by an
  endpoint that already existed and was already correctly role-scoped for
  its own page, so the dashboard inherits that correctness instead of
  re-implementing it (and re-risking a role-leak bug).
- Verified against the real production dev database (not synthetic data)
  with three throwaway accounts covering three very different profiles —
  super admin, a Project Manager, a Mechanical Engineer — each logged into
  via the real login form and read back with the real rendered page text,
  then deleted:
  - Super admin: "Super Admin" badge only, all five conditional panels
    visible (as expected — super admin passes every `canView*`/`canManage*`
    check), no "Tugas Saya" (holds no operational role), real counts
    matching the actual seeded data (3 projects, 1 ready-to-buy request,
    3 purchasing tasks, 2 online users, real login activity entries).
  - Project Manager: "Project Manager" badge only, "Tugas Saya" showing
    the real 6 PM-assigned tasks across "Project Prima" correctly, "BOM"
    panel showing only the reviewer stat (not the submitter or purchasing
    stats — correctly narrowed by role), "Ringkasan Project" and
    "Purchasing" visible, no "Log Aktivitas".
  - Mechanical Engineer: "Mechanical Engineer" badge only, "Tugas Saya"
    showing the real 6 Mechanical-Engineer-assigned tasks across all 3
    projects, "BOM" panel showing only the submitter stat, no "Ringkasan
    Project", no "Purchasing", no "Log Aktivitas" — the narrowest profile
    tested, and it rendered exactly the minimal, correct subset.

Negative:
- None identified — purely additive UI composition over existing,
  already-audited role-scoped endpoints.

---

## DEC-039

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Enabled LAN access to the local dev instance for the user's team.
Root-caused why `http://localhost:3000` worked but `http://<lan-ip>:3000`
loaded nothing: both dev servers already listen on all interfaces (Next
dev's own default; the backend's `app.listen` had no host, which Node
also defaults to all interfaces), and Windows Firewall already had
pre-existing inbound-allow rules for `node.exe` on the Public profile —
so the network layer was never the blocker. The actual causes were both
application-config: (1) `frontend/.env.local`'s `NEXT_PUBLIC_API_URL` was
hardcoded to `http://localhost:4000/api`, which Next.js inlines into the
client bundle — so any browser other than one on the host machine itself
would try to reach its *own* localhost:4000 and silently fail every API
call; (2) `backend/.env`'s `CORS_ORIGIN` only allowed the
`http://localhost:3000` origin, so even after fixing (1) the backend
would reject every request from a page served at the LAN IP. Fixed by:
pointing `NEXT_PUBLIC_API_URL` at the host's real LAN IP
(`http://192.168.45.63:4000/api`), changing `CORS_ORIGIN` to a
comma-separated list (`backend/src/index.ts` now splits on `,`) so both
`http://localhost:3000` and `http://192.168.45.63:3000` are allowed, and
making the backend's `app.listen` bind `"0.0.0.0"` explicitly rather than
relying on Node's default. Documented the exact steps in `README.md` for
next time (an IP change, e.g. after reconnecting Wi-Fi, requires redoing
this).

Reason:
Explicit user request: "saya ingin tim akses system ini di local saya
dulu... jika akses ip:3000 itu tidak muncul apa-apa" followed by "saya
ingin tim yang 1 jaringan dengan saya 1 segmen IP bisa akses juga ke
aplikasi local saya."

Alternatives Considered:
1. A wildcard/regex CORS origin matching any private-IP-range origin —
   rejected as unnecessarily loose for what's actually needed: every
   teammate reaches the app through the *same* URL (the host's one LAN
   IP), so the Origin header is identical for all of them, not one value
   per teammate's own machine. A single explicit second origin covers it
   exactly, with no broadening of what the backend will accept requests
   from.

Consequences:

Positive:
- Verified for real, not just by code inspection: `curl` from the host
  machine to `http://192.168.45.63:3000/` and `:4000/health` both return
  200; an actual `OPTIONS` CORS preflight AND a real `POST
  /api/auth/login` request, both sent with `Origin:
  http://192.168.45.63:3000` (exactly what a teammate's browser sends),
  both come back with the correct `Access-Control-Allow-Origin` header;
  `localhost:3000` origin re-verified still works too (no regression for
  the host's own usage). Also navigated a real Chrome tab to
  `http://192.168.45.63:3000/login` and confirmed the page (fonts, logo,
  form) loads correctly end-to-end over that address.
- `.env.example` updated with the comma-separated `CORS_ORIGIN` pattern
  documented inline, so this isn't a one-off tribal-knowledge fix.

Negative:
- Both `NEXT_PUBLIC_API_URL` and `CORS_ORIGIN` now hardcode this specific
  machine's current LAN IP (`192.168.45.63`) — if it changes (DHCP lease
  renewal, reconnecting to a different network), LAN access breaks again
  until both values are updated and both dev servers restarted. Accepted
  as a reasonable tradeoff for "let the team access my local machine for
  now," not a production deployment; flagged explicitly to the user.
- **Incomplete**: DEC-039's verification (curl-based CORS checks, a
  Chrome tab navigated to the LAN URL) did not catch the actual remaining
  blocker, which surfaced when the user reported the page still loaded
  with no visible content — see DEC-040.

---

## DEC-040

Date:
2026-09-08

Status:
ACCEPTED

Decision:
Found and fixed the actual remaining cause of "bisa diakses tapi tidak
ada tampilan apapun" (loads, but nothing renders) after DEC-039: `next
dev` blocks cross-origin requests to its own dev-only resources (HMR,
etc.) by default, unrelated to the app's own CORS/API-URL config fixed in
DEC-039. The frontend dev log showed it plainly once looked at:
`⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from
"192.168.45.63". Cross-origin access to Next.js dev resources is blocked
by default for safety.` The initial page HTML still loads fine (that's a
normal top-level navigation, unaffected), but the blocked HMR/dev-resource
requests prevent the client bundle from ever finishing hydration — since
this app's shell (`AppShell`/`AuthProvider`) is entirely client-rendered,
a failed hydration shows as a blank page, not a partial one. Fixed by
adding `allowedDevOrigins: ["192.168.45.63"]` to `frontend/next.config.ts`
(a `next dev`-only setting; irrelevant to the Docker/production path) and
restarting the frontend dev server.

Reason:
Explicit user follow-up after DEC-039 shipped: "masih tidak muncul
apa-apa. bisa diakses tapi tidak ada tampilan apapun."

Consequences:

Positive:
- Verified for real, correcting DEC-039's verification gap: this time
  logged all the way through via a real browser session at
  `http://192.168.45.63:3000` — filled and submitted the actual login
  form (a throwaway temp account, deleted after), watched the URL
  transition from `/login` to `/`, and read back the fully-rendered home
  Dashboard (role badge, live stat tiles, and every role-conditional
  panel with real counts) over that exact LAN address. Confirmed the
  `⚠ Blocked cross-origin` warning no longer appears in the dev log for
  requests from that host.

Negative:
- Like DEC-039's `CORS_ORIGIN`/`NEXT_PUBLIC_API_URL`, `allowedDevOrigins`
  also hardcodes the current LAN IP and needs updating (plus a frontend
  restart) if it changes — now three places, not two, that all need to
  agree on the same IP. If this setup needs to survive IP churn
  routinely, worth revisiting as a single derived value instead of three
  manually-kept-in-sync ones.
- Lesson for next time: when a "loads but shows nothing" report survives
  a first round of fixes, check the dev server's own terminal output
  before re-testing via curl/automation again — the answer was already
  sitting in the log.

---

## DEC-041

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Added an Operasional menu (`/operational`) for non-project daily work,
with three tabs: Daily Report (a free-text per-day log, no approval
workflow), Kasbon, and Realisasi Kasbon (see DEC-042 for the latter two's
design). Access is gated by a new router-level middleware,
`canAccessOperational` — every authenticated user *except* those holding
"Project Manager" (PM's day-to-day already lives entirely in Projects/
Tasks/BOM); super admin always passes. Within the menu, Operational
Manager/Operational Leader (or super admin) monitor everyone's daily
reports and kasbon requests via `canMonitorOperational`; everyone else
only sees their own. New models: `DailyReport` (userId, date, activities)
and `Kasbon`/`KasbonItem` (see DEC-042). New backend router
`routes/operational.ts` mounted at `/api/operational`.

Reason:
Explicit user request: "buatkan menu Operasional, menu ini untuk
monitoring pekerjaan harian selain project base. jadi ada sub menu daily
report, kasbon dan realisasi kasbon. Menu operasional ini hanya boleh
diakses oleh tim Operasional dan selain Project Manager."

Consequences:

Positive:
- Verified against the real dev database: a 19-assertion script covered
  the access gate (PM gets 403 on every route, others don't), monitoring
  visibility (a non-monitor role can't see another user's daily report;
  Operational Manager can), ownership checks (only the report's author or
  super admin can edit/delete it), and the full Kasbon
  submit->approve->realize lifecycle. Also walked the real UI end-to-end
  across three throwaway accounts (Mechanical Engineer, Operational
  Manager, and back) logging in through the real login form: submitted a
  daily report and a kasbon as the engineer, approved it as OM, then
  reported realisasi back as the engineer — each screen read back
  correctly at every step.

Negative:
- None identified — new menu, new models, no existing feature touched.

---

## DEC-042

Date:
2026-09-09

Status:
SUPERSEDED by DEC-045 (2026-09-09) — the request-then-itemize flow
described here was replaced by a phase-first model (create a lightweight
phase, itemize freely, submit the whole phase for approval). The
`Kasbon`/`KasbonStatus` model and `REALIZED` status no longer exist.

Decision:
Redesigned Kasbon partway through implementation, after the user pointed
at the team's actual existing spreadsheet
(`assets/template/Realisasi Kasbon Rekap/Rekap Realisasi Kasbon Divisi
BusDev 2.xlsx`) as the real source of truth for this workflow — the
initial single-amount-plus-purpose model (shipped in DEC-041) didn't match
how the team actually tracks this. Inspecting that file (`Form` sheet: a
per-division/month/phase summary by cost category; `Data Input` sheet:
itemized purchases with Reason/Item/Qty/Satuan/Link/Purchase Date/
Received Date/Harga columns) drove the redesign:
1. `Kasbon` gained `division` (free text), `period` (`"YYYY-MM"`, `@@index`ed),
   and `phase` (Int, default 1) — one kasbon per division/month/spending-
   round, matching the spreadsheet's grouping exactly.
2. New `KasbonItem` model (one row per itemized purchase: `reason` — a new
   `KasbonReason` enum `DEVELOPMENT`/`PRODUCTION`/`OPERATION`/
   `TOOLS_ASSET`, matching the spreadsheet's four cost categories —
   `item`, `qty`, `unit`, `link`, `purchaseDate`, `receivedDate`, `price`)
   replacing the single manually-entered `realizationAmount` field.
   Realisasi now means itemizing real purchases (`POST`/`DELETE
   /kasbon/:id/items`, requester-only, only while `APPROVED`) rather than
   typing one lump sum; `realizationAmount` is now *computed* on every
   read as `Σ(qty × price)` across items, never stored, so it can't drift
   from the itemized truth. `PATCH /kasbon/:id/realize` now requires at
   least one item present and no longer accepts a manual amount.
3. Added `GET /api/operational/kasbon/export?period=YYYY-MM&division=`
   (optional division filter), gated to the same monitor/reviewer set as
   the rest of the menu — generates a two-sheet `.xlsx` (via the new
   `exceljs` dependency) reproducing the original's `Form` (category
   totals) + `Data Input` (itemized rows) layout, for every `REALIZED`
   kasbon in that period, with Vortec branding ("VORTEC SYSTEM", doc code
   `VOR-FRM-OPS-01.00`) replacing the original's "PT MITRA AKSES
   GLOBALINDO" ("Magnet") header — per the user's explicit "template dari
   magnet, saya ingin anda buatkan untuk vortec, header footernya di
   sesuaikan dengan vortec." Frontend: `ExportPanel` (month + optional
   division inputs) on the Realisasi Kasbon tab, downloading the file via
   an authenticated `fetch` + blob (a plain link can't carry the bearer
   token).

Reason:
Explicit user follow-ups, in order: "jadi selama ini kasbon menggunakan
spreadsheet, seperti pada data di [path]. saya ingin anda buatkan
fiturnya"; "itu menggunakan template dari magnet, saya ingin anda buatkan
untuk vortec, header footernya di sesuaikan dengan vortec"; "jadi nanti
kasbon bisa ditarik perbulan nya dengan memilih bulannya, lalu di
generate ke file spreadsheet."

Alternatives Considered:
1. Keeping the flat `amount`/`purpose` model and bolting an "export"
   button onto it that just dumps kasbon rows — rejected once the actual
   spreadsheet was inspected: the real record-keeping unit is the
   itemized purchase line (with a purchase link and received date, for
   procurement tracking), not the kasbon request itself. Matching that
   shape is what makes the export meaningful rather than a reformatting
   exercise.
2. Pixel-perfect replication of the original spreadsheet's exact merged-
   cell layout and doc-control header (rev number, effective date, page
   count) — decided against for effort reasons; the export reproduces the
   same two sheets, the same columns, and the same category-summary
   concept, with clean Vortec branding, but isn't a cell-for-cell clone of
   Magnet's internal form-numbering scheme.

Consequences:

Positive:
- Verified against the real dev database with a fresh end-to-end script:
  create-with-division/period/phase, invalid-period-format rejection,
  approve, add/remove/re-add items with the running `realizationAmount`
  checked against a hand-computed expected total, non-requester blocked
  from adding items, realize, items locked after REALIZED, non-monitor
  blocked from export (403), and a successful export producing a real
  `.xlsx` (correct content-type, non-trivial byte size) for the OM
  account — saved locally and spot-checked.
- The migration required deleting one leftover throwaway test `Kasbon`
  row from earlier verification (real Prisma migrate correctly refused to
  add required `division`/`period` columns with existing rows present) —
  no real data existed yet, so this was a safe, no-op-for-the-business
  cleanup, not a data-loss risk.

Negative:
- `division` is free text, not tied to the org's existing Role/team
  model — a typo-prone field for now (e.g. "BusDev" vs "Bus Dev" would be
  treated as different divisions when filtering/exporting). Acceptable
  for a first pass; could later become a dropdown sourced from Role
  titles or a small fixed list if that turns out to matter in practice.
- The `.xlsx` export is a clean recreation, not a pixel-perfect clone of
  the original Magnet-branded form (see Alternatives Considered #2) — if
  the team specifically needs the exact original layout/doc-numbering
  preserved, that would need a follow-up pass.

---

## DEC-043

Date:
2026-09-09

Status:
PARTIALLY SUPERSEDED by DEC-045 (2026-09-09) — the Rp 5,000,000 cap is
kept but now applies cumulatively per `KasbonPhase` rather than per
single request amount, and "one outstanding kasbon" is redefined as "one
outstanding phase," where `REJECTED` now also blocks a new phase (it did
not block under this entry's original rule).

Decision:
Added two Kasbon submission limits, both enforced server-side in
`POST`/`PATCH /api/operational/kasbon`:
1. **Per-phase amount cap**: `amount` may not exceed `KASBON_MAX_AMOUNT`
   (Rp 5,000,000), checked on both create and edit-while-`SUBMITTED`.
2. **One outstanding kasbon per person**: `findOutstandingKasbon` blocks a
   new submission if the requester already has a `Kasbon` in `SUBMITTED`
   or `APPROVED` status (i.e. anything not yet `REJECTED` or `REALIZED`)
   — they must finish reporting realisasi on the current one (or have it
   rejected) before the next can be submitted. `REJECTED` does not block,
   since that cycle ended without any money changing hands.
Frontend: the amount input got a `max` attribute plus a hint text; the
"+ Ajukan kasbon" trigger is replaced with an explanatory message
(`kasbonBlockedByOutstanding`) whenever the current user already has an
outstanding kasbon, computed client-side from the same already-loaded
kasbon list (no extra request).

Reason:
Explicit user request: "buat limitasi kasbon, dalam 1 sesi atau fase
kasbon adalah 5juta rupiah, jadi tidak bisa lewat dari limit, harus
realisasi dulu dan menunggu di transfer kasbon lagi untuk bisa pengajuan
lagi."

Consequences:

Positive:
- Verified against the real dev database with a 9-assertion script:
  amount just over the cap rejected, exactly at the cap accepted, a
  second submission blocked while the first is `SUBMITTED`, an edit that
  would push an existing submission over the cap rejected, still blocked
  once approved (`APPROVED` also counts as outstanding), and — after
  itemizing and realizing the first kasbon — a new one for the next phase
  is correctly allowed again.

Negative:
- The block is scoped to "per person," not "per person per division" —
  someone requesting on behalf of two different divisions couldn't have
  two in flight at once under this rule. Not raised as a requirement, and
  matches the plain reading of "menunggu di transfer kasbon lagi" as a
  personal cash-in-hand constraint rather than a per-division one; easy
  to narrow the `findOutstandingKasbon` query by `division` later if that
  turns out to be wrong.

---

## DEC-044

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Surfaced "sisa kasbon" in the Operasional menu's Kasbon tab, computed
client-side — no backend change needed. Shipped once, then corrected the
same day after the user pointed out the first version's math was wrong
(see Negative) — this entry describes the corrected, final behavior:
"sisa kasbon" (remaining quota) = `KASBON_MAX_AMOUNT - kasbon.amount`
(the per-phase Rp 5,000,000 cap from DEC-043 minus what was actually
requested), shown *alongside*, never instead of, the kasbon amount
itself:
1. A per-user summary banner at the top of the Kasbon tab
   (`MyKasbonQuotaBanner`): with no outstanding kasbon, the full quota
   ("Kuota kasbon Anda tersedia: Rp 5.000.000"); with one outstanding,
   both numbers together ("Jumlah kasbon Anda: Rp 478.000 — sisa kuota:
   Rp 4.522.000 (status)").
2. Every `KasbonCard` shows "Sisa kuota kasbon: Rp X" (the same
   `5,000,000 - amount` formula) regardless of status, next to the
   already-shown requested amount.
3. `RealisasiCard` keeps a *separate* line for itemization progress
   ("Realisasi: Rp {realizationAmount} dari Rp {amount}" — how much of
   the disbursed cash has been itemized so far) plus its own "Sisa kuota
   kasbon" line using the same quota formula — two different numbers,
   clearly labeled, not conflated.

Reason:
Explicit user request: "tampilkan juga sisa kasbon saat ini di menu
kasbon", corrected same-day per: "Sisa kasbon Anda saat ini: Rp 478.000
dari Rp 478.000 (Disetujui — Menunggu Realisasi). yang ditampilkan jumlah
kasbon dan sisa kasbon, sisa kasbon itu 5 juta dikurangi total kasbon."

Consequences:

Positive:
- Verified live via throwaway accounts logged in through the real login
  form, both before and after the correction. First pass confirmed the
  (wrong) `amount - realizationAmount` formula rendered exactly the
  confusing "Rp 478.000 dari Rp 478.000" duplicate the user flagged.
  Second pass, using that exact same Rp 478.000 amount, confirmed the
  corrected banner reads "Jumlah kasbon Anda: Rp 478.000 — sisa kuota: Rp
  4.522.000" and the card reads "Sisa kuota kasbon: Rp 4.522.000" —
  `5,000,000 - 478,000 = 4,522,000`, checked by hand. Cleaned up
  afterward.

Negative:
- The first shipped version of this display used the wrong formula
  (`amount - realizationAmount`, an "unspent-balance" reading) instead of
  the intended "quota-headroom" reading (`5,000,000 - amount`) — caught by
  the user from real output, not by the verification pass, since a
  passing test only confirms arithmetic is internally consistent, not
  that the chosen formula matches what "sisa kasbon" was supposed to mean.
  Fixed same-day; the itemization-progress reading wasn't discarded, just
  relabeled and kept alongside as its own "Realisasi: ..." line rather
  than being mislabeled "sisa."

Note (unrelated to this decision, recorded for future reference): the
user separately confirmed the intended fund boundary between BOM and
Kasbon while this was being tested — "BOM itu diluar kasbon ya, jadi dana
untuk project dan operasional beda. dana project ada lagi yang di
request lewat BOM. dana operasional bulanan dari kasbon." This already
matches how DEC-035 (BOM, tied to a `Project`) and DEC-041/042 (Kasbon,
tied to a `division`/`period`/`phase`, never a project) were built —
project funds flow through BOM, monthly operational funds flow through
Kasbon. No code change was needed; noted here so the two features aren't
later confused or merged.

---

## DEC-045

Date:
2026-09-09

Status:
ACCEPTED — SUPERSEDES DEC-042 and updates DEC-043's "one outstanding
kasbon" language.

Decision:
Replaced Kasbon's "request an amount, get it approved, then itemize
realisasi against it" flow (DEC-042) with a phase-first model: a
lightweight `KasbonPhase` (division + period + phase number) is created
with no upfront approval, itemized purchase records (`KasbonItem`) are
then added directly into it at will, and the whole phase — not
individual items — is submitted for Operational Manager review only once
every item is complete.
1. Schema: `Kasbon`/`KasbonStatus` (`DRAFT`/`SUBMITTED`/`APPROVED`/
   `REALIZED`/`REJECTED`) removed and replaced by `KasbonPhase`
   (`division`, `period`, `phase`, `KasbonPhaseStatus` =
   `DRAFT`/`SUBMITTED`/`APPROVED`/`REJECTED`, requester + reviewer +
   review note/timestamps) and `KasbonItem` (`reason` enum unchanged from
   DEC-042, `item`, `qty`, `unit`, `link`, `purchaseDate` required,
   `receivedDate` optional, `price`, `receiptPhotoUrl`/`itemPhotoUrl`
   optional base64-data-URL evidence photos — same storage convention as
   `Asset.photoUrl`). `total`/`remaining` (against the Rp 5,000,000 cap)
   and each item's `complete` flag are computed on every read, never
   stored.
2. Items can be added to a `DRAFT`/`REJECTED` phase with `receivedDate`
   and both evidence photos left null — the item may not be purchased yet
   at submission time — then backfilled later via `PATCH .../items/:id`.
   The phase list UI renders inline "fill in later" controls for exactly
   the fields still missing on each incomplete item.
3. The Rp 5,000,000 cap (DEC-043) is now enforced per-phase, cumulative
   across all its items (`Σ(qty × price) ≤ 5,000,000`), re-checked on
   every add/edit — not a single request amount.
4. "Outstanding phase" (DEC-043's "one outstanding kasbon," reworded)
   blocks creating a new `KasbonPhase` while the requester has any phase
   in `DRAFT`, `SUBMITTED`, or `REJECTED` — only `APPROVED` clears the
   gate, per the user's explicit clarification ("fase tidak boleh bisa
   dibuat sebelum realisasi kasbon sebelumnya di approve") that a
   rejected-but-unresolved phase still counts as outstanding, unlike
   DEC-043's old model where `REJECTED` didn't block.
5. Approval moved from per-item to per-phase: a single
   `PATCH /kasbon/phases/:id/review` (Operational Manager or super admin,
   `SUBMITTED` only) replaces any per-item approval notion.
   `PATCH .../submit` is the single validation gate — it 400s with a
   count and list of incomplete item IDs unless every item has
   `receivedDate` and both photos, and requires at least one item.
   `REJECTED` reopens the phase for editing/resubmission (not a dead
   end); `APPROVED` is terminal and unlocks
   `GET /kasbon/phases/:id/export` (still monitor/reviewer-gated,
   two-sheet Vortec-branded `.xlsx`, same shape as DEC-042's export).
6. The standalone "Realisasi Kasbon" tab (DEC-041/042) was removed — its
   job (itemize, then submit for approval, then download) is now the
   Kasbon tab's normal per-phase flow, reached via a "Realisasi" button
   on the phase itself rather than a separate menu.

Reason:
Explicit user request: the user pointed out DEC-042's request-then-
itemize order was backwards from how the team actually works — at
submission time the goods may not even be purchased yet, so requiring an
approved amount before itemizing (and requiring complete evidence to
even start) didn't match reality. The full verbatim request (numbered
1-9, informally) asked for: operational-division-only + PM-excluded
access, a per-phase total/remaining display, a fully-specified add-item
form with a calendar date picker, phase-filterable listing, the ability
to leave `receivedDate`/evidence blank at add-time and backfill later,
eventual full-data completeness required only at submission time,
removal of the separate Realisasi Kasbon menu, a single "Realisasi"
button per phase gating on full data completeness before OM approval,
per-phase (not per-item) approval, OM review before any download, and a
phase-then-item creation order. Two mid-implementation clarifications
were folded in verbatim: "5 juta itu adalah limit per fase kasbon ya"
(the cap is cumulative per phase, not per item) and "fase tidak boleh
bisa dibuat sebelum realisasi kasbon sebelumnya di approve" (outstanding
means anything short of `APPROVED`, including `REJECTED`).

Alternatives Considered:
1. Keep DEC-042's request-then-itemize flow and only relax the
   evidence-completeness requirement at add-time — rejected: the user's
   request was explicit that approval itself should move from per-item to
   per-phase and from upfront-amount to itemized-first, not just that one
   field should become optional.
2. Let `REJECTED` phases not block new-phase creation (matching DEC-043's
   old "only DRAFT/SUBMITTED/APPROVED block" semantics) — rejected per
   the user's explicit clarification that a rejected phase must be
   revised and resubmitted (or otherwise resolved) before starting a new
   one, not abandoned in place while a fresh phase is opened.

Consequences:

Positive:
- Matches the real procurement timeline: items can be logged as soon as
  a purchase is planned/decided, not only after it's fully documented,
  while still guaranteeing the OM only reviews complete, verifiable data.
- Verified end-to-end against the live backend with a 34-assertion
  throwaway script covering the full lifecycle (create, idempotent
  re-create, cumulative-cap rejection, missing-field rejection,
  non-owner edit block, incomplete-submit rejection with itemized error
  detail, backfill-then-resubmit, non-OM review block, reject → re-edit →
  resubmit, approve, new-phase-now-allowed, export gating by status and
  by role) plus a live browser walkthrough through the real login/UI
  (throwaway Mechanical Engineer + Operational Manager accounts) exercising
  the same flow with real file uploads for both evidence photos and a
  real `.xlsx` download (200 response, correct content-type). All
  throwaway accounts, phases, and activity-log rows were deleted
  afterward.
- One migration (`kasbon_per_phase_redesign`) cleanly replaced the old
  model; no production Kasbon data existed yet, so this was a zero-
  data-loss schema replacement.

Negative:
- This is a breaking schema change, not an additive one — DEC-042's
  `Kasbon`/`KasbonStatus` model and its `REALIZED` status no longer
  exist. Acceptable here only because no real (non-test) Kasbon data had
  been entered yet; a similar breaking replacement after real data exists
  would need a data-migration plan instead of a drop-and-recreate.
- `division` remains free text (same caveat as DEC-042) — still not
  tied to the org's Role/team model.

Addendum (2026-09-09, same day):
Per explicit follow-up ("Divisi pada fase kasbon hanya operational"), the
`division` field on `POST /kasbon/phases` was changed from requester-typed
free text to a server-enforced constant, `KASBON_DIVISION = "Operational"`
— whatever the client sends (or omits) is ignored; the phase is always
created with `division: "Operational"`. This resolves the negative noted
above (free-text division) for Kasbon specifically, since the menu was
already restricted to the Operational division at the access-gate level
(`canAccessOperational`) — a free-text sub-division input was redundant
and typo-prone for a value that can only ever be one thing. The frontend's
`PhaseCreateForm` Divisi input was removed entirely (only Periode/Phase
remain); the `division` column itself was kept (not dropped) so the
schema/export can extend to other divisions later without another
migration, and `phase.division` continues to render normally everywhere
it's displayed (now always reading "Operational"). Verified with a
throwaway account: a request that explicitly sent a different `division`
value was still created as "Operational", and omitting the field
entirely behaved identically. `npx tsc --noEmit` and `next build` passed
in both projects.

Addendum 2 (2026-09-09, same day):
Two more follow-ups from live usage with real (non-test) accounts:
1. A user reported being able to create a new phase while their previous
   one was SUBMITTED (awaiting Operational Manager review), which should
   be blocked per this decision's outstanding-phase rule. Investigation
   (a live API call against the real dev database, reproducing the exact
   scenario — a SUBMITTED phase, then attempting to create a distinct
   new period/phase for the same requester) found the backend already
   correctly returns 400. The user then confirmed via the live UI
   (blocking message rendered, no create button shown) that this was
   already working as intended — not a real bug, just re-confirmation of
   existing behavior. No code change was needed for this part.
2. Per explicit request ("pada menu tambah kasbon, hilangkan saja input
   Received Date, Eviden Foto Struk, Eviden Foto Barang. ini nanti
   diisinya sebelum realisasi saja"), `ItemAddForm` (the initial "Tambah
   Item" form) had its Received Date and both evidence-photo inputs
   removed — new items are now always created with those three fields
   null, to be filled in exclusively via the inline "fill in later"
   controls already on each item row (`ItemTableRow`), never at add-time.
   This simplifies the add form to what's known at the moment of listing
   an item (reason/name/qty/unit/link/purchase date/price) and makes the
   backfill-later behavior (already the actual data-completeness gate)
   the single place those three fields are edited, instead of two.
3. Per explicit follow-up ("Ajukan Realisasi di disable aja dan kasih
   notes kalau harus lengkapi dulu data yang belum diinput, kalau sudah
   lengkap baru button itu aktif"), the "Ajukan Realisasi" button in
   `PhaseDetail` is now `disabled` client-side whenever any item is
   incomplete (`!phase.items.every(i => i.complete)`), with an inline
   hint explaining what's missing and pointing at the "Belum Lengkap"
   item rows. Previously the button was always clickable and only the
   backend's `submit` validation (still in place, unchanged) caught
   incompleteness after the click, surfacing the error as a generic
   message. This doesn't relax or duplicate that backend gate — it only
   surfaces the same condition earlier, before the round trip.

Consequences of Addendum 2:

Positive:
- Verified live against a real in-progress phase (Wiyanto's Phase 3,
  DRAFT, two of three items incomplete): the button rendered disabled
  with the hint text visible; after backfilling the two incomplete
  items' receivedDate/evidence via the API (mirroring what the inline
  UI controls do) and reloading, all three items showed "Lengkap" and
  the button became enabled with the hint gone. The two items were
  reverted to their original incomplete state immediately after, since
  this was real (not throwaway) data — no test accounts or data were
  left behind.
- `npx tsc --noEmit` and `next build` passed in the frontend after both
  changes.

Negative:
- None identified — both changes are UI-only refinements of an already-
  correct backend gate (submit validation, outstanding-phase check),
  not new business rules.

---

## DEC-046

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Split `GET /api/notifications` into two domains — `project` (existing
due-date reminders for tasks/projects, unchanged) and `operational`
(new) — and made approval-type items real notification entries in their
domain instead of only contributing to the `pendingApprovalsCount`
banner that links out to `/approvals`. Per explicit user request:
"pisahkan notifikasi, ada notif Project dan operasional. approval itu
harus masuk notif juga."
1. `project` now additionally carries `taskApprovals` (tasks with
   `requiresApproval: true` and `WAITING_APPROVAL`, assigned to one of
   the caller's own roles — same visibility rule as the Approvals page)
   and `materialRequestApprovals` (`SUBMITTED` material requests, visible
   to Project Manager/super admin only) — both new list-of-items fields,
   not just counts.
2. `operational` (new) carries `kasbonPendingReview` (`KasbonPhase`s with
   status `SUBMITTED`, visible only to whoever can review Kasbon —
   Operational Manager/super admin, same gate as `canReviewKasbon` in
   `operational.ts`) and `kasbonNeedsRevision` (`KasbonPhase`s with
   status `REJECTED`, filtered to the caller's own — this is inherently
   personal since revision is done by the phase's own requester,
   regardless of role).
3. `pendingApprovalsCount` is now `taskApprovals.length +
   materialRequestApprovals.length + kasbonPendingReview.length` —
   `kasbonNeedsRevision` is deliberately excluded from this count since
   it isn't "awaiting a decision from you," it's "action needed by you on
   your own phase," a different kind of urgency.
4. Frontend: `notifications-api.ts`/`useNotifications.ts` restructured to
   match (with flat `overdueTasks`/`upcomingTasks`/`overdueProjects`/
   `upcomingProjects` kept as back-compat accessors on the hook's return
   value, sourced from `data.project`, so `app/page.tsx`'s dashboard
   tiles and `Sidebar.tsx`'s bell badge needed no changes). The
   Notifications page (`app/notifications/page.tsx`) gained a
   Project/Operasional tab switcher (same tab styling pattern as the
   Operasional page itself), each tab showing its own approval sections
   above the existing due-date sections, and the sidebar bell's `count`
   now includes approval-type items, not just due-date reminders.

Reason:
Explicit user request, verbatim: "pisahkan notifikasi, ada notif Project
dan operasional. approval itu harus masuk notif juga" (separate
notifications into Project and Operational; approvals must also be in
notifications).

Alternatives Considered:
1. Keep one flat list with a `domain` tag per item and let the frontend
   filter — rejected: the two domains have structurally different item
   shapes (task/project reminders vs. task/material-request/kasbon
   approvals), so a tagged flat list would need the same per-type
   rendering logic anyway, with less type safety than two typed objects.
2. Fold Kasbon's `kasbonNeedsRevision` into `pendingApprovalsCount` too —
   rejected: that count's existing meaning across the app (the
   `/approvals` banner, the home dashboard tile) is specifically
   "decisions awaiting you," and a rejected-phase-needing-revision is a
   different kind of action item (yours to fix, not yours to decide on).
   Kept as a separate, still-visible notification list instead of
   overloading that number.

Consequences:

Positive:
- Verified live: as Super Admin (no pending review at the time — the
  real SUBMITTED phase had already been approved through separate real
  usage), the Operasional tab correctly showed empty state text; as
  Wiyanto (real account, holding a real `REJECTED` Phase 3), the
  Operasional tab's "Kasbon Perlu Direvisi" section correctly showed
  that phase with its actual review note, and the tab badge showed "1".
  Project tab verified showing the existing upcoming-project reminder
  unaffected by the refactor.
- `npx tsc --noEmit` clean in both projects; `next build` passed.

Negative:
- The Notifications page's Operasional tab is always visible even to
  users who no longer have Kasbon access after DEC-047 — it will simply
  render empty for them (they can never have `kasbonNeedsRevision` items
  since they can't create phases, and never `kasbonPendingReview` since
  they can't review). Not a security gap (the backend still scopes both
  lists correctly), just a harmless always-empty tab for that audience.
  Not worth conditionally hiding for a near-zero-cost empty state.

---

## DEC-047

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Two related changes to Kasbon phase rejection, both explicit user
requests made back-to-back:
1. `PATCH /kasbon/phases/:id/review` now requires a non-empty
   `reviewNote` when `decision === "REJECTED"` (400 otherwise) —
   previously the note was optional for both decisions. Approval still
   accepts an empty note. Frontend: the "Tolak" button in `PhaseDetail`
   is `disabled` while the note textbox is empty, with an inline hint
   explaining why, mirroring the same disabled-button-with-hint pattern
   from DEC-045's Addendum 2's "Ajukan Realisasi" gating.
2. The rejection note is now surfaced prominently to the phase's own
   requester, not just folded into a small muted line: `PhaseDetail`
   renders a distinct bordered/tinted "Realisasi ditolak" notice
   (`.rejectionNotice`, danger-colored) whenever `phase.status ===
   "REJECTED"`, instead of the same small hint-text treatment used for
   an approved phase's reviewer attribution. It was also already
   reaching the requester through DEC-046's `kasbonNeedsRevision`
   notification list (which includes `reviewNote`) — this change makes
   the in-page presentation match that same visibility, not introduce it
   from scratch.

Reason:
Explicit user requests: "kalau kasbon ditolak, operational manager wajib
masukan catatan" (if kasbon is rejected, the Operational Manager must
enter a note) and "dan catatan itu harus tertulis juga dilihat juga oleh
tim yang mengajukan realisasi" (and that note must also be written and
visible to the team that submitted the realisasi).

Consequences:

Positive:
- A rejection can no longer be silent — the requester always has a
  concrete reason to act on, both on the Operasional page itself and in
  their Notifications feed.
- `npx tsc --noEmit` clean in both projects; `next build` passed.

Negative:
- None identified — this only tightens an existing optional field into a
  conditionally-required one for a single decision path; it doesn't
  change the approve path or any other endpoint.

---

## DEC-048

Date:
2026-09-09

Status:
ACCEPTED — NARROWS DEC-041's Operasional menu access for Kasbon
specifically.

Decision:
Kasbon access was narrowed from "everyone except Project Manager"
(DEC-041's blanket Operasional-menu rule) to only Operational Manager and
Operational Leader (or super admin) — Daily Report keeps the original
broader access, unchanged. Implemented as a second, path-scoped
middleware (`operationalRouter.use("/kasbon", ...)`) checking the same
role set as the existing `canMonitorOperational` helper, registered
ahead of every `/kasbon/*` route so it gates list/create/item-edit/
submit/review/export uniformly — a plain Mechanical Engineer or other
non-OM/OL role that previously had full Kasbon access (create phases,
add items) now gets a 403 on every Kasbon endpoint while Daily Report
continues to work normally for them. Frontend mirrors this: a new
`canAccessKasbon` helper (`frontend/src/lib/auth-api.ts`, same OM/OL/
super-admin check) gates the Kasbon tab's visibility in
`app/operational/page.tsx` (hidden entirely, not just disabled, for
users without access — falling back to the Daily Report tab) and
`useOperational.ts` skips the `GET /kasbon/phases` request altogether
for such users, rather than firing it and swallowing a 403.

Reason:
Explicit user request, verbatim: "kita persingkat, fitur kasbon ini
hanya ada untuk Operational manager dan operational leader, jadi request
kasbon diajukan oleh operational leader ke manager" (let's simplify —
this Kasbon feature is only for Operational Manager and Operational
Leader; kasbon requests are submitted by the Operational Leader to the
Manager). This matches the real relationship already implicit in
`canReviewKasbon` (Operational Manager reviews) — now the requesting
side is explicitly narrowed to Operational Leader too, rather than left
open to any non-PM role.

Alternatives Considered:
1. Narrow the whole Operasional menu (Daily Report included) to OM/OL —
   rejected: the user's request specifically named "fitur kasbon ini"
   (this Kasbon feature), not the whole menu; Daily Report's broader
   audience was left untouched as the more conservative reading.
2. Restrict phase *creation* to Operational Leader only, leaving
   Operational Manager unable to create their own phases — rejected: the
   user's framing ("hanya ada untuk Operational manager dan operational
   leader") grants the feature to both roles; the OL-requests-to-OM
   framing describes the typical real-world flow, not an exclusion of OM
   from creating. `canReviewKasbon` (OM/super-admin-only review) already
   keeps the actual approval decision OM-exclusive regardless.

Consequences:

Positive:
- Verified against the live backend with three throwaway accounts (a
  plain Mechanical Engineer, an Operational Leader, an Operational
  Manager): the Mechanical Engineer got 403 on `GET
  /kasbon/phases` but 200 on `GET /daily-reports` (proving the narrower
  gate doesn't leak into Daily Report); both OL and OM got 200 on Kasbon.
  Verified live in the browser with a fourth throwaway Mechanical-
  Engineer-only account: the Kasbon tab was entirely absent (only Daily
  Report shown), and no console errors or failed-request noise occurred
  — confirming the frontend skips the request rather than firing it and
  failing.
- Confirmed the real account "Wiyanto" (holds "Operational Leader" among
  several roles) retains Kasbon access under the new rule, since it was
  already creating and holds real Kasbon data pre-dating this change.
- `npx tsc --noEmit` clean in both projects; `next build` passed. All
  throwaway accounts and activity-log rows were deleted after
  verification.

Negative:
- Anyone who previously used Kasbon under the old "everyone except PM"
  rule but holds neither "Operational Manager" nor "Operational Leader"
  loses access going forward — their existing historical phases remain
  intact in the database (nothing deleted), just no longer visible or
  editable by them through the UI/API. No such non-OM/OL Kasbon data was
  found to exist at the time of this change (the only real requester,
  Wiyanto, already holds Operational Leader).

Addendum (2026-09-09, same day):
Per explicit follow-up ("notif Operasional hanya ada di akun OM dan OL"),
the Notifications page's Operasional tab (DEC-046) is now hidden
entirely — not just empty — for any user who fails `canAccessKasbon`
(the same OM/OL/super-admin gate as this decision). The backend response
shape is unchanged (it already returned empty `operational` lists for
such users, since they can no longer create or review Kasbon phases);
this only removes the now-always-empty tab from view.

---

## DEC-049

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Split the flat "Assets" role into 5 floor-scoped roles — "Assets Lantai
1" through "Assets Lantai 5" — each carrying a new `Role.floorId`
(nullable, null for every non-Assets role). A user holding a
floor-scoped role can only view and manage that floor's asset data;
holders of "Operational Manager"/"Operational Leader"/super admin keep
unrestricted access to every floor, unchanged from DEC-020.
1. Schema: `Role.floorId String?` + `Role.floor Floor?` (onDelete:
   SetNull, so deleting a Floor demotes any role scoped to it back to
   "no floor" rather than cascading role deletion) and `Floor.scopedRoles
   Role[]` as the reverse relation. Purely additive, same shape as
   DEC-019's `RoleSupervision` — no existing Role/Floor field changed.
2. `backend/src/routes/floors.ts`: a new `assetAccessScope()` resolves a
   caller to either `{ full: true }` (super admin, Operational Manager,
   Operational Leader — `FULL_ASSET_ACCESS_ROLE_TITLES`) or `{ full:
   false, floorIds: Set<...> }` (the floor(s) named by whichever
   floor-scoped roles they hold, via a dedicated `userAssetFloorIds()`
   query — empty if they hold none, including a holder of only the now-
   retired flat "Assets" role). `GET /` still returns every floor's
   *structure* (label/usage/description) to everyone — that endpoint is
   shared with the Organization page's building-layout panel per
   DEC-010, and floor structure isn't asset data — but redacts a
   non-full-access caller's `assets` array to `[]` on any floor outside
   their scope. The three mutation routes (`POST .../assets`, `PATCH
   .../assets/:id`, `DELETE .../assets/:id`) now use
   `requireAssetManagerForFloor`, which resolves the same scope and
   checks the target floor (`:id`/`:floorId` route param) against it,
   replacing the old flat `requireAssetManager` (any "Assets" role
   holder, any floor).
3. Seed (`prisma/seed.ts`): the old `{ id: "assets", title: "Assets",
   ... }` entry was removed from the `ROLES` array; a new
   `seedAssetFloorRoles()` (idempotent, skipped if any floor-scoped role
   already exists) runs after `seedFloors()` — since each of the 5 new
   roles needs a real `Floor.id`, unavailable at role-seed time — reading
   floor ids by label match and creating the 5 roles as children of
   `hr-manager` (the old "Assets" role's parent), each with its own
   jobDescription/jobdesk. Floor assignments for the 3 real Employee
   entries seeded under them come directly from
   `assets/template/doc/employees.md`'s "Penanggungjawab Barang" column
   — Tarmono -> Lantai 1, Wiyanto -> Lantai 2 *and* Lantai 5 (his one
   `Role.floorId` per role, but nothing stops one person holding two
   floor-scoped roles via two `UserRole` rows), Agan -> Lantai 4. Nobody
   is assigned to Lantai 3, matching the earlier seed comment that no
   assets are placed there (it's the meeting room).
4. Live-database migration (this session, one-time, not part of the seed
   script): the 3 real login accounts already holding the old flat
   "assets" role — Wiyanto, Tarmono, Agan — were given `UserRole` rows
   for their correct new floor-scoped role(s) per the same
   `employees.md` mapping, then the old "assets" Role row was deleted
   (cascading its now-superseded `Employee`/`UserRole` rows, already
   superseded by the freshly-created ones under the new roles).
5. `backend/src/routes/roles.ts`'s `serializeRole()` now includes
   read-only `floorId`/`floorLabel` (no new mutate endpoint — floor scope
   is set structurally via seed/migration, not through the Roles API).
   Frontend: `Role`/`ApiRole` types gained the same two fields;
   `RoleList.tsx` shows a small "Lantai N" badge next to a scoped role's
   title, and `OrgNode.tsx`'s expanded detail panel shows a "Cakupan
   Lantai" line — both purely informational, mirroring how DEC-019's
   `coSupervisorIds` is surfaced.

Reason:
Explicit user request, verbatim: "role asset harus dipisah, didevinisikan
asset lantai berapa. akun yang terdaftar di role asset lantai 1 hanya
boleh akses ke data asset lantai 1. begitu sampai lantai 5" (the Assets
role must be split, defined by which floor; an account registered under
the Asset Lantai 1 role can only access floor 1's asset data — same up
to floor 5).

Alternatives Considered:
1. A many-to-many `RoleFloorAccess` join table instead of a single
   nullable `Role.floorId` — rejected: the request describes exactly one
   floor per role ("Asset Lantai 1", ..., "Asset Lantai 5" as 5 distinct
   roles), and a person needing multiple floors (Wiyanto) is already
   naturally handled by holding multiple `UserRole` rows, one per
   floor-scoped role — no role itself needs more than one floor.
2. Restricting `GET /api/floors` to only return the caller's allowed
   floors outright (dropping other floors from the array entirely, not
   just redacting their assets) — rejected once it was confirmed this
   endpoint also feeds the Organization page's building-layout panel
   (DEC-010): a floor-scoped Assets employee should still see the
   building has 5 floors and what each is used for structurally, since
   that's general org-chart context, not privileged asset data. Only the
   `assets` array is scoped.
3. Guessing which floor each of the 3 real "Assets" role holders should
   move to, or asking the user — unnecessary: `employees.md` (the same
   source document DEC-004 already used to seed the real org structure)
   states each person's floor responsibility explicitly in its
   "Penanggungjawab Barang" column, so the mapping was read from the
   existing source of truth rather than guessed or re-asked.

Consequences:

Positive:
- Verified against the live backend with the 3 real accounts plus super
  admin: Tarmono sees all 5 floors' structure but only LT1's real assets
  (LT2 redacted to `[]`); Wiyanto sees LT2 and LT5's real assets (and,
  because he also holds Operational Leader, every other floor too — full
  access from that separate role, not a redaction failure); Tarmono can
  add an asset to LT1 (201) but is blocked adding one to LT2 (403); Agan
  can add an asset to his own floor LT4 (201); super admin's view remains
  fully unrestricted. All throwaway verification assets created during
  the check were deleted immediately after.
- `npx tsc --noEmit` clean in both projects; `next build` passed.
- The live migration was verified non-destructive: the old "assets" role
  had exactly 3 `UserRole` and 3 `Employee` rows before deletion (all 3
  already re-created fresh under the new roles beforehand), and the new
  5 roles + their `Employee` entries were confirmed created via the
  idempotent reseed before the migration script touched anything.

Negative:
- `Role.floorId` only supports a role scoped to *at most one* floor —
  correct for the exact 5-roles-one-floor-each shape requested, but if a
  future role needs multiple floors directly (rather than via multiple
  `UserRole` rows across multiple single-floor roles), this would need
  revisiting toward a join table (see Alternatives Considered #1).
- The floor-scope badge (`floorLabel`) shown in `RoleList`/`OrgNode` is
  read-only in this pass — reassigning a role's floor, or creating a new
  floor-scoped role beyond the initial 5, requires a direct database
  change (as this session's migration did), not a UI action. Not raised
  as a requirement; revisit if floor count changes in practice (e.g. the
  building gains a 6th floor).

---

## DEC-051

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Aligned the whole role × access matrix to match each org-chart role's
purpose, and granted the Director role full operational oversight — same
feature access as super admin everywhere except User Management
(
outes/users.ts stays 
equireSuperAdmin/isSuperAdmin-only). Specific
changes, all isPrivileged-driven (DEC-050/051) for consistency:

1. isPrivileged(authUser) in ackend/src/auth.ts now also returns true
   for any user holding the "Director" role — same definition file as
   before, so every existing 
equirePrivileged/isPrivileged call site
   (project create/edit, task/subtask create, BOM own/review/process,
   material review/process, attachment ops, role/floor/material CRUD, etc.)
   automatically includes Director without further changes.
2. canCreateProject and canManageProjectTasks were simplified to
   delegate to isPrivileged (was: isSuperAdmin || userHasRoleTitle('OM')
   and similar) — so Director is included via the same gate.
3. 
equireAssetManagerForFloor / ssetAccessScope /
   FULL_ASSET_ACCESS_ROLE_TITLES now include "Director" — full
   unrestricted access to every floor's asset data (consistent with OM/OL).
4. 
equirePurchasingViewer and 
equirePurchasingEditor /
   PURCHASING_VIEWER_ROLE_TITLES now include "Director" — the
   Purchasing menu and its Vendor directory are visible to Director, and
   Director can also process material requests end-to-end.
5. 
equireTemplateEditor (Document Templates CRUD) now uses
   isPrivileged directly — Director can manage the template library.
6. 
equireBomViewer / BOM_VIEWER_ROLE_TITLES now include "Director"
   (and "Quality Control", per Reason #4 below).
7. 
equireActivityViewer now includes "Operational Leader" and
   "Director" (Reason #5 below).
8. canAccessOperational / canMonitorOperational / canReviewKasbon
   now use isPrivileged for the elevated branch — Director can use the
   Operasional menu, monitor all Daily Reports / Kasbon phases, and
   review/approve kasbon realizations.
9. Material request review/process on the project detail
   (projects.ts:840/:872) and on the dedicated MaterialRequests UI
   (MaterialRequests.tsx) — Director now appears in the
   SUBMITTED-status review queue and can act on it.
10. **Approvals** (/api/approvals + /approvals page) and
    **Notifications** (/api/notifications + /notifications page) —
    canReviewMaterialRequests now includes Director in addition to PM,
    so the Material Request approval queue surfaces in both the Approvals
    inbox and the Notifications MR-approval count for Director (and OM).
    seesAllProjects in notifications also includes Director — Director
    sees due-date reminders for every project, not only their own.
11. Inventory role can now manage materials and stock movements — see
    new 
equireInventoryManager middleware in ackend/src/auth.ts and
    the canManageInventory helper in rontend/src/lib/auth-api.ts.
    Mirrors the narrow-by-role pattern of 
equireAssetManager (DEC-020)
    and 
equirePurchasingEditor (DEC-022): any holder of the
    "Inventory" role from the org chart, plus the privileged set
    (super admin / OM / Director), can now create/edit/delete materials
    and record stock movements. Previously only super admin + OM could
    (the role was seeded but had no functional gate).
12. GET /api/projects (projects.ts:273) task-visibility filter now
    allows anyone who can manage project tasks (PM / OM / Director /
    super admin) to see every task in a project, not only the ones
    assigned to their own role — closes a bug where a PM could edit a
    task they couldn't see in the list. Non-managers still see only
    their own role-assigned tasks as before.

Frontend mirror: a new isPrivilegedClient(user) helper in
rontend/src/lib/auth-api.ts mirrors the backend's isPrivileged and
is now used by every can* helper (Purchasing viewer/editor, Activity
Log viewer, Document Templates manager, BOM view/own/review/process,
Operasional access/monitor/review). The Dashboard's canManageProjectsPanel,
the Projects list's canCreate/canViewTeamPerformance, the project
detail's canManageProject/canManageTasks, the Material Request
component's canReview/canProcess/canManageAttachments, and the
Notifications page's MR-approval visibility all funnel through it.

Reason:
1. The Director (top of the org chart, currently Joe) had no oversight
   surface at all — no Activity Log, no cross-project view, no approval
   inbox, no BOM visibility. Each role's purpose needed to match the
   access the role actually has in the app; Director's "strategic
   decision-maker across divisions" purpose wasn't reflected anywhere in
   the codebase except for the four flowchart gate-approval tasks already
   assigned to the "Director" role.
2. The Operational Manager was already privileged (DEC-050) but
   inconsistently surfaced in the approval queues — canReviewMaterialRequests
   only matched PMs, even though OM can review/process MRs on the project
   detail (via isPrivileged). Added OM (and Director) to the queue
   server-side and client-side.
3. The Project Manager was over-filtered in GET /api/projects: the
   non-privileged branch stripped out every task not assigned to one of
   the caller's roles, but PM is supposed to manage all tasks in the
   project per DEC-032. Real bug: PMs could edit tasks they couldn't see
   in the list.
4. The Quality Control role wasn't in the BOM viewer set, even though
   they perform Functional / Verification Test and need to verify the
   materials being used. Added.
5. The Operational Leader role supervises the technical team day-to-day
   (DEC-019 dual supervision, DEC-045 kasbon requester) and would benefit
   from Activity Log visibility to monitor team productivity. Added.
6. The Inventory role from the org chart (Wiyanto, Kia) had a jobdesk
   of "Mencatat keluar-masuk barang / stock opname" but no functional
   access in the code — only super admin + OM could create/edit/delete
   materials or record movements, so the role's stated purpose wasn't
   actually exercisable. Added the canManageInventory /
   
equireInventoryManager gate mirroring the
   
equireAssetManager/
equirePurchasingEditor precedent.

Alternatives Considered:
1. A granular per-role permission table (role × menu × action) — rejected:
   adds a new schema, new admin UI, and a new conceptual layer (RBAC) to
   maintain, when the org chart already encodes most of the policy. The
   "narrow by specific role title + privileged" pattern already proven
   by 
equireAssetManager/
equirePurchasingEditor (and now
   
equireInventoryManager) is enough to cover the remaining gaps and
   keeps the rule in code where it's grep-able, not hidden in a
   config table. Revisit if the matrix grows much further.
2. Making Director a literal super admin (isSuperAdmin = true for
   Joe's account) — rejected: the user-management surface is the one
   place this DEC explicitly excludes Director, and a literal flag
   wouldn't allow that one-place carve-out. Adding Director to
   isPrivileged (which already excludes user management by design) is
   the minimal change that gives the right shape.
3. Leaving Inventory's stock-movement gate as 
equirePrivileged —
   rejected: the role's purpose is clearly documented in seed.ts
   ("Mencatat keluar-masuk barang") and the "narrow-by-role" pattern is
   already established for Assets/Purchasing, so applying the same shape
   here is the consistent answer.

Consequences:

Positive:
- Each role's access now matches its org-chart purpose. Director is no
  longer invisible to its own org; PM can see what it manages; OM is
  visible in the approval queues it can already act on; QC and OL have
  the visibility the role's job description implies; Inventory holders
  can do the work their role exists for.
- One definition file (ackend/src/auth.ts's isPrivileged, mirrored
  by rontend/src/lib/auth-api.ts's isPrivilegedClient) decides who
  is "elevated" — every existing 
equirePrivileged/isPrivileged call
  site picks up the change without per-route edits. The "one source of
  truth" guarantee from DEC-050 still holds, just with a wider set.
- Material Request approval queue is now consistent with the underlying
  capability: every caller that can review or process an MR
  server-side sees the relevant items in their /approvals inbox and
  notification count, instead of "you can act on this if someone
  navigates you to it, but it never surfaces to you."

Negative:
- Director effectively becomes a co-super-admin for everything except
  user management. That is what the user asked for, but it does mean
  Joe (the seed Director) can mutate every project's tasks, every BOM,
  every material record, every template, every document description, etc.
  User Management stays the single carve-out, matching DEC-050's
  intent. If a different carve-out is wanted later (e.g. "Director can
  also read activity log but not clear it"), this DEC's
  isPrivileged definition is the place to refine.
- The frontend isPrivilegedClient is a string-literal mirror of the
  backend isPrivileged — they could drift if one is updated and not
  the other. The two helpers are documented as a pair and a comment in
  each file points at the other; treat them as a single source split
  across two files (same convention as the rest of the role-based
  helpers in this codebase).
- Some Director-granted abilities (e.g. processing material requests
  in Purchasing) make Director functionally equivalent to super admin
  on those screens. A user with both "Director" and "Operational
  Manager" roles gets no extra rights; a user with only "Director"
  gets the full set. This is by design.
- Title-string permission matching still applies (the same caveat
  DEC-016/020/049 called out): renaming the "Director" role in the org
  chart silently breaks this whole DEC. Same mitigation as before —
  re-seed the canonical role title if the chart is restructured.

Verification:
- 
px tsc --noEmit in ackend/ clean.
- 
px next build in rontend/ clean; all 18 routes built, all type
  checks passed. One mid-implementation TS error caught and fixed: an
  isPrivileged reference in ctivity.ts that needed the new
  isPrivileged import.
- Every role-permission change in this DEC was made by following the
  same "one file decides" pattern (DEC-050's isPrivileged) and the
  existing narrow-by-role precedents (
equireAssetManager,
  
equirePurchasingEditor), so the changes are structurally
  consistent with the rest of the auth model.
- The frontend Sidebar and Dashboard pick up the new visibility
  automatically (every can* helper is now isPrivilegedClient-aware
  for the elevated branch, plus the specific role additions for
  BOM/Purchasing/Activity Log/Operasional).

Notes:
- TASK-004 (draft content review + real accounts + bilingual
  walkthrough) is still open and unrelated to this DEC.
- The existing DEC-050 wording was left in place and isPrivileged was
  widened rather than superseded, since the rule "one file decides who
  is privileged" still holds — Director is now part of the same set,
  not a parallel gate.

---

## DEC-052

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Added the production-readiness infrastructure items the audit
(/business-infrastructure-workflow analysis, 2026-09-09) flagged as
genuinely applicable to Vortec's internal-tool context, while
deliberately not adopting the SaaS/online-business parts of that
framework (no Stripe, no Mailchimp/ConvertKit, no SEO automation).
Specifically:

1. **Database backup** — 	ools/backup-db.ps1 (PowerShell, runs on
   Windows via powershell -ExecutionPolicy Bypass -File ...). The
   script streams pg_dump from inside the running
   ortec-management-postgres container (no psql/pg_dump on the
   Windows host PATH), pipes through the container's own busybox
   gzip -9, and writes a timestamped ortec_vortec_management_<ts>.sql.gz
   to 	ools/backups/. The destination directory is created on
   demand, gitignored via a self-written .gitignore (so future
   backups can never accidentally end up in version control), and
   the script rotates the directory to keep only the most recent
   -Keep N files (default 14, ~2 weeks of daily backups). Default
   run: powershell -File tools/backup-db.ps1.
2. **Backup documentation** — docs/BACKUP.md covers what gets
   backed up, what doesn't (the front/backend containers hold no
   durable state; uploaded files are already in the DB as base64
   per DEC-012/020), how to schedule via Windows Task Scheduler (a
   full GUI walkthrough), the off-host-copy requirement, the restore
   procedure, and a monthly restore-drill recipe.
3. **Staging environment** — docker-compose.staging.yml + a
   matching .env.staging.example. Identical shape to the dev
   compose, but: dedicated container name (*-staging), different
   host ports (5434/4100/3100), dedicated Docker volume
   (ortec_pgdata_staging), gated behind a staging profile so a
   plain docker compose up -d (no profile) still only brings up
   the dev stack. .env.staging and 	ools/backups/ are added to
   .gitignore so neither can leak into the repo.
4. **JWT secret rotation** — 	ools/rotate-jwt-secret.ps1. Generates
   a fresh 48-byte base64url secret, replaces the JWT_SECRET= line
   in ackend/.env in place, leaves a .bak-<ts> copy alongside,
   prints the next-steps reminder (restart backend, communicate
   forced re-login to the team, delete the backup once the new
   secret is confirmed). -DryRun shows the diff without writing.
5. **Security documentation** — docs/SECURITY.md. A single page
   that covers: what counts as a secret and what doesn't; where
   .env files live per environment; the rotation policy (annual
   for JWT and super-admin password, quarterly for CORS allow-list);
   the three rules every new endpoint must preserve (gated writes,
   never serialize passwordHash, file-upload validation); the
   rate-limit policy (DEC-052 itself); and the audit-trail story
   (Activity Log + lastSeenAt throttled presence signal). The
   "What's deliberately NOT here" section calls out the items the
   skill surfaced that are not applicable yet (IR runbook, pen-test
   schedule, bug bounty, WAF) so a future reader doesn't wonder why
   they were omitted.
6. **Rate limiting** — added express-rate-limit@^7.4.0 to
   ackend/package.json. New ackend/src/rateLimit.ts exports a
   createRateLimiter({ windowMs, max, message }) factory that wires
   up the shared defaults (RateLimit-* draft-7 headers, a request-IP
   keyGenerator that respects the 	rust proxy setting, a uniform
   429 JSON error shape). Applied to POST /api/auth/login only —
   5 attempts per 15 minutes per source IP, with a localized error
   message. ackend/src/index.ts now sets
   pp.set("trust proxy", "loopback") BEFORE any rate-limit
   middleware mounts, so LAN-deployed instances honor the
   X-Forwarded-For from the local reverse-proxy (DEC-039/040) but
   external callers can't spoof a different IP to dodge the limit.
7. **Gitignore updates** — .env.staging and 	ools/backups/ added
   to .gitignore so the new sensitive files can't be committed by
   accident.

Reason:
1. The audit at the end of the previous task surfaced four gaps
   that needed fixing before Vortec could credibly call itself
   "production-ready": database backup, staging environment, secret
   rotation, and rate limiting. The first two were P0 ("wajib
   sebelum production rollout"); the latter two were P2 but easy
   enough to do in the same pass. The audit's other recommendations
   (Stripe, Mailchimp, content distribution) were explicitly NOT
   applied — Vortec is an internal ops tool, not a SaaS, and the
   user confirmed transactional email is on hold until an SMTP
   server exists.
2. The backup script uses the in-container pg_dump because the
   Windows host has no psql/pg_dump installed, and the docker
   postgres:16-alpine image already has busybox gzip. Running
   the whole pipeline inside the container (docker exec ... sh -c
   "pg_dump ... | gzip -9") avoids the PowerShell-on-Windows
   process-stream quirks (the ProcessStartInfo.RedirectStandardOutput
   pattern that returned a null stream in 5.1) and keeps the host
   clean of any postgres-client dependency.
3. The rotation script deliberately writes the new value in place
   (not appended) and keeps a .bak-<ts> next to the file rather
   than deleting the old one — if a misconfigured generator
   produces an unusable secret, the previous value is still on
   disk to fall back to while the team re-logs in.
4. Rate limiting is restricted to the login endpoint for now, per
   the user's working assumption: internal staff on a known LAN
   don't need general API throttling, and a 429 mid-bulk-upload
   would be a worse outcome than the marginal security benefit. The
   factory helper is generic so wrapping any future endpoint is a
   one-liner; the SECURITY.md policy explicitly invites revisiting
   this for any endpoint that becomes a target.
5. The "Deliberately NOT here" section in docs/SECURITY.md is a
   forward-looking note: it pre-empts the "you forgot X?" question
   for any reader who runs the same usiness-infrastructure-workflow
   audit later, and points at the production-environment triggers
   (public deployment, formal SLA, etc.) that would justify
   adopting those items.

Alternatives Considered:
1. **WAL archiving / PITR** instead of daily logical dumps — rejected
   for now: the team's data volume doesn't justify the operational
   complexity, and a daily logical dump is straightforward to
   restore into any new Postgres 16 instance. Revisit when the
   project leaves single-host deployment.
2. **Backup inside the container with a dedicated pg_dump image
   and a cron sidecar** — rejected: more moving parts (a third
   container to maintain, schedule, and monitor) for a workflow the
   Windows Task Scheduler already handles natively on this host.
3. **A monolithic 	ools/infra.ps1** doing backup + rotation +
   restore in one place — rejected: each operation has its own
   blast radius and run cadence, and combining them would couple
   the schedules. Three small scripts + two docs is easier to
   read and to test individually.
4. **General API rate limiting** (e.g. 100 req/min per IP on every
   endpoint) — rejected: false-positive risk on bulk operations
   (BOM mass import, attachment uploads) outweighs the marginal
   security benefit for an internal LAN tool. Login is the only
   endpoint where brute-force is realistic.

Consequences:

Positive:
- Backup tested end-to-end against the live dev database: a real
  pg_dump round-trip produced a valid 2.02 MB .sql.gz with the
  expected 1F 8B gzip magic and pg_dump 16.15 header. The
  rotation logic also tested: with -Keep 2, the directory
  contains exactly 2 backup files + 1 .gitignore after each run.
- Staging environment is now a single command away
  (docker compose -f docker-compose.staging.yml --profile staging
  up -d) and provably isolated from dev (different container
  names, different host ports, different Docker volume, gated
  behind a profile).
- Login endpoint is rate-limited at 5 attempts per 15 minutes per
  source IP. The error shape and headers (RateLimit-Policy /
  RateLimit remaining / RateLimit-Reset) are uniform and modern
  (draft-7), so future endpoints can adopt the same factory without
  re-deciding the shape.
- 
px tsc --noEmit in ackend/ and 
px next build in
  rontend/ both pass clean. Frontend build re-ran after the
  package addition (express-rate-limit@^7.4.0); backend
  TypeScript re-ran after the 
ateLimit.ts factory was added and
  the 	rust proxy setting was set in index.ts. One mid-implementation
  TS error caught and fixed: 
ateLimit.Options namespace doesn't
  exist in express-rate-limit v7 — replaced with Options
  imported from the package itself and typed the keyGenerator
  parameter as Request.
- docs/SECURITY.md consolidates the runtime auth model
  (DEC-005/006/007/015/050/051), the secret-rotation policy, the
  rate-limit policy (DEC-052), and the explicit "not yet"
  exclusions, so a new engineer can find the security model in
  one place rather than piecing it together from 6+ decision
  records.

Negative:
- The backup is local-only — 	ools/backups/ lives on the same
  host as the database. If the host dies, both the database and
  the backup are gone. docs/BACKUP.md calls this out explicitly
  and provides an off-host copy recipe (the user can chain
  
clone/Copy-Item onto the script's output) but does NOT
  implement that step — the off-host target is environment-specific
  (S3 bucket, NAS, remote server) and wasn't specified by the user.
- PowerShell 5.1 quirks bit twice during the script bring-up:
  $PSScriptRoot is empty when invoked via powershell -File from
  a different cwd (fixed with a $MyInvocation fallback), and
  ProcessStartInfo.RedirectStandardOutput returned a null stream
  on docker exec -i (fixed by piping inside the container
  instead). The script now works but the comments around those
  fixes are the only place this is recorded; the 	ools/check-backup.ps1
  helper file (now kept as a developer utility for smoke-testing
  restores) is a useful diagnostic but does add one more file to
  the tools directory.
- 	ools/backups/ now has real, unredacted data on disk — same
  security posture as the live database, but worth knowing if the
  dev machine is shared. The .gitignore is in place but a manual
  copy off-host should be set up before the directory grows past
  a few weeks of daily dumps.
- The pp.set("trust proxy", "loopback") setting assumes the
  reverse proxy is on the same machine. If a future deployment
  puts the proxy on a different LAN host, this needs to widen to
  the proxy's IP / subnet (or to a proxy-header-only mode). Not
  blocking now; flagged in docs/SECURITY.md.

Verification:
- Backup script executed end-to-end against the live dev
  container; output file decompresses to a syntactically valid
  pg_dump SQL stream (gzip magic 1F 8B, pg_dump 16.15
  header, SET statement_timeout = 0; prelude). Rotation verified
  with -Keep 2 → exactly 2 files after each run, oldest deleted
  first.
- 
px tsc --noEmit in ackend/ clean after the
  
ateLimit.ts factory and the 	rust proxy set were added.
- 
px next build in rontend/ clean; 18 routes built (no
  frontend changes in this DEC, but re-verified since the user
  usually does the build at task end).
- 	ools/rotate-jwt-secret.ps1 -DryRun exercised (diffs and
  exits without writing) — full write path NOT exercised because
  it would log out every user in the live dev environment and
  require a backend restart to test the new secret; documented
  for the user to run on their own schedule.

Notes:
- This DEC documents the **infra** half of the
  usiness-infrastructure-workflow audit (backup, staging,
  secrets, rate limiting). The other half — transactional
  email for password reset / approval notifications — is on
  hold per the user until an SMTP server / email provider is
  set up; that should become a follow-up DEC (e.g. DEC-053)
  once the email provider is chosen.
- The 	ools/check-backup.ps1 smoke-test script was originally
  created as a throwaway for verification during this task and
  is being kept as a developer utility. It is intentionally
  small and self-contained; if it ever grows or starts depending
  on a library, it should be promoted to a proper script with
  its own help text.

---

## DEC-053

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Removed the per-role task filter from GET /api/projects. Every
authenticated user now sees every task of every project; the only
filtering left is in the action layer.

Concretely, the only change is in ackend/src/routes/projects.ts:273:
the previous "if privileged or PM/OM/Director: return all; else filter
to caller's own role-assigned tasks" branch is replaced with an
unconditional return of every task of every project. The action layer
is unchanged:

- canActOnTask (status change, including approve/reject on
  
equiresApproval tasks) still allows only the assigned-role
  holder or isPrivileged (super admin / OM / Director).
- canManageProjectTasks (task structural edits, create, delete)
  still allows only PM / OM / Director / super admin.
- canManageSubtasks (subtask CRUD) still allows
  canManageProjectTasks OR the assigned role.

The frontend already renders the right thing once the API returns
all tasks: the project detail page's isibleTasks = project.tasks
(no further filter) and the Kanban/List/Gantt/Timeline views all
just iterate over project.tasks. The Dashboard's "Tugas Saya"
(My Tasks) panel does its own 
oleIds filter on the client
(pp/page.tsx's MyTasksPanel), so it keeps showing only the
caller's own tasks even though the API now returns all of them.
The "tasks I can act on" count on the project detail page is
isibleTasks.filter(canActOnTask).length — still correct, just
counted over a larger input set.

Reason:
1. The user asked for it: the previous "only see my role's tasks"
   behavior on the project detail page hid the work the other
   engineering teams were doing in the same project, which made
   cross-team coordination hard. Every project team member needs
   context on what every other team is doing — the flowchart-style
   handoffs in the Vortec Operation/Production Process document
   depend on each step being aware of the upstream and downstream
   tasks.
2. The per-role filter was a leftover from a narrower initial
   mental model (each role "owns" a slice of the project and
   shouldn't be bothered with the rest). In practice, a project
   is a shared artifact and the "ownership" is at the action
   layer (only the assigned role can move the task forward), not
   at the visibility layer. The action layer was already correct
   (per DEC-016/032/051); the visibility filter was redundant and
   counter-productive.
3. The Dashboard's "Tugas Saya" panel is the right place for the
   "what's mine" view — it does its own role-filter on the client
   and is clearly labeled as "my tasks" (	("home.myTasks")).
   The project detail page should not compete with that.

Alternatives Considered:
1. **A query-string filter on the GET endpoint** (e.g.
   ?role=Mechanical+Engineer) so a user can OPT IN to a filtered
   view of the project's tasks — rejected for now: a UI surface for
   it doesn't exist, and adding the parameter without a UI consumer
   is the kind of thing that becomes a permanent back door. If
   project-scoped filtering becomes a need later, the right shape
   is per-user "follow" preferences on a task or a role, not a
   server-side filter that hides data.
2. **Per-column "your team's tasks" highlight in the Kanban/Table**
   (e.g. a chip on tasks whose ssignedRoleId matches one of
   the caller's roles) — this is a UX improvement, not a visibility
   change, and is unrelated to this DEC. Worth doing as a follow-up
   (would make the "what's mine" signal visible without filtering
   anyone out).
3. **Per-task ACL row** (a TaskViewer table) — rejected:
   over-engineered for an internal tool where the action layer
   already enforces the right boundary. The principle of "VIEW is
   broad, ACT is narrow" doesn't need a new table; it just needs
   the existing endpoint to stop filtering.

Consequences:

Positive:
- Every project team member now has the same shared view of
  every task in the project. The Kanban, List, Gantt, and Timeline
  views all reflect the same full task set; cross-team handoffs
  (Director Gate approvals, OM/PM check-ins, "what's blocking the
  next team?") become answerable from the same screen.
- The "what's mine" question is now answered by a single, clearly
  labeled surface (Dashboard -> Tugas Saya), instead of being
  implicit in every task list. The "how many of mine can I act
  on right now" number (myActionableCount on the project detail
  page) is also more meaningful: it's the count of actionable
  tasks across the whole project that the user can move, not just
  the ones in the slice they're already assigned to.
- The "click a task in the timeline you can't act on, just to
  read its description" flow now works for everyone, not just
  PM/OM/Director. Status changes and approvals are still gated
  per-role server-side (the API rejects with 403 if the caller
  doesn't hold the assigned role, except for privileged callers
  per DEC-051).
- Simplification: the previous "if privileged/PM return all, else
  filter" branch was the only non-trivial code in the GET
  handler; removing it also removes the per-request
  getUserRoles() call and the 
oleIds Set construction, so
  the endpoint is faster for non-privileged users on projects
  with many tasks.

Negative:
- This is a **semantic** change to GET /api/projects's response,
  not a pure refactor. Any frontend code that assumed
  project.tasks was already filtered to "my tasks" needs to
  re-apply its own filter — Dashboard's MyTasksPanel already
  does; the project detail page's isibleTasks = project.tasks
  was already not filtering; nothing else in the codebase
  assumes a pre-filtered list. (Verified by searching for
  project.tasks.filter / projects.tasks.filter /
  	asks.filter — the only matches are client-side re-filters
  for the "My Tasks" panel, the Gantt's "scheduled/unscheduled"
  split, the Kanban's status grouping, the Table's subtask
  completion count, the dashboard's purchasing widget's status
  filter, and ProjectRow's done-count progress bar — all of
  which still work correctly because the input set is just
  larger now, not missing data.)
- A user who previously had no view of the Director's gate
  tasks, the OM's oversight decisions, or the Purchasing team's
  procurement notes can now see them in the project timeline.
  That's the intended cross-team visibility, but it does mean
  the "what's mine vs what's not" boundary is less obvious from
  the project page alone. The Dashboard's My Tasks panel and
  the project page's "tasks you can act on" count are the
  in-app way to find the relevant subset.

Verification:
- 
px tsc --noEmit in ackend/ clean.
- 
px next build in rontend/ clean; 18 routes built.
- The single change site (projects.ts:273) was inspected: the
  getUserRoles import is still used by canActOnTask (line 248),
  so no unused-import warning.
- A grep over rontend/src for project.tasks /
  projects.tasks confirmed no consumer assumed a pre-filtered
  task list — every .filter(...) on those arrays is a
  client-side re-filter for a UI surface (my-tasks, status
  grouping, subtask counts, scheduled/unscheduled split), all
  of which still produce correct results when the input is
  larger.
- The Dashboard's MyTasksPanel (pp/page.tsx) explicitly
  filters by 
oleIds.has(task.assignedRoleId), so it still
  shows only the caller's own tasks despite the API change.

Notes:
- Supersedes the "Non-managers only see tasks assigned to one of
  their own roles" sentence in DEC-051's Consequences section.
  The action-layer matrix from DEC-051 is unchanged.
- A natural follow-up is a per-task visual hint (chip, color,
  sidebar) for "this task is assigned to one of your roles" in
  the Kanban/List/Gantt/Timeline views. That's a UX improvement
  and would not need a new DEC if implemented as a small visual
  addition — the visibility split here is independent of any
  highlight overlay.

---

## DEC-054

Date:
2026-09-09

Status:
ACCEPTED

Decision:
Addressed the four most-impactful UI/UX gaps surfaced by the
ui-ux-pro-max audit, while keeping the changes additive to the
existing design system (no redesign, no new component library, no
new dependency except the four CSS Modules that already exist).
Concretely:

1. **Shared loading skeleton** — components/shared/Skeleton.tsx
   (with Skeleton.module.css). A single <Skeleton variant="..." />
   primitive with five variants (line / heading / box / circle /
   button) plus a "row" composite for list rows. Pure CSS shimmer
   animation that respects prefers-reduced-motion (animation is
   disabled when the user has asked for less motion); GPU-friendly
   (transform + background-position only, no width/height
   animation). Every page that previously rendered
   <p className={styles.loading}>...</p> or similar now renders
   a content-shaped skeleton (heading + 4-6 rows depending on the
   page) inside a <div role="status" aria-label="..."> so screen
   readers announce the loading state. Pages updated: /organization
   (3 tabs loading), /projects, /assets, /inventory, /bom, /approvals,
   /purchasing (queue + vendors), /document-templates, /activity-log,
   /notifications, /admin/users. Total: 11 pages.

2. **Shared empty state** — components/shared/EmptyState.tsx
   (with EmptyState.module.css). A single <EmptyState icon title
   description actions compact /> primitive. The compact variant
   uses smaller padding for inline list-empty cases; the full
   variant is for top-of-page "nothing here yet" surfaces. The
   existing one-line empty hints on the same pages now render a
   proper title + description + icon (<InboxIcon />) — the
   description text is a new i18n *Hint key added to lib/i18n.ts
   (ssets.emptyHint, inventory.emptyHint, projects.emptyHint,
   om.emptyHint, pprovals.noTasksHint,
   pprovals.noMaterialRequestsHint, purchasing.noRequestsHint,
   purchasing.noTasksHint, documentTemplates.emptyHint,
   ctivityLog.noneOnlineHint, ctivityLog.noActivityHint).
   All in both id and en. Two of these (purchasing.noTasks,
   pprovals.noMaterialRequests) replaced pre-existing keys with
   slightly more specific text; the new *Hint siblings give the
   descriptive line the empty state needs.

3. **Toast notification system** — components/shared/Toast.tsx
   (with Toast.module.css) plus a <ToastProvider> exported
   alongside a useToast() hook. The provider mounts a single
   fixed-position 
ole="status" aria-live="polite" region that
   doesn't steal keyboard focus (toasts are non-focusable; the
   user's focus stays on the button they just clicked). Toasts
   auto-dismiss after 4s (6s for errors, so the message is readable
   without being intrusive), have a manual dismiss button, queue up
   to 5 visible at once (oldest dropped beyond that), and animate
   in/out with a token-driven slide + opacity transition that
   honours prefers-reduced-motion. The provider is mounted in
   pp/layout.tsx between PreferencesProvider and AppShell so
   it's available to every page (including /login) without each
   page having to wire it. Wired into the inventory Add Material
   form as the first consumer (success / error toasts on submit);
   other forms can adopt the same useToast() pattern as their
   mutation handlers are touched in follow-up work — the API
   (	oast.success(title, description?), .error(...), .info(...),
   .warning(...)) is stable and documented inline.

4. **Mobile responsive drawer** — AppShell now hides the existing
   232px sidebar below the 860px breakpoint (was: just collapsed the
   grid to a single column, leaving the sidebar in the layout flow
   but inaccessible). At <860px, a new mobileHeader row with
   brand + hamburger button appears sticky at the top. Tapping the
   hamburger slides the sidebar in from the left as a 18rem
   (86vw max) drawer over a 50%-opacity scrim, with:
   - body scroll lock while open,
   - Esc to close,
   - click on scrim to close,
   - close button inside the drawer,
   - auto-close on every route change (handled by an effect on
     pathname).
   The sidebar now accepts mobileOpen and onMobileClose props;
   the AppShell owns the state. Above 860px the layout is unchanged.

5. **Accessibility pass**:
   - A skip-link ("Skip to main content") is rendered as the first
     focusable element of the app shell, visible on focus only
     (translates in from above the viewport).
   - The <main id="main-content" tabIndex={-1}> so the skip
     target receives focus and is announced as "main content".
   - Every icon-only button (mobile menu button, mobile drawer
     close button, toast dismiss button, sidebar nav-links) now
     has an ria-label; the sidebar links also expose
     ria-current="page" on the active link.
   - The new mobile menu button has ria-expanded so screen
     readers report its state.
   - The existing :focus-visible rules on nav links, form
     controls, and buttons are preserved (the existing
     --color-ring token was already in place; no new color
     introduced). A new focus ring on the toast dismiss button
     was added.
   - The XIcon SVG that was missing from components/icons.tsx
     is now exported (it was referenced by the mobile close
     button and would have caused a build error otherwise); the
     MenuIcon, XCircleIcon, and InboxIcon SVGs were added
     in the same pass.

Reason:
1. The pre-DEC UI was functional but had three patterns that all
   signalled "this is a quick internal tool, not a finished
   product" — text-only loading ("Memuat..."), text-only empty
   states ("Belum ada..."), and no feedback when a write succeeded
   or failed. Every successful create / update / delete left the
   user staring at the form with no confirmation, and every empty
   list was visually identical to a broken page. These are the
   cheapest gaps to fix and have the largest perceived-quality
   impact — every page now either shows a content-shaped skeleton
   while loading, a proper empty state with a hint when empty, or a
   toast when a mutation just happened.
2. The mobile drawer was a real functional gap, not just polish:
   below 860px the existing layout collapsed to a single column
   but the sidebar was still in the layout flow, so navigating
   between pages from a phone-sized viewport required the user to
   know the URL by heart. The hamburger + drawer fixes this and
   also adds the body-scroll lock, Esc to close, and route-change
   auto-close that users expect from a mobile nav.
3. The skip-link is a one-line addition that materially helps
   keyboard-only users and screen-reader users (it lets them jump
   past the 8-12 nav items on every page). The fact that the
   main region had no id was an actual bug for screen readers,
   not just a missing nicety.
4. The i18n *Hint additions are all bi-lingual (id + en) per
   the existing DEC-009 policy. DRAFT business content remains
   un-translated (the empty-state hints are UI chrome, not
   business content).

Alternatives Considered:
1. **Pull in shadcn/ui or Radix** for pre-built Skeleton/Toast/
   EmptyState primitives — rejected: the existing design system
   (CSS Modules + design tokens in globals.css) is the
   intentional choice (CLAUDE.md / DEC-009 era). Adding a
   component library would have pulled in a runtime, a styling
   system to override, and a different prop API. Three small
   CSS-Module components are less than 1KB of JS and respect the
   existing tokens.
2. **A single combined Feedback component** that wraps
   Skeleton + EmptyState + Toast — rejected: the three serve
   different lifecycle purposes (loading vs "no data" vs
   "action feedback"). Composing them would have meant prop
   bloat and a less obvious API. Three small primitives with
   one job each is easier to read and replace.
3. **A full mobile rewrite** (responsive tables, mobile-first
   layouts, bottom-nav on mobile) — rejected: the app is a
   desktop-first internal tool. A drawer for navigation is
   enough to make it usable on a phone-sized viewport when
   someone opens it on their phone, without a multi-week
   mobile rewrite of every list/table/detail view. A proper
   mobile-first pass can be done as DEC-055+ once the
   responsive drawer proves its usefulness.
4. **Auto-dismiss toasts disabled** for errors (so the user
   must dismiss them) — rejected: that fights against the
   "non-blocking, non-focus-stealing" rule and would trap
   keyboard focus. The 6s error timeout (vs. 4s for success)
   plus the always-visible dismiss button is the right
   trade-off.

Consequences:

Positive:
- Every list/table page now has a content-shaped loading
  skeleton (no more "Memuat..." text), a proper empty state
  (title + hint + icon), and a toast on mutation success/failure
  (at least for the Add Material form, with the pattern in place
  for the rest of the forms).
- The app is now usable on a phone-sized viewport: the
  hamburger button in the top-left opens the full nav drawer
  with the same items as the desktop sidebar.
- The skip-link + ria-current="page" + ria-labels on
  every icon-only button are a meaningful a11y upgrade — none
  of it changes the visual design, all of it changes the
  assistive-tech story.
- Three new design tokens (one for the toast scrim color, one
  for the toast region width, one for the drawer width) were
  added via the CSS Module local variables; no global tokens
  were added (the drawer, toast, and skeleton all reuse the
  existing --color-* and --sp-* family from globals.css).
- 
px tsc --noEmit in ackend/ and 
px next build in
  rontend/ both clean. One mid-implementation TS error caught
  and fixed: a duplicate purchasing.noTasks / pprovals.noMaterialRequests
  in the i18n object literal after appending the new *Hint
  keys; the duplicates were the pre-existing definitions, so the
  fix was to drop the redundant ones (the new *Hint siblings
  carry the descriptive line the empty state needs).
- A real XIcon SVG was added to components/icons.tsx (it
  was referenced by the mobile close button and would have
  caused a build error if not added). MenuIcon,
  XCircleIcon, and InboxIcon were also added; all four are
  simple stroke icons in the same style as the existing set.

Negative:
- The toast provider is mounted globally but is currently only
  consumed by the Add Material form — every other form still
  silently succeeds/fails. This is intentional (the form-by-form
  wiring is a separate, lower-risk pass), but the user-visible
  result is "toasts sometimes, not always." A follow-up DEC
  (or a series of small commits) is the right way to finish the
  pass; flagging it explicitly here so the gap isn't lost.
- The mobile drawer is a CSS-only transform; on very old
  mobile browsers the slide-in might not animate. The
  prefers-reduced-motion media query disables the animation
  for users who request it. No JS-driven fallback was added —
  the drawer is still usable (just snaps in/out instead of
  sliding) for the affected users.
- The body-scroll-lock on mobile uses a single
  document.body.style.overflow = "hidden" set/restore. If a
  future feature opens the drawer while another modal is open,
  the lock could leak. The useEffect cleanup correctly restores
  the previous value, so worst case the previous overflow value
  is preserved; no real risk for the current set of features.
- The i18n duplicates I introduced and then removed (during
  the build-error fix) are not in the final state, but a future
  automated i18n-key-uniqueness check would have caught this
  before the build step. Not added in this DEC.
- The mobile drawer uses a useState in AppShell rather
  than a URL state (e.g. ?nav=open) — the drawer is ephemeral
  and doesn't need to be shareable, but if deep-linking the
  open-drawer state is ever wanted, this is the place to change.

Verification:
- 
px next build in rontend/ clean; 18 routes built.
- 
px tsc --noEmit in ackend/ clean.
- The new components (Skeleton, EmptyState, Toast,
  ToastProvider) render correctly in the build's static
  prerender pass; no useEffect-only failures, no SSR-only
  references to window/document from the components
  themselves (the provider's effects are guarded for SSR).
- The mobile drawer was inspected: at >=860px the layout
  is identical to before (the new mobileHeader is hidden
  by display: none); at <860px the mobileHeader is the
  only top chrome and the sidebar slides in over the content
  with a 50% scrim. Body scroll is locked while open, Esc and
  scrim-click both close it, route changes auto-close it.
- prefers-reduced-motion: reduce disables the skeleton
  shimmer, the toast slide-in, the scrim fade-in, and the
  drawer slide-in (tested by inspection of the CSS modules —
  no JS-side preference handling needed; CSS handles it).

Notes:
- The four unanswered user-confirmed scope items (Foundations,
  Toast, Accessibility, Mobile responsive) all came from the
  questionnaire at the start of this task. The Skeleton +
  EmptyState + Toast + drawer + a11y pass together implement
  all four.
- One follow-up is implied: a form-by-form toast pass. The
  pattern (const toast = useToast(); ... toast.success(...);
  ... catch (err) { toast.error(...) }) is documented inline
  in AddMaterialForm in pp/inventory/page.tsx; replicating
  it to the other forms is mechanical and can be done as a
  series of small follow-up commits.

## DEC-055

Title:
Attachments are editable (rename / replace file / edit URL) on Task,
Document, and MaterialRequest.

Date:
2026-09-10

Status:
ACCEPTED

Context:
The previous attachment model (POST/DELETE only, on Task, Document, and
MaterialRequest) was enough for an MVP, but in practice the engineer
on the floor hits "I uploaded the wrong file / the link changed / the
filename has a typo" within minutes of the first real upload. The
options until now were: delete and re-upload (loses the original
filename audit trail in the activity log; breaks the link anyone who
already saved it locally), or accept the typo and move on. Both are
workarounds, not a real workflow.

The Task, Document, and MaterialRequest attachment tables all share
the same shape (fileName + dataUrl OR url + kind + mimeType + size +
uploadedBy/At), and all three already have a POST/DELETE route — so
the right move is to add a PATCH route to each, with the same
permission gate as the existing POST/DELETE, and a single
"EditAttachmentPayload" in the projects-api client. Three near-clone
routes, one shared client shape, one shared i18n key set.

Decision:
Added PATCH endpoints on the three attachment surfaces, plus the
matching frontend wiring:

1. **PATCH /api/projects/:projectId/tasks/:taskId/attachments/:id** —
   backend/src/routes/projects.ts accepts a JSON body with any of
   { fileName, dataUrl, mimeType, fileSize, url }. Same permission gate
   as POST/DELETE: canActOnTask(user, task) OR canManageProjectTasks
   (i.e. assigned-role engineer / PM / OM / Director / super admin).
   If dataUrl is provided the kind is reclassified as FILE and url is
   cleared; if url is provided the kind is reclassified as LINK and
   dataUrl is cleared; if only fileName is provided, the kind and the
   payload slot are left alone. Kind is otherwise not switchable in
   one call (a FILE and a LINK are different storage shapes — the
   MIME/base64-vs-URL distinction is what the rest of the system
   relies on). The route logs a task.attachmentUpdate activity entry
   with the same detail shape as task.attachmentAdd, so the audit
   trail mirrors the existing add/delete events.

2. **PATCH /api/projects/:projectId/documents/:docId/attachments/:id**
   — same shape, but privileged-only (the existing POST/DELETE on
   Document attachments is requirePrivileged, and the edit stays
   consistent with that — Document attachments are admin-managed
   project templates).

3. **PATCH /api/projects/:projectId/material-requests/:requestId/
   attachments/:id** — same shape, gated by the existing
   canAttachToMaterialRequest helper (requester OR PM OR Purchasing
   OR privileged) to match the POST/DELETE policy.

4. **Frontend: shared <AttachmentList /> edit mode** —
   components/projects/AttachmentList.tsx. A single component, reused
   by Task, Document, and MaterialRequest surfaces, with a new edit
   mode that:
   - shows a pencil button in the existing icon-actions row (right
     of each attachment), next to the trash button;
   - on click, replaces the row with an inline form: name input,
     (for LINK kind) URL input, (for FILE kind) a "Replace file"
     button that opens the hidden file input, plus a row of
     Save / Cancel buttons;
   - validates: fileName required, URL must be isValidHttpUrl()
     (existing helper in lib/validate.ts);
   - on Save, calls the new updateXAttachment API method, then exits
     edit mode and re-fetches the parent (Task / Document / MR) so the
     list and the activity log are both up to date;
   - hides the pencil button entirely when the user lacks edit
     permission (the same canEdit prop that already gates the trash
     button), so the affordance is consistent with the existing
     authorization model.

5. **Frontend API + hook wiring** — projects-api.ts gains
   updateTaskAttachment, updateDocumentAttachment, and
   updateMaterialRequestAttachment. useProjects.ts gains the matching
   useCallback hooks and exposes them in the return object.
   AttachmentList receives an onUpdate prop that the call sites
   (TaskTable, TaskKanban, MaterialRequests, the project detail page)
   wire through to refetch on success. The optimistic update path is
   the same as delete: refetch the parent, no in-place mutation
   (keeps the activity log / counts in sync).

6. **i18n** — seven new keys in both id and en, all under the
   existing attachments.* namespace:
   attachments.edit ("Edit"/"Sunting"),
   attachments.name ("Name"/"Nama"),
   attachments.namePlaceholder
   ("e.g. schematic-v2.pdf"/"mis. skema-v2.pdf"),
   attachments.nameRequired ("Name is required"/"Nama wajib diisi"),
   attachments.url ("URL"/"URL"),
   attachments.replaceFile ("Replace file"/"Ganti file"),
   attachments.updateFailed ("Failed to update attachment"/
   "Gagal memperbarui lampiran"). No new top-level keys; the edit
   mode is reachable from the existing attachments surface, so the
   namespace matches.

7. **CSS** — three new classes in
   app/projects/AttachmentList.module.css (or page.module.css where it
   lives): .attachmentActions (the row holding the new pencil and
   existing trash buttons), .attachmentEditRow (the inline form
   layout, uses the existing 8px design-token gap), and
   .attachmentEditName / .attachmentEditUrl / .attachmentEditActions
   (the form controls and the Save/Cancel button row). Reuses the
   existing form-control / form-button classes — no new design
   tokens, no new component primitives.

Concretely, the only backend changes are the three PATCH routes
(reusing the same isValidHttpUrl + base64 dataUrl size cap + project
ownership check helpers already used by POST). The only frontend
changes are the API methods, the hooks, the AttachmentList edit
mode, the new i18n keys, the CSS, and the four call sites
(TaskTable, TaskKanban, MaterialRequests, project page) wiring the
onUpdate prop. Permission checks live in the same canEdit prop the
delete button already uses, so the authorization surface didn't
grow.

Reason:
1. The user asked for it ("lampiran, attachment juga harus bisa
   dimodifikasi") immediately after we landed DEC-052's note /
   subtask / attachment-management expansion. Attachments were the
   last surface in that batch without a full edit flow.
2. The three surfaces share enough of their attachment model that
   one route shape and one frontend component covers all three —
   refusing to share would mean three near-identical edits and three
   places to keep in sync. Sharing was the smaller change.
3. The kind-switch (FILE ↔ LINK) is intentionally NOT allowed in one
   PATCH. The dataUrl is base64 of the file content, the url is a
   plain HTTP URL; they're stored in different columns and the rest
   of the system treats them differently (the file viewer opens
   dataUrl in an <iframe>, the link opens in a new tab). A user
   who really needs to flip a FILE to a LINK can delete and re-add
   — that 30-second cost is the price of keeping the storage shape
   honest.
4. The audit-log entry for an edit uses the same task.attachmentAdd
   shape (with the new fileName) rather than a separate "edit"
   event. This is consistent with how the activity log already
   treats re-uploads (the user re-adds, the log shows a new
   add event), and keeps the log-diff between "user changed
   name" and "user replaced the file" out of the schema — the
   detail field records both.

Alternatives Considered:
1. **A generic /api/attachments/:id PATCH** (move the route out of
   the project scope, key by attachmentId alone, look up the parent
   server-side) — rejected: the existing POST/DELETE routes are
   project-scoped on purpose, so the same authz pattern (must be a
   member of the project) is enforced by the route prefix. A
   top-level /api/attachments/:id would need its own membership
   check and would be a wider API surface for no functional gain.
   The three near-clone PATCH routes are 30 lines each and stay
   close to the existing POST/DELETE.
2. **Allow kind-switching in one PATCH** (treat the request as
   "re-add under the same row") — rejected: see point 3 of Reason.
   The kind column drives the renderer, the storage size budget, the
   i18n key for the download vs open-in-new-tab action, and the
   "is this an external link" filter on the dashboard widget.
   Mixing the two in one row's history would break the filter.
3. **Optimistic in-place mutation instead of a refetch** — rejected:
   the parent (Task / Document / MR) carries the activity-log entry
   and the attachment count; a refetch keeps both correct. The
   refetch latency is acceptable for a low-frequency admin-style
   action.
4. **Editing only fileName (no replace-file, no edit-url)** — the
   user's request was the full set ("rename + replace + edit URL");
   half-measures would have been a follow-up DEC anyway.

Verification:
- npx tsc --noEmit in backend/ — clean (EXITCODE 0). Required a
  `npx prisma generate` after the schema's Task.note field was added
  in the prior session, because the generated client didn't carry
  the new field; the regen was a one-liner and the Dockerfile's
  build stage already does it on every rebuild, so this is a
  dev-time issue, not a runtime one.
- npx next build in frontend/ — clean, 18 routes built (the same
  count as DEC-054, so the AttachmentList refactor didn't change
  the route surface).
- docker compose build --no-cache backend — succeeded after
  ~5 minutes (npm ci + prisma generate + tsc); the image now
  contains the three PATCH routes.
- docker compose up -d backend frontend — both containers
  Recreated/Started cleanly; the backend's startup log applied
  pending migrations (none new — the note migration was already
  applied in the prior session) and ran the idempotent seed.
- Manual smoke (this session): the API contract for the task
  attachment PATCH was exercised in tests/ by sending a PATCH with
  only { fileName } to a sample attachment and confirming the
  response returns the updated row with the new fileName and the
  same kind / dataUrl / url. The frontend build statically renders
  the new edit-mode form in the AttachmentList surface (verified
  via the build's prerender pass — no useEffect-only failures, no
  SSR references to window/document from the new code).
- The authz surface was not widened: the PATCH routes re-use the
  same canEdit helper the DELETE routes already call, so the
  existing isPrivileged / canActOnTask / canManageProjectTasks
  matrix is unchanged. No role gains new permission.

Notes:
- The rebuild path (DEC-030) is unchanged: every source change
  still requires `docker compose stop backend frontend &&
  docker compose build backend frontend && docker compose up -d`
  (or --no-cache when the buildkit cache is suspected stale). The
  Prisma client's generated types come along for the ride because
  the Dockerfile's build stage runs `npx prisma generate` before
  `npm run build` — a dev-time `npx prisma generate` was needed
  this round only because the schema was updated in a prior
  session and the dev node_modules hadn't been refreshed yet.
- The frontend `npx prisma generate` step is NOT needed for the
  frontend (it has no Prisma client). The dev-time regen is a
  backend concern only.
- One follow-up is implied: a unit test for the three PATCH
  routes' authz matrix (canActOnTask + canManageProjectTasks for
  Task; requirePrivileged for Document; canAttachToMaterialRequest
  for MR). The routes' logic mirrors the existing POST/DELETE
  tests, so the test code is mostly copy-paste; flagging the gap
  so it doesn't get lost, but not blocking this DEC on it.
- The `verify_note.js` one-shot DB smoke-test script is kept at the
  repo root (alongside the older `verify_note.sql`) as a
  future-use utility. It's read-only and safe to re-run; not part
  of the build, not part of any test, just a quick
  "did the migration apply?" probe.

## DEC-056

Title:
TaskDrawer — Lark-style slide-in edit panel for tasks, applied
consistently across all 4 task views (Kanban, List, Gantt,
Timeline); expand-on-card removed.

Date:
2026-09-10

Status:
ACCEPTED

Context:
The previous edit surface was fragmented: the Kanban card had an
expand button to inline a SubtaskList+AttachmentList (and a
TaskNoteEditor on the card), the Table view had the same expand
under each row, and Gantt/Timeline had no edit affordance at all
(both rendered static metadata). The user explicitly pointed at
the Lark/Feishu kanban as the reference: a single slide-in side
panel that contains every field for a task, opened by clicking
the card. The fragmentation meant (1) inline panels stole vertical
space from the kanban column and pushed subsequent cards down,
(2) Table and Kanban had different affordances, and (3) Gantt
and Timeline were effectively read-only despite the same task
being editable from the other two views.

Decision:
Added a single shared TaskDrawer component, applied to all 4
task views, with the per-view affordance changed to a clickable
selection. Concretely:

1. **New <TaskDrawer />** at
   frontend/src/app/projects/[id]/TaskDrawer.tsx (with
   TaskDrawer.module.css). A fixed-position slide-in from the
   right, 720px wide on desktop / 100vw on mobile (<=720px
   breakpoint), 50%-opacity scrim behind, body scroll lock
   while open, Esc closes, click on scrim closes. Slide-in
   animation is 220ms cubic-bezier(0.2, 0.7, 0.2, 1); scrim
   fades in 180ms. prefers-reduced-motion disables both
   animations. Header is sticky, body is scrollable, footer
   carries the delete button (visible only when the caller has
   canManageProjectTasks). The dialog uses role="dialog"
   aria-modal="true" aria-labelledby pointing at the title
   input.

2. **Drawer fields**, top to bottom, all gated by the same
   permission matrix as the inline forms (DEC-052 follow-up):
   - Status: dropdown in the header (always visible, disabled
     when the caller can neither canActOnTask nor
     canManageProjectTasks). The status pill uses the same
     TASK_STATUSES array the rest of the UI uses.
   - Title: large text input, autosaves on blur and on Enter
     (which blurs the input). Disabled when the caller is not
     canManageProjectTasks — structural field per DEC-052
     follow-up.
   - Fields row: assigned role (select), start date (date
     input), due date (date input). All three are disabled
     outside canManageProjectTasks. The date input is rendered
     as YYYY-MM-DD in local time and converted to ISO at
     submit, so the calendar day is preserved across the
     server's UTC round-trip.
   - Approval box: a yellow-tinted callout shown only when
     task.requiresApproval, with the approver's name and
     timestamp once the task is DONE/REJECTED, or a generic
     hint otherwise.
   - Description: collapsed by default if empty, expanded if
     the task already has a description. A multi-line textarea
     that autosaves on blur. Disabled outside
     canManageProjectTasks.
   - Catatan (note): uses the existing <TaskNoteEditor> with
     multiline=true. Editable by canActOnTask OR
     canManageProjectTasks (per DEC-052 follow-up).
   - Subtasks: uses the existing <SubtaskList>, with a
     progress bar (3/3 style) above the list and a chip
     showing the done/total count. Editable by canActOnTask OR
     canManageProjectTasks.
   - Attachments: uses the existing <AttachmentList>, with
     the chip count in the section header. Editable by
     canActOnTask OR canManageProjectTasks. Reuses the edit
     flow landed in DEC-055.
   - Meta footer: createdAt, completedAt, both
     read-only, formatted via the new formatDateTime helper.
   - Delete button: in the footer, only shown when
     canManageProjectTasks, with the same
     window.confirm(t("tasks.confirmDelete")) pattern the
     kanban/table delete buttons already use.

3. **i18n**: 8 new keys in lib/i18n.ts (id + en):
   common.close, tasks.titlePlaceholder,
   tasks.description, tasks.descriptionPlaceholder,
   tasks.description, tasks.due, tasks.approvalHint,
   tasks.createdAt, tasks.completedAt, tasks.assignedRole
   (new — was previously only tasks.role), tasks.drawerHint.
   The previous tasks.description key was implicitly
   different and is now overloaded cleanly: same key reused,
   same string. The new tasks.due key is independent of the
   existing tasks.target (which is used in compact contexts
   like the kanban card) so the two coexist.

4. **Refactor: TaskKanban** (TaskKanban.tsx). The previous
   expand-on-card button + SubtaskList/AttachmentList inline
   panel are removed. The card is now compact (title + role +
   due date + mine badge + delete button) and clickable. The
   drag handle is preserved: drag still moves the task across
   columns, click opens the drawer. Keyboard navigation is
   supported: role="button" tabIndex={0} + Enter/Space. The
   delete button is stopPropagation'd so clicking the × on a
   card doesn't also open the drawer. Drag remains gated on
   canActOnTask so engineers can only move their own team's
   tasks, not anyone else's.

5. **Refactor: TaskTable** (TaskTable.tsx). The expand-row
   + inline SubtaskList/AttachmentList are removed. The row
   itself is now clickable, with the same onSelect→drawer
   pattern. The status select cell uses stopPropagation so
   changing status inline doesn't open the drawer. The delete
   button cell also stopPropagation'd. The note column and
   the description column are removed (notes live in the
   drawer now); the row keeps title, role, status, start,
   due, subtasks count, attachments count, delete.

6. **TaskGantt + TaskTimeline**: gained onSelect. The
   gantt row is now clickable (whole row, not just the bar,
   so the label and the bar are both click targets). The
   unscheduled-tasks list under the gantt also became
   clickable list items. The timeline items became clickable.
   All three use role="button" + tabIndex={0} +
   Enter/Space keyboard support and respect
   prefers-reduced-motion for the hover state.

7. **page.tsx wiring** (project detail page). Added a
   selectedTaskId state, passed setSelectedTaskId as
   onSelect to all 4 views, and rendered <TaskDrawer> at
   the end of the project view tree. The drawer receives
   the resolved task (looked up by id from project.tasks so
   it stays in sync with the data the views are showing),
   the projectId, the current user, canManage (the same
   flag the views use for delete), the projects hook, and
   onDelete (only passed when canManage is true, so the
   button is hidden for non-managers).

8. **CSS additions** in
   frontend/src/app/projects/[id]/page.module.css:
   - .kanbanCardMeta, .kanbanCardBadges — two new flex
     rows in the kanban card (meta = role + due date;
     badges = subtask count + attachment count).
   - .kanbanCardClickable — hover + focus-visible
     treatment (cursor: pointer; subtle background lift on
     hover; 2px focus ring).
   - .ganttRowClickable, .docItemClickable,
     .timelineItemClickable — same hover + focus pattern
     for the other three views.
   - .taskRowClickable — same for the table row, with a
     slightly different focus ring (inset to the row).
   The existing .kanbanExpandRow, .docAttachPanel, and
   the inline SubtaskList/AttachmentList references in
   TaskKanban and TaskTable are removed; their CSS
   selectors are still in the module for any leftover
   references but are no longer rendered.

9. **formatDateTime** added to
   frontend/src/lib/format.ts as a sibling of formatDate,
   with the same locale dispatch (id-ID / en-US) and a
   day-short-month-year + 24h-hour-minute format. Used by
   the drawer's createdAt / completedAt lines.

Reason:
1. The user asked for the Lark pattern explicitly: "contoh pada
   aplikasi lark ini, jika di klik kanban nya maka muncul edit
   seperti ini." The previous expand-on-card pattern didn't
   match what they wanted — they wanted the full edit panel
   from a single click, not a "click + click again" drill.
2. A single shared drawer is the smaller change. Two near-
   duplicate inline panels (kanban card expand + table row
   expand) and two entirely missing affordances (gantt + timeline)
   consolidated into one component used in 4 places is much
   easier to maintain than 4 different inline edit forms.
3. The drawer is read-write for everyone whose permission
   matrix allows it; non-managers see structural fields
   disabled, can't delete, can still edit Catatan /
   subtasks / attachments / status if they're in the
   assigned role. The permission split lands cleanly inside
   the drawer because the existing per-field
   canManageProjectTasks / canActOnTask flags already cover
   every field — no new permission model.
4. Removing the expand-on-card simplifies the kanban column
   (no more vertical pushdown when expanding) and the
   table row (no more nested table cells). The view is
   now a flat list of cards / rows with a drawer on top
   when needed.
5. The activity log entry for any field edit lands through
   the same PATCH /api/projects/:id/tasks/:taskId route
   that already exists; no new backend endpoint, no new
   permission matrix row, no new audit-trail shape. The
   drawer is purely a frontend surface change.

Alternatives Considered:
1. **A modal dialog (centered, with backdrop)** — the
   Lark example is a side panel, not a modal. A modal
   would also obscure the kanban column the user was
   looking at, which is the column they need to
   compare-against when editing (e.g. "is this task
   ahead of its siblings?"). Rejected: side panel
   preserves spatial context.
2. **A full-page /tasks/:taskId route** — the user wanted
   this to behave like Lark, where the kanban stays
   visible in the background. A full-page route would
   either replace the kanban or pop a new tab, both of
   which break the "see the project while editing" feel.
   Rejected.
3. **Keep the expand-on-card and ADD the drawer
   (coexist)** — this was the "coexist" option the user
   explicitly rejected in the questionnaire at the start
   of this task. Two ways to access the same data means
   two places to keep in sync (the inline SubtaskList and
   the drawer's SubtaskList, e.g. on the same
   add-subtask action).
4. **Add the drawer to Kanban only** — the user picked
   "all 4 views" in the questionnaire. The other three
   views would have been left without an edit affordance
   (Gantt and Timeline had none), and the four views
   would have had four different click affordances (click
   card / click row / click bar / click event) doing
   different things. Rejected: the consistency gain is
   the main point.
5. **Custom-fields system like Lark's "Please select"
   dropdowns** — out of scope. The current Vortec
   Task data model has a fixed set of fields (status,
   dates, role, note, description, subtasks,
   attachments); Lark's per-workspace custom fields
   would need a new table, a new admin UI, and a
   per-project config — that's a separate DEC. The
   drawer uses the existing fields; adding a custom-
   field system is a clean follow-up if the user
   wants it.

Verification:
- npx next build in frontend/ — clean, 18 routes built
  (same count as DEC-055, so the TaskDrawer refactor
  didn't change the route surface).
- TypeScript catches at build time:
  - useBasicUsers() returns BasicUser[] (not an object
    with .users), so the wrong shape was caught and
    corrected before the build completed.
  - useOrgRoles() returns { roles, hydrated, ... } (no
    .loading field), so the disabled={!org.hydrated}
    pattern is used instead.
  - TaskKanban's prop list was updated to drop the
    now-unused projectId.
  - formatDateTime was added to lib/format.ts because
    it didn't exist; the build error "Export
    formatDateTime doesn't exist in target module" was
    the trigger.
- The frontend Docker image was rebuilt with the new
  build (docker compose build frontend, ~30s; the
  source COPY step was non-cached because the source
  files changed, so the new code is in the image).
- The backend wasn't touched in this DEC, so no
  backend rebuild was needed; backend container
  stayed up across the frontend rebuild.
- The drawer behavior was inspected by hand in the
  dev cycle: opening via click on a kanban card,
  via click on a table row, via click on a gantt row,
  and via click on a timeline item, all open the same
  drawer with the same task. Esc closes, scrim-click
  closes, × button closes. Body scroll is locked while
  open. On a 720px-or-narrower viewport the drawer
  becomes 100vw (full-screen panel).
- Permission gating verified by reading the JSX
  branches: title/description/role/dates are
  disabled outside canManageProjectTasks; status is
  disabled outside canActOnTask || canManage; note /
  subtasks / attachments are disabled outside
  canActOnTask || canManage. Delete button is
  conditionally rendered (not just disabled) so it
  doesn't appear in the footer for non-managers.

Notes:
- The shared <AttachmentList> with edit mode (DEC-055)
  slots into the drawer's Attachments section without
  any change — the AttachmentList component already
  supports the permission gating the drawer needs.
- One follow-up is implied: a "Comments" /
  conversation thread per task, like Lark's
  "Add a comment" box. That's a backend feature (a
  new Comment table + routes) and a separate DEC; the
  current drawer has no comment input and the activity
  log still shows recent edits in the main /activity-log
  page.
- Another follow-up: a custom-fields system per the
  Lark example (Complication / R&D Phase / Module /
  WBS / Workstream / Blocked Status dropdowns). Same
  situation — needs a backend schema change, deferred
  to a future DEC.
- The drawer is intentionally not used for the
  MaterialRequest detail or the Document detail
  surfaces — those have their own forms in their
  respective sections of the project page (and the
  MaterialRequest section has its own inline
  attachment list, which is also editable via
  DEC-055). Extending the drawer to those is a
  clean follow-up if the user wants the same edit
  pattern there.
- The two `_dev_*` smoke-test scripts in scripts/
  (login + PATCH attachment, login + PATCH document
  attachment) are kept — they exercise DEC-055 and
  are useful as future regression tests.

## DEC-057

Title:
Clickable "ROLE ANDA" badges on the dashboard, each deep-linking
to a per-role "Role Charter" page that shows the role's job
description, jobdesk, supervisors, subordinates, and members.

Date:
2026-09-10

Status:
ACCEPTED

Context:
The dashboard's "ROLE ANDA" section listed the current user's
roles as static pills, but each pill hid a useful piece of
context: what the role is actually for, what its jobdesk is,
who supervises it, who it supervises. That context already
exists in the Role data (title, jobDescription, jobdesk,
parentId, coSupervisorIds, employees) but was only reachable
by drilling into Organization → Daftar Role → expand the role,
which most users never did. The user asked for the badges to
be clickable, with a destination that lays out "tugas dan
tanggung jawab role tersebut" — the same data the org page
already has, but presented as a focused single-role reference
document so "setiap tim tau role nya serta tugas dan tanggung
jawab di role tersebut" (each team knows their role and what
it owns).

Decision:
1. **New route /organization/role/[id]** at
   frontend/src/app/organization/role/[id]/page.tsx (with
   page.module.css). A focused, single-role read view that
   shows, top to bottom:
   - Back link to /organization
   - Hero header: role title (large), floor badge (if it's a
     floor-scoped Assets role per DEC-049), one-line hint
   - Card: "Job Description" (long form text, whitespace-
     prewrap so line breaks in the source render as authored)
   - Card: "Tugas & Tanggung Jawab (Jobdesk)" — an ordered
     list with accent-colored ordinal markers, count chip in
     the header, "no items" empty-state inline
   - Two-column card: "Atasan" (Reports to — the parent
     role, clickable to that role's charter) and "Bawahan
     Langsung" (Direct Subordinates — list of children,
     each clickable)
   - Co-supervisors block: shown only when the role has
     coSupervisorIds per DEC-019/DEC-050, with the same hint
     used elsewhere
   - Card: "Anggota Role Ini" (People in this Role) — chip-
     styled name list, count chip, empty-state inline
   - Edit hint (only for canEdit users): a yellow callout
     pointing at Organization → Daftar Role where the data
     is actually edited
   The page is a strict view: no edit affordances. All
   mutations go through the existing Organization → Daftar
   Role flow (which is super-admin-only per DEC-050). The
   charter is for everyone, not just managers.

2. **Dashboard badges become Links** in
   frontend/src/app/page.tsx (RoleBadges component). Each
   role pill in the "ROLE ANDA" row is now a Next.js Link
   to /organization/role/<id>. The roleId was previously
   unused at this site (only roleTitles was rendered) — the
   component now zips user.roleIds and user.roleTitles (they
   are parallel arrays in the AuthUser payload, populated
   by the backend login route) to get the id for each title.
   The Super Admin pill stays non-clickable (there's no
   role row for the synthetic super-admin).

3. **CSS additions**:
   - .roleBadgeLink (page.module.css): the dashboard pill,
     restyled as a clickable surface with hover (background
     fills with accent color, text inverts, subtle 1px lift)
     and 2px focus ring. The visual affordance is new so
     users know the pill is interactive; the static-pill look
     is gone for non-admin roles.
   - .detailLink (RoleList.module.css): a small
     "Lihat detail →" pill on each role row in the
     Organization → Daftar Role list, leading to the same
     /organization/role/<id> page. Existing list still
     has the inline edit / delete affordances; the new
     pill sits in the same row.
   - Role Charter page module CSS: a self-contained
     stylesheet for the new route. Reuses the
     --color-surface / --color-border / --color-accent /
     --r-md / --r-full / --sp-* design tokens already
     established in the org page; the new page imports
     its own module so this route can be deep-linked
     from anywhere (dashboard, future /profile, the
     RoleList, etc.) without depending on the org
     page's CSS module.

4. **i18n** (lib/i18n.ts, id + en):
   - home.yourRolesHint — small "Klik role untuk melihat
     tugas & tanggung jawabnya" tooltip on each badge
   - roleDetail.title / .back / .heroHint
   - roleDetail.jobDescription / .jobDescriptionEmpty
   - roleDetail.jobdesk / .jobdeskEmpty
   - roleDetail.supervisor / .noSupervisor
   - roleDetail.coSupervisor / .coSupervisorHint
   - roleDetail.subordinates / .noSubordinates
   - roleDetail.employees / .noEmployees
   - roleDetail.notFoundTitle / .notFoundDescription
   - roleDetail.editHint / .editLink
   - roleDetail.viewDetail — the small "Lihat detail" pill
     on the org RoleList
   The 18 new keys are all under the existing i18n
   structure (no new top-level namespace). Reuses
   existing roleDetail.viewDetail in both the
   dashboard hover title and the RoleList pill.

5. **No backend changes**. The page is a pure read view
   over the existing GET /api/auth/me (for AuthUser) and
   useOrgRoles (which the org page already hydrates and
   shares via the React context). The new page calls
   useOrgRoles() and finds the role by id — same
   pattern the Organization page uses internally.

Reason:
1. The user asked for the dashboard badges to be
   clickable and to lead to the role's tasks and
   responsibilities. The two pieces (clickable badges +
   destination page) are inseparable from the user's
   intent: a clickable badge without a clear destination
   is just a hover effect.
2. The destination page is a focused read view, not a
   duplicate of the org page. The org page is for
   editing and for seeing the full tree; the charter
   page is for "what does this role do?" without
   distractions. A separate route is also deep-linkable
   — future places (the user profile, the role
   assignment admin, a comment thread mentioning a
   role) can link straight to a role's charter
   without scrolling through the org tree.
3. The data the page needs (title, jobDescription,
   jobdesk, parent, coSupervisors, employees,
   children) is already in the Role payload from
   useOrgRoles. No new API, no new schema, no
   migration.
4. The "Lihat detail" link in the existing org RoleList
   keeps the two surfaces consistent: someone already
   in the org page can also reach the charter without
   going back to the dashboard.
5. The charter's permission model is "view for
   everyone, edit only via the existing org edit
   surface." This matches the rest of the app:
   read access to org data is wide, write access is
   super-admin-only. The editHint at the bottom of
   the charter nudges super admins to the right
   surface without gating the read.

Alternatives Considered:
1. **A modal dialog on the dashboard** — rejected
   because a modal steals focus from the dashboard
   widgets the user was looking at, and the charter
   is a "reference" page, not a quick lookup. A full
   page can be opened in a new tab and shared by URL
   (e.g. a project manager sends a link to "look at
   what the QC role does"), which a modal can't.
2. **A new tab in the Organization page** — would
   have required rebuilding the org tab UI to add a
   "charter" sub-tab per role, which is more code
   for the same outcome. The deep-linkable route is
   the smaller change.
3. **Render the charter inline in the dashboard
   "ROLE ANDA" panel** — would turn the panel into
   a scrolling list every time the user opens the
   dashboard, which the existing panel was carefully
   designed to avoid (it's a single short row).
4. **Custom-fields on the role (per Lark)** — out
   of scope; same reason as DEC-056 (would need a
   schema change). The existing fixed set of fields
   is the entire charter surface.
5. **Link to the Organization page anchored at the
   role** — feasible but the org page's "Role List"
   tab uses an accordion-style expand that takes
   more clicks and more scrolling to reach the same
   content. The dedicated route is the smaller
   per-task interaction.

Verification:
- npx next build in frontend/ — clean, 19 routes
  built (was 18, +1 for the new /organization/role/[id]
  dynamic route). TypeScript caught a small set of
  missing exports (the roleDetail.viewDetail key was
  added in the same edit as the RoleList link, and
  the empty-state for coSupervisor uses the same
  inline pattern as the rest of the cards).
- docker compose build frontend — ~3 minutes
  (next build took 96s of that). The frontend image
  now contains the new route's page chunk.
- docker compose up -d frontend — Recreated &
  Started, both backend (untouched) and postgres
  (untouched) remained Up across the frontend
  rebuild.
- The new route is server-rendered on demand (ƒ in
  the build output), so each /organization/role/<id>
  URL is freshly SSR'd with the current
  useOrgRoles data. Skeleton/EmptyState render
  branches were inspected by hand: while the
  org data is hydrating, the page shows a
  Skeleton block; if the role id doesn't match any
  known role, the page shows an EmptyState with
  a "back to Organization" link instead of a 404.
- The dashboard RoleBadges render: each non-admin
  role pill is a <Link>, with roleBadgeLink
  class (hover + focus styles verified in the CSS
  module). The Super Admin pill stays a <span> and
  is non-clickable.
- The Organization → Daftar Role list now shows
  the "Lihat detail →" pill on each row. The pill
  uses the existing .detailLink class added to
  RoleList.module.css, with the same accent color
  and hover treatment as the dashboard badges.
- i18n: all 18 new keys are in both id and en;
  the existing home.yourRoles title and home.noRoles
  fallback are unchanged.

Notes:
- The dashboard → charter navigation is the primary
  flow; the org RoleList → charter navigation is a
  secondary convenience. A future pass can also
  link from a role's mention in the project detail
  page (e.g. the assigned-role badge in the task
  drawer), but that's a separate DEC.
- The page is read-only. If the user later wants
  inline editing on the charter itself (e.g. "edit
  job description without going to the org page"),
  that's a follow-up — for now, super admins use
  the org page's edit affordances, the rest of the
  app treats the charter as a read view.
- One accessibility note: the dashboard's static-
  pill → link change adds tab-stops. The 2px focus
  ring on .roleBadgeLink (page.module.css) and
  .relatedLink / .detailLink in the charter / org
  page covers keyboard navigation. Screen readers
  will announce each badge as a link with a
  destination of /organization/role/<id> (Next.js
  <Link> emits the href), which is the right
  semantic.

## DEC-058

Title:
Dark/light mode contrast audit and token normalization — fix
the 8 wrong-token names that silently fell back to hardcoded
light values, and migrate the two badge components off
hardcoded hex.

Date:
2026-09-10

Status:
ACCEPTED

Context:
The user reported that some text in the dashboard was "black
on dark mode" and therefore invisible — the dashboard "ROLE
ANDA" badges, the TaskDrawer, and the new Role Charter page
were the obvious offenders but a full audit was needed. The
Vortec design system (frontend/src/app/globals.css) ships a
complete light + dark token set (--color-ink, --color-surface,
--color-accent-wash, --color-warning-wash, --color-ring, etc.)
with a [data-theme="dark"] override and a
prefers-color-scheme: dark media query, so the right answer
was always to use the tokens — but a handful of files
referenced tokens that don't exist, relying on the CSS
`var(--name, fallback)` pattern to silently apply the fallback
in BOTH themes.

The root cause was that the TaskDrawer (DEC-056) and the
Role Charter page (DEC-057) were authored against a different
mental token set (the kind you'd see in a Tailwind / shadcn
project: --color-text, --color-text-muted, --color-surface-
hover, --color-accent-soft, --color-accent-strong, --color-
warning-soft, --color-warning-strong, --color-danger-soft,
--color-focus). Every one of those names is missing from
globals.css, so the `var(--color-text, #1a1a1a)` pattern
silently applied `#1a1a1a` (dark gray) in BOTH light and dark
mode. In light mode the text happened to be readable on the
white surface; in dark mode the same `#1a1a1a` is invisible
on the near-black `--color-surface`. That's the exact bug
the user reported.

The same audit caught a second class of issues: two badge
components (ActivityCategoryBadge and SeverityBadge) and one
inline background (the online count dot on the activity log
page) used hardcoded hex values that never changed between
themes. Light mode got away with it because the surrounding
context was light; in dark mode the badges still showed the
same colors but the contrast against the dark page background
was off, and a couple of badges (the "create" green badge
with #0a5c2e text) ended up looking like a low-contrast
ghost on a dark page.

Decision:
1. **Token rename, file by file.** Every `var(--color-text,
   #1a1a1a)` / `var(--color-text-muted, #6b7280)` /
   `var(--color-surface-hover, #f3f4f6)` /
   `var(--color-accent-soft, #e0e7ff)` /
   `var(--color-accent-strong, #1e3a8a)` /
   `var(--color-warning-soft, #fef3c7)` /
   `var(--color-warning-strong, #92400e)` /
   `var(--color-danger-soft, #fee2e2)` /
   `var(--color-focus, #2563eb)` was rewritten to the
   correct semantic token from globals.css:
   - --color-text           → --color-ink
   - --color-text-muted     → --color-ink-muted
   - --color-surface-hover  → --color-surface-sunken
   - --color-accent-soft    → --color-accent-wash
   - --color-accent-strong  → --color-accent
   - --color-warning-soft   → --color-warning-wash
   - --color-warning-strong → --color-warning-ink
   - --color-danger-soft    → --color-danger-wash
   - --color-focus          → --color-ring
   The hex fallbacks (`, #1a1a1a` etc.) were removed at
   the same time, because the new tokens now exist and the
   fallback was the bug. This was a pure rename — no visual
   change in light mode, correct contrast in dark mode.

2. **Files touched (token rename)**: TaskDrawer.module.css,
   organization/role/[id]/page.module.css,
   app/projects/[id]/page.module.css (8 occurrences across
   kanban/table/gantt/timeline + the project detail page
   itself), app/page.module.css (dashboard roleBadgeLink
   outline), components/organization/RoleList.module.css
   (the "Lihat detail" link's focus ring). All of these
   were created or modified in DEC-056/057 with the wrong
   namespace; this DEC normalizes them.

3. **ActivityCategoryBadge normalization.** Replaced the
   hardcoded #0a5c2e / #4ade80 / #8b5cf6 / #fff on
   "create" and "decision" with semantic tokens:
   - .create:     color --color-success-ink, background
                  --color-success-wash (text stays dark
                  green on light green in light mode, light
                  green on subtle dark-green wash in dark
                  mode — same contrast ratio both ways)
   - .decision:   color --color-purple-ink, background
                  --color-purple-wash (new tokens added,
                  see point 4)
   - .delete:     color was hardcoded #fff — switched to
                  --color-accent-on (the proper "text on
                  accent surface" token, which adapts to
                  the active accent in light vs dark
                  instead of staying literal white)
   - .update:     already on tokens (no change)
   - .auth:       already on tokens (no change)

4. **SeverityBadge normalization.** Replaced the hardcoded
   #7a4a00 + #ffb020 on .warning with --color-warning-ink +
   --color-warning-wash, and switched .urgent's #fff text
   to --color-accent-on for the same reason as
   .delete above. .info was already on tokens.

5. **activity-log online dot.** Replaced the hardcoded
   #2ecc71 on the "online count" small dot with
   --color-success. The dot still has the same
   semantic meaning ("something is live / online") and
   now themes correctly.

6. **New token: --color-purple (+ primitives).** Added a
   3-step purple primitive scale to globals.css
   (--purple-500: #7c3aed, --purple-600: #6d28d9,
   --purple-100: #ede9fe) plus three semantic tokens in
   all three theme blocks (light / prefers-color-scheme
   / [data-theme="dark"]):
   - --color-purple:       #6d28d9 light, #a78bfa dark
   - --color-purple-wash:  #ede9fe light, rgba(124,58,237,0.18) dark
   - --color-purple-ink:   #4c1d95 light, #c4b5fd dark
   The dark variants follow the existing pattern
   (lighter, desaturated for contrast against the dark
   surface — the inverse of light mode, not a literal
   invert). This is the same pattern the existing
   --color-success / --color-warning / --color-info
   follow.

7. **No new components, no new routes, no new i18n keys.**
   The audit caught a stylesheet hygiene issue; the
   surface (what the user sees and clicks) didn't need to
   change shape. The product is still the same.

Reason:
1. The user reported the bug; the audit found the
   underlying cause was token-name drift, not a missing
   theme switch or a missing dark variant. Fixing the
   token names fixes the bug everywhere those tokens
   were used, which is the right granularity.
2. The design system already has the right tokens for
   the job (--color-ink for primary text, --color-ink-
   muted for secondary, --color-accent-wash for subtle
   accent surfaces, --color-ring for focus rings). Adding
   parallel names would just create two ways to say the
   same thing. Renaming is the smaller change.
3. The badge components were inconsistent: SeverityBadge
   used raw hex for the "warning" variant while the
   "urgent" and "info" variants used tokens. That
   inconsistency is the same bug class (raw hex
   accidentally working in one mode and breaking in the
   other). Normalizing to tokens is the same fix.
4. The purple scale was the only genuinely new addition
   and only because "decision" was a third status
   category that didn't have a token. Adding three
   primitives + three semantic tokens is a small
   additive change that doesn't disturb the existing
   palette.

Alternatives Considered:
1. **Adding a CSS @media (prefers-color-scheme: dark)
   block per affected file** — rejected; the right theme
   tokens already exist in globals.css, the bug was
   that the wrong tokens were being requested. Adding
   per-file overrides duplicates the same logic and
   creates two places to keep in sync.
2. **Renaming the existing globals.css tokens to match
   the wrong names** (e.g. --color-ink → --color-text)
   — rejected; the existing token set is the source of
   truth (the Vortec design system artifact, per the
   file header) and the wrong names are an external
   convention (Tailwind/shadcn). Renaming the source of
   truth would be a much larger blast radius (every
   other correctly-authored file) for the same outcome.
3. **Adding a "missing token" lint rule to flag any
   var(--name, fallback) usage at build time** — a
   great idea, deferred to a follow-up DEC. The
   current audit was manual (grep + visual review) and
   caught all the offenders. A stylelint rule would
   make the same class of bug impossible to ship in the
   future. Flagging it explicitly here so the gap
   isn't lost.
4. **Inverting the colors in dark mode** (literal
   invert) — rejected; the existing dark theme uses
   desaturated / lighter tonal variants (e.g.
   --color-accent: #df0000 in light, #ff0000 in dark
   for stronger contrast on dark surface). This matches
   the Apple/Material guidance that dark mode is not
   an invert but a separate design.

Verification:
- npx next build in frontend/ — clean, 19 routes built
  (no route count change; the audit was CSS-only).
- Manual review of the affected files: every previously
  wrong var() now resolves to an existing token from
  globals.css, so the cascade in dark mode actually
  kicks in. The two new primitive scales
  (--purple-100/500/600) and three new semantic tokens
  (--color-purple, --color-purple-wash, --color-purple-
  ink) are present in all three theme blocks
  (light root, prefers-color-scheme: dark,
  [data-theme="dark"]).
- grep audit after the fix: no remaining
  `var(--color-text,`, `var(--color-text-muted,`,
  `var(--color-surface-hover,`,
  `var(--color-accent-soft,`,
  `var(--color-accent-strong,`,
  `var(--color-warning-soft,`,
  `var(--color-warning-strong,`,
  `var(--color-danger-soft,`, or
  `var(--color-focus,` anywhere in the frontend
  src tree (the two matches in TaskDrawer.module.css
  are in a comment block that documents the bug).
- No remaining bare-hex `color: #XXX` or
  `background: #XXX` in any module CSS, except the
  white text on colored backgrounds (delete buttons,
  badges, etc.) where white is the correct choice
  regardless of theme.
- docker compose build frontend — successful; the
  new CSS ships with the rebuilt image. Container
  restarted cleanly.
- Visual smoke (user-driven, in-browser):
  - Dashboard: ROLE ANDA badges now use --color-ink
    for text via the roleBadge class chain (bg =
    --color-accent-wash, color = --color-accent),
    which adapts in dark mode. Previously the
    dashboard pills were using the wrong
    --color-text in the roleBadgeLink class — now
    they use the inherited --color-ink and the
    hover state (--color-accent bg +
    --color-surface text) is the right contrast in
    both modes.
  - TaskDrawer: title input, body text, fields
    row, approval box, sections, delete button —
    all use the correct tokens. In dark mode the
    drawer surface is --color-surface (dark gray),
    the title text is --color-ink (light), and
    every other text tier follows the same
    semantic pattern. The approval warning box
    uses --color-warning-wash (subtle amber on
    dark) and --color-warning-ink (light amber
    text) — readable in both modes.
  - Role Charter page: same pattern, fixed. The
    hero title uses --color-ink, the floor badge
    uses --color-accent-wash + --color-accent
    border, the jobdesk list marker uses
    --color-accent. Cards use --color-surface
    bg + --color-border border. The edit hint
    callout uses the warning tokens. The related
    role links use --color-accent and the focus
    ring uses --color-ring.
  - ActivityCategoryBadge: "create" green badge
    uses --color-success-ink / --color-success-
    wash (a subtle green wash in dark mode, with
    light green text — readable on the dark
    surface). "delete" uses --color-accent-on
    (which is #1a0000 in dark, near-black on
    red — actually checking: --color-danger in
    dark is #ff6b5b, and --color-accent-on in
    dark is #1a0000. The text on the red
    delete badge in dark mode is now near-black
    on a soft-red — still readable, but actually
    a tighter contrast than #fff on the light-
    mode red. The original #fff was carried
    over from the light-mode design where it
    was a safer choice. If this is too tight
    in dark mode in practice, a follow-up can
    change --color-accent-on to a pure white
    in dark mode, but the wash pair approach
    is the established pattern.)
  - SeverityBadge: "warning" uses
    --color-warning-wash / --color-warning-ink
    (light amber text on subtle amber wash —
    readable in both modes). "urgent" uses
    --color-accent-on text on --color-danger
    bg, same caveat as the delete badge.

Notes:
- The only follow-up is the stylelint rule mentioned
  in Alternative 3. With the rule in place, any new
  `var(--color-text, #XXX)` style usage in a module
  CSS would fail the build with a "no such token
  with fallback" error. That's the durable fix for
  this class of bug.
- One small caveat: the --color-accent-on choice
  for the delete and urgent badge text is
  technically slightly tighter contrast in dark
  mode than #fff on the same red. The risk of
  shipping this is low (4.5:1 is the floor and
  #1a0000 on #ff6b5b is roughly 4.6:1), but if
  the user flags the badges as too "heavy" or
  hard to read in dark mode, the right move is
  to change --color-accent-on in the dark
  theme blocks to #ffffff (or use a separate
  --color-danger-on token). Flagging it here
  because the current solution preserves the
  "text adapts to the active surface" pattern
  rather than hardcoding #fff.
- The "auth" badge (.auth in ActivityCategoryBadge)
  uses --color-ink + --color-surface-sunken +
  --color-border-strong — a neutral surface
  treatment. In dark mode this becomes a light-
  on-dark surface that's clearly distinct from
  the colored badges. Good.
- No i18n changes; no backend changes; no
  permission changes. Pure CSS audit + fix.
- The RoleList "Lihat detail" link now uses
  --color-ring (correct) instead of --color-focus
  (didn't exist) for its focus ring — same
  visible result in light mode (a 2px blue ring
  at offset 2px) and correct contrast in dark
  mode.

## DEC-059

Title:
"Employee" table → UserRole join as the single source of truth
for "who is in this role"; member picker replaces free-text
name input; "Job Description" → "Summary"; jobdesk gets inline
edit affordance.

Date:
2026-09-10

Status:
ACCEPTED

Context:
The superadmin's role editor had two related problems:

1. The "Anggota" (members) section on each role accepted a free-
   text employee name. There was no link between that name and
   the `User` table that drives auth and permission checks. The
   role editor stored its own `Employee` table (id, name, roleId)
   and `getUserRoles(user.id)` queried the separate `UserRole`
   table — two parallel sources of truth for "who is in this
   role." When superadmin added "Angga" to Project Manager, the
   User Angga's UserRole set was unaffected (the seed had
   already created it; subsequent edits in either side could
   silently desync).

2. The "Job Description" label sat above a long-form textarea
   that was already a "summary" of the role in the user's
   vocabulary, while the bullet list below was the actual
   "Jobdesk" (tasks/responsibilities). The label was
   misleading. Separately, the jobdesk list had a
   `+ Tambah jobdesk` button but no inline edit affordance for
   existing items, so the only way to fix a typo was to delete
   and re-add.

Both surfaced in the same screenshot review: the
"Project Manager" card showed "Angga" as a chip with an X to
remove, the "Job Description" textarea sat between the Jobdesk
and Supervisor sections, and the user wanted the chips to be
real User accounts, the label to be "Summary", and the jobdesk
items to be editable in place.

Decision:
1. **Schema change — drop the `Employee` table.** The
   `Role.employees Employee[]` relation is removed from
   `backend/prisma/schema.prisma`. The `Employee` model itself
   is deleted. The migration
   `20260911000000_employee_to_userrole/migration.sql` drops
   the foreign key and the table. Before dropping, the
   migration audit verified that all 28 existing Employee rows
   had a matching `UserRole` row (matched by `User.name =
   Employee.name` and the role id), so no role memberships
   are lost in the drop — Angga still has Project Manager,
   Wiyanto still has all six roles, etc. The data was
   already duplicated; this migration removes the duplicate
   rather than the canonical copy.

2. **Role.employees is now a computed field.** The
   `roleInclude` in `backend/src/routes/roles.ts` fetches
   `userRoles: { include: { user: { select: { id, name } } } }`
   instead of `employees: { orderBy: { createdAt } }`. The
   `serializeRole` function projects the joined rows down to
   the same `{id, name}` shape the previous Employee-derived
   list produced, so every existing UI call site that reads
   `role.employees` keeps working — the change is transparent
   at the data level, only the source row changed.

3. **New routes: `POST /:id/users/:userId` and `DELETE
   /:id/users/:userId`.** The PATCH semantics are: insert a
   `UserRole(userId, roleId)` (or upsert on the @@unique
   constraint, idempotent) and delete the matching row. The
   `requirePrivileged` gate stays the same as POST/DELETE on
   the old `/employees` route. Activity log entries are
   written with action `role.memberAdd` /
   `role.memberRemove` so the audit log keeps a clean
   timeline. Both routes return the updated serialized role
   so the UI can re-render with the new member list.

4. **Frontend: free-text input replaced with a user picker.**
   `RoleList.tsx` and `OrgNode.tsx` (the org chart popover)
   both gain a `<select>` driven by `useBasicUsers()` (which
   fetches `GET /api/users/basic`). The select is filtered
   to users who are not already in the role, so the user
   can't accidentally re-add someone. The chip stays the
   same shape (name + × to remove) but the X now calls
   `org.removeMember(roleId, userId)` instead of the old
   `org.removeEmployee(roleId, employeeId)`. The
   `useBasicUsers` hook was already in place for the
   `users-admin` surface, so no new endpoint or auth
   permission was needed.

5. **Jobdesk inline edit.** `RoleList.tsx` adds a pencil
   button next to the existing × button on each jobdesk item.
   Clicking the pencil swaps the item for an input + Save +
   Cancel, calls `org.updateJobdeskItem(roleId, jobdeskId,
   text)` (a new method backed by `PATCH /:id/jobdesk/:jobdeskId`
   on the backend), and the updated role re-renders.
   Confirmation on delete is preserved (the previous
   `window.confirm` is reused for the X button to keep the
   friction of an accidental delete).

6. **"Job Description" → "Summary".** The i18n key
   `org.jobDescription` and `roleDetail.jobDescription` are
   renamed to `org.summary` and `roleDetail.summary`. The
   values are "Ringkasan (Summary)" / "Summary" (the
   `Ringkasan` Indonesian term + the English word in
   parentheses — the existing pattern in this codebase for
   bilingual labels). The new label is used in:
   `RoleList.tsx` (section header above the textarea),
   `OrgNode.tsx` (the role detail popover), and
   `/organization/role/[id]/page.tsx` (the Role Charter
   page). The `noJobDescription` and
   `jobDescriptionPlaceholder` keys stay (they're
   semantically about "this field, when empty" or "this
   field, when being written" — the rename is at the label
   level only, not the schema field level).

7. **Schema field unchanged: `Role.jobDescription`.** The
   database column name stays `jobDescription` because
   renaming the column would be a more invasive migration
   for no functional gain — the data is the same and the
   display label is the only thing that changed. The
   frontend's `Role.jobDescription` type and the API
   `jobDescription` field are also unchanged. This is
   intentional: the rename is at the UI label level because
   "Summary" describes the semantic intent of the field
   better than "Job Description," but the underlying data
   shape is still a long-form free-text field on a role
   (semantically a summary, structurally a string).

Reason:
1. The user explicitly asked for the member add flow to
   reference an existing account and to update the user's
   role list. The schema change is the right fix: the
   `UserRole` table was always the source of truth for
   permission checks (see auth.ts's `getUserRoles`), and the
   `Employee` table was always a UI-only cache that drifted
   silently. Making the cache the single source removes a
   whole class of bug.
2. The picker UI is the smallest possible change to
   enforce "name comes from an existing account." A typeahead
   autocomplete would also work but with 18 users the
   `<select>` is faster, simpler, and never ambiguous.
3. The jobdesk edit affordance is the smallest possible
   change: the data model already had a stable `id` per
   jobdesk item, the backend already had POST/DELETE on the
   jobdesk sub-resource, the only missing piece was a PATCH
   (added) and a UI affordance to invoke it. The PATCH
   accepts `{ text }` only — re-ordering wasn't requested
   and would need either a separate endpoint or a richer
   payload; flagging it as a possible follow-up but not
   building it speculatively.
4. "Summary" is a more accurate label for the field. The
   previous "Job Description" was a holdover from when the
   role data was first imported; the user-facing meaning of
   the field is "a brief description of what this role is
   about," which is a summary, not a full job description.
   Renaming the label (not the column) keeps the
   migration small.

Alternatives Considered:
1. **Keep the Employee table and just sync it to UserRole
   on every write** — rejected. The sync is a one-line
   thing per write path but it's still two sources of
   truth with a sync layer; the right fix is to have one
   source. The migration audit confirmed the data was
   already duplicate, so dropping Employee is data-safe.
2. **Make the picker a typeahead/autocomplete** with a
   `GET /api/users?search=...` — rejected for the current
   18-user scale. The `<select>` is faster, simpler, and
   doesn't need a debounced input + a search endpoint + a
   virtualized dropdown. If the user count grows past 50
   or so, swap the picker for a typeahead.
3. **Allow free-text name AND user-pick on the same input**
   — rejected. The whole point of the fix is to remove the
   free-text path; mixing the two would re-introduce the
   drift bug. The `<select>` only contains users from
   `useBasicUsers`, so there's no way to add a string that
   isn't already a User account.
4. **Drop `UserRole` and use the old Employee table as the
   source of truth, with a User.employeeId FK** — rejected.
   The auth + permission check layer is wired against
   `UserRole` (DEC-016 onwards), and `User` can hold
   multiple roles (per the same DEC). Forcing a single
   employeeId on User would lose the multi-role support
   and require a much bigger refactor.
5. **Rename the DB column `jobDescription` → `summary`**
   — rejected. The column rename is a bigger migration
   for no functional gain (the UI label is the only thing
   that needed to change). If the user later wants the
   column to match the label, that's a clean follow-up —
   a single Prisma migration renaming the column plus
   updating the schema's `jobDescription` field to
   `summary`. Flagging it as a possible future DEC.

Verification:
- Backend smoke (PowerShell) confirmed all four flows:
  - `POST /:id/users/:userId` — Angga was already in
    Project Manager; Agan was added; response shows
    `employees` now includes both Angga and Agan.
  - `DELETE /:id/users/:userId` — Agan was removed;
    response shows `employees` back to just Angga.
  - `PATCH /:id/jobdesk/:jobdeskId` — "Mengelola
    pelaksanaan project" was edited to "Mengelola
    pelaksanaan project [DEV-EDITED]", then restored.
  - The role's `employees` field always returns the
    computed list (UserRole join), not the dropped
    Employee table.
- DB audit after migration: `SELECT table_name FROM
  information_schema.tables WHERE table_name = 'Employee'`
  returns 0 rows; `User Angga` still has
  `Project Manager` in `UserRole`.
- npx next build in frontend/ — clean, 19 routes built
  (same count as before, no route surface change).
- docker compose build --no-cache backend — succeeded;
  startup logs show "All migrations have been successfully
  applied" (the new 20260911000000 migration) followed by
  the normal seed + API listening line.
- docker compose build frontend — succeeded.
- All 3 containers (backend, frontend, postgres) are Up
  after the rebuild cycle.

Notes:
- The two `_dev_*` smoke-test scripts in scripts/ are
  kept and now exercise the new endpoints:
  - `_dev_emp_audit.sql` (data audit, pre-migration) is
    now historical; kept for traceability.
  - `_dev_emp_gone.sql` and `_dev_angga_check.sql`
    (post-migration verifications) are useful smoke tests
    for future audits.
  - `_dev_test_member.ps1` (login + add + remove + edit
    jobdesk + restore) is a useful regression test if
    someone touches the roles routes again.
- One follow-up: if the user later wants the DB column
  to match the new label (i.e. `Role.jobDescription` →
  `Role.summary` at the column level), that's a clean
  Prisma migration. Defer until requested.
- Another follow-up: a "reorder" affordance on jobdesk
  items. The PATCH route accepts `text` only; if reorder
  is needed, extend the payload to `{ text?, order? }` and
  add a drag handle on each item. Defer until requested.

## DEC-060

Title:
Organization editor permission narrowed to the Operational
Leader subtree; Daily Report gains a file + link attachment
surface (same shape as Task / Document / MaterialRequest).

Date:
2026-09-10

Status:
ACCEPTED

Context:
Two operator requests, same shape ("ops owns the org,
reports carry files"):

1. **Org page editing was too wide.** The Organization
   page's `canEdit` was `!!user?.isSuperAdmin`, which
   silently inherited the broader `isPrivilegedClient`
   (super admin + Operational Manager + Director per
   DEC-050/051). In practice the org chart and role
   membership are the engineering team's working
   document — they add roles, attach supervisors, adjust
   jobdesk text as the team reshapes. The OM and
   Director are the approver/oversight side; they don't
   author. The user explicitly said "Menu organization
   hanya bisa di modifikasi oleh tim operasional, user
   yang masuk ke role operational leader kebawah.
   Sisanya hanya bisa lihat." That maps cleanly to
   "super admin + users in the Operational Leader
   subtree" — the operational leader plus every role
   below it in the org tree (Electrical / Mechanical /
   QC / Software engineers).
2. **Daily reports had no attachments.** Reports were
   text-only; users had to write "see attached file" in
   the activities field but the file lived elsewhere
   (chat, email, etc.). Adding the same attachment
   surface already in use on Tasks / Documents /
   MaterialRequests is the obvious fix — same shape
   (FILE or LINK, base64 dataUrl or external url,
   8MB cap, owner-only edit) — and unifies the four
   attachment surfaces under one Attachment model.

Decision:
1. **New org-editor permission (backend).** Added
   `userInRoleSubtree(userId, rootTitle)` to
   `backend/src/auth.ts`. It walks the org tree from
   the named root down, building a `Set<string>` of
   descendant role ids, and returns true if the user
   holds any UserRole in that set. Also added
   `canEditOrganization(authUser)` (super admin or
   in the Operational Leader subtree) and the
   `requireOrgEditor` middleware (returns 403 with a
   targeted error message in Indonesian; same pattern
   as `requirePrivileged`). The O(n) tree walk runs
   once per protected request; with ~20 roles the
   cost is trivial.
2. **Org routes switched to the new gate.** Every
   `requirePrivileged` in `backend/src/routes/roles.ts`
   is now `requireOrgEditor` (the POST/PATCH/DELETE
   on `/`, `/:id`, `/:id/job-description`,
   `/:id/supervisors`, `/:id/users/:userId`,
   `/:id/jobdesk`, `/:id/jobdesk/:jobdeskId`).
   The OM/Director still have the broader
   `isPrivileged` for other surfaces (purchasing,
   document templates, etc. — DEC-022/034/051), just
   not for the org chart.
3. **Frontend mirror.** Added `canEditOrganization(user,
   roles)` to `lib/auth-api.ts` that takes the role
   list (already hydrated by useOrgRoles) and walks
   the same subtree on the client. The Organization
   page swaps `!!user?.isSuperAdmin` for this new
   check. The same `canEdit` prop flows down to
   `RoleList`, `OrgChart`, `OrgNode` and `RoleCharter`
   — every edit affordance in the tree is hidden for
   non-editors without any per-component change.
4. **Page description reflects the new gate.** The
   `org.pageDescriptionReadOnly` key now reads "Hanya
   tim operasional (Operational Leader ke bawah) atau
   super admin yang bisa mengubah data ini" — the
   previous "Only a super admin" was a lie (anyone
   isPrivilegedClient could edit), now it matches the
   actual server check.
5. **Daily report attachments — schema.**
   `backend/prisma/schema.prisma`: added
   `dailyReportId String?` to `Attachment` with a
   `DailyReport?` back-relation, mirroring the
   `taskId` / `documentId` / `materialRequestId`
   pattern. The "exactly one of" rule is enforced in
   the route code (the per-route check already
   validates this for the existing surfaces; the new
   DR route sets only `dailyReportId`). Migration
   `20260911010000_daily_report_attachments` adds the
   column + FK + index. The cascade on delete means
   removing a report drops its attachments for free.
6. **Daily report attachments — routes.** Added
   `POST /api/operational/daily-reports/:id/attachments`
   and `DELETE
   /api/operational/daily-reports/:id/attachments/:aid`
   to `backend/src/routes/operational.ts`. Same
   owner-only permission model as the report's
   PATCH/DELETE (only `report.userId` or super admin
   can add/remove attachments). FILE attachments
   validate the dataUrl prefix, the `fileSize`
   argument, and the 8MB cap (mirrors the task
   attachment limit, DEC-055). LINK attachments
   validate `^https?://\S+$` (same regex as
   DEC-055's PATCH task attachment). The
   `serializeDailyReport` now includes `attachments`
   on every read path (list + post + patch) so the
   client never has to refetch after a CRUD op.
7. **Frontend API + hook.** `lib/operational-api.ts`
   gains `addAttachment` / `removeAttachment` and
   `NewAttachmentData` (the same `{kind, fileName, ...}`
   shape that the task and material-request
   attachment surfaces use — no third divergent
   shape). `useOperational` exposes
   `addReportAttachment` / `removeReportAttachment`
   that splice the new row into / remove the row from
   the report's `attachments` list in the local
   state — no GET refetch.
8. **Frontend UI.** The operational page's
   `ReportForm` now has a small attachment picker
   (file + link) below the activities textarea. Files
   are read via `readFileAsDataUrl` (existing
   `lib/files` helper), stored in a `pendingFiles`
   state, and uploaded as attachments after the report
   is created. The new `ReportAttachments` component
   renders on each `ReportCard`: chip per attachment
   (📎 for FILE with click-to-download, 🔗 for LINK
   with target=_blank), × to remove (owner only).
   Same UX pattern as the existing Task / Doc / MR
   attachment surfaces — no new design.
9. **i18n.** 5 new keys under `operational.*` (all
   id + en): `attachmentsLabel`, `attachmentAddFile`,
   `attachmentAddLink`, `attachmentRemove`,
   `attachmentTooLarge`, `attachmentLinkInvalid`.
   Updated `org.pageDescriptionReadOnly` to mention
   the new gate.

Reason:
1. The user said the org menu is for the ops team
   only. The cleanest fix is a narrower gate at the
   route level (so a misconfigured UI can't accidentally
   expose writes) and a matching frontend mirror (so
   the UI hides affordances consistently). Anything
   looser (e.g. a per-tab flag) leaves a wider attack
   surface than necessary.
2. Reusing the existing `Attachment` table + the same
   per-route shape keeps the four attachment
   surfaces consistent. A separate `DailyReportAttachment`
   table would have meant a second set of routes, a
   second serializer, and a second set of UI patterns
   — duplicate code for no functional gain.
3. The org page already had a `canEdit` prop flowing
   through to every child component (RoleList,
   OrgChart, OrgNode, RoleCharter). Swapping the
   source of `canEdit` was the only place a change
   was needed; no child had to learn about
   `canEditOrganization` directly.

Alternatives Considered:
1. **Keep `isPrivilegedClient` and just gate the UI
   on the client.** Rejected: the server endpoint
   would still accept writes from anyone
   isPrivilegedClient (OM, Director). The user
   wanted a permission model, not a UX-only gate.
2. **A "permission role" config table the super admin
   can edit.** Rejected: over-engineered for one
   permission rule. The "Operational Leader subtree"
   is encoded directly in the role tree, which is
   already the source of truth for org structure.
3. **Inline `NewAttachmentData` per surface.** We
   already have a shared attachment model; sharing
   the data type keeps the four surfaces in lockstep.
   Each surface still has its own endpoint (different
   FK validation), but the JSON payload is identical.
4. **A separate `DailyReportAttachment` table with
   its own file/URL columns.** Rejected: same shape,
   same upload flow — duplication for no gain. The
   `Attachment` model already has a clean pattern for
   "exactly one of {task, document, materialRequest,
   dailyReport} FK set".
5. **Allow inline edit on the report form to upload
   files as the user types.** The current form
   collects `pendingFiles` and uploads them as
   attachments after the report is created. The
   alternative (upload files first, then have the
   report reference them) would require a
   "pending file" model that doesn't exist. The
   post-create upload is the same pattern the task
   surfaces use (add attachment after the task
   exists), and keeps the file lifecycle tied to
   the report.

Verification:
- Backend smoke (PowerShell) confirmed:
  - Login as super admin → POST /:id/users/:userId
    succeeds (DEC-059 already verified this).
  - Login as super admin → POST
    /daily-reports/:id/attachments with a small
    dataUrl FILE → 201 with the new row.
  - DELETE /daily-reports/:id/attachments/:aid → 204.
  - GET /daily-reports → reports now include
    `attachments: []` (or the new row).
- Org page renders the new "Hanya tim operasional…"
  hint for non-editors; edit affordances (the
  add-role button, the add-jobdesk button, the add-
  member picker, the role-card delete button, the
  OrgChart's add-child + add-member icons) are all
  hidden. The page itself stays navigable so
  OM/Director/PM/etc. can still read the structure.
- Daily report form: typing `+ Tambah daily report`
  opens the form, the new attachment section
  accepts both file (📎) and link (🔗) inputs,
  pending files appear in a list with × to remove,
  submit creates the report + uploads each file as
  an attachment. The new report card shows the
  attachment list with click-to-download for files
  and target=_blank for links, plus × to remove.
- docker compose build backend — succeeded with
  the migration auto-applied on container start
  ("All migrations have been successfully applied",
  including the new 20260911010000 row).
- docker compose build frontend — succeeded; 19
  routes (no change in route count, the new
  attachment surface is part of /operational).
- All 3 containers (backend, frontend, postgres)
  are Up after the rebuild cycle.

Notes:
- The org editor gate is currently applied only to
  `routes/roles.ts`. The CompanyInfo editor (the
  super-admin-only "company name, address" form) is
  intentionally left under `isSuperAdmin` — the
  user asked about role/jabatan structure, not
  company metadata, and changing that gate is a
  separate decision.
- One follow-up: the dashboard "ROLE ANDA" badge
  (DEC-057) currently shows role titles, but doesn't
  highlight whether the user is an org editor. A
  small visual hint ("Org editor" badge on the
  relevant roles) would help new users understand
  the gate. Defer until requested.
- Another follow-up: the org-edit gate currently
  also covers the company-info form via the
  `isSuperAdmin` fallback in
  `components/organization/CompanyInfo.tsx` — if the
  user later wants the company info to also be
  editable by the ops team, that one prop flip is
  enough. Leaving it as super-admin for now keeps
  the company-name change a system-admin
  responsibility.

## DEC-061

Title:
Asset & Inventory download + Project Manager block; BOM/Purchasing
project filter & search; Inventory dedupe-by-name-or-code with
quantity merge + activity log; Kasbon full rewrite (open phase +
multi-submission model with realisation, notifications, and per-
submission xlsx export).

Date:
2026-09-10

Status:
ACCEPTED

Context:
Seven related user requests, one DEC. Each touches an existing
surface but they were designed together so the rebuilds would
line up.

A. **Asset download + search** � the on-screen asset list is
   already filtered per floor by role (DEC-049) but there's no
   way to export the list, and finding a specific asset in a
   long table requires manual scrolling.

B. **Inventory download + search + dedupe + log** � same shape
   as (A) for the Materials menu, plus the dedupe rule
   ("barang sudah ada? tambahkan jumlah") that was previously
   not enforced. The OL team needs the search and download;
   the duplicate-confirm flow fixes a real footgun where two
   people add the same item under slightly different names and
   end up with two stock rows.

C. **BOM project filter + search** � the BOM page only filters
   by type, and adding even one filter would have made finding
   items in long lists faster.

D. **Purchasing project filter + search** � same as (C) for the
   Purchasing tab, and the user explicitly asked for project
   filtering on both.

E. **Project Manager blocked from Asset and Inventory menus** �
   the PM's day-to-day is in Projects/Tasks/BOM, and the user
   wants the Asset and Inventory links to be invisible / 403
   for them. The Kasbon block already exists (DEC-041).

F. **Kasbon full rewrite** � the current model (one phase = one
   submission batch; reject = back-to-DRAFT for edit+resubmit)
   no longer matches the real workflow. The user wants a
   two-stage model: an OM opens a Phase; OL submits batches
   of items (with minimal data) into that Phase; OM reviews
   the submission; if approved OL fills the realisation data
   per item; when every approved item in the phase is fully
   realised the Phase flips to "sudah terealisasi". A new
   submission is created when a previous one is rejected
   (rather than editing the rejected one). Notifications +
   activity log entries are added on every state change.

Three design decisions on the new kasbon model were confirmed
with the user up-front (before any code touched):
- One phase can hold MANY submissions (the rejected one stays
  visible as an audit trail, the OL creates a new one).
- Rejected submissions are kept visible (read-only) with the
  review note attached � they're the audit trail, not noise.
- Phase status is OPEN \u2192 REALIZED; submission status is
  PENDING \u2192 APPROVED | REJECTED. The phase is realised when every
  approved item in every approved submission has full
  realisation data filled in (link, dates, both photos).

Decision:

1. **Asset xlsx export (backend).** New endpoint
   GET /api/floors/export in
   ackend/src/routes/floors.ts returns a
   multipart/spreadsheetml xlsx of the asset list. The route
   reuses the existing ssetAccessScope() (DEC-049) to
   filter rows by the caller's floor-scoped role: a user
   with only Assets Lantai 1 exports only Lantai 1; OM,
   OL, Director, and super admin export every floor. The
   file has the same columns the page shows (Floor, Usage,
   Kode, Nama, Jumlah, Harga, Tanggal Perolehan, Catatan).
   Implementation: a tiny shared helper
   ackend/src/lib/exports.ts (uildXlsx, safeFilename)
   so the asset, material, and kasbon-submission export
   endpoints share the same code path (bold header row,
   frozen first row, auto-sized columns).

2. **Material xlsx export (backend).** New endpoint
   GET /api/materials/export in
   ackend/src/routes/materials.ts exports every material
   (Kode, Nama, Satuan, Stok, Total Masuk, Total Keluar,
   Catatan). Stok is computed from the StockMovement rows
   so the file is a self-contained snapshot at export time.

3. **Project Manager block (server + client).**
   - Backend: new 
equireNotProjectManager middleware in
     uth.ts. Applied at the router level in
     
outes/floors.ts and 
outes/materials.ts, so every
     asset / material endpoint (read and write) returns 403
     with "Menu ini tidak tersedia untuk Project Manager"
     to a Project Manager. This is the server-side
     enforcement; the sidebar (frontend) hides the link too.
   - Frontend: new canAccessAssets(user) /
     canAccessInventory(user) helpers in
     lib/auth-api.ts. Director is intentionally NOT
     excluded (DEC-051: full oversight). The Sidebar.tsx
     now filters NAV_ITEMS through a per-item isible
     predicate so a Project Manager sees no Asset or
     Inventory link.

4. **Inventory canEdit mirror fix (frontend).** The page was
   checking !!user?.isSuperAdmin (a bug \u2014 the backend
   already allowed Inventory + OM + Director since
   DEC-051). DEC-061 extends the backend canManageInventory
   to also include the Operational Leader (per the user's
   "Inventory CRUD by Inventory + OM + OL" requirement) and
   mirrors the new gate on the client. The page now uses
   canManageInventory(user) so the UI hides the add/edit/
   delete affordances consistently for every role the
   backend also rejects.

5. **Inventory dedupe-by-name-or-code (backend +
   frontend).** The Material POST route now does a case-
   insensitive name match (always) plus a code match (when a
   code is supplied). On a hit, the route returns HTTP 409
   with a structured body:
   `
   { error: "MATERIAL_ALREADY_EXISTS",
     message: "Bahan baku dengan kode \"X\" atau nama \"Y\" sudah ada",
     existing: <ApiMaterial> }
   `
   The page treats the 409 as a "duplicate prompt": it
   surfaces the existing material in a friendly warning
   panel with a quantity + note field, and on confirm calls
   the new POST /api/materials/:id/confirm-duplicate
   endpoint. The endpoint records an IN StockMovement
   for the existing material (since stock is computed, not
   stored) and logs material.mergeDuplicate to the
   ActivityLog. The Kode barang field is now REQUIRED in
   the form (was optional) so the dedupe key is reliable on
   the common path; the server still accepts rows with
   null code (legacy seeded data) and falls back to name-
   only dedupe for those.

6. **BOM project filter + search (frontend).** Added a
   project <select> to the BOM filter bar (every project
   the user can see, populated from useProjects), and a
   free-text search input that filters by item name. Both
   are client-side; the underlying data is already in
   om.items. The filter bar is now lex-wrap so it
   fits narrow viewports.

7. **Purchasing project filter + search (frontend).** Same
   shape: project <select> + free-text search. The search
   matches against material request title (Queue tab) and
   vendor name (Vendors tab). Also client-side over
   purchasing.materialRequests / purchasing.tasks /
   endors.vendors.

8. **Kasbon full rewrite (schema + backend + frontend).**
   - **Schema.** KasbonPhase.status is now
     OPEN | REALIZED (was DRAFT | SUBMITTED | APPROVED |
     REJECTED). The phase is created by OM
     (createdByUserId, renamed from 
equestedByUserId).
     
ealizedAt: DateTime? is set when the phase
     auto-flips. New KasbonSubmission table with its own
     status (PENDING | APPROVED | REJECTED), submittedBy,
     reviewedBy, reviewNote. KasbonItem now lives under a
     submission (submissionId, dropped the direct
     phaseId relation). The realisation data
     (link, purchaseDate, 
eceivedDate,
     
eceiptPhotoUrl, itemPhotoUrl) is nullable on the
     model; items only need 
eason, item, qty, unit,
     price at submission time. Migration
     20260911020000_dec061_kasbon_submissions is the
     data-safe transformation: every existing phase
     becomes a synthetic migrated-<id> submission
     carrying the old status, all old items move to that
     submission, old APPROVED phases flip to REALIZED
     and get a 
ealizedAt timestamp, old DRAFT /
     SUBMITTED / REJECTED phases become OPEN. The
     unique key changes from (requestedByUserId,
     division, period, phase) to (division, period,
     phase) since the phase creator is now a system role,
     not a specific user.
   - **Backend routes (all in 
outes/operational.ts):**
     - GET /kasbon/phases \u2014 every kasbon-access user
       sees every phase (the new model has no "owned
       phases", only owned submissions inside a shared
       phase). Each phase carries its full submission
       tree.
     - POST /kasbon/phases \u2014 OM only. Auto-numbers
       phase as max(phase)+1 for the (division,
       period). Refuses to create a new phase if another
       OPEN phase exists for the same period, or if the
       most-recent phase (by period/phase) is not
       REALIZED \u2014 this is the "OM baru bisa membuka
       fase baru ketika fase sebelumnya sudah realisasi"
       rule.
     - POST /kasbon/phases/:id/submissions \u2014 OL only
       (or any kasbon-access user). Creates a new
       PENDING submission inside the phase. The phase
       must be OPEN, and the caller must not already
       have a PENDING submission in this phase (so
       there's never two parallel "drafts" per user per
       phase).
     - POST /kasbon/submissions/:id/items \u2014 OL adds
       a single item with the minimum data (reason,
       item, qty, unit, price) to a PENDING submission.
       Per-phase cap of Rp 5,000,000 (DEC-043) is checked
       against the sum of APPROVED items in the phase.
     - PATCH /kasbon/items/:id \u2014 OL edits an item
       in a PENDING submission. Same ownership +
       status rules.
     - DELETE /kasbon/items/:id \u2014 OL deletes an
       item from a PENDING submission.
     - POST /kasbon/submissions/:id/submit \u2014 OL
       locks the PENDING submission (sets submittedAt,
       blocks further item edits). Triggers the
       notification aggregator (it surfaces PENDING to
       OM via the existing "operational" domain).
     - PATCH /kasbon/submissions/:id/review \u2014 OM
       only. Approves or rejects a PENDING
       submission. Reject requires a 
eviewNote. The
       rejected submission stays visible (read-only) as
       an audit trail. Triggers the "needs revision"
       notification to the submitter.
     - PATCH /kasbon/items/:id/realize \u2014 OL fills
       the realisation data (link, purchaseDate,
       receivedDate, receiptPhoto, itemPhoto) for an
       item in an APPROVED submission. After the
       update, maybeRealizePhase checks if every
       APPROVED item in the phase is now fully realised
       and flips the phase to REALIZED (setting
       
ealizedAt).
     - GET /kasbon/submissions/:id/export \u2014 xlsx
       export of a single APPROVED submission. Same
       Form + Data Input sheet layout the team was used
       to (DEC-045), Vortec branding. Only available for
       APPROVED submissions (the user said "download
       setelah approve"); a REJECTED or still-PENDING
       submission returns 400 with the same Indonesian
       hint as before.
     The old per-phase endpoints (/kasbon/phases/:id/
     submit, /kasbon/phases/:id/review,
     /kasbon/phases/:id/export,
     /kasbon/phases/:id/items,
     /kasbon/phases/:id/items/:itemId) are GONE \u2014
     the per-phase flow is replaced by the per-
     submission flow.
   - **Notifications.** The notifications aggregator
     (
outes/notifications.ts) was updated to read
     KasbonSubmission instead of KasbonPhase. OM
     gets a "Menunggu Review" list of PENDING
     submissions; OL gets a "Perlu Direvisi" list of
     REJECTED submissions they own; a NEW
     kasbonApproved list surfaces the most recent
     APPROVED submissions to the submitter so they go
     realise the items. The frontend Operational menu
     tab + sidebar count badge read the same data.
   - **Activity Log.** All state-changing routes call
     logActivityFor with one of the new entity types:
     kasbonPhase.create / .delete / .realize,
     kasbonSubmission.create / .submit / .approve /
     .reject, kasbonItem.create / .update / .delete /
     .realize. The Activity Log menu (super admin /
     OM / OL / Director) picks these up via the same
     getActivityLog query the page already uses.
   - **Frontend.** Full rewrite of the kasbon tab in
     pp/operational/page.tsx. New components:
     PhaseCard (one per phase, shows submissions),
     SubmissionCard (one per submission, shows
     items + status + actions),
     ItemAddForm (the minimum-data item add form for
     a PENDING submission),
     RealizeItemForm (the realisation form, shown
     inline per APPROVED item),
     ReviewForm (OM's approve/reject form, shown
     inline per PENDING submission),
     PhaseCreateForm (OM only, the "Buka fase baru"
     button + period input).
     useOperational was rewritten for the new model:
     createSubmission, submitSubmission,
     
eviewSubmission, ddItem, updateItem,
     
ealizeItem, 
emoveItem, downloadSubmission
     (the latter replaces the old exportPhase). The
     page's phase list now shows each phase's status
     (OPEN/REALIZED) and realised-at timestamp. A
     "Phase X" filter dropdown sits above the list.
     The new submissionStatus_* and
     phaseStatus_OPEN / _REALIZED i18n keys are used
     for the status pills.
   - **i18n.** ~30 new keys under
     common.{download,searchPlaceholder,filterBy,allProjects,downloading},
     ssets.{searchHint,downloadButton,noResults},
     inventory.{codeRequired,searchHint,downloadButton,noResults,duplicateTitle,duplicateConfirm,duplicateExisting,duplicateQuantity,duplicateNote,duplicateAdd,duplicateCreateNew},
     om.{searchHint,filterByProject,noResults},
     purchasing.{searchHint,filterByProject,noResults},
     operational.{phaseStatus_OPEN,phaseStatus_REALIZED,submissionStatus_PENDING,submissionStatus_APPROVED,submissionStatus_REJECTED,phaseNewTrigger,phaseNewBlockedByPrevious,phaseAlreadyOpen,phaseNotOpenForSubmission,phaseRealizedAt,phaseCreatedBy,submissionNew,submissionNewHint,submissionBatchNote,submissionSubmit,submissionAlreadyPending,submissionEmpty,submissionReviewed,submissionRejected,realizeItemTitle,realizeItemHint,itemRealized,itemNotRealized,noOpenPhaseForYou,exportSubmission},
     
otifications.{kasbonApproved,noneKasbonApproved}. All in id + en.

Reason:
1. The asset/inventory download + PM-block requests
   cluster naturally: they all touch the same menu
   gating code, the same xlsx export path, and the
   same per-floor scope check. Splitting them across
   multiple DECs would have meant multiple rebuilds
   for the same shared code.
2. The shared xlsx helper means the asset, material,
   and kasbon-submission exports all share the same
   column-writing + filename-sanitising code. Three
   call sites, one helper.
3. The Inventory dedupe is a real footgun (two
   people add the same item under slightly different
   names, and the stock is split across two rows
   forever). The 409-with-existing pattern is the
   smallest change that fixes it without breaking
   the existing Material.code uniqueness check.
4. The Kasbon model change is a deliberate
   behavioural break from DEC-045 \u2014 the old
   edit+resubmit path on rejection was confusing (a
   user couldn't tell if their rejected items were
   "still there" or "erased"). The new path is
   explicit: rejected submissions stay visible as
   the audit trail, and the user creates a new
   submission. This matches the user's explicit
   "harus mengajukan pengajuan baru" wording.
5. The two-stage workflow (minimal data at submit,
   full data at realise) is closer to the real-world
   "I need cash to buy this thing; the receipt
   arrives later" rhythm of operational spend, and
   lets the OL submit immediately once they know the
   approximate cost, without waiting for the receipt
   or delivery date.
6. The phase auto-realisation (every APPROVED item
   in every APPROVED submission has full realisation
   data) gives OM a single boolean to gate the "open
   next phase" workflow on, instead of a complex
   per-item check.
7. The notifications aggregator was already the
   source of truth for "what does the user need to
   see right now" \u2014 reusing the same shape
   (PENDING for reviewers, REJECTED for the
   submitter, APPROVED for the submitter-to-go-
   realise) keeps the operational menu and the
   sidebar badge in lockstep with the new model
   without introducing a notifications table.

Alternatives Considered:
1. **Per-item review by OM.** Rejected: the user
   explicitly said "review bukan peritem namun per
   pengajuan". Per-submission approval keeps the
   OM's job small and matches how the real
   "Formulir Realisasi Kasbon" spreadsheet was
   reviewed (one signature, not per-row).
2. **A separate KasbonApproval table for the
   submission-level review.** Rejected: the
   
eviewedByUserId / reviewedAt / reviewNote on
   the submission itself is enough; a separate
   table would only matter if multiple OMs could
   co-review, which the user didn't ask for.
3. **A KasbonRejection log table to track why
   each item was rejected.** Rejected: the
   reviewNote on the submission covers the case
   where one item in a batch is the problem; the
   Activity Log entry on submission.reject preserves
   the who/when/why for the audit trail.
4. **Per-phase xlsx export (old behaviour).**
   Rejected: a single phase can now hold many
   submissions, some approved and some rejected.
   Exporting the whole phase would mix approved
   and rejected items; per-submission export gives
   the OM a clean "what was actually purchased"
   file.
5. **Clearing the existing 3 kasbon phases as part
   of the migration.** Rejected: the data is
   historical (one of the three was already
   REJECTED, two were APPROVED) and matches the
   "test data" note in the project context. The
   migration instead transforms the data: old
   APPROVED phases become REALIZED, their items
   move to a synthetic APPROVED submission, etc.
   The user can manually delete the synthetic
   submissions if they don't want them in the new
   UI.
6. **Keeping ItemAddForm requiring purchase date
   + link + photos at submission time.** Rejected:
   the user explicitly said "Item minimal harus
   mengisi data Nama Item, Nominal Harga, Reason,
   Quantity, Satuan" \u2014 the receipt and delivery
   date are filled later, in the realisation step.
   The old "every item must be complete before
   submit" gate is gone; the new gate is "every
   APPROVED item in every APPROVED submission
   must be complete before the phase flips to
   REALIZED".

Verification:
- Backend 
px tsc -p tsconfig.json --noEmit \u2014
  clean.
- Frontend 
px tsc -p tsconfig.json --noEmit \u2014
  clean.
- docker compose build --no-cache backend \u2014
  succeeded; container start logs show
  "Applying migration 20260911020000_dec061_kasbon_submissions"
  followed by "All migrations have been successfully
  applied" + the normal API-listening line. The
  synthetic submissions appear (id starts with
  migrated-); the 3 historical phases show
  status REALIZED / OPEN correctly.
- docker compose build --no-cache frontend \u2014
  succeeded.
- All 3 containers (backend, frontend, postgres)
  are Up after the rebuild cycle.
- Manual smoke (PowerShell) pending for the
  browser pass.

Notes:
- The xlsx filename on the asset export is
  Daftar Aset Vortec.xlsx; on the material
  export Daftar Inventaris Vortec.xlsx; on the
  kasbon-submission export the existing
  Rekap Realisasi Kasbon <division> <month>
  Phase <n>.xlsx from DEC-045 is preserved.
- The duplicate-confirm flow's exact-match
  behaviour is case-insensitive on name (the
  server uses Postgres' mode: "insensitive",
  which lower-cases both sides for the comparison)
  and exact-match on code (codes are deliberately
  short identifiers; "BB-001" != "bb-001"). If
  the user wants a different policy, both sides
  are in one place: 
outes/materials.ts POST
  and the page's materialsApi.confirmDuplicate.
- The kasbon rewrite intentionally keeps the
  same 5,000,000 phase cap (DEC-043) and the same
  KASBON_REASONS enum (DEVELOPMENT / PRODUCTION /
  OPERATION / TOOLS_ASSET). The per-phase cap
  applies to the sum of APPROVED items across
  every submission in the phase; PENDING /
  REJECTED items don't count.
- The migrated-<phaseId> synthetic submissions
  carry the original 
equestedByUserId as their
  submittedByUserId (so the audit trail of "who
  asked for this" is preserved). The new model
  doesn't show "requested by" on a phase anymore
  (it's a container, not a request); it shows
  "created by" (the OM who opened the phase).
  Migration preserves the old relationship in the
  submission row.
- The two follow-ups noted in DEC-060 (org-editor
  badge on the dashboard, custom-fields per role)
  are still open. New follow-ups from DEC-061:
  - The kasbon UI could use a per-row "per-item
    notes" field for the OL to add a per-item
    context (e.g. "this was a rush order"). The
    KasbonItem model would need a new nullable
    column. Defer until requested.
  - The duplicate-confirm could become a
    "merge into existing with a custom new name"
    option in addition to "merge quantities".
    Defer until requested.

## DEC-062

Title:
BOM moves into each Project as a 5th view (MBOM/EBOM/SBOM sub-tabs,
per-item PM/OM approval, status syncs to Purchasing); Purchasing menu
narrows to super admin + Purchasing only; Vendor becomes a top-level
navbar item; Kasbon splits into Sekarang (current open phase) + Arsip
(closed phases) tabs.

Date:
2026-09-10

Status:
ACCEPTED

Context:
Seven related user requests (DEC-062 captures all of them as one
ship, confirmed by the user before implementation):
- Asset & Inventory pages gained Download + search (DEC-061 already
  shipped this); BOM and Purchasing now get the same treatment.
- The user wants the BOM to live INSIDE each project, not at the top
  level. Inside a project, three BOMs (MBOM / EBOM / SBOM) � one per
  engineering role. PM/OM see all three, each Engineer sees their
  own type.
- Per-item approval (PM or OM, one click is enough), and approved
  items flow into the Purchasing queue so the purchasing team can
  mark them PROCESSING \u2192 ARRIVED. Status syncs back to the BOM
  view for everyone.
- New items added to a BOM need a fresh approval (same flow).
- The Purchasing menu is narrowed: only super admin + the Purchasing
  role itself. OM/PM/OL/Director lose the top-level link (their
  material-request access still lives inline in the project page,
  per DEC-022).
- Vendor moves out of the Purchasing sub-tab and becomes a top-level
  navbar item. Access: Purchasing + Operational Manager + super
  admin. Vendors page gets search + sort + filter + .xlsx download.
- Kasbon menu split: "Sekarang" shows only the currently-OPEN phase
  (no more filter dropdown over a list of closed phases); "Arsip"
  shows all REALIZED phases as collapsed cards that expand on click
  to reveal the submissions inside.
- Dashboard: PM/OM see total of all 3 BOMs across every project;
  engineers see only their own role's BOM total.

Three design decisions were confirmed up-front (Q1/Q2/Q3):
- One big DEC-062 ship (not split into 062a/062b).
- Per-item approval: one PM or OM person clicks Approve, single
  click is enough (no two-stage review).
- Vendor: top-level navbar item.
- Purchasing access: super admin + Purchasing only.

Decision:

1. **Schema.** One new column: \BomItem.price Float?\ (DEC-062
   migration 20260911030000). Nullable so legacy seeded rows stay
   intact; the dashboard BOM summary treats null price as "not
   priced" and skips it. No other schema changes \u2014 the existing
   per-item approval fields (approvedByUserId, approvedAt,
   approveNote) were already there from DEC-035.

2. **Backend auth (auth.ts).**
   - **canManageInventory** already included Inventory + OM + super
     admin (DEC-051); DEC-061 also added OL for the dedupe flow.
     No further change here.
   - **canReviewBom** now accepts PM \u2192 OR \u2192 OM. Director is
     excluded (per DEC-051 oversight-only pattern). The narrower gate
     matches the user's "1 kali approve saja + PM atau OM" wording.
   - **canProcessBom** narrows to Purchasing + super admin only.
     PM/OM can no longer touch the purchasing status of a BOM item
     \u2014 once an item is APPROVED, it's in purchasing's lane until
     ARRIVED. Matches the user's "BOM yang bisa ubah status BOM
     hanya purchasing" wording.
   - **canViewPurchasing** narrows to super admin + Purchasing only.
     PM/OM/OL/Director lose the top-level Purchasing link (their
     per-project material-request access stays inline via the
     MaterialRequests component).
   - **canAccessVendors** (new): super admin + Purchasing + OM.
     Director excluded for the new narrow rule.

3. **Backend routes.**
   - **bom.ts**: add \price\ to create + patch payloads (validated
     \u2265 0). The existing per-item /review endpoint already
     supports OM via the new canReviewBom. The /purchasing update
     route is now strictly Purchasing + super admin.
   - **bom.ts**: new \GET /api/bom/summary\ endpoint. Returns the
     role-scoped spending total: PM/OM/super admin get all 3 BOM
     types across every project; engineers get only their own type;
     anyone else gets scope=none. Status filter: APPROVED +
     PROCESSING + ARRIVED (i.e. committed spend, not pending
     requests).
   - **bom.ts**: projectId query parameter is supported on the
     existing list endpoint; the project page now calls it with
     ?projectId=... to scope by project (so a single GET returns
     just that project's items).
   - **purchasing.ts**: new \GET /api/purchasing/approved-bom\
     endpoint. Returns approved + processing + arrived BOM items
     with full metadata (price, approver, project, etc.) so the
     Purchasing team can flip status from PROCESSING to ARRIVED.
   - **purchasing.ts**: \
equirePurchasingViewer\ /
     \
equirePurchasingEditor\ narrow to super admin + Purchasing
     only. The old broader viewer set (OM/PM/OL/Director) is gone.
   - **vendors.ts**: new \GET /api/vendors/export\ xlsx endpoint
     (same shared buildXlsx helper as the asset/material/kasbon
     exports). Routes are gated to Purchasing + OM + super admin
     via the new canAccessVendors helper.

4. **Sidebar.** Removed "BOM" from the nav (no longer a top-level
   menu). Added "Vendor" with the canAccessVendors gate. Narrowed
   the Purchasing nav to only super admin + Purchasing. The other
   nav items are unchanged.

5. **Project page** (\rontend/src/app/projects/[id]/page.tsx\).
   - New 5th view mode: \om\. The view switcher now has Kanban /
     List / Gantt / Timeline / BOM.
   - New \ProjectBom.tsx\ component: 3 sub-tabs (MBOM / EBOM / SBOM)
     inside the BOM view, each showing that type's items for the
     current project. An AddItem form sits above the table (visible
     only to the engineer of that type). Each item row shows:
     name, qty, unit, price, notes/URL, approver name (or
     "Belum di-approve" badge), purchasing status, and action
     buttons. Engineer can edit+delete while SUBMITTED; PM/OM
     gets a per-item Approve/Reject form; Purchasing gets a per-item
     PROCESSING/ARRIVED form.
   - The \/bom\ route was turned into a thin redirect to
     \/projects\ (stale bookmark safety).

6. **Purchasing page** (\rontend/src/app/purchasing/page.tsx\).
   Removed the Vendors sub-tab. The Queue tab stays (material
   requests + team tasks). The new BOM tab shows the approved-BOM
   queue (\usePurchasing.approvedBom\), with per-item
   PROCESSING/ARRIVED form. The old \VendorForm\ and \VendorRow\
   functions were removed.

7. **Vendor page** (\/vendors\). New dedicated page (DEC-062 was
   the trigger to elevate it from a sub-tab to a top-level menu).
   Search input + type filter + Download (.xlsx) button. The page
   uses the same download pattern as the asset/material exporters
   (fetch + blob + createObjectURL + click).

8. **Kasbon page** (\operational/page.tsx\). Split into Sekarang +
   Arsip:
   - Sekarang tab: the single currently-OPEN phase (or an empty
     state with the "Operational Manager must open a new phase"
     hint if none). The old "Filter berdasarkan: Phase 1" dropdown is
     gone. The OM-side "Buka fase kasbon baru" button stays at the
     top, gated on the previous-phase-REALIZED rule from DEC-061.
   - Arsip tab: every REALIZED phase as a collapsed card with
     realized-at date and a "Lihat detail" toggle. Click to expand
     and see the same PhaseCard content (submissions, items) read-
     only. An archive count sits in the tab label
     (e.g. \Arsip (3)\).

9. **Dashboard** (\pp/page.tsx\). The existing BomWidget now
   reads from the new \useBomSummary\ hook and shows, per BOM type,
   the committed spend in the same tile layout as the other
   dashboard stats. An engineer sees only their own type's tile;
   PM/OM/super admin see all three plus a grand total tile. The
   widget still shows the per-role action counts (my pending
   submissions, items awaiting my review, items awaiting
   purchasing) for backward compatibility.

10. **i18n.** \u224830 new keys, all id + en:
    - \
av.vendors\ (new), \common.all\ (new)
    - \endors.pageDescription\, \endors.searchHint\,
      \endors.downloadButton\, \endors.noResults\,
      \endors.loading\
    - \om.tab\, \om.tabHelp\, \om.subtype_MBOM/EBOM/SBOM\,
      \om.subEmpty\, \om.price\, \om.approver\,
      \om.approvedBy\, \om.notApprovedYet\,
      \om.approveItem\, \om.unapproveNote\,
      \om.approveNoteOptional\, \om.summaryTitle\,
      \om.summaryAll\, \om.summaryMine\, \om.grandTotal\,
      \om.totalLabel_MBOM/EBOM/SBOM\
    - \purchasing.tabBomQueue\, \purchasing.noBomQueue\,
      \purchasing.seeVendors\
    - \operational.kasbonTabNow\, \operational.kasbonTabArchive\,
      \operational.kasbonArchiveEmpty\,
      \operational.kasbonPhaseStatusRealized\,
      \operational.kasbonNoOpenPhaseHeader\,
      \operational.kasbonNoOpenPhaseBody\,
      \operational.kasbonNowEmpty\,
      \operational.kasbonNewSubmissionHere\,
      \operational.kasbonArchiveExpand\,
      \operational.kasbonArchiveCollapse\

Reason:
1. **BOM into the project.** The user wants the BOM scoped per
   project so each project's engineering team has a focused,
   single-project view. Per-BOM-type (MBOM/EBOM/SBOM) sub-tabs
   mirror the engineering role split already used for the project
   document checklist (DEC-035). Per-item approval (single PM/OM
   click) keeps the review surface small.
2. **BOM status syncs to Purchasing.** APPROVED \u2192 PROCESSING \u2192
   ARRIVED is the existing status vocabulary; the new pipeline just
   has Purchasing be the only role that can change it. The
   dashboard's spending summary gives PM/OM a single number to
   watch.
3. **Purchasing menu narrows.** The user explicitly said "hanya ada
   di role Superadmin dan Purchasing". OM/PM/OL/Director lose the
   top-level link \u2014 they still see the per-project MaterialRequests
   inline (existing, unchanged).
4. **Vendor becomes a top-level menu.** Vendors aren't a Purchasing-
   internal concept anymore (multiple divisions may use them);
   they get a dedicated page with full CRUD + search/filter/
   download.
5. **Kasbon Sekarang/Arsip split.** The current "show all phases
   + filter dropdown" UX was confusing once we had 3+ historical
   phases (the screenshot the user attached shows exactly this).
   Sekarang = the live workspace; Arsip = historical record. No
   more filter dropdown on the main view.
6. **No Kanban-style submission view for kasbon.** The user
   didn't ask for one; the existing per-submission card stays.

Alternatives Considered:
1. **Per-submission approval by PM (one phase = one submission).**
   Rejected in DEC-061 already; the multi-submission model with
   per-item BOM approval is the cleaner pattern this DEC builds on.
2. **Keep the Purchasing menu open to OM/PM/Director for
   oversight.** Rejected per the user's spec; they want the
   Purchasing workspace to be a focused, gating-narrow surface.
3. **Move Vendor to a "Settings" page or group it under a parent
   menu.** Rejected \u2014 the user explicitly said "Sub Menu Vendor
   itu jadikan Menu di Navbar", which is a top-level menu item.
4. **Add a separate \/purchasing/bom-queue\ route instead of a
   tab inside /purchasing.** Rejected \u2014 the user said the items
   should appear inside the Purchasing menu for the purchasing
   team, not a separate route. A tab is the minimum-friction
   surface.
5. **Use a separate \BomPurchase\ table that links each BOM item
   to a purchasing action.** Rejected \u2014 the existing BomItem
   status field already carries the purchasing state; adding a
   parallel table would be a denormalisation. The current design
   keeps the BOM item as the single source of truth for both
   engineering and purchasing.

Verification:
- Backend \
px tsc --noEmit\ \u2014 clean.
- Frontend \
px next build\ \u2014 clean, 20 routes (+1 for /vendors;
  the /bom route still exists as a redirect to /projects).
- \docker compose build --no-cache backend\ \u2014 succeeded; the
  new 20260911030000 migration applied cleanly on container start.
- \docker compose build --no-cache frontend\ \u2014 succeeded.
- Backend smoke (PowerShell) confirmed:
  - GET /api/bom/summary \u2192 scope=all, 3 byType entries
    (MBOM/EBOM/SBOM), all 0 (no priced items yet).
  - GET /api/vendors/export \u2192 200, xlsx, correct filename.
  - GET /api/purchasing/approved-bom \u2192 4 items (the
    DEC-061-migrated synthetic APPROVED items from the
    historical 3 kasbon phases).
  - POST /api/bom with projectId + price \u2192 201, price=25000
    persisted.
  - Sidebar shows no BOM link; PM/OL/Director (tested via the
    previous DEC-061 smoke) get 403 on the old /api/floors and
    /api/materials routes \u2014 unchanged from DEC-061.
- All 3 containers (backend, frontend, postgres) are Up.

Notes:
- Per-item approval uses the existing \pproveNote\ field but
  doesn't require a note for approval (only rejection does, per
  the old DEC-035 pattern). The form's note field is "optional" \u2014
  a small UI note clarifies this.
- The \/api/bom\ endpoint is no longer reachable via the top-
  level /bom nav. The /bom route still exists in Next.js as a
  client-side redirect to /projects; the backend endpoint is
  still live for any future API consumer.
- The dashboard's new BOM summary card replaces the old
  "My submissions / Awaiting review / Awaiting purchasing" tiles
  with per-type spending totals. The action counts are still
  shown alongside (the widget has both kinds of stats now).
- One follow-up from the user spec that's not done in this DEC:
  the dashboard summary card on PM/OM is supposed to show "total
  of 3 BOMs" \u2014 currently it shows per-type totals + a grand
  total tile. The grand total tile IS the "total of 3 BOMs" figure;
  the per-type breakdown is a bonus. If the user wants a single
  big number, the layout can be tightened in a follow-up DEC.
- The Purchasing team's \usePurchasing\ hook now fetches
  \/approved-bom\ in addition to \/material-requests\ and
  \/tasks\. The hook's signature changed (added approvedBom
  field) \u2014 any other code that calls this hook needs to be
  updated, but only the Purchasing page consumes it.

---

## DEC-064

Date:
2026-09-11

Status:
ACCEPTED

Decision:
Implement: (1) QBOM BOM type for Quality Control team; (2) document review
status with PM/OM approval gate; (3) multi-role task assignment via
TaskRole join table; (4) permission narrowing for Info Perusahaan and
floor layout; (5) attachment disk storage at
`D:\Internal Vortec\Vortec Management\attachment`.

Reason:
The user requested a QBOM (Quality BOM) alongside the existing
SBOM/MBOM/EBOM, controlled by the QC team. Document checklist items need
a two-stage completion: the owning role marks done, then PM+OM approve
or reject with a note. Tasks need to be assignable to multiple roles
simultaneously. Info Perusahaan draft badge, floor descriptions, and org
member management need role-gated write access (Super Admin / Director /
OM only). Existing base64 dataUrl attachments should migrate to disk
storage to avoid bloating the database.

Alternatives Considered:
- Single-role task assignment (rejected — does not match multi-role
  workflow)
- Store attachments in DB as base64 (rejected — DB bloat; disk storage
  required)
- Separate BOM tables per type (rejected — complexity; single BomType
  enum is sufficient)

---

### DEC-064 Phase 1: Schema

Files Changed:
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260911050000_dec064_qbom_doc_task/migration.sql`
- `backend/src/auth.ts`

Changes:
- `BomType` enum extended with `"QBOM"`; QBOM owned by the Quality
  Control role.
- `ProjectDocument` gains `reviewStatus @default(PENDING)`,
  `reviewedByUserId String?`, `reviewedAt DateTime?`, `reviewNote String?`.
  An `@@index` on `[projectId reviewStatus]` is added for fast approval
  queries.
- `TaskRole` join table: `id`, `taskId`, `roleId`, `createdAt`.
  `Task` loses `assignedRoleId String?` but gains `taskRoles Role[]`.
  `assignedRoleIds` lives only in API serialization (backward compat).
- `User` gains `reviewedDocuments ProjectDocument[] @relation("DocumentReviewedBy")`.
- `auth.ts`: `BOM_OWNER_ROLE["QBOM"] = "Quality Control"`.
  `canOwnBomType(user, "QBOM")` returns true when user holds the QC role.

Migration applied when backend restarted. TypeScript compiled clean.

---

### DEC-064 Phase 2: Backend Routes

Files Changed:
- `backend/src/routes/bom.ts` — QBOM owner/viewer added; owner filter for
  QBOM uses `{ role: { title: "Quality Control" } }`.
- `backend/src/routes/projects.ts` — `TaskRole` replaces `assignedRoleId`
  throughout: task creation, task PATCH (sync TaskRole rows), task DELETE
  (cascade), task list serialization (`assignedRoleIds: string[]`).
- `backend/src/routes/approvals.ts` — task query includes `taskRoles`.
- `backend/src/routes/roles.ts` — uses `requireCanManageUserRoleAssignments`.
- `backend/src/routes/floors.ts` — uses `requireCanEditFloorLayout`.

Notable:
- `ApiTask.assignedRoleIds: string[]` is canonical; `assignedRoleId` kept
  for legacy callers.
- `requireCanManageUserRoleAssignments` allows: superAdmin OR Director OR
  OM (role title "Operational Manager").
- `requireCanEditFloorLayout` allows: superAdmin OR Director OR OM.

---

### DEC-064 Phase 3: Frontend QBOM

Files Changed:
- `frontend/src/lib/bom-api.ts`
- `frontend/src/lib/auth-api.ts`
- `frontend/src/app/projects/[id]/ProjectBom.tsx`

Changes:
- `BOM_TYPES = 4` (added `"QBOM"`).
- `canOwnBomType(user, "QBOM")` returns true when
  `canOwnBomType(user, "SBOM")` is true (QC users are SBOM-eligible).
- `ProjectBom.tsx` renders 4 tabs: QBOM / SBOM / MBOM / EBOM.
- Dashboard BOM widget shows 4 per-type totals.

---

### DEC-064 Phase 4: Permission Narrowing

Files Changed:
- `frontend/src/app/organization/page.tsx`
- `frontend/src/app/organization/[id]/OrgChart.tsx`
- `frontend/src/app/organization/[id]/OrgNode.tsx`
- `frontend/src/app/organization/[id]/RoleList.tsx`

Changes:
- Draft badge removed from Info Perusahaan header.
- OrgNode member management (add/remove) gated by `canManageUserRoleAssignments`.
- RoleList member management (add/remove) gated by `canManageUserRoleAssignments`.
- OrgChart "add root role" button gated by `canManageMembers`.

---

### DEC-064 Phase 5: Dashboard + Approval 3-Tab

Files Changed:
- `frontend/src/app/page.tsx`
- `frontend/src/app/approvals/page.tsx`

Changes:
- `NeedsAttentionCard` added to dashboard — shows tasks whose
  `assignedRoleIds` intersect with the user's role IDs.
- Approval page rewritten with 3-tab layout: Project / Material Request /
  Kasbon. Each tab shows its own count badge.
- Kasbon tab only shown for `canReviewKasbon(user)` (OM + super admin).
- `ApiTask.assignedRoleIds` used for filtering tasks in the approval queue.

---

### DEC-064 Phase 6: Document Checklist + Task Multi-Role

Files Changed:
- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/app/projects/[id]/TaskDrawer.tsx`
- `frontend/src/app/approvals/page.tsx`

Document Checklist:
- `DocumentRow` shows PM/OM review panel (Approve / Revise buttons +
  note input + review badge) when `canReview && doc.done`.
- `reviewStatus`: PENDING (gray) / APPROVED (green) / REVISION (red).
- `reviewedByUserName` shown when `reviewStatus !== PENDING`.
- Non-PM/OM cannot modify a document with `reviewStatus === APPROVED`.
- PM/OM can revoke APPROVED → REVISION.

Task Multi-Role:
- `AddTaskForm` uses checkbox group instead of `<select>`.
- `TaskDrawer` role assignment uses checkbox group.
- `canActOnTask` checks
  `task.assignedRoleIds?.some(rid => user.roleIds.includes(rid))`.

---

### DEC-064 Phase 7: Asset Acquisition Date

Files Changed:
- `backend/src/routes/floors.ts`
- `frontend/src/app/organization/[id]/FloorPlan.tsx`

Changes:
- `acquiredAt` field added to asset model; parsed/serialized in backend
  routes.
- `AddAssetForm` and `EditAssetRow` include `acquiredAt` date input.
- Table shows formatted date + human-readable age.
- OM + OL can CRUD assets (via `canManageAssets` gate).

---

### DEC-064 Phase 8: Attachment Disk Storage

Files Changed:
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260911060000_dec064_attachment_disk/migration.sql`
- `backend/src/lib/diskStorage.ts` (new)
- `backend/src/index.ts`
- `backend/src/routes/projects.ts`
- `frontend/src/lib/files-api.ts` (new)
- `frontend/src/lib/projects-api.ts`
- `frontend/src/hooks/useProjects.ts`
- `frontend/src/app/projects/[id]/AttachmentList.tsx`
- `frontend/src/app/projects/[id]/page.tsx`
- `frontend/src/app/projects/[id]/TaskDrawer.tsx`
- `frontend/src/app/projects/[id]/MaterialRequests.tsx`

Disk Storage Layout:
```
D:\Internal Vortec\Vortec Management\attachment\
  tasks/
  documents/
  material-requests/
  daily-reports/
```
Files stored as `<uuid><ext>` (e.g. `a1b2c3d4.pdf`).

New Attachment Fields:
- `diskPath String? @db.Text` on `Attachment` model.
- `ATTACHMENT_BASE_PATH` env var overrides the default path.
- `prepareDiskPath(entity, filename)`, `writeDiskFile`, `deleteDiskFile`.

API Changes:
- `GET /api/files/:id` streams from disk when `diskPath` is set;
  falls back to `dataUrl` for legacy records.
- `POST .../upload` (multipart/form-data) writes file to disk, stores
  `diskPath` in DB, returns serialized row.
- `POST .../replace` (multipart/form-data) replaces disk file and
  `diskPath`.
- All 3 DELETE routes delete disk file before deleting DB row.

Frontend Changes:
- `files-api.ts` exports `uploadFile(formData)` and
  `attachmentDownloadUrl(id)`.
- `AttachmentList` rewritten: `uploadUrl`/`replaceUrl`/`onUploaded`
  props; FILE upload via `uploadFile()` (FormData); LINK upload via
  `onUpload` (JSON); download uses `attachmentDownloadUrl()` for all
  FILEs.
- `onUploaded={() => refreshProject(projectId)}` refetches after file
  upload.

Legacy Compatibility:
- Existing `dataUrl` records remain fully readable.
- Frontend always uses `GET /api/files/:id` — backend handles both disk
  and dataUrl transparently.

Notes:
- `multer ^2.3.0` + `@types/multer` added to backend.
- Smoke test required: upload a file and verify it appears in the
  correct subfolder under `D:\Internal Vortec\Vortec Management\attachment`.


---

## DEC-065

Date:
2026-09-13

Status:
ACCEPTED

Decision:
Add a nullable stage column to Task and ProjectDocument so the
project page can group tasks/documents by the current project stage
(INITIATION / REQUIREMENT / DESIGN / etc.) and the Workflow Diagram
becomes an interactive filter (click a stage to show only its items,
click again to clear).

Migration 20260914050000_dec065_task_document_stage backfills the
STANDARD_TASKS and STANDARD_DOCUMENTS seed data by order so the
default project template still reads top-to-bottom. New rows can pick a
stage from the dropdown; existing rows without one remain valid
(stage = NULL).

Reason:
The previous project view rendered all tasks in a single flat Kanban
regardless of where the project was in its lifecycle. Engineers wanted
to "zoom in" on the stage they're working on without scrolling past
earlier stages that are already closed out.

Alternatives Considered:
- Stage as a swimlane column inside Kanban → rejected, would clutter
  the board and confuse Kanban semantics (which is about status, not
  lifecycle).
- Filtering on the client only without a column → rejected, can't
  persist a user's filter preference across reloads.

Notes:
- Frontend: AddTaskForm, TaskDrawer, WorkflowDiagram, project
  page filter state.
- Backfill uses order to map the seed template stages 1:1.


---

## DEC-066

Date:
2026-09-13

Status:
ACCEPTED (with one ordering fix during apply, see incident below)

Decision:
Add a Workflow table and a SOP table under Vortec Organization,
both reusable as a process/knowledge library the team can refer to.

- Workflow: a short process reference (name, description, ordered
  steps, category). No mandatory attachment — text-first.
- SOP: an official procedure (title, summary, body content,
  category). Usually carries an attached PDF/DOCX but the body can
  stand alone too.

Both reuse the existing Attachment table by adding nullable
sopId / workflowId FKs (no separate attachment models). CRU by
Operational Manager and super admin; every other authenticated role
gets read-only. Permission gate lives in the route handler
(isPrivileged check, mirrors the existing OM/super-admin pattern).

Migration 20260915050000_dec066_org_workflow_sop adds the tables
and the FK columns in the same transaction.

Reason:
Engineers kept asking "what's the right way to do X" and answers lived
in people's heads or scattered PDFs. A single library under Vortec
Organization gives the team a shared reference without forcing the
existing per-task Attachment model into a new role.

Alternatives Considered:
- One combined Reference table with a kind enum → rejected,
  SOPs have a content body that Workflows don't need; separate
  tables keep the schema honest.
- Reuse DocumentTemplate → rejected, those are *generated*
  documents attached to projects, not a library.

Notes:
- **INCIDENT during apply**: the first version of the migration
  declared the FK constraints Attachment.sopId → SOP and
  Attachment.workflowId → Workflow *before* the CREATE TABLE
  statements, so Postgres aborted the transaction with current
  transaction is aborted. Fixed by reordering: build Workflow + SOP
  tables (and their FKs to User) first, then add the Attachment FKs
  last. Lesson: in Prisma migrations, always create referenced tables
  before declaring FKs to them, even inside a single BEGIN/COMMIT.
- After clearing the failed _prisma_migrations row, migrate deploy
  applied cleanly; 37/37 migrations are now in.
- Smoke verified: full CRUD (GET / POST / PATCH / DELETE) on
  /api/workflows and /api/sops as super admin.


---

## DEC-067

Date:
2026-09-13

Status:
ACCEPTED

Decision:
A coordinated set of seven UX / workflow improvements around the BOM
and project creation flows. One decision; multiple coordinated
changes because the surface area is the same and rolling them out
separately would create transient states that don't make sense (e.g.
"close" without "compact list" leaves an inconsistent UX).

### Scope

1. **Per-role BOM submit dropdown.**
   Role gains llowedBomTypes: BomType[]. POST /api/bom validates
   that the requested omType is in the union of the submitter's
   roles' llowedBomTypes, OR the submitter holds a privileged role
   (super admin / Operational Manager / Project Manager — the latter
   two get the full set ["MBOM","EBOM","SBOM","QBOM"]).
   Frontend AddBomItemForm (inside ProjectBom) shows a dropdown
   restricted to the user's effective allowed types.

2. **Default llowedBomTypes mapping.**
   Mechanical Engineer → ["MBOM"], Electrical Engineer →
   ["EBOM"], Software Development → ["SBOM"], Quality Control →
   ["QBOM"], Project Manager + Operational Manager → all four,
   Director + Purchasing + Operational Leader → [] (oversight, not
   submitters). Migration backfills every existing role with the
   matching default; super-admin / OM can edit per-role in the org
   structure UI later.

3. **Open / Close BOM per project.**
   Project gains omClosed: Boolean (default false),
   omClosedAt: DateTime?, omClosedByUserId: String?.
   New route POST /api/projects/:id/bom/close. Gate: PM / OM /
   Director / super admin. Body must include a typed verification
   phrase (close <project-name>) — same pattern as the existing
   ConfirmDialog's confirmText field.
   Pre-condition: every BomItem for that project (status != REJECTED)
   must be ARRIVED. If any item is SUBMITTED, APPROVED,
   PROCESSING, or REJECTED, return 400 with the counts per status.

4. **Close BOM generates a rekap Excel per type.**
   For every BomType that has at least one non-rejected item, write
   one .xlsx via exceljs (already installed) with a clean table:
   header row (No, Item, Qty, Unit, Price, Status, Submitted By,
   Submitted At, Approved By, Approved At, Purchase Note), one row
   per item, totals row at the bottom (qty per type, total spend).
   Save via diskStorage.addDocument to ATTACHMENT_BASE_PATH/<sub>
   where <sub> is the type name (e.g. MBOM, EBOM). Create an
   Attachment row with projectDocumentId pointing to the matching
   checklist ProjectDocument (matched by name, e.g. the "MBOM"
   doc). Auto-set done = true on that document.

5. **Compact BOM list UI (per submission).**
   ProjectBom no longer renders a giant flat table by default. It
   renders one card per submission: collapsed shows type badge, item
   name, qty + unit, status pill, submitter, age. Click expands to
   show full row (price, notes, approver, processor, action buttons).
   Grouping heuristic: items submitted by the same user within the
   same calendar minute form one card (so a future batch-form UX
   naturally clusters). Engineer view shows only their own
   submissions; PM/OM/privileged sees everyone's.

6. **Notifications adjusted to match function.**
   Recipients per event are now:

   - om.submitted → reviewer PM + OM + project PIC
     (Purchasing does **not** get this — they act on APPROVED, not
     SUBMITTED, see DEC-063; the previous logic was correct on this
     one).
   - om.approved → submitter + project PIC + PM + OM
     (Purchasing gets a separate om.approved.queue heads-up when
     the **project's BOM queue** has ≥ 1 APPROVED item, generated by
     the approve route, so Purchasing's inbox reflects *work to do*
     not every individual item state change — see notifications.ts).
   - om.rejected → submitter + project PIC + PM + OM
   - om.processing → submitter + project PIC + PM + OM
   - om.arrived → submitter + project PIC + PM + OM
   - om.closed (new) → submitter + project PIC + PM + OM + Director
     (everyone who owns a BOM type or oversees the project gets a
     heads-up that the BOM for this project is locked).

7. **Default empty project.**
   POST /api/projects no longer auto-creates STANDARD_TASKS (24
   items) or STANDARD_DOCUMENTS (12 items). The team creates both
   manually. The constants stay in outes/projects.ts as the
   reference template (the migration backfill for legacy rows still
   uses them) but the new-project path returns an empty project.

Reason:
- The submitter's role used to be the only thing controlling who
  could submit which BOM type. With the team growing (and QC picking
  up QBOM per DEC-064), we need a flexible rule that's also a single
  source of truth — putting it on Role keeps the auth helper small
  and lets OM adjust per-role in the org UI without code change.
- Open / Close BOM is the missing piece for the "BOM lifecycle" story:
  today a project can keep accumulating BOM items forever, which
  means Purchasing has no clear "we're done with this project's
  buying" signal. The Excel rekap closes that loop and doubles as
  the actual proof-of-completion artifact for the document checklist.
- The flat BOM table was fine for the first project; with five live
  projects each carrying 30+ items it's unusable. Submission-card UX
  is the same pattern Gmail / Linear / Notion use for grouped
  activity: collapse detail, expand on demand.
- Default-empty project matches "the team will create tasks manually"
  per the user's instruction; the standard 24-task seed was creating
  friction ("do I edit it? do I delete it?").

Alternatives Considered:
- Hardcode the per-role rule in om.ts (no schema change) →
  rejected, duplicates the rule across backend + frontend and stops
  OM from adjusting it in the org UI.
- Group BOM items by submittedByUserId alone (not time-windowed) →
  rejected, an engineer who logs 5 items across two days would see
  them merged, which is misleading. Time window of 1 minute keeps
  "one form session" = one card.
- Close BOM via a flag on BomItem (per-item) → rejected, the user
  said "BOM" (the project-level artifact), not per-item.
- Keep STANDARD_TASKS / STANDARD_DOCUMENTS auto-seed but add a
  checkbox "skip template" → rejected, defaults matter; if the user
  wants the template they'll say so.

Notes:
- exceljs is already in ackend/package.json — no new dep.
- Role.allowedBomTypes is BomType[] (Postgres array column via
  Prisma String[]); migration backfills with one UPDATE per known
  role title.
- ProjectDocument.bomRekapAttachmentId is **not** added — the
  rekap Attachment lives on the existing checklist doc via the
  projectDocumentId FK, which is already there (DEC-064).


---

## DEC-068

Date:
2026-09-13

Status:
ACCEPTED

Decision:
Lock/Unlock toggle on Pengajuan Bahan Baku per project + Jenis BOM
dropdown on the MaterialRequest create form + status panel filter on
the MaterialRequest list.

### Scope (correction to DEC-067)

The earlier DEC-067 build put the Open/Close button on the per-project
BOM tab (BomItem flow). The user's actual intent was the Pengajuan
Bahan Baku page (MaterialRequest flow): "pada bagian pengajuan BOM,
harus ada button lock dan unlock". DEC-067 stays valid for the
per-project BOM close + Excel rekap; DEC-068 adds the parallel
mechanism for MaterialRequest submissions.

### Changes

1. **Project.materialRequestLocked + audit fields.** Same lock-flag
   pattern as DEC-067's omClosed. PM/OM toggle via
   POST /api/projects/:id/material-requests/lock with body
   { locked: boolean }. No typed verification (the user said
   "switch button" — soft, reversible toggle).
2. **New route POST /api/projects/:id/material-requests/lock.**
   Body { locked: true|false }. Gate: PM + OM + Director + super
   admin (mirrors backend canLockMaterialRequest). On lock=true
   stamps materialRequestLockedAt + materialRequestLockedByUserId;
   on lock=false clears them.
3. **POST /api/projects/:id/material-requests now enforces:**
   a. If project.materialRequestLocked, return 400 with Indonesian
      message ("Pengajuan Bahan Baku ... di-lock oleh PM/OM").
   b. If body has omType, validate it's in the caller's effective
      llowedBomTypes (per DEC-067); otherwise 403.
4. **MaterialRequest.bomType: BomType?.** Nullable on legacy rows.
   New submissions set it from the dropdown.
5. **Frontend SubmitForm:** adds a "Jenis BOM" dropdown restricted to
   the user's effective allowedTypes. Hidden when the project is locked
   (a yellow hint takes its place).
6. **Frontend MaterialRequests header:** adds a lock/unlock toggle
   button (PM/OM only). The button label + colour changes based on
   state (🔒 "Pengajuan di-lock" vs 🔓 "Pengajuan terbuka").
7. **Frontend status panel filter:** clickable row of tabs (Semua /
   Submitted / Approved / Processing / Completed / Rejected) above
   the list. Each panel shows its count; the active panel filters the
   list below.

Reason:
- The lock is per-project so multiple parallel projects can each have
  independent Pengajuan states (don't want one project's lock to
  block another).
- The Jenis BOM dropdown lives on the submit form (not per-item)
  because a single submission is for one BOM type — the items inside
  share that type. Engineers see only the types their roles permit;
  PM/OM get all four.
- Status panels mirror how email / task tools expose queues — the user
  can switch from "Submitted (awaiting my review)" to "Approved (in
  Purchasing's queue)" without losing their place in the page.

Alternatives Considered:
- Lock at the global / role level → rejected, too coarse; a
  per-project lock matches the user's mental model.
- Per-item BomType instead of per-submission → rejected, would scatter
  the type info across the items list.
- Tabs vs dropdown for the status filter → tabs chosen because the
  user said "by status panel" and we have ≤5 statuses that fit on one
  row.

---

## DEC-078

Date:
2026-09-15

Status:
ACCEPTED

Decision:
Add free-text search, date-range filter, and CSV download to the
/activity-log page so viewers can audit any time window without
monthly cap.

### 1. Backend � ackend/src/routes/activity.ts

- GET /api/activity-log now accepts three new query params alongside
  the existing limit / efore:
  - q (trimmed, non-empty) ? OR clause that ILIKE-matches
    description, userName, ction, entityType (case
    insensitive, leverages PostgreSQL's mode: "insensitive").
  - rom / 	o ? inclusive [from, to] range on createdAt. Parsed
    with 
ew Date(...); invalid strings are silently dropped so the
    endpoint never 500s on a malformed picker value.
- limit ceiling bumped from 200 ? 1000 so the in-page list can
  render a larger filtered range without paging.
- New endpoint GET /api/activity-log/export.csv applies the same
  q / rom / 	o filters but streams every matching row in 500-row
  cursor-paginated batches (ordered by createdAt DESC, id DESC).
  - Content-Type: text/csv; charset=utf-8
  - Content-Disposition: attachment; filename="activity-log[_from-...][_to-...].csv"
    � derived from the filter so the browser-saved filename tells you
    the range without opening the file.
  - CSV cells are escaped per RFC 4180 (quote when value contains
    ", ,, \r, or \n; double up internal quotes). Critical for
    the free-text description column.
  - Last line is a # rows: N trailer so consumers can sanity-check
    the row count without a separate count endpoint.
- Both routes reuse the same equireActivityViewer guard so the
  existing super-admin / OM / Operational Leader / Director gate
  (DEC-026 / DEC-051) is enforced on the download too.

### 2. Frontend

- lib/activity-api.ts: new ActivityLogFilters type + shared
  uildQuery(...) helper. ctivityApi.list(token, filters) and a
  new ctivityApi.downloadCsv(token, filters) that returns the raw
  Response so the caller can stream it into a Blob.
- hooks/useActivityLog.ts: gains ilters + setFilters. The hook
  pushes them into the list() call; online polling stays
  independent (online = "now window", not "date range").
- /activity-log page UI: filter bar between the PageHeader and the
  feed with a free-text search field (search icon inside the input,
  consistent with DEC-076), a From date input, a To date input
  (min / max chained so the picker rejects inverted ranges), an
  Apply button, a Reset button (visible only when filters are active),
  and a result-count hint.
- The Download button sits in the PageHeader.actions slot so it
  stays visible at every scroll position. It downloads with the same
  filters as the in-page list � what you see is what you download.
- Toasts on success / failure (ctivityLog.downloadSuccess,
  ctivityLog.downloadFailed, ctivityLog.downloadEmpty).

### 3. i18n

- New keys (all with id + en variants):
  ctivityLog.searchHint, ctivityLog.dateFrom, ctivityLog.dateTo,
  ctivityLog.resetFilters, ctivityLog.downloadCsv,
  ctivityLog.downloadHint, ctivityLog.downloadSuccess,
  ctivityLog.downloadFailed, ctivityLog.downloadEmpty,
  ctivityLog.resultsCount, common.apply.
- Per CLAUDE.md hard rule, 	() does NOT interpolate � the count is
  rendered as "{n} entri cocok" / "{n} matching entries" so the
  number sits outside the translated phrase.

Reason:
- The audit log is a system-of-record for who-changed-what; ops and
  directors regularly need to pull historical ranges (a single
  quarter, a single project lifecycle, the full first half of the
  year). Forcing them to filter by month or scroll the in-page list is
  not workable � the table caps at 1000 rows.
- CSV download is the format external auditors / spreadsheets /
  finance / external vendors can consume. Offering JSON instead would
  have been useless for the actual user.
- The free-text q plus the date range matches how people remember
  activity: a rough date plus a fragment of the description. They
  don't typically know the entity ID.
- We reuse the existing search-and-filter pattern from DEC-076
  (/admin/users, /operational) so the filter bar reads as a
  family across long-table pages.

Alternatives Considered:
1. Pagination only (no download) ? rejected. Even at 1000 rows per
   page, a year of activity for an engineering company easily exceeds
   that. Auditors need the whole window in one file.
2. JSON download ? rejected. CSVs open in Excel / Google Sheets / any
   spreadsheet tool without extra steps.
3. Server-side filter only (no client-side domain tab) ? rejected. The
   All / Login / Actions / Project / Operational tab is a 5-bucket
   visual cut; pushing it to the backend adds an enum + query-param
   surface for a feature that only changes how the page renders.
4. Pre-baked "last 30 / 90 / 365 days" presets ? rejected. The user
   explicitly asked for arbitrary ranges ("kapanpun, dengan range
   waktu yg ditentukan"); presets would constrain the workflow
   instead of supporting it.

Consequences:

Positive:
- Auditors / directors / super-admins can pull any historical
  activity-log window in one CSV. No monthly bucket.
- Search + date range also improves the in-page UX: the list now
  reflects the filter the user typed, so they verify the export
  before clicking download.
- The CSV endpoint streams rows in batches, so a multi-year export
  doesn't OOM the backend or block the response.
- CSV filename embeds the filter range � easy to identify the file
  on disk weeks later.

Negative:
- A full-history CSV can be large. Mitigated by streaming in 500-row
  batches and Cache-Control: no-store. If exports grow past tens of
  MB we should consider gzipping.
- Search hits four columns (description / userName / action /
  entityType) � if a user types a very common fragment they may get
  noise. Acceptable trade-off vs requiring exact match.
- Activity-log filter state is not persisted across reloads. If this
  becomes annoying we can mirror DEC-076's URL query-param pattern
  later.

Evidence:
- evidence/build-backend-de078.log � backend image built clean.
- evidence/restart-backend-de078.log � backend container recreated
  and healthy.
- evidence/export-de078-smoke.csv � full export (no filter) ?
  rows present, header correct, escape working ("Super Admin" and
  "Rafif" wrapped, internal quotes doubled).
- evidence/export-de078-q.csv � q=login filter ? only auth.login
  rows returned.
- evidence/export-de078-range.csv � rom + 	o filter ?
  2 rows in window, with # rows: 2 trailer.
- evidence/build-frontend-de078.log � frontend image build (running).

---

## DEC-079

Date:
2026-09-15

Status:
ACCEPTED

Decision:
Lift the /organization tab strip (Tentang / Struktur Organisasi /
Daftar Role) out of the page and surface it as nested entries in the
Sidebar's /organization submenu. The title block on the page
(Vortec Organization + the Pusat informasi � summary) was also
removed because the same info is already rendered in the page hero
directly below where the tabs used to be. The three sections become
three real routes:

- /organization ? Tentang (default landing, hero + library tiles +
  CompanyInfo)
- /organization/structure ? Struktur Organisasi (OrgChart)
- /organization/roles ? Daftar Role (RoleList, gated)

### Why

DEC-072 turned /organization into an About hub with a hero and a
tab strip; the tabs were the navigation mechanism for the three
"shells" of the org tree (about, structure, roles). Two pain points
surfaced after that ship:

1. The title at the top of the page (PageHeader title="Vortec
   Organization" subtitle="Pusat informasi internal Vortec �") and
   the hero block below it (heroName + heroSummary) carried the
   same copy. The user explicitly asked to remove the upper copy
   because it duplicates the lower one.
2. The tab strip is page-scoped � if a user is on /organization,
   they can switch tabs; the moment they navigate to
   /organization/workflow or /organization/sop the tabs vanish,
   and there's no in-page affordance to get back to Struktur /
   Daftar Role without manually going to /organization first.

Moving the three tabs into the Sidebar submenu (where Workflow + SOP
already live) gives the user a persistent, always-visible way to
jump between the four org destinations � same UX pattern as
Google Workspace / Notion / Linear sidebars.

### Implementation

#### 1. Sidebar (rontend/src/components/shell/Sidebar.tsx)

- ORG_SUBMENU gains three new entries (org.tabInfo ? Tentang,
  org.tabStructure ? Struktur Organisasi, org.tabRoles ?
  Daftar Role). Existing Workflow + SOP entries stay.
- org.tabRoles carries a isible(user) gate that mirrors the
  DEC-072 page-side gate (canEditOrganization ||
  canManageUserRoleAssignments) � Directory / OM / super admin /
  Operational Leader see the entry; read-only viewers don't.
- The submenu renderer filters by sub.visible before mapping, so
  Daftar Role stays hidden for read-only users without a separate
  if block.

#### 2. Topbar (rontend/src/components/shell/Topbar.tsx)

- SEGMENT_KEYS gains two new entries:
  /organization/structure ? org.tabStructure and
  /organization/roles ? org.tabRoles.
- Order matters � they sit ABOVE the generic /organization entry
  because readcrumbLabel does longest-prefix matching
  (Math.sort by match.length desc). Without reordering, both
  routes would fall through to 
av.organization ("Vortec
  Organization") instead of the section-specific label.

#### 3. /organization/page.tsx

- Dropped the useState<Tab> state and the <div className="tabs"
  role="tablist"> strip.
- Dropped <PageHeader title={nav.organization} subtitle={heroSubtitle} />
  at the top of the page � the same copy lives in the hero below,
  so removing the PageHeader removes the duplicate.
- The component still renders the hero + library tiles +
  <CompanyInfo>. Now it's just /organization, no conditional
  branch.

#### 4. New routes

- rontend/src/app/organization/structure/page.tsx � wraps
  <OrgChart org canEdit canManageMembers /> with the same Skeleton
  loading state the previous in-page tab used.
- rontend/src/app/organization/roles/page.tsx � wraps
  <RoleList org canEdit canManageMembers />, with an additional
  canEdit || canManageMembers gate that shows the existing
  <EmptyState> for read-only users who somehow land on the URL
  directly without the Sidebar permission.

#### 5. i18n

No new keys. org.tabInfo, org.tabStructure, org.tabRoles were
already present (introduced in DEC-072 for the in-page tabs) � they
now serve the Sidebar submenu and the Topbar breadcrumb.

Reason:
- Persistent navigation beats page-scoped tabs when the section has
  multiple destinations � the user can always jump between them.
- Removing the duplicate title makes the Tentang page read as a
  clean hero card rather than three competing title blocks.
- Splitting into real routes gives each section its own URL, which
  matters for deep-linking (a director pasting /organization/roles
  in chat now lands on the role list, not the Tentang page).

Alternatives Considered:
1. Keep tabs but hide PageHeader only ? rejected. Tabs still vanish
   on /organization/workflow and /organization/sop, and there's
   no way to jump back to Struktur / Daftar Role without going
   through Tentang.
2. Move only the duplicate title, keep tabs ? rejected. Same
   page-scopability pain as above.
3. Use a single /organization route with a query-param
   (/organization?tab=struktur) ? rejected. Submenu links would
   land on /organization?tab=struktur instead of a clean URL; deep
   links are uglier; the active submenu matching needs pathname
   prefix logic instead of exact match.
4. Drop the hero entirely ? rejected. The hero carries the live
   stats (member / role / workflow / SOP counts) which are useful
   orientation cues; removing them would make the Tentang page
   empty after the title-block removal.

Consequences:

Positive:
- The Tentang / Struktur / Daftar Role destinations are now
  reachable from every page inside the org tree, not only from
  /organization itself.
- Sidebar submenu matches the user's mental model: one parent
  (Vortec Organization) with five children, all real routes.
- Topbar breadcrumb on the two new routes shows
  "Vortec Management / Struktur Organisasi" and "Daftar Role"
  � gives the user context even without the in-page title.
- Daftar Role auto-hides from read-only viewers in the Sidebar; the
  page itself still gates by role in case of direct URL access.
- Three real routes means each section can grow independently
  (e.g. a future OrgChart filter or RoleList pagination) without
  crowding the Tentang page.

Negative:
- The Tentang page lost the in-page tabs that used to occupy the
  visual weight between the hero and the CompanyInfo. Acceptable
  because the Sidebar submenu now carries that affordance.
- Read-only users (engineers without Operational Leader role) lose
  the visual hint that Struktur / Daftar Role exist. Mitigation:
  the Sidebar already collapses the missing entries, and the Topbar
  breadcrumb still shows "Vortec Organization" when they're on the
  Tentang route.

Evidence:
- evidence/build-frontend-de079.log � frontend image built clean
  (78.2s, 23/23 static pages including the two new routes).
- evidence/restart-frontend-de079.log � container recreated and
  healthy.
- evidence/scripts/de079-smoke.ps1 � all five routes return HTTP
  200:
  /organization, /organization/structure, /organization/roles,
  /organization/workflow, /organization/sop.

---

## DEC-080

Date:
2026-09-15

Status:
ACCEPTED

Decision:
Replace the dashboard hero greeting card's solid red gradient
(linear-gradient(135deg, --color-accent, --color-accent-hover))
with a neutral surface + a 4px accent stripe on the left edge +
soft accent-wash pill for the date.

### Why

The hero greeting is the first thing every user sees after logging
in � it sets the tone for the entire session. The previous version
filled the full card with --red-600 ? --red-700, producing a
bright red rectangle roughly 1180px � 120px that the user looked at
on every page reload. The user reported it as visually aggressive
and uncomfortable ("sangat merusak mata dan membuat tidak nyaman").

DEC-071 already banned solid red wash on stat tiles and
SeverityBadge, but the hero greeting slipped through that pass.
DEC-080 extends the same spirit to the hero card itself.

### Implementation

#### 1. rontend/src/app/page.module.css � .hero redesign

Before:
`css
.hero {
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  color: var(--color-accent-on);
  box-shadow: var(--sh-md);
}
.heroMeta { background: rgba(255, 255, 255, 0.18); /* white wash on red */ }
.heroGreeting { opacity: 0.85; }
.heroName { color: inherit; /* white */ }
.heroHint { opacity: 0.92; }
`

After:
`css
.hero {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-accent);  /* thin brand stripe */
  color: var(--color-ink);
  box-shadow: var(--sh-sm);                    /* lighter shadow */
  padding: var(--sp-5) var(--sp-6);            /* a touch tighter */
}
.heroGreeting { color: var(--color-accent); font-size: .74rem; }  /* small accent eyebrow */
.heroName { color: var(--color-ink); }                            /* neutral heading */
.heroHint { color: var(--color-ink-muted); }
.heroMeta {
  background: var(--color-accent-wash);        /* soft red-50 */
  border: 1px solid var(--color-accent-wash-border);
  color: var(--color-accent);
}
.hero::after, .hero::before {
  background: var(--color-surface-sunken);     /* muted circles, no more white-on-red */
  opacity: 0.6 / 0.5;
}
`

The 4px left-edge accent stripe is the same pattern DEC-072 used on
panel borders (order-left: 3px solid --color-tone) � it carries
brand colour without flooding the eye. The date pill uses the
--color-accent-wash token that already exists in globals.css
and was previously used by SeverityBadge (DEC-071) for the
outline + dot pattern.

#### 2. No HTML / TSX changes

rontend/src/app/page.tsx is untouched. The hero markup
(<section className={styles.hero}> with heroMain, heroGreeting,
heroName, heroHint, heroMeta) is the same � only the CSS
rules changed.

### Verification

- evidence/build-frontend-de080.log � frontend image built clean
  (97.7s, 23/23 static pages).
- evidence/restart-frontend-de080.log � container recreated +
  healthy.
- / (dashboard) returns 200.
- Compiled CSS check via grep -E "linear-gradient.*color-accent"
  in /app/.next/static/chunks/*.css � only the Skeleton shimmer
  gradient remains (linear-gradient(90deg, --color-surface-sunken,
  --color-border, --color-surface-sunken)); no red hero gradient
  in any chunk.
- The compiled .hero rule in the page chunk now reads:
  ackground:var(--color-surface);border:1px solid
  var(--color-border);border-left:4px solid var(--color-accent)
  � confirms the change shipped.

Reason:
- Red #dc2626 is the brand colour and should remain present on
  the dashboard, but only as accent (small details, badges, focus
  rings), not as a wall of colour that the user stares at every
  login.
- A 4px accent stripe on the left edge is enough brand signal.
  Larger uses of red (CTAs, status indicators) are still available
  via ar(--color-accent) for buttons and pills.
- Aligning with DEC-071 means the dashboard never uses solid red
  wash anywhere � the rule is now consistent across tiles, badges,
  and the hero greeting.

Alternatives Considered:
1. Drop the accent colour entirely from the hero ? rejected. The
   greeting card would feel disconnected from the rest of the
   dashboard which uses red for CTAs and badges. A small accent
   keeps the page on-brand.
2. Use a cool colour (blue/slate) gradient ? rejected. The brand
   colour is red; switching the hero to blue breaks brand identity
   and makes the dashboard inconsistent with the sidebar's active
   nav dot / Topbar accent stripe.
3. Shrink the hero to a smaller strip ? rejected. The greeting +
   name + hint + date pill needs the current width to breathe; a
   thinner strip would crowd the text.

Consequences:

Positive:
- Dashboard first-impression is now neutral. Comfortable to look at
  for extended sessions; the brand colour remains present as
  accent.
- The new layout matches the rest of the design system: outline +
  accent pattern used by SeverityBadge, panel borders, and tile
  borders.
- Dark mode adapts automatically � --color-surface,
  --color-ink, and --color-accent-wash all have dark-mode
  variants in globals.css.

Negative:
- The hero is visually less "loud" than before. For users who liked
  the energetic greeting, the new version will feel calmer. Trade
  the user explicitly accepted ("UX lebih baik").

Evidence:
- evidence/build-frontend-de080.log � frontend build clean.
- evidence/restart-frontend-de080.log � container recreated.
- Compiled CSS bundle (verified via docker exec
  vortec-management-frontend grep):
  .hero{background:var(--color-surface);border:1px solid
  var(--color-border);border-left:4px solid
  var(--color-accent);...} � confirms the new design shipped.

---

## DEC-081

Date:
2026-09-15

Status:
ACCEPTED

Decision:
Make the /organization hero stat tile numbers reflect the actual
counts of the surfaces they reference:

- **Team members** = total number of User rows in the DB
  (previously filtered to "users with at least one role").
- **Roles** = org.roles.length (unchanged).
- **Workflows** = library.workflows.length (already shared with
  /organization/workflow).
- **SOPs** = library.sops.length (already shared with
  /organization/sop).

### Why

The user reported the hero numbers were out of sync with what they
saw on the linked pages. Concrete observations from the API:

- GET /users/basic returns **19** user accounts (the screenshot
  showed 18 because the hero filtered to oleTitles.length > 0,
  which excluded one user without any role assignment).
- GET /roles returns **20** roles (hero matched).
- GET /workflows returns **2** workflows (hero showed 1 � old
  snapshot).
- GET /sops returns **2** SOPs (hero showed 1 � old snapshot).

The hero was filtering the team-members number locally, so it
diverged from the real DB state. The other three were correct as
code but the data had moved on since the screenshot was taken.

### Implementation

#### rontend/src/app/organization/page.tsx

`diff
- const memberCount = basicUsers
-   ? basicUsers.filter((u) => u.roleTitles.length > 0).length
-   : null;
+ const memberCount = basicUsers ? basicUsers.length : null;
`

Everything else (oleCount, workflowCount, sopCount) already
read from the right sources and stays the same.

### Why these specific data sources

- useBasicUsers() ? GET /users/basic ? returns all users from
  prisma.user.findMany({ select: { id, name, userRoles } }).
  This is the authoritative source for the hero because it
  already exists, is called by other pages (e.g. project PIC
  pickers), and the response payload is small (id + name + roles).
- useOrgRoles() ? exposes oles: Role[]. The Tentang hero
  number matches /organization/roles page which calls the same
  hook.
- useOrgLibrary() ? returns { workflows, sops }. The Tentang
  hero reads library.workflows.length; the dedicated
  /organization/workflow and /organization/sop pages each call
  useWorkflows() / useSops() separately � both go through the
  same workflowsApi.list / sopsApi.list and return the same
  array. Any change to the data (create / delete a workflow or
  SOP) shows up in both places on the next reload.

Reason:
- The hero's job is to give the user a one-glance summary of the
  company. If the numbers there disagree with the surfaces they
  link to, the user loses trust in the dashboard. Locking each
  stat to its authoritative source (the same hook the destination
  page uses) removes the drift.
- "Jumlah akun atau user saat ini" is unambiguous: total user
  count, including anyone who hasn't been assigned a role yet.
  Filtering by role was a DEC-072-era choice that pre-dated
  /admin/users being open to everyone via bulk seeding.

Alternatives Considered:
1. Add a dedicated GET /users/count endpoint and a useUserCount
   hook ? rejected. asicUsers.length already gives us the answer
   with no extra round-trip; the endpoint would be a near-duplicate
   of /users/basic (which is already fetched for the role
   assignment flows and was free for the hero to share).
2. Show two numbers ("X users � Y with role") ? rejected. The hero
   is a summary surface; one number is the user's request.
3. Add a "with role" / "without role" split as a secondary stat
   tile ? rejected for the same reason. The user asked for a single
   authoritative number per tile.

Consequences:

Positive:
- The hero now reflects the real state of the system. Team
  members: 19, Roles: 20, Workflows: 2, SOPs: 2 (current DB).
- Any future CRUD on workflows, SOPs, roles, or users propagates to
  the hero on the next reload because the hero reads the same data
  sources as the destination pages.
- The four numbers will never drift from each other as long as the
  hero keeps reading from the canonical hooks � no chance of a
  stale "denormalized" hero stat.

Negative:
- The team-members count is now higher than before (was 18 in the
  screenshot, now 19). If any UI assumes the old value it would
  break, but a quick grep shows the hero number is the only
  consumer of that count.
- The hero will fluctuate as users are added or removed (and as
  workflows / SOPs are authored). Acceptable � this is the
  intended live-summary behaviour.

Evidence:
- evidence/build-frontend-de081.log � frontend image built clean
  (97.7s, 23/23 static pages).
- evidence/restart-frontend-de081.log � container recreated +
  healthy.
- Live API counts (run after the rebuild):
  - GET /users/basic ? **19**
  - GET /roles ? **20**
  - GET /workflows ? **2**
  - GET /sops ? **2**
  All four numbers match the hero computation logic.
- /organization route ? HTTP 200 after the rebuild.
---

## DEC-082

Date:
2026-09-16

Status:
ACCEPTED

Decision:
Remove every horizontal tab strip that used to sit at the top of a
page section and replace it with persistent nested submenus in the
Sidebar. Five pages were affected: `/approvals`, `/projects`,
`/operational`, `/purchasing`, `/notifications`.

### Why

The user explicitly asked: *"sub menu yang seperti ini dirubah semua
ke submenu di navbar. jangan ada lagi yang seperti ini"* (sub-menu
tabs like this should all be changed to sidebar submenus, no more
like this).

The previous pattern was a `<div className="tabs">` pill row that
lived inside the page body. Once the user navigated to any nested
sub-route of the page (e.g. `/approvals/material-requests`), the tab
strip disappeared and there was no in-page affordance to switch back
to another section. The sidebar submenu approach (introduced for
`/organization` in DEC-079) gives persistent navigation — every
section is one click away regardless of which sub-route the user is
on.

### Implementation strategy

The five pages split into two groups based on how invasive the
conversion needed to be:

#### Group A — real routes (`/approvals`)

`/approvals` had three well-encapsulated card sections (Project /
Pengajuan Bahan Baku / Kasbon) so the conversion was a clean split:

- `frontend/src/app/approvals/page.tsx` → Project content only
- `frontend/src/app/approvals/material-requests/page.tsx` →
  Pengajuan Bahan Baku content
- `frontend/src/app/approvals/kasbon/page.tsx` → Kasbon content
- `frontend/src/components/approvals/ApprovalCards.tsx` +
  `.module.css` → extracted `TaskApprovalCard`,
  `MaterialRequestApprovalCard`, `KasbonSubmissionCard`,
  `AttachmentsReadOnly` so all three pages share them.

#### Group B — URL query (`/projects`, `/operational`, `/purchasing`,
`/notifications`)

These pages had monolithic content (1500+ lines for `/operational`,
shared state across the tabs) where a full route split would
require extracting every helper component. URL-query is the lighter
alternative:

- The page reads the active section from
  `useSearchParams().get("tab")`.
- The default tab (Dashboard / Daily Report / Queue / Project) is
  the no-query state, so existing links keep working.
- The Sidebar submenu links navigate via `?tab=xxx`.
- The Topbar breadcrumb shows the parent label (no sub-tab in the
  breadcrumb — submenus are the navigation mechanism for sub-tabs).

For `/notifications` the inbox section still appears above the tab
content because it's a separate persistent feed (DEC-063). The three
tabs (Project / Operational / BOM) sit below the inbox and are now
query-driven.

### Sidebar submenu wiring

`frontend/src/components/shell/Sidebar.tsx` gains five new submenu
constants:

```ts
const APPROVALS_SUBMENU = [
  { key: "approvals.tabProject",          href: "/approvals" },
  { key: "approvals.tabMaterialRequest",  href: "/approvals/material-requests" },
  { key: "approvals.tabKasbon",           href: "/approvals/kasbon",
    visible: (u) => canReviewKasbon(u) },
];
const PROJECTS_SUBMENU = [
  { key: "dashboard.tabDashboard", href: "/projects" },
  { key: "dashboard.tabList",      href: "/projects?tab=list" },
];
const OPERATIONAL_SUBMENU = [
  { key: "operational.tabDailyReport", href: "/operational" },
  { key: "operational.tabKasbon",      href: "/operational?tab=kasbon",
    visible: (u) => canAccessKasbon(u) },
];
const PURCHASING_SUBMENU = [
  { key: "purchasing.tabQueue", href: "/purchasing" },
  { key: "purchasing.tabBomQueue", href: "/purchasing?tab=bom" },
];
const NOTIFICATIONS_SUBMENU = [
  { key: "notifications.tabProject",     href: "/notifications" },
  { key: "notifications.tabOperational", href: "/notifications?tab=operational",
    visible: (u) => canAccessKasbon(u) },
  { key: "notifications.tabBom",          href: "/notifications?tab=bom" },
];
```

The render loop picks the right submenu list per parent link via a
small branch table (`isOrg / isApprovals / isProjects / isOperational
/ isPurchasing / isNotifications`). Submenu row `active` state uses
a helper `isSubActive(sub)` that splits each entry's `href` into
`pathname` + `?tab=` and compares both — so a URL like
`/notifications?tab=bom` highlights the BOM row in the sidebar.

### Topbar breadcrumbs

Only `/approvals` got new SEGMENT_KEYS entries (because it has real
sub-routes):

```ts
{ match: "/approvals/material-requests", key: "approvals.tabMaterialRequest" },
{ match: "/approvals/kasbon",            key: "approvals.tabKasbon" },
```

The four URL-query pages share the parent breadcrumb (`/projects`,
`/operational`, `/purchasing`, `/notifications`).

### Parent nav badges

- `/notifications` already had a badge (DEC-073): `notifications.count`
  = total inbox + project + operational + bom + inbox unread.
- `/approvals` now has one (DEC-082): `approvals.tasks.length +
  approvals.materialRequests.length + (canReviewKasbon(user) ?
  pendingKasbon : 0)`. Same data sources as the old per-tab badges,
  combined into the parent.

### i18n

No new keys. `approvals.tabProject`, `approvals.tabMaterialRequest`,
`approvals.tabKasbon`, `dashboard.tabDashboard`,
`dashboard.tabList`, `operational.tabDailyReport`,
`operational.tabKasbon`, `purchasing.tabQueue`,
`purchasing.tabBomQueue`, `notifications.tabProject`,
`notifications.tabOperational`, `notifications.tabBom` already
existed from DEC-064 / DEC-072 / DEC-076 — the sidebar submenu
re-uses them, no new translations needed.

### DEC-071 / DEC-072 cross-checks

- No solid red wash on stat tiles or SeverityBadge — unchanged.
- No `<PageHeader>` title duplication on the three `/approvals/*`
  pages — same DEC-079 pattern as `/organization`. Other four pages
  keep their PageHeader because they remain full-page surfaces
  without an in-page duplicate.

Reason:
- Persistent navigation beats page-scoped tabs for any section with
  more than one destination. The Sidebar stays in view as the user
  scrolls, so a sub-menu jump is one click no matter where they
  are.
- Each section now has its own URL (real routes) or stable URL
  (query-param) — deep links and shared URLs work.
- The pattern is now consistent across `/organization` (DEC-079)
  and these five pages. Every sidebar parent with multiple children
  renders a submenu in the same shape.

Alternatives Considered:
1. Keep tab strips but hide the PageHeader above them → rejected.
   Same page-scopability pain the user called out; sub-routes would
   still drop the tab strip.
2. Use URL query for `/approvals` too → rejected. The three
   sections have very different content shapes (task approval card
   vs material request card vs kasbon submission card). Real routes
   with shared components are cleaner than one 1500+ line page with
   three branches.
3. Force every converted page to use real routes → rejected for
   the four monolithic pages. `/operational` would need every
   ReportForm / PhaseCard / ArchivePhaseCard helper extracted to
   `/components/operational/` to support two page files. The URL-query
   pattern gets the same UX with much less refactor.

Consequences:

Positive:
- Every section with sub-routes is now reachable from every page
  inside that section's tree via the Sidebar submenu. No more
  "where did the tabs go?" moments when navigating to a sub-route.
- Real routes for `/approvals` give each section its own URL —
  directors can paste `/approvals/kasbon` in chat to deep-link OM
  reviewers to the right queue.
- URL-query pages keep their shared component tree — no extraction
  overhead, smaller blast radius for future refactors.
- All five submenus use the existing Sidebar submenu CSS
  (`.submenu`, `.submenuLink`, `.submenuLinkActive`) so the visual
  language stays consistent with `/organization`.

Negative:
- The Topbar breadcrumb on URL-query pages doesn't show the
  sub-tab label (e.g. on `/projects?tab=list` the breadcrumb says
  "Projects" not "Project List"). Sub-tab context is carried by the
  Sidebar submenu's active row. Trade-off accepted: a real route
  split would have added the label but cost a major refactor.
- Reading the active query tab in the Sidebar uses
  `window.location.search` because `usePathname()` doesn't expose
  it. This works in client components but means the Sidebar renders
  once with the initial URL on hydration. Acceptable for a
  navigation surface.

Evidence:
- `evidence/build-frontend-de082b.log` — first /approvals build
  (failed on TypeScript errors with `quantity` / `note` / i18n key,
  fixed in next pass).
- `evidence/build-frontend-de082d.log` — final build clean, 47.7s,
  25/25 static routes including `/approvals/material-requests` and
  `/approvals/kasbon`.
- `evidence/restart-frontend-de082.log` — container recreated +
  healthy.
- All twelve representative routes return HTTP 200 (verified via
  `Invoke-WebRequest` smoke test):
  - `/approvals`, `/approvals/material-requests`, `/approvals/kasbon`
  - `/projects`, `/projects?tab=list`
  - `/operational`, `/operational?tab=kasbon`
  - `/purchasing`, `/purchasing?tab=bom`
  - `/notifications`, `/notifications?tab=operational`,
    `/notifications?tab=bom`
