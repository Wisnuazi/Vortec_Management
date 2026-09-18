# COMPLETED TASKS

## TASK-001

Title:
Backend scaffold + Organization feature wired to Postgres

Completed:
2026-09-07

Commit:
(not yet committed — see `git status`)

Result:
- Started the corrected `vortec-management-postgres` container (port 5433).
- Scaffolded `backend/`: `tsconfig.json`, Prisma schema (Role/Employee/Jobdesk),
  Express server with a `/api/roles` REST API, `.env`/`.env.example`,
  dependencies installed, migration applied, database seeded.
- Seeded the database with Vortec System's real org structure and employee
  assignments from `assets/template/doc/organization_structure.md` and
  `employees.md`, plus generated (draft) jobdesk/job-description text and a
  company profile summary — all flagged as draft pending review.
- Rewired `frontend/src/hooks/useOrgRoles.ts` to call the backend API instead
  of `localStorage`, without changing `OrgChart`/`RoleList`/`OrgNode`.
- Added a new "Info Perusahaan" tab (`CompanyInfo` component) to the
  Organization page showing the draft company profile + building layout.
- Verified end-to-end in the browser: frontend + backend running together,
  data flows from Postgres to the page.
- Documented the split: `docs/ARCHITECTURE-FRONTEND.md`,
  `docs/ARCHITECTURE-BACKEND.md`, updated `docs/ARCHITECTURE.md` to point to
  them, recorded decisions in `docs/DECISIONS.md` (frontend/backend split,
  dedicated Postgres container, single-parent role tree limitation, draft
  seed content). Updated `docs/PROJECT_CONTEXT.md`, `README.md`, `CLAUDE.md`.

Verification:
- `npm run build` in `frontend/` passes (TypeScript + Next.js build).
- Backend `GET /api/roles` returns 16 seeded roles with correct
  parent/employee/jobdesk data.
- Manually verified in Chrome: Organization page renders company info, org
  chart, and role list from live API data; no console errors.

Documentation Updated:
`docs/PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`,
`docs/ARCHITECTURE-FRONTEND.md`, `docs/ARCHITECTURE-BACKEND.md`,
`docs/DECISIONS.md`, `README.md`, `CLAUDE.md`, `tasks/CURRENT_TASK.md`.

Notes:
Content marked DRAFT still needs user review/correction (see
`docs/DECISIONS.md` DEC-004 and the "Draft — menunggu review" badge in-app):
company profile summary, per-role jobdesk not explicitly present in the
source docs, and the single-parent placement of the Technical & Quality Team
under Operational Leader only (DEC-003).

## TASK-002

Title:
Authentication/authorization, tree redesign, Assets feature, account-synced
preferences, partial i18n

Completed:
2026-09-07

Commit:
(not yet committed — see `git status`)

Result:
- Redesigned the Organization structure tab from a nested indent list into a
  real branching tree diagram (CSS-only connector lines), with click-to-
  expand jobdesk/job-description per role, and icon-only action buttons.
- Added confirmation prompts before every delete (roles, employees, jobdesk
  items, assets, users).
- Built authentication: `User` model, JWT bearer auth, super admin bootstrap
  seed (email typo fixed post-launch: `vortec_dev@vortecsystem.com`), login
  page, `/admin/users` CRUD page (super admin only) with users tied to an
  org `Role`, login via email or username, write-only password reset (super
  admin can set but never view a password). See DEC-005/006/007.
- Locked down Organization/Assets mutation endpoints to super admin only
  (`requireAuth` + `requireSuperAdmin` server-side); non-admins get a
  read-only view and the "Manajemen User" nav item is hidden for them.
- Added a "Daftar Role" CRUD pass (rename/delete/add-with-parent-selector),
  kept in sync with the tree view via the same `useOrgRoles` hook.
- Added a Profile page + navbar profile dropdown (My Profile / Log out).
- Theme and language (ID/EN) now sync to the user's account, not just
  browser `localStorage` — a login on a different browser/device restores
  the same preferences. See DEC-008.
- Added an i18n system covering the app chrome (Sidebar/Topbar/ProfileMenu/
  Login/Profile); Organization/Assets/Users page content remains
  Indonesian-only for now (tracked in DEC-009, not silently incomplete).
