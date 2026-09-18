"use client";

import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { canEditOrganization, canManageUserRoleAssignments } from "@/lib/auth-api";
import { RoleList } from "@/components/organization/RoleList";
import { BrochureIcon } from "@/components/icons";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";

// DEC-079: /organization/roles is the dedicated home of the RoleList
// (Daftar Role). The route is reachable from the sidebar submenu,
// which already hides the entry for users who can't edit the org
// tree or manage role assignments. We re-check on the page itself
// in case someone lands on the URL directly without the sidebar
// permission.
export default function OrganizationRolesPage() {
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

  if (!canEdit && !canManageMembers) {
    return (
      <EmptyState
        title={t("common.restricted")}
        icon={<BrochureIcon />}
        description={t("common.restrictedHint")}
      />
    );
  }

  return <RoleList org={org} canEdit={canEdit} canManageMembers={canManageMembers} />;
}