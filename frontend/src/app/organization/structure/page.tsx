"use client";

import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { canEditOrganization, canManageUserRoleAssignments } from "@/lib/auth-api";
import { OrgChart } from "@/components/organization/OrgChart";
import { Skeleton } from "@/components/shared/Skeleton";

// DEC-079: /organization/structure is the dedicated home of the
// OrgChart. The route is reachable from the sidebar submenu
// ("Struktur Organisasi") which replaces the in-page tab strip
// (DEC-072). No PageHeader — the sidebar + Topbar breadcrumb
// already carry the navigation context.
export default function OrganizationStructurePage() {
  const org = useOrgRoles();
  const { user } = useAuth();
  const { t } = usePreferences();

  const canEdit = canEditOrganization(user, org.roles);
  const canManageMembers = canManageUserRoleAssignments(user);

  if (!org.hydrated) {
    return (
      <div role="status" aria-label={t("org.loading")}>
        <Skeleton variant="heading" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="row" />
        ))}
      </div>
    );
  }

  return <OrgChart org={org} canEdit={canEdit} canManageMembers={canManageMembers} />;
}