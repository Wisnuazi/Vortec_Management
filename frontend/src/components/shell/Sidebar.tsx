"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useNotifications } from "@/hooks/useNotifications";
import { useApprovals } from "@/hooks/useApprovals";
import { useOperational } from "@/hooks/useOperational";
import {
  canViewPurchasing,
  canViewActivityLog,
  canAccessOperational,
  canAccessAssets,
  canAccessInventory,
  canAccessVendors,
  canAccessApprovals,
  canReviewKasbon,
  canAccessKasbon,
} from "@/lib/auth-api";
import styles from "./Sidebar.module.css";
import { ProfileMenu } from "./ProfileMenu";
import logoDark from "../../../public/brand/vortec-logo-full-dark.png";
import type { TranslationKey } from "@/lib/i18n";
import { XIcon } from "@/components/icons";

type NavItem = {
  key: TranslationKey;
  href: string;
  visible?: (u: ReturnType<typeof useAuth>["user"]) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { key: "nav.dashboard", href: "/" },
  { key: "nav.organization", href: "/organization" },
  { key: "nav.projects", href: "/projects" },
  { key: "nav.approvals", href: "/approvals", visible: canAccessApprovals },
  { key: "nav.notifications", href: "/notifications" },
  { key: "nav.assets", href: "/assets", visible: canAccessAssets },
  { key: "nav.inventory", href: "/inventory", visible: canAccessInventory },
  { key: "nav.documentTemplates", href: "/document-templates" },
];

// DEC-079: submenu items nested under /organization. Three
// about/structure/roles entries replace the in-page tab strip
// (DEC-072); Workflow + SOP library entries stay so users still have
// the same surface area in the sidebar that the page used to offer
// as cards.
const ORG_SUBMENU: { key: TranslationKey; href: string; visible?: (u: ReturnType<typeof useAuth>["user"]) => boolean }[] = [
  { key: "org.tabInfo", href: "/organization" },
  { key: "org.tabStructure", href: "/organization/structure" },
  // DEC-079: Daftar Role stays hidden for users who can't edit the org
  // tree or assign roles — same gate that DEC-072 used on the in-page
  // tab. Keeps the sidebar clean for read-only viewers. Mirrors the
  // page-side gate (canEditOrganization || canManageUserRoleAssignments)
  // without requiring the full org tree in the sidebar context.
  {
    key: "org.tabRoles",
    href: "/organization/roles",
    visible: (u) =>
      Boolean(
        u &&
          (u.isSuperAdmin ||
            u.roleTitles.some((t) =>
              ["Director", "Operational Manager", "Operational Leader"].includes(t)
            ))
      ),
  },
  { key: "orgLibrary.workflow.title", href: "/organization/workflow" },
  { key: "orgLibrary.sop.title", href: "/organization/sop" },
];

const SUPER_ADMIN_NAV_ITEMS: { key: TranslationKey; href: string }[] = [
  { key: "nav.users", href: "/admin/users" },
];

// DEC-082: submenu items nested under /approvals. The old in-page
// tab strip (DEC-064) split into three real routes so each section
// has its own URL. Kasbon entry stays hidden for users who can't
// review Kasbon (mirrors the canReviewKasbon gate on the page).
const APPROVALS_SUBMENU: { key: TranslationKey; href: string; visible?: (u: ReturnType<typeof useAuth>["user"]) => boolean }[] = [
  { key: "approvals.tabProject", href: "/approvals" },
  { key: "approvals.tabMaterialRequest", href: "/approvals/material-requests" },
  {
    key: "approvals.tabKasbon",
    href: "/approvals/kasbon",
    visible: (u) => Boolean(u && canReviewKasbon(u)),
  },
];

// DEC-082: /projects submenu. URL-query driven (no real route split)
// because the tab content is large and lives in one shared component.
// Dashboard = no query param; Project List = ?tab=list.
const PROJECTS_SUBMENU: { key: TranslationKey; href: string }[] = [
  { key: "dashboard.tabDashboard", href: "/projects" },
  { key: "dashboard.tabList", href: "/projects?tab=list" },
];