- Added the Assets feature: `Floor`/`Asset` models, `/api/floors` REST API,
  floor descriptions (draft) + click-to-expand per-floor asset list on the
  "Info Perusahaan" tab, a standalone `/assets` CRUD page, and an asset
  `code` field — both surfaces read the same backend data so they can't
  drift out of sync. See DEC-010.
- Fixed two real bugs found during manual verification: (1) the tree's
  jobdesk panel couldn't be closed after opening (an overly broad
  `stopPropagation` on the card header swallowed the toggle click); (2) the
  Assets page's "add asset" form silently defaulted to an empty floor id if
  opened before floor data finished loading, causing a 404
  (`POST /floors//assets`) — fixed with a `useEffect` sync plus a disabled
  submit button as a second guard.
- Also fixed a real regression introduced mid-session: after gating
  `/api/roles` behind `requireAuth`, `org-api.ts` was never updated to send
  a bearer token, breaking the Organization page for every logged-in user
  until caught via a Next.js dev-overlay error and fixed.

Verification:
- `npm run build` in `frontend/` passes after every change in this task
  (TypeScript + Next.js build), `npx tsc --noEmit` in `backend/` passes.
- Manually verified in Chrome as both the super admin and a newly-created
  non-admin user (Angga/Project Manager): login (email + username), tree
  expand/collapse, role/employee/jobdesk CRUD gated correctly by role,
  Users admin page create/list, Profile page save + theme + language
  toggle (confirmed persisted server-side via `GET /api/auth/me`), Assets
  add/delete + code field, sync between the floor panel and `/assets` page.
- Confirmed via curl: unauthenticated and non-admin requests to mutation
  endpoints are rejected (401/403) while GETs succeed for any logged-in user.

Documentation Updated:
`docs/DECISIONS.md` (DEC-005 through DEC-010), `docs/ARCHITECTURE-BACKEND.md`,
`docs/ARCHITECTURE-FRONTEND.md`, `tasks/CURRENT_TASK.md`.

Notes:
See `tasks/CURRENT_TASK.md` (TASK-003) for what's still open: full i18n
coverage, review of all draft content (company info, jobdesk, floor
descriptions), and the dual-supervision org-structure question (DEC-003).

## TASK-002b

Title:
Inventory, Projects/Tasks/Material Requests, multi-role accounts, workflow
diagram (retroactively logged)

Completed:
2026-09-07

Commit:
(not yet committed — see `git status`)

Result:
This work was completed in the same continuous session as TASK-002 but was
never logged as its own task before the session hit its context limit —
recorded here after the fact, once the gap was noticed at the start of the
next session, to keep this file an accurate record of what's actually
running.
- Replaced `User.roleId` (single) with a `UserRole` join table so one
  account can hold multiple roles (DEC-015).
- Added the Inventory feature: `Material`/`StockMovement` models, computed
  (not stored) stock, `/api/materials` (DEC-013).
- Added the Project feature: `Project`/`ProjectDocument` models seeded from
  the Vortec Operation/Production Process document's checklist, `ProjectStage`
  enum, `/api/projects` (DEC-014).
- Added `Task` (per-project, role-assigned, approval-gated) with
  role-based permission checks (`requireProjectCreator`,
  `canManageProjectTasks`, `canActOnTask`) and 4 views (Kanban/List/Gantt/
  Timeline) (DEC-016).
- Added the Material Request (BOM) workflow: submit → PM review/approve →
  Purchasing process, with per-transition attribution (DEC-017).
- Added `Attachment` (file or link, base64-data-URL pattern) usable on
  Tasks, ProjectDocuments, and MaterialRequests.
- Added the n8n-style `WorkflowDiagram` node-flow visualization of a
  project's current stage (DEC-018).

Verification:
- `npm run build` in `frontend/` and `npx tsc --noEmit` in `backend/` passed
  at the time (re-verified clean at the start of the next session).
- Manually verified in Chrome per the session's own record at the time
  (Kanban drag-and-drop, task approval gates, material request review/
  process actions, attachment upload/download).

