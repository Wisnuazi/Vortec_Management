"use client";

import Link from "next/link";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { COMPANY_INFO } from "@/lib/company-info";
import {
  canManageAssets,
  canEditOrganization,
  canEditFloorLayout,
} from "@/lib/auth-api";
import { useOrgLibrary } from "@/hooks/useOrgLibrary";
import { useBasicUsers } from "@/hooks/useBasicUsers";
import { CompanyInfo } from "@/components/organization/CompanyInfo";
import {
  ArrowRightIcon,
  ClipboardCheckIcon,
  FlowIcon,
  FolderIcon,
  UsersIcon,
} from "@/components/icons";
import styles from "./page.module.css";

// DEC-079: /organization is now the "Tentang" (About) route only.
// The Struktur + Daftar Role sections moved to dedicated sub-routes
// (/organization/structure, /organization/roles) and the entry points
// live in the Sidebar submenu. This page no longer needs a tab strip
// or a PageHeader — the sidebar submenu + the global Topbar breadcrumb
// (Topbar.tsx → SEGMENT_KEYS) carry the navigation context.
export default function OrganizationAboutPage() {
  const org = useOrgRoles();
  const { user } = useAuth();
  const { t } = usePreferences();
  const library = useOrgLibrary();
  const basicUsers = useBasicUsers();

  const canEdit = canEditOrganization(user, org.roles);
  const canEditAssets = canManageAssets(user);
  const canEditLayout = canEditFloorLayout(user);

  // DEC-081: live stats for the hero. Counts must mirror the surfaces
  // the user can navigate to:
  //   - members = total user accounts (the user explicitly asked for
  //     "jumlah akun atau user saat ini", not just users with roles)
  //   - roles   = org.roles (matches /organization/roles listing)
  //   - workflows / sops = useOrgLibrary (same hook used by
  //     /organization/workflow + /organization/sop, so the hero number
  //     matches the submenu list length exactly)
  const memberCount = basicUsers ? basicUsers.length : null;
  const roleCount = org.hydrated ? org.roles.length : null;
  const workflowCount = library.hydrated ? library.workflows.length : null;
  const sopCount = library.hydrated ? library.sops.length : null;

  return (
    <div className={styles.wrap}>
      {/* === Hero ===========================================================
          DEC-072: Vortec Organization is the company's "About" hub — a
          single screen that introduces who we are and routes the user
          to the Workflow / SOP libraries and the Struktur / Daftar
          Role sub-routes. The Struktur + Daftar Role tabs (formerly
          rendered below this hero) moved into the sidebar submenu
          under DEC-079, so this hero no longer competes with a tab
          strip for the user's attention. */}
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.heroEyebrow}>{t("nav.organization")}</span>
          <h2 className={styles.heroName}>{COMPANY_INFO.name}</h2>
          <p className={styles.heroSummary}>{COMPANY_INFO.summary}</p>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <UsersIcon />
            <strong>{memberCount ?? "—"}</strong>
            <span>{t("org.heroStatsMembers")}</span>
          </div>
          <div className={styles.heroStat}>
            <FolderIcon />
            <strong>{roleCount ?? "—"}</strong>
            <span>{t("org.heroStatsRoles")}</span>
          </div>
          <div className={styles.heroStat}>
            <FlowIcon />
            <strong>{workflowCount ?? "—"}</strong>
            <span>{t("org.heroStatsWorkflows")}</span>
          </div>
          <div className={styles.heroStat}>
            <ClipboardCheckIcon />
            <strong>{sopCount ?? "—"}</strong>
            <span>{t("org.heroStatsSops")}</span>
          </div>
        </div>
      </section>

      {/* === Library tiles — quick links to Workflow + SOP libraries === */}
      <section className={styles.library} aria-label={t("org.libraries")}>
        <Link href="/organization/workflow" className={styles.libraryCard}>
          <span className={styles.libraryIcon}>
            <FlowIcon />
          </span>
          <div className={styles.libraryBody}>
            <h3>{t("org.libraryWorkflows")}</h3>
            <p>{t("org.libraryWorkflowsHint")}</p>
          </div>
          <span className={styles.libraryArrow} aria-hidden="true">
            <ArrowRightIcon />
          </span>
        </Link>
        <Link href="/organization/sop" className={styles.libraryCard}>
          <span className={styles.libraryIcon}>
            <ClipboardCheckIcon />
          </span>
          <div className={styles.libraryBody}>
            <h3>{t("org.librarySops")}</h3>
            <p>{t("org.librarySopsHint")}</p>
          </div>
          <span className={styles.libraryArrow} aria-hidden="true">
            <ArrowRightIcon />
          </span>
        </Link>
      </section>

      {/* === Building layout kept from previous Info tab ============= */}
      <CompanyInfo canEdit={canEdit} canEditAssets={canEditAssets} canEditFloorLayout={canEditLayout} />
    </div>
  );
}