// DEC-082: /operational submenu (Daily Report + Kasbon). Kasbon entry
// hidden for users without operational access.
const OPERATIONAL_SUBMENU: { key: TranslationKey; href: string; visible?: (u: ReturnType<typeof useAuth>["user"]) => boolean }[] = [
  { key: "operational.tabDailyReport", href: "/operational" },
  {
    key: "operational.tabKasbon",
    href: "/operational?tab=kasbon",
    visible: (u) => Boolean(u && canAccessKasbon(u)),
  },
];

// DEC-082: /purchasing submenu. Queue = no query; BOM = ?tab=bom.
const PURCHASING_SUBMENU: { key: TranslationKey; href: string }[] = [
  { key: "purchasing.tabQueue", href: "/purchasing" },
  { key: "purchasing.tabBomQueue", href: "/purchasing?tab=bom" },
];

// DEC-082: /notifications submenu (Project / Operational / BOM).
// Operational entry hidden for users without Kasbon access.
const NOTIFICATIONS_SUBMENU: { key: TranslationKey; href: string; visible?: (u: ReturnType<typeof useAuth>["user"]) => boolean }[] = [
  { key: "notifications.tabProject", href: "/notifications" },
  {
    key: "notifications.tabOperational",
    href: "/notifications?tab=operational",
    visible: (u) => Boolean(u && canAccessKasbon(u)),
  },
  { key: "notifications.tabBom", href: "/notifications?tab=bom" },
];

type SidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = usePreferences();
  const notifications = useNotifications();
  // DEC-082: feed the /approvals parent badge. We pull the same
  // hooks the /approvals page itself uses so the badge always matches
  // the totals the user would see if they drilled into each sub-route.
  const approvals = useApprovals();
  const operational = useOperational();
  const items = [
    ...NAV_ITEMS.filter((i) => !i.visible || i.visible(user)),
    ...(canAccessOperational(user) ? [{ key: "nav.operational" as TranslationKey, href: "/operational" }] : []),
    // DEC-062: top-level BOM nav is gone — the BOM is now a view
    // inside each project. Purchasing access narrows to super admin
    // + Purchasing only; Vendor becomes a top-level item.
    ...(canViewPurchasing(user) ? [{ key: "nav.purchasing" as TranslationKey, href: "/purchasing" }] : []),
    ...(canAccessVendors(user) ? [{ key: "nav.vendors" as TranslationKey, href: "/vendors" }] : []),
    ...(canViewActivityLog(user) ? [{ key: "nav.activityLog" as TranslationKey, href: "/activity-log" }] : []),
    ...(user?.isSuperAdmin ? SUPER_ADMIN_NAV_ITEMS : []),
  ];

  // DEC-069 (UX pass): the /organization parent stays active and its
  // submenu stays visible whenever the user is anywhere inside the
  // org tree (organization, organization/workflow, organization/sop).
  // Previously the submenu was hidden the moment the user left the
  // parent route, which made the nested entries un-discoverable.
  const isOnOrgRoute = pathname?.startsWith("/organization") ?? false;
  const orgItemActive = isOnOrgRoute;

  // DEC-082: same pattern for /approvals — parent + submenu stay
  // active across the whole approvals tree so the user knows which
  // top-level section they're in.
  const isOnApprovalsRoute = pathname?.startsWith("/approvals") ?? false;
  const approvalsItemActive = isOnApprovalsRoute;

  // DEC-082: URL-query submenu gating — the parent nav link is
  // active when the user is on the base path (regardless of ?tab=).
  // Each entry's `active` state checks both pathname + query string
  // so a URL like /navigations?tab=bom highlights the BOM submenu row.
  const searchParamsForActive = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const activeQueryTab = searchParamsForActive?.get("tab") ?? "";
  const isOnProjectsRoute = pathname === "/projects";
  const isOnOperationalRoute = pathname === "/operational";
  const isOnPurchasingRoute = pathname === "/purchasing";
  const isOnNotificationsRoute = pathname === "/notifications";

  const isSubActive = (entry: { href: string }, expectedTab?: string): boolean => {
    // Entries with ?tab=… only match when pathname + tab agree.
    if (entry.href.includes("?")) {
      const [path, qs] = entry.href.split("?");
      if (path !== pathname) return false;
      const entryTab = new URLSearchParams(qs).get("tab") ?? "";
      return entryTab === activeQueryTab;
    }
    // Bare-path entries match when pathname matches AND (if expectedTab
    // is provided) the active query tab is the expected one or empty.
    if (pathname !== entry.href) return false;
    if (expectedTab) return activeQueryTab === "" || activeQueryTab === expectedTab;
    return true;
  };

  // DEC-082: parent /approvals badge = tasks + materialRequests +
  // pending kasbon submissions (only for users who can review Kasbon).
  // Mirrors the per-tab counts that used to live on the in-page strip.
  const approvalsPendingCount =
    approvals.tasks.length +
    approvals.materialRequests.length +
    (canReviewKasbon(user) && operational.hydrated
      ? operational.kasbonPhases.flatMap((p) => p.submissions).filter((s) => s.status === "PENDING").length
      : 0);

  return (
    <aside
      className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ""}`}
      aria-label="Primary navigation"
    >
      <div className={styles.closeRow}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onMobileClose}
          aria-label="Close navigation"
        >
          <XIcon />
        </button>
      </div>

      <div className={styles.brand}>
        <Image src={logoDark} alt="Vortec" height={20} priority />
      </div>

      <nav className={styles.nav}>
        <div className={styles.groupLabel}>Menu</div>
        {items.map((item) => {
          const isOrg = item.href === "/organization";
          const isApprovals = item.href === "/approvals";
          const isProjects = item.href === "/projects";
          const isOperational = item.href === "/operational";
          const isPurchasing = item.href === "/purchasing";
          const isNotifications = item.href === "/notifications";
          // /organization + /approvals stay active across the whole
          // section tree so the user always knows which top-level
          // section they are in. URL-query pages (projects/operational/
          // purchasing/notifications) treat the base path as the
          // active parent regardless of which sub-tab is selected.
        const active = isOrg
            ? orgItemActive
            : isApprovals
              ? approvalsItemActive
              : isProjects
                ? isOnProjectsRoute
                : isOperational
                  ? isOnOperationalRoute
                  : isPurchasing
                    ? isOnPurchasingRoute
                    : isNotifications
                      ? isOnNotificationsRoute
                      : pathname === item.href;
          // Show the parent submenu when the user is anywhere under
          // that section's URL tree.
          const showSubmenu =
            (isOrg && orgItemActive) ||
            (isApprovals && approvalsItemActive) ||
            (isProjects && isOnProjectsRoute) ||
            (isOperational && isOnOperationalRoute) ||
            (isPurchasing && isOnPurchasingRoute) ||
            (isNotifications && isOnNotificationsRoute);
          // Pick the right submenu list for this entry.
          let activeSubmenu: typeof ORG_SUBMENU = [];
          if (isOrg) activeSubmenu = ORG_SUBMENU;
          else if (isApprovals) activeSubmenu = APPROVALS_SUBMENU;
          else if (isProjects) activeSubmenu = PROJECTS_SUBMENU;
          else if (isOperational) activeSubmenu = OPERATIONAL_SUBMENU;
          else if (isPurchasing) activeSubmenu = PURCHASING_SUBMENU;
          else if (isNotifications) activeSubmenu = NOTIFICATIONS_SUBMENU;
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.dot} aria-hidden="true" />
                {t(item.key)}
                {item.href === "/notifications" && notifications.count > 0 && (
                  <span className={styles.navBadge}>{notifications.count}</span>
                )}
                {item.href === "/approvals" && approvalsPendingCount > 0 && (
                  <span className={styles.navBadge}>{approvalsPendingCount}</span>
                )}
              </Link>
              {showSubmenu && (
                <div className={styles.submenu}>
                  {activeSubmenu
                    .filter((sub) => !sub.visible || sub.visible(user))
                    .map((sub) => {
                      const subActive = isSubActive(sub);
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={subActive ? `${styles.submenuLink} ${styles.submenuLinkActive}` : styles.submenuLink}
                          aria-current={subActive ? "page" : undefined}
                        >
                          <span className={styles.submenuDot} aria-hidden="true" />
                          {t(sub.key)}
                        </Link>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={styles.bottomSection}>
        <div className={styles.pending}>{t("nav.pendingHint")}</div>
        <ProfileMenu />
      </div>
    </aside>
  );
}