Documentation Updated:
`docs/DECISIONS.md` (DEC-013 through DEC-018), `docs/ARCHITECTURE-BACKEND.md`
(Addenda 1 & 3), `docs/ARCHITECTURE-FRONTEND.md` (Addenda 2 & 3) — all
written at the time; only this task-log entry was missing until now.

Notes:
No behavior changed by writing this entry — it is a documentation-only
reconciliation.

## TASK-003

Title:
Dual supervision modeling, full i18n coverage, real asset inventory import
(PARTIALLY COMPLETE — see Notes)

Completed:
2026-09-07 (continuation session, after the previous session hit its
context limit while TASK-003 was still IN PROGRESS)

Commit:
(not yet committed — see `git status`)

Result:
Resumed TASK-003 after the user answered its three open questions
(draft content: keep as draft for now; DEC-003: model dual supervision
properly; DEC-009: do full i18n now, extended to every page). Mid-session,
the user also asked for a real asset inventory import, asset photos, a
narrower Assets permission model, full asset edit capability, an asset
acquisition-date/age field, and sortable lists/tables app-wide — all
delivered in this same session.
- **Dual supervision (DEC-019, supersedes DEC-003):** added a
  `RoleSupervision` many-to-many table, additive to the `Role.parentId`
  tree. Technical & Quality Team roles now formally show Project Manager
  as a co-supervisor, editable via a new `SupervisorMultiSelect` control in
  `RoleList`, displayed (read-only, both directions) in `OrgNode`.
- **Full i18n (DEC-009, extended):** `i18n.ts` grew from 34 to ~230 keys.
  Every remaining Indonesian-only page (Organization, Assets, Admin Users,
  Inventory, Projects/Tasks/Material Requests) now runs through `t()`.
  Centralized enum labels (`PROJECT_STAGES`/`TASK_STATUSES`/
  `MATERIAL_REQUEST_STATUSES`) became locale-aware. A shared
  `lib/format.ts` replaced 6 hardcoded `id-ID` date-format call sites.
  DRAFT business content (company profile, jobdesk, floor descriptions)
  and backend error strings were deliberately left Indonesian-only
  (documented, not silently incomplete).
- **Real asset inventory (no new decision — data population using the
  existing DEC-010 model):** parsed `asset_vortec_aug_2026.xlsx` (extracted
  via `Expand-Archive` + a throwaway Node script, since neither Python nor
  an xlsx package was available) and imported 107 asset rows across the
  seeded floors via a new idempotent `seedAssetsAug2026()`.
- **Asset photo + narrower permissions + full edit (DEC-020):** added
  `Asset.photoUrl` (optional, base64 data URL, same pattern as
  `User.avatarUrl`); narrowed Assets-menu mutation access from
  super-admin-only to super admin or a user holding the "Assets",
  "Operational Manager", or "Operational Leader" org role
  (`requireAssetManager` in `backend/src/routes/floors.ts`); wired up the
  previously-unused `updateAsset` API into a real edit UI on `/assets`.
- **Acquisition date/age + sortable tables (DEC-021):** added
  `Asset.acquiredAt` (optional date) with a derived (not stored) age
  display; added a shared `lib/sort.ts` sort utility, wired into
  clickable/toggling column headers on every genuine table (Assets, Admin
  Users, project detail Task Table) and a sort-by dropdown on every
  card-list view (Inventory, Projects) — deliberately not added to
  structural views (org chart tree, Kanban, Gantt/Timeline).
- Fixed a real bug found along the way: the floor asset count on the
  Organization "Info Perusahaan" tab was counting distinct `Asset` rows
  (item types) instead of summing `quantity` (actual item count).
- Deleted `lib/org-seed.ts`, confirmed dead code flagged in a previous
  session's architecture doc, once it started failing the build after
  `Role` gained a new required field.

Verification:
- `npx prisma migrate dev` clean for both new migrations
  (`add_role_supervision_and_asset_photo`, `add_asset_acquired_at`);
  `npx tsc --noEmit` in `backend/` passes.
- `npm run build` in `frontend/` passes (full TypeScript + Next.js build),
  re-run after each major batch of changes, not just once at the end.
