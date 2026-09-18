"use client";

import { usePathname } from "next/navigation";
import { usePreferences } from "@/hooks/usePreferences";
import type { TranslationKey } from "@/lib/i18n";
import { OnlineUsersIndicator } from "./OnlineUsersIndicator";
import styles from "./Topbar.module.css";

// DEC-072: route → breadcrumb segment. Only the first path segment maps
// to a translation key; deeper paths fall back to a slugified label so
// the breadcrumb never says "Dashboard" on a non-dashboard page (the
// previous version hardcoded Dashboard everywhere).
const SEGMENT_KEYS: { match: string; key: TranslationKey }[] = [
  { match: "/", key: "nav.dashboard" },
  // DEC-079: longest-prefix match wins, so the sub-routes declared
  // here must come BEFORE the generic `/organization` entry.
  { match: "/organization/workflow", key: "orgLibrary.workflow.title" },
  { match: "/organization/sop", key: "orgLibrary.sop.title" },
  { match: "/organization/role", key: "roleDetail.title" },
  { match: "/organization/structure", key: "org.tabStructure" },
  { match: "/organization/roles", key: "org.tabRoles" },
  { match: "/organization", key: "nav.organization" },
  { match: "/projects", key: "nav.projects" },
  // DEC-082: longest-prefix match wins, so the approvals sub-routes
  // declared here must come BEFORE the generic `/approvals` entry.
  { match: "/approvals/material-requests", key: "approvals.tabMaterialRequest" },
  { match: "/approvals/kasbon", key: "approvals.tabKasbon" },
  { match: "/approvals", key: "nav.approvals" },
  { match: "/notifications", key: "nav.notifications" },
  { match: "/assets", key: "nav.assets" },
  { match: "/inventory", key: "nav.inventory" },
  { match: "/document-templates", key: "nav.documentTemplates" },
  { match: "/purchasing", key: "nav.purchasing" },
  { match: "/vendors", key: "nav.vendors" },
  { match: "/activity-log", key: "nav.activityLog" },
  { match: "/operational", key: "nav.operational" },
  { match: "/admin/users", key: "nav.users" },
  { match: "/profile", key: "profile.title" },
  { match: "/bom", key: "nav.bom" },
];

function breadcrumbLabel(pathname: string | null): string {
  if (!pathname) return "";
  // Find the most specific (longest) matching prefix.
  const match = SEGMENT_KEYS.filter((s) => s.match !== "/" && pathname.startsWith(s.match))
    .sort((a, b) => b.match.length - a.match.length)[0];
  if (match) return match.key;
  // Root is handled separately.
  if (pathname === "/") return "nav.dashboard";
  return "";
}

export function Topbar() {
  const { t } = usePreferences();
  const pathname = usePathname();
  const labelKey = breadcrumbLabel(pathname);
  const label = labelKey ? t(labelKey as TranslationKey) : "";

  return (
    <header className={styles.topbar}>
      <div className={styles.path}>
        Vortec Management <span>/</span> <b>{label}</b>
      </div>
      {/* DEC-077: global "online sekarang" indicator (Google Sheets /
         Figma / Miro pattern). Lifted out of /activity-log so it follows
         the user across every page. */}
      <OnlineUsersIndicator />
    </header>
  );
}
