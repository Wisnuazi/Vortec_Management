# FRONTEND ARCHITECTURE

## Status
Version: 0.2
Status: INITIAL
Last Updated: 2026-09-07

## Overview
`frontend/` is a Next.js (App Router) application. It renders the app shell
(sidebar, topbar, theme toggle) per the Vortec design system
(`docs/design-system.html`), and the Organization, Assets, Users
(super-admin), and Profile features. It holds no persistence logic itself —
all data comes from the backend REST API. Every page except `/login`
requires an authenticated session (enforced client-side in `AppShell`, and
server-side by the backend on every write).

## Technology Stack
- Framework: Next.js 16 (App Router, Turbopack)
- Language: TypeScript
- UI: React 19, CSS Modules (no component library)
- Runtime: Node.js

## Repository Structure
```text
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout (AuthProvider > PreferencesProvider > AppShell)
│   │   ├── page.tsx             # Dashboard placeholder
│   │   ├── login/                # Standalone login page (no app chrome)
│   │   ├── profile/              # Self-service profile: name, password, theme, language
│   │   ├── organization/         # Organization feature (3 tabs)
│   │   ├── assets/               # Assets feature (flat CRUD table across all floors)
│   │   └── admin/users/          # Super-admin-only user management
│   ├── components/
│   │   ├── shell/                # Sidebar, Topbar, ProfileMenu, ThemeToggle,
│   │   │                          LanguageToggle, AppShell
│   │   ├── organization/         # CompanyInfo, FloorRow, OrgChart, OrgNode, RoleList
│   │   └── icons.tsx              # Shared small inline SVG icons
│   ├── hooks/
│   │   ├── useAuth.tsx            # Session: user, token, login/logout, updateProfile
│   │   ├── usePreferences.tsx     # Theme + locale, synced to the account (see DEC-008)
│   │   ├── useOrgRoles.ts         # Data-fetching hook for the Organization feature
│   │   ├── useFloors.ts           # Data-fetching hook for the Assets feature
│   │   └── useUsers.ts            # Data-fetching hook for /admin/users
│   └── lib/
│       ├── org-types.ts           # Role/Employee shape used by UI components
│       ├── org-api.ts             # fetch() wrapper for /api/roles/*
│       ├── floors-api.ts          # fetch() wrapper for /api/floors/*
│       ├── auth-api.ts            # fetch() wrapper for /api/auth/*, /api/users/*
│       ├── i18n.ts                # Translation dictionary + translate() (see DEC-009)
│       ├── org-seed.ts            # Unused now that data comes from the API
│       └── company-info.ts        # Static draft company profile summary (name/business text)
└── .env.local                     # NEXT_PUBLIC_API_URL
```

## Main Components

### `useAuth` / `AuthProvider`
Responsibility: session state. On mount, restores a token from
`localStorage` and validates it against `GET /api/auth/me`. Exposes `user`,
`token`, `login(identifier, password)`, `logout()`,
`updateProfile({name?, password?})`. Every other data hook (`useOrgRoles`,
`useFloors`, `useUsers`) reads `token` from this via `useAuth()` and sends it
as a bearer token on every request.

### `usePreferences` / `PreferencesProvider`
Responsibility: theme + language. Restores from `localStorage` instantly
(avoids a flash), then — once `useAuth()`'s `user` is known — applies the
account's stored `theme`/`locale`, overwriting local state so a login on a
new device/browser returns to the same preferences (DEC-008). `setTheme`/
`setLocale` update local state + `localStorage` immediately and
best-effort-persist to the account via `PATCH /api/auth/me`. `t(key)` looks
up `lib/i18n.ts`.

### `AppShell`
Responsibility: route guard + chrome. A client component that redirects to
`/login` when there's no authenticated user (and away from `/login` when
there is); renders `/login` without the sidebar/topbar chrome.

### `useOrgRoles` / `useFloors` / `useUsers`
Each follows the same shape: fetch-on-mount (gated on `token` being ready),
expose the data plus mutation functions that call the backend and merge the
returned entity back into local state. `useOrgRoles`'s `deleteRole` and
`useFloors`— via cascading deletes — reload the full list after a delete
instead of patching locally, since the server may have removed more than
one row.