- Manually verified via curl: a non-privileged logged-in user (Project
  Manager role) gets 403 on an Assets mutation and 200 on a GET, confirming
  `requireAssetManager` is enforced server-side, not just hidden in the UI.
- Manually verified the asset import via a direct DB query: floor asset
  counts and a multi-floor spot-check ("Bor Baterai": Lantai 1 qty 2,
  Lantai 4 qty 1, Lantai 5 qty 1) matched the source spreadsheet exactly.
- Did not get a full manual browser walkthrough of every translated page
  in both languages before this entry was written — recommended as a
  follow-up verification step (see `tasks/CURRENT_TASK.md`).

Documentation Updated:
`docs/DECISIONS.md` (DEC-003 superseded, DEC-009 rewritten, DEC-019,
DEC-020, DEC-021 added), `docs/ARCHITECTURE-BACKEND.md` (Data Model, API
tables, Known Technical Debt, Architecture Constraints, Addendum 4),
`docs/ARCHITECTURE-FRONTEND.md` (Known Technical Debt, Addenda 4 & 5),
`tasks/COMPLETED.md` (this entry + TASK-002b), `tasks/CURRENT_TASK.md`.

Notes:
Marked PARTIALLY COMPLETE, not DONE: two of TASK-003's original four
acceptance criteria remain open by the user's own explicit choice, not an
oversight —
1. Draft content (company profile, per-role jobdesk, floor descriptions)
   is still unreviewed/unconfirmed — the user chose "keep as draft for now"
   this session, same as last time.
2. Real login accounts for org members still haven't been created — only
   the super admin and the Angga test account exist.
See `tasks/CURRENT_TASK.md` (TASK-004) for these, plus the recommended full
bilingual browser walkthrough noted above.

## TASK-005

Title:
Purchasing/Approvals/Notifications/Activity Log menus, destructive-action
double-confirm, Docker production deployment, Projects dashboard, Task/
Subtask permission split with auto-advance, Team Performance monitoring

Completed:
2026-09-08

Commit:
(not yet committed — see `git status`)

Result:
A long, fast-moving session of feature requests, each implemented and
verified before the next arrived. TASK-004 itself (draft content review,
full bilingual walkthrough, real org accounts) remains open/deferred by
the user's own choice — this entry covers everything else built in the
same span. In rough chronological order, each backed by a `docs/
DECISIONS.md` entry:
- **Purchasing menu + Vendor directory** (DEC-022): cross-project
  Purchasing queue and vendor directory, dedicated endpoints to avoid
  `GET /api/projects`'s per-role task filtering hiding data from OM/PM/
  Operational Leader viewers.
- **Approvals menu** (DEC-023): personalized cross-project approval
  inbox; established the "sees all vs. sees own" task-visibility split
  later referenced by DEC-032/DEC-033.
