"use client";

import { useState, type MouseEvent } from "react";
import type { Role } from "@/lib/org-types";
import type { UseOrgRoles } from "@/hooks/useOrgRoles";
import { useBasicUsers } from "@/hooks/useBasicUsers";
import { UserPlusIcon, NodePlusIcon, TrashIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import styles from "./OrgNode.module.css";

function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// DEC-064: member add/remove (assigning a User to a Role via UserRole)
// is gated separately from the org-structure tree edits (rename role,
// add child, delete role). Member management is super admin + Director + OM only.
export function OrgNode({
  role,
  allRoles,
  org,
  canEdit,
  canManageMembers,
}: {
  role: Role;
  allRoles: Role[];
  org: UseOrgRoles;
  canEdit: boolean;
  canManageMembers: boolean;
}) {
  const { user } = useAuth();
  const { t } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(role.title);
  const [addingMember, setAddingMember] = useState(false);
  const [memberDraft, setMemberDraft] = useState("");
  const [addingChild, setAddingChild] = useState(false);
  const [childDraft, setChildDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const allUsers = useBasicUsers();
  const children = allRoles.filter((r) => r.parentId === role.id);
  const coSupervisors = allRoles.filter((r) => role.coSupervisorIds.includes(r.id));
  const coSupervises = allRoles.filter((r) => r.coSupervisorIds.includes(role.id));
  // Same picker pattern as RoleList: filter to users who aren't
  // already in this role (DEC-059: members are real User accounts,
  // so picking a user adds a UserRole row, not a free-text name).
  const memberIds = new Set(role.employees.map((e) => e.id));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  const commitTitle = () => {
    org.renameRole(role.id, titleDraft);
    setEditingTitle(false);
  };

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <li className={styles.node}>
      <div
        className={expanded ? `${styles.card} ${styles.cardExpanded}` : styles.card}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={styles.head}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(role.title)}
          </span>

          <div className={styles.titleWrap}>
            {editingTitle ? (
              <input
                className={styles.titleInput}
                value={titleDraft}
                autoFocus
                onClick={stop}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") {
                    setTitleDraft(role.title);
                    setEditingTitle(false);
                  }
                }}
              />
            ) : canEdit ? (
              <button
                type="button"
                className={styles.titleBtn}
                onClick={(e) => {
                  stop(e);
                  setEditingTitle(true);
                }}
                title={t("org.clickToRename")}
              >
                {role.title}
              </button>
            ) : (
              <span className={styles.titleBtn}>{role.title}</span>
            )}
          </div>

          <span
            className={expanded ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>

        {expanded && (
          <div className={styles.detail} onClick={stop}>
            <div>
              <span className={styles.detailLabel}>{t("org.jobdesk")}</span>
              {role.jobdesk.length === 0 ? (
                <p className={styles.emptyHint}>{t("org.noJobdesk")}</p>
              ) : (
                <ul className={styles.detailJobdesk}>
                  {role.jobdesk.map((item, i) => (
                    <li key={item.id} className={styles.detailJobdeskItem}>
                      {item.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <span className={styles.detailLabel}>{t("org.summary")}</span>
              {role.jobDescription ? (
                <p className={styles.detailDescription}>{role.jobDescription}</p>
              ) : (
                <p className={styles.emptyHint}>{t("org.noJobDescription")}</p>
              )}
            </div>
            {role.floorLabel && (
              <div>
                <span className={styles.detailLabel}>{t("org.floorScope")}</span>
                <p className={styles.detailDescription}>{role.floorLabel}</p>
              </div>
            )}
            {(coSupervisors.length > 0 || coSupervises.length > 0) && (
              <div>
                <span className={styles.detailLabel}>{t("org.dualSupervision")}</span>
                {coSupervisors.length > 0 && (
                  <p className={styles.detailDescription}>
                    + {t("org.coordinatedBy")}: {coSupervisors.map((r) => r.title).join(", ")}
                  </p>
                )}
                {coSupervises.length > 0 && (
                  <p className={styles.detailDescription}>
                    {t("org.alsoCoordinates")}: {coSupervises.map((r) => r.title).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className={styles.employees} onClick={stop}>
          {role.employees.length === 0 && !addingMember && (
            <span className={styles.emptyHint}>{t("org.noMembers")}</span>
          )}
          {role.employees.map((emp) => (
            <span key={emp.id} className={styles.chip}>
              {emp.name}
              {canManageMembers && (
                <button
                  type="button"
                  aria-label={`${t("org.removeMember")} ${emp.name}`}
                  onClick={() => {
                    if (window.confirm(`${t("org.confirmRemoveMember")} "${emp.name}" ${t("org.from")} ${role.title}?`)) {
                      org.removeMember(role.id, emp.id);
                    }
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>

        {canManageMembers && addingMember ? (
          <form
            className={styles.inlineForm}
            onClick={stop}
            onSubmit={(e) => {
              e.preventDefault();
              if (memberDraft) {
                org.addMember(role.id, memberDraft);
                setMemberDraft("");
                setAddingMember(false);
              }
            }}
          >
            <select
              autoFocus
              value={memberDraft}
              onChange={(e) => setMemberDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAddingMember(false)}
            >
              <option value="">— {t("org.pickUser")} —</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!memberDraft}>
              {t("common.add")}
            </button>
          </form>
        ) : null}

        {canEdit && addingChild ? (
          <form
            className={styles.inlineForm}
            onClick={stop}
            onSubmit={(e) => {
              e.preventDefault();
              org.addRole(role.id, childDraft);
              setChildDraft("");
              setAddingChild(false);
            }}
          >
            <input
              autoFocus
              placeholder={t("org.newRolePlaceholder")}
              value={childDraft}
              onChange={(e) => setChildDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAddingChild(false)}
            />
            <button type="submit">{t("common.add")}</button>
          </form>
        ) : null}

        {canEdit && (
          <div className={styles.actions} onClick={stop}>
            <button
              type="button"
              className={styles.iconOnlyBtn}
              title={t("org.addMember")}
              aria-label={t("org.addMember")}
              onClick={() => setAddingMember((v) => !v)}
            >
              <UserPlusIcon />
            </button>
            <button
              type="button"
              className={styles.iconOnlyBtn}
              title={t("org.addChildRole")}
              aria-label={t("org.addChildRole")}
              onClick={() => setAddingChild((v) => !v)}
            >
              <NodePlusIcon />
            </button>
            <button
              type="button"
              className={`${styles.iconOnlyBtn} ${styles.iconOnlyBtnDanger}`}
              title={t("org.deleteRole")}
              aria-label={t("org.deleteRole")}
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon />
            </button>
          </div>
        )}
        {confirmingDelete && (
          <ConfirmDialog
            title={t("org.deleteRole")}
            message={t("org.confirmDeleteRole")}
            confirmText={role.title}
            confirmLabel={t("org.deleteRole")}
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={() => {
              setConfirmingDelete(false);
              org.deleteRole(role.id);
            }}
          />
        )}
      </div>

      {children.length > 0 && (
        <ul className={styles.branches}>
          {children.map((child) => (
            <OrgNode key={child.id} role={child} allRoles={allRoles} org={org} canEdit={canEdit} canManageMembers={canManageMembers} />
          ))}
        </ul>
      )}
    </li>
  );
}
