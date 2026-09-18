"use client";

import { useState } from "react";
import type { UseOrgRoles } from "@/hooks/useOrgRoles";
import { usePreferences } from "@/hooks/usePreferences";
import { OrgNode } from "./OrgNode";
import { Button } from "@/components/shared/Button";
import styles from "./OrgChart.module.css";

export function OrgChart({ org, canEdit, canManageMembers }: { org: UseOrgRoles; canEdit: boolean; canManageMembers: boolean }) {
  const { t } = usePreferences();
  const [addingRoot, setAddingRoot] = useState(false);
  const [draft, setDraft] = useState("");
  const roots = org.roles.filter((r) => r.parentId === null);

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>{t("org.chartHint")}</p>

      <div className={styles.scrollWrap}>
        <ul className={styles.rootRow}>
          {roots.map((root) => (
            <OrgNode key={root.id} role={root} allRoles={org.roles} org={org} canEdit={canEdit} canManageMembers={canManageMembers} />
          ))}
        </ul>
      </div>

      {canManageMembers && (
        <div className={styles.addRoot}>
          {addingRoot ? (
            <form
              className={styles.addRootForm}
              onSubmit={(e) => {
                e.preventDefault();
                org.addRole(null, draft);
                setDraft("");
                setAddingRoot(false);
              }}
            >
              <input
                autoFocus
                placeholder={t("org.newTopRolePlaceholder")}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setAddingRoot(false)}
              />
              <Button type="submit">{t("common.add")}</Button>
            </form>
          ) : (
            <Button type="button" onClick={() => setAddingRoot(true)}>
              + {t("org.newTopRole")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