### `components/organization/*`
`CompanyInfo` — company profile (static) + live floor list (`useFloors`),
each floor row (`FloorRow`) click-to-expand showing description + assets.
`OrgChart` / `OrgNode` — tree view (see `ARCHITECTURE.md` for the CSS
connector technique), click-to-expand jobdesk/description, add/rename/delete
role, add/remove employee — all edit affordances hidden when `canEdit` is
false.
`RoleList` — flat list with the same CRUD affordances as `OrgNode`, plus an
"add role" form with a parent-role selector.

`canEdit` (`= user?.isSuperAdmin`) is threaded down as a prop from
`app/organization/page.tsx` through every component in this tree; it is not
re-derived locally anywhere below the page.

## Data Flow
```text
Organization page
  → useOrgRoles() (fetch on mount, once token is available)
  → GET http://localhost:4000/api/roles  (Authorization: Bearer <token>)
  → backend → requireAuth → Prisma → Postgres
  → response mapped from ApiRole (ids on jobdesk/employees) to Role
    (jobdesk as string[]) for the existing UI components
```
The same pattern applies to `useFloors` (→ `/api/floors`) and `useUsers`
(→ `/api/users`, super admin only).

## Interfaces

### Backend API
Base path: `NEXT_PUBLIC_API_URL` (dev default `http://localhost:4000/api`).
Authentication: JWT bearer token, attached by every `lib/*-api.ts` fetch
wrapper when a token is passed in.

## Known Technical Debt
- Mutations are optimistic-on-success only (no rollback UI if a request
  fails); errors are logged to the console (some forms also show a local
  error message, e.g. login, create-user).
- i18n coverage — see DEC-009 for current scope/status.
- No automated tests (unit or e2e) yet; verification has been manual
  (build + browser checks) each session.

## Architecture Constraints
Claude must not change these without explicit architectural review:
- The shape returned by `useOrgRoles()` (`roles`, `hydrated`, and the
  mutation function names/signatures) — `OrgChart`, `OrgNode`, and
  `RoleList` depend on it exactly as-is.
- The shape returned by `useFloors()` — `FloorRow` and `app/assets/page.tsx`
  depend on it.
- `AppShell`'s route-guard behavior (redirect to `/login` when
  unauthenticated) — do not weaken this without an explicit decision.

## Addendum (2026-09-07, later same day)

Added since the structure above was written:
- `app/inventory/` (Material/StockMovement CRUD, same expand-to-see-history
  pattern as `FloorRow`) + `hooks/useMaterials.ts` + `lib/materials-api.ts`.
- `lib/image.ts` (`resizeImageToDataUrl`) — used by the Profile page's photo
  upload, which resizes client-side before sending to the backend (DEC-012).
- The profile/logout control (`ProfileMenu`) now lives in `Sidebar`
  (bottom-left, dropdown opens upward), not `Topbar`. `ThemeToggle` /
  `LanguageToggle` were removed from the sidebar and are only on
  `/profile` now — see DEC-011.

## Addendum 2 (2026-09-07)

- `app/projects/` (Project CRUD + per-project document checklist, same
  expand-to-see-detail pattern as `FloorRow`/`MaterialRow`) +
  `hooks/useProjects.ts` + `lib/projects-api.ts`. Reuses `useUsers()` for the
  PIC (person in charge) selector when creating a project.

## Addendum 3 (2026-09-07)

- `AuthUser.roleId` → `roleIds`/`roleTitles` (arrays); added
  `userHasRoleTitle()` helper in `lib/auth-api.ts`.
- `app/admin/users/RoleMultiSelect.tsx` — multi-select role picker
  (portaled to `document.body` via `createPortal` so its dropdown isn't
  clipped by the table's `overflow-x: auto` container — a real bug caught
  and fixed during verification).