- **Activity Log menu** with login/action/project category filters and
  color-coded category badges, and a **Notifications menu** with due-date
  reminders — both audited for role-leak bugs (an activity or notification
  must never reach a role it isn't relevant to) and verified with a real
  temporary test account.
- **Destructive-action double-confirm**: a reusable `ConfirmDialog`
  requiring the user to type an exact confirmation string before a
  high-impact delete (Project, Role, User, Material) enables; simple
  yes/no kept for low-impact actions.
- **Credentials handoff file**: generated for the team after explaining
  that existing bcrypt password hashes are cryptographically irreversible
  (not a policy choice) — required resetting/creating accounts with known
  passwords first; user took explicit responsibility for keeping the file
  out of git.
- **Docker production deployment** (DEC-030): `docker compose up -d` alone
  now serves both apps via production builds, no `npm run dev` required.
  See `docs/TROUBLESHOOTING.md` ISSUE-001 for the `restart: unless-stopped`
  gotcha discovered afterward (stale containers silently reclaiming dev
  ports after a Docker daemon restart).
- **Projects Dashboard** (DEC-031): a monitoring dashboard tab on
  `/projects` — project/task/budget stat tiles, a stage pipeline bar, a
  task-status stacked bar, a material-request breakdown, and a
  needs-attention list — built client-side from existing data, following
  the dataviz skill's procedure with the app's own design tokens as the
  palette.
- **Task/Subtask permission split + auto-advance** (DEC-032): full task
  CRUD narrowed to Project Manager/Operational Manager/super admin (PIC
  dropped); every other assigned role gets full subtask CRUD plus its
  existing task-status-change ability; completing all of a task's
  subtasks auto-advances its status as an additive convenience. Added
  `Subtask` model and `Task.completedAt`.
- **Team Performance monitoring** (DEC-033): a dashboard panel, visible to
  PM/OM/super admin, ranking teams (org roles) by average days ahead of/
  behind their tasks' due dates, backed by a new dedicated
  `GET /api/projects/performance/tasks` endpoint (needed for the same
  "sees all vs. sees own" reason as DEC-022/DEC-023).

Verification:
- `npx tsc --noEmit` in `backend/` and `npm run build` in `frontend/`
  passed after each feature, not just once at the end.
- Every role-permission change in this session was verified against the
  real dev database with throwaway temporary accounts/projects (created,
  exercised via real HTTP calls with a real signed JWT, then deleted) —
  not just read from code. The Task/Subtask split and Team Performance
  endpoint were each verified with a full assertion script (15 and 8
  checks respectively, all passing) covering both the "allowed" and
  "forbidden" sides of every new permission boundary.
- The Subtask feature and Team Performance panel were additionally
  verified live in the browser (via a throwaway temporary super-admin
  account, deleted afterward): adding/checking a subtask through the real
  UI correctly flipped a task's status to "Selesai", and the Team
  Performance panel rendered its correct empty state against current real
  data (zero completed tasks so far).
- Notification/Activity Log role-scoping was verified with a real
  temporary test account and a real (temporarily modified, then restored)
  project due date.

Documentation Updated:
`docs/DECISIONS.md` (DEC-022 through DEC-033), `docs/TROUBLESHOOTING.md`
(ISSUE-001), `README.md` (Docker quick-start), `tasks/COMPLETED.md` (this
entry), `tasks/CURRENT_TASK.md`.

Notes:
TASK-004's three original acceptance criteria are still open — this
session's work happened alongside it, not instead of it. See
`tasks/CURRENT_TASK.md`.

## TASK-006

Title:
Document Templates menu, dedicated BOM (MBOM/EBOM/SBOM) menu with
item-level approval/purchasing workflow, list/grid layout toggle

Completed:
2026-09-08

Commit:
(not yet committed — see `git status`)

Result:
- **Document Templates** (DEC-034): new `/document-templates` menu and
  `DocumentTemplate` model. Every logged-in role can view/download; only
  super admin or Operational Manager can add/edit/delete.
- **BOM menu** (DEC-035): new `/bom` menu and `BomItem` model, entirely
  separate from the existing per-project Material Request feature. Each
  BOM type (MBOM/EBOM/SBOM) is owned by its matching engineering role
  (Mechanical/Electrical/Software Development), who submit items that
  independently cycle through `SUBMITTED -> APPROVED/REJECTED (Project
  Manager) -> PROCESSING -> ARRIVED (Purchasing)`. An item locks (no
  edit/delete) the moment a PM reviews it, and stays locked once
  Purchasing marks it arrived; engineers keep adding new items which each
  start their own independent cycle. `submittedAt`/`approvedAt`/
  `purchasingUpdatedAt` are recorded on every item.
- **List/grid layout toggle** (DEC-036): a new reusable `LayoutToggle`
  component wired into Projects' "Daftar Project" tab, BOM, and Document
  Templates, switching each page's item list between a flex-column list
  and a CSS Grid of cards.

Verification:
- `npx tsc --noEmit` in `backend/` and `npm run build` in `frontend/`
  passed.
- A 26-assertion end-to-end script against the real dev database (four
  throwaway role-specific users + a throwaway project) covered: Document
  Templates' view-for-everyone/edit-for-OM-only split; BOM's per-type
  create gate; PM-only review; Purchasing-only status updates; the edit
  lock taking effect immediately on PM approval (not just on arrival);
  the delete lock; and a second BOM item submitted independently after
  the first was already ARRIVED. All passed; all temp data cleaned up.
- Verified live in the browser (throwaway temp super-admin account,
  deleted after): created a real template through the UI, toggled all
  three pages between list and grid layout with real data, confirmed
  correct rendering in both modes.

Documentation Updated:
`docs/DECISIONS.md` (DEC-034, DEC-035, DEC-036), `tasks/COMPLETED.md`
(this entry).

Notes:
TASK-004's three original acceptance criteria remain open, unrelated to
this entry's work.

## TASK-007

Title:
PIC must be a Project Manager, real per-role home Dashboard

Completed:
2026-09-08

Commit:
(not yet committed — see `git status`)

Result:
- **PIC restriction** (DEC-037): a project's PIC can now only be set to a
  user holding "Project Manager" — `GET /api/users/basic` gained
  `roleTitles`, both PIC pickers (create form, detail page editor) filter
  to Project Manager holders, and `POST`/`PATCH /api/projects` reject any
  other `picUserId` server-side.
- **Home Dashboard** (DEC-038): replaced the long-standing placeholder at
  `/` with a real per-role landing page — a role banner (badges for every
  role the user holds, or "Super Admin"), universal stat tiles
  (approvals/overdue/upcoming, all already role-scoped via existing
  endpoints), a "Tugas Saya" task list, and role-conditional panels for
  Project Summary (PM/OM/admin), BOM, Purchasing, and Activity Log —
  each only fetching its data when the viewer actually has access.

Verification:
- `npx tsc --noEmit` in `backend/` and `npm run build` in `frontend/`
  passed.
- PIC restriction: a 9-assertion script against the real dev database
  covered the directory's new `roleTitles` field and every accept/reject
  path on create and update.
- Dashboard: verified against the real dev database/production data with
  three throwaway accounts (super admin, Project Manager, Mechanical
  Engineer), each logged in via the real login form — confirmed each
  profile's role badge, stat tiles, and exactly the expected subset of
  conditional panels rendered with real counts (3 real projects, real
  PM-assigned and Mechanical-Engineer-assigned tasks across them, real
  purchasing/activity data for the admin view). All three temp accounts
  deleted afterward.

Documentation Updated:
`docs/DECISIONS.md` (DEC-037, DEC-038), `tasks/COMPLETED.md` (this
entry).

Notes:
TASK-004's three original acceptance criteria remain open, unrelated to
this entry's work.

## TASK-008

Title:
Operasional menu (Daily Report, Kasbon, Realisasi Kasbon) with itemized
realisasi matching the team's real spreadsheet, plus Excel export

Completed:
2026-09-09

Commit:
(not yet committed — see `git status`)

Result:
- **Operasional menu** (DEC-041): new `/operational` page, accessible to
  everyone except Project Manager. Daily Report tab (free-text per-day
  log). Kasbon tab (submit -> Operational Manager review). Realisasi
  Kasbon tab (itemized settlement reporting). Operational Manager/
  Operational Leader/super admin monitor everyone; everyone else sees
  only their own.
- **Itemized Kasbon redesign** (DEC-042): after the user pointed at the
  team's real spreadsheet (`assets/template/Realisasi Kasbon Rekap/...
  .xlsx`), reshaped Kasbon to match it — added `division`/`period`/
  `phase`, and a new `KasbonItem` line-item model (Reason/Item/Qty/
  Satuan/Link/Purchase Date/Received Date/Harga) that the requester fills
  in during realisasi; `realizationAmount` is now computed from items,
  never manually entered.
- **Excel export**: `GET /api/operational/kasbon/export` generates a
  Vortec-branded two-sheet `.xlsx` (category summary + itemized rows) for
  a chosen month/division, reproducing the original spreadsheet's layout
  with "VORTEC SYSTEM" branding in place of the original's "PT MITRA
  AKSES GLOBALINDO" ("Magnet") header.

Verification:
- `npx tsc --noEmit` in `backend/` and `npm run build` in `frontend/`
  passed at each stage.
- Two end-to-end assertion scripts against the real dev database: 19
  checks on the menu-wide access gate, monitoring visibility, and
  ownership rules; a second pass (after the itemized redesign) covering
  create-with-division/period/phase, item add/remove with a hand-computed
  running total, the requester-only item-edit gate, realize requiring
  ≥1 item, items locking after REALIZED, export's 403 for non-monitors,
  and a real 200 `.xlsx` download with correct content-type and size for
  an Operational Manager account.
- Full live-UI walkthrough across three throwaway accounts (Mechanical
  Engineer, Operational Manager) logged in through the real login form:
  submitted a daily report and kasbon, approved as OM, reported realisasi
  back as the engineer — every screen read back correctly.

Documentation Updated:
`docs/DECISIONS.md` (DEC-041, DEC-042), `tasks/COMPLETED.md` (this
entry).

Notes:
Hit a real, unrelated infrastructure snag while verifying the export
endpoint: Docker Desktop's own engine API returned 500s for several
minutes (`vortec-management-postgres` briefly unreachable, crashing the
backend's Prisma pool twice during this session) — not caused by this
work, resolved on its own once Docker Desktop's engine recovered.

## TASK-009

Title:
Kasbon redesigned into a phase-first workflow (create phase -> itemize
freely -> submit whole phase for OM approval), replacing DEC-042's
request-then-itemize flow and removing the separate Realisasi Kasbon tab

Completed:
2026-09-09

Commit:
(not yet committed — see `git status`)

Result:
- **Schema** (DEC-045, supersedes DEC-042): `Kasbon`/`KasbonStatus`
  replaced by `KasbonPhase` (division/period/phase number,
  `KasbonPhaseStatus` = DRAFT/SUBMITTED/APPROVED/REJECTED, requester +
  reviewer) and `KasbonItem` (reason/item/qty/unit/link/purchaseDate
  required, receivedDate + two evidence photos optional at add-time,
  backfillable later). `total`/`remaining` (vs. the Rp 5,000,000 per-
  phase cap) and each item's `complete` flag are computed on every read.
- **Backend** (`backend/src/routes/operational.ts`): phase CRUD, item
  add/edit/remove with cumulative-cap enforcement, `PATCH .../submit`
  (the single completeness gate — 400s with the incomplete item list
  otherwise), `PATCH .../review` (Operational Manager/super admin,
  per-phase not per-item, REJECTED reopens for revision), and
  `GET .../export` (APPROVED-only, monitor/reviewer-only, two-sheet
  Vortec-branded `.xlsx`, unchanged shape from DEC-042).
- **Frontend**: Operasional page's Kasbon tab rebuilt around phases —
  create-phase form (native month/date pickers), per-phase item table
  with inline "fill in later" controls for missing receivedDate/evidence,
  live total/quota display, phase-number filter, Ajukan Realisasi ->
  OM review -> Download Rekap flow. Realisasi Kasbon tab removed
  entirely (its job folded into the Kasbon tab's per-phase flow).
- Outstanding-phase gate: a user cannot create a new phase while any of
  their own phases is DRAFT/SUBMITTED/REJECTED — only APPROVED clears it,
  per explicit user clarification mid-task.

Verification:
- `npx tsc --noEmit` in both `backend/` and `frontend/`, and
  `npm run build` in `frontend/` — all clean.
- A 34-assertion throwaway script against the live backend covering the
  full lifecycle: create, idempotent re-create, blocked second phase
  while DRAFT, cumulative-cap rejection, required-field rejection,
  non-owner edit block, incomplete-submit rejection with itemized error
  detail, receivedDate/photo backfill, invalid-photo rejection, submit
  success, add-while-SUBMITTED block, non-OM review block, OM reject,
  edit-after-reject, resubmit, still-blocked-while-SUBMITTED, export
  blocked pre-approval, OM approve, new-phase-now-allowed, export
  role/status gating, and a real 200 `.xlsx` download with correct
  content-type and non-trivial size.
- Full live-browser walkthrough through the real login form with two
  throwaway accounts (Mechanical Engineer, Operational Manager):
  created a phase, added an item with received-date and both evidence
  photos deliberately left blank, backfilled all three via the inline
  controls (item flipped Belum Lengkap -> Lengkap), submitted, reviewed
  and approved as the OM, and downloaded the generated `.xlsx` (network
  tab confirmed a 200 response).
- All throwaway accounts, phases, and activity-log rows created during
  verification were deleted afterward; confirmed no `_tmp_*` files or
  leftover test data remained.

Documentation Updated:
`docs/DECISIONS.md` (DEC-045, added; DEC-042 and DEC-043 marked
superseded/partially superseded), `tasks/COMPLETED.md` (this entry).

Notes:
This is a breaking schema replacement, not additive — acceptable only
because no real (non-test) Kasbon data existed yet under the DEC-042
model.

## TASK-010

Title:
Notifications split into Project/Operasional with real approval items;
Kasbon rejection requires a note; Kasbon narrowed to OM/OL; Assets role
split per floor; Activity Log gained an Operasional filter

Completed:
2026-09-09

Commit:
(not yet committed — see `git status`)

Result:
- **Notifications split** (DEC-046): `GET /api/notifications` now
  returns `project`/`operational` domains; task and material-request
  approvals are real notification items (not just a count banner);
  Kasbon phases awaiting review or needing revision surface under
  Operasional. Notifications page gained a tab switcher; the Operasional
  tab is hidden entirely for non-OM/OL users (addendum).
- **Kasbon rejection requires a note, visible to the requester**
  (DEC-047): backend 400s a REJECTED review with no note; "Tolak" is
  disabled client-side until one is typed; the note renders in a
  prominent notice box on the phase and in the requester's notifications.
- **Kasbon narrowed to Operational Manager/Leader** (DEC-048): a new
  path-scoped middleware gates every `/kasbon/*` route to OM/OL/super
  admin; Daily Report keeps its broader access; frontend hides the
  Kasbon tab and skips the API call for everyone else.
- **Assets role split per floor** (DEC-049): the flat "Assets" role
  replaced by 5 floor-scoped roles ("Assets Lantai 1".."5"), each via a
  new `Role.floorId`. A floor-scoped holder can only view/manage that
  floor's asset data (floor structure itself stays visible to everyone,
  since it's shared with the Organization page's building panel);
  OM/OL/super admin keep full access. The 3 real accounts previously on
  the flat role (Wiyanto, Tarmono, Agan) were migrated to their correct
  floor(s) per `assets/template/doc/employees.md`'s "Penanggungjawab
  Barang" column, and the old role was retired.
- **Activity Log Operasional filter**: `DailyReport`/`KasbonPhase`/
  `KasbonItem` entries split out of the generic "crud" filter tab into
  their own "Operasional" tab.
- Minor: Kasbon's "Link (opsional)" item field relabeled "Link/Vendor
  (opsional)".

Verification:
- `npx tsc --noEmit` clean in both projects at every stage; `next build`
  passed repeatedly.
- Notifications: verified live with real accounts (Super Admin, Wiyanto)
  — the Operasional tab correctly showed an approved phase as empty and
  a real REJECTED phase (Wiyanto's) with its actual review note and a
  "1" tab badge.
- Kasbon OM/OL gate: a throwaway 3-account script confirmed a plain
  Mechanical Engineer gets 403 on Kasbon but 200 on Daily Report, while
  Operational Leader/Manager accounts get 200 on Kasbon; a live browser
  check with a throwaway Mechanical-Engineer-only account confirmed the
  Kasbon tab is entirely absent with no console errors.
- Assets floor split: verified against the 3 real accounts plus super
  admin — Tarmono sees all floor structure but only LT1's real assets
  (LT2 redacted to `[]`), can add to LT1 (201) but not LT2 (403); Agan
  can add to LT4 (201); Wiyanto sees LT2/LT5 assets directly and every
  floor via his separate Operational Leader full-access role; super
  admin unrestricted. All throwaway verification assets were deleted
  immediately after.

Documentation Updated:
`docs/DECISIONS.md` (DEC-046, DEC-047, DEC-048, DEC-049 added; DEC-029
addendum for the Activity Log filter), `tasks/COMPLETED.md` (this
entry).

Notes:
The Assets floor-role migration touched real (non-test) data: the old
flat "assets" Role row was deleted after its 3 real `UserRole`/`Employee`
rows were re-created under the correct new floor-scoped roles — verified
non-destructive by checking the old role's row counts before deletion.
