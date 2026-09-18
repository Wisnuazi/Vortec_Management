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