- `hooks/useBasicUsers.ts` (+ `lib/auth-api.ts`'s `basicUsersApi`) — for PIC
  pickers usable by non-super-admins.
- `app/projects/[id]/TaskTable.tsx` — 4th task view (flat sortable-looking
  table), alongside Kanban/Gantt/Timeline.
- `app/projects/[id]/MaterialRequests.tsx` — submit/review/process UI for
  DEC-017's workflow.
- `app/projects/[id]/WorkflowDiagram.tsx` — DEC-018's node-flow status
  visualization.

## Addendum 4 (2026-09-07)

- `Role.coSupervisorIds` (string[]) threaded through `org-types.ts`,
  `org-api.ts`, `useOrgRoles()` (+ new `setCoSupervisors`); displayed as a
  badge in `OrgNode`/`RoleList` and editable via the new
  `components/organization/SupervisorMultiSelect.tsx` (same portaled
  checkbox-list pattern as `admin/users/RoleMultiSelect.tsx`) — see DEC-019.
- `Asset.photoUrl` threaded through `floors-api.ts`/`useFloors()`;
  `app/assets/page.tsx` gained a photo picker (reuses
  `lib/image.ts`'s `resizeImageToDataUrl`, 480px), a photo column, and an
  edit action (`updateAsset` previously had no UI consumer); `FloorRow.tsx`
  shows a read-only thumbnail. `lib/auth-api.ts` gained `canManageAssets()` —
  Assets/Operational Manager/Operational Leader/super admin — now used
  instead of `isSuperAdmin` to gate the Assets menu specifically (floor
  *description* editing is still gated by plain `isSuperAdmin`) — see
  DEC-020.
- `lib/org-seed.ts` (flagged dead code in the previous version of this doc)
  was deleted — confirmed unreferenced anywhere in the app.

## Addendum 5 (2026-09-07)

- Full i18n coverage (DEC-009, extended): every remaining Indonesian-only
  page (Organization, Assets, Admin Users, Inventory, Projects/Tasks/
  Material Requests) now routes its UI chrome through `usePreferences().t()`
  — `i18n.ts` grew from 34 to ~230 keys. `lib/format.ts`'s `formatDate()`
  replaced every hardcoded `toLocaleDateString("id-ID", ...)` call.
  `lib/projects-api.ts`'s `PROJECT_STAGES`/`TASK_STATUSES`/
  `MATERIAL_REQUEST_STATUSES` labels became `{ id, en }` pairs; their
  `*Label()` helpers now take a `locale` argument.
- `Asset.acquiredAt` (nullable date) + a derived, not-stored "age" display
  (`assetAge()` in `app/assets/page.tsx`) — see DEC-021.
- `lib/sort.ts` (`sortRows`/`compareValues`) — shared client-side sort
  utility. Wired into `app/assets/page.tsx`, `app/admin/users/page.tsx`,
  and `app/projects/[id]/TaskTable.tsx` as clickable/toggling column
  headers; into `app/inventory/page.tsx` and `app/projects/page.tsx` as a
  sort-by dropdown + direction toggle (card-list views with no table
  headers) — see DEC-021. Deliberately not added to the org chart tree,
  Kanban board, or Gantt/Timeline views, whose ordering is structural.

## Addendum 6 (2026-09-07)

- New menus, each with its own `lib/*-api.ts` + `hooks/use*.ts` following
  the established fetch-wrapper/reducer-ish-state pattern: `app/purchasing/`
  (+ Vendor sub-tab, DEC-022), `app/approvals/` (DEC-023),
  `app/notifications/` (DEC-024, polls every 60s, sidebar badge count via
  `useNotifications().count`), `app/activity-log/` (DEC-026, polls every
  30s). Visibility helpers added to `lib/auth-api.ts`: `canViewPurchasing`/
  `canManagePurchasing`, `canViewActivityLog`. Approvals/Notifications have
  no visibility gate — content is personalized per-viewer by the backend
  instead (see DEC-023/024 Reason).
- `components/shared/ConfirmDialog.tsx` — portaled "type the name to
  confirm" modal, applied to every cascading delete (Project, Role, User,
  Material) per DEC-025. `OrgNode.tsx`'s previous bespoke inline confirm
  bar was replaced by it.
- `components/icons.tsx` gained `BellIcon` (notifications nav item).
