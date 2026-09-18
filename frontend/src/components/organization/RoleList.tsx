"use client";

import { useState } from "react";
import Link from "next/link";
import type { Role } from "@/lib/org-types";
import type { UseOrgRoles } from "@/hooks/useOrgRoles";
import { useBasicUsers } from "@/hooks/useBasicUsers";
import { TrashIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { usePreferences } from "@/hooks/usePreferences";
import { SupervisorMultiSelect } from "./SupervisorMultiSelect";
import styles from "./RoleList.module.css";

function orderDepthFirst(roles: Role[]): Role[] {
  const byParent = new Map<string | null, Role[]>();
  for (const r of roles) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  const out: Role[] = [];
  const visit = (parentId: string | null) => {
    for (const r of byParent.get(parentId) ?? []) {
      out.push(r);
      visit(r.id);
    }
  };
  visit(null);
  return out;
}

function RoleCard({
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
  const { t } = usePreferences();
  const allUsers = useBasicUsers();
  const [jobdeskDraft, setJobdeskDraft] = useState("");
  const [addingJobdesk, setAddingJobdesk] = useState(false);
  const [editingJobdeskId, setEditingJobdeskId] = useState<string | null>(null);
  const [editingJobdeskText, setEditingJobdeskText] = useState("");
  const [descDraft, setDescDraft] = useState(role.jobDescription);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(role.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [memberDraft, setMemberDraft] = useState("");
  const [confirmingRemoveMember, setConfirmingRemoveMember] = useState<string | null>(null);

  const parent = allRoles.find((r) => r.id === role.parentId);
  const coSupervisors = allRoles.filter((r) => role.coSupervisorIds.includes(r.id));
  // Filter the user picker to only show users who aren't already in
  // this role — re-adding is a no-op server-side but the UX is
  // cleaner when the option isn't there to pick.
  const memberIds = new Set(role.employees.map((e) => e.id));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  const commitTitle = () => {
    org.renameRole(role.id, titleDraft);
    setEditingTitle(false);
  };

  const addMember = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!memberDraft) return;
    org.addMember(role.id, memberDraft);
    setMemberDraft("");
  };

  const removeMember = (userId: string) => {
    org.removeMember(role.id, userId);
    setConfirmingRemoveMember(null);
  };

  const startEditJobdesk = (id: string, text: string) => {
    setEditingJobdeskId(id);
    setEditingJobdeskText(text);
  };

  const commitJobdesk = () => {
    if (!editingJobdeskId) return;
    org.updateJobdeskItem(role.id, editingJobdeskId, editingJobdeskText);
    setEditingJobdeskId(null);
    setEditingJobdeskText("");
  };

  const cancelEditJobdesk = () => {
    setEditingJobdeskId(null);
    setEditingJobdeskText("");
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.headTitle}>
          {editingTitle ? (
            <input
              className={styles.titleInput}
              value={titleDraft}
              autoFocus
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
              onClick={() => setEditingTitle(true)}
              title={t("org.clickToRename")}
            >
              {role.title}
            </button>
          ) : (
            <h3 className={styles.titleBtn}>{role.title}</h3>
          )}
          {parent && (
            <span className={styles.parentHint}>
              {t("org.under")} {parent.title}
            </span>
          )}
          {coSupervisors.length > 0 && (
            <span className={styles.supervisionHint}>
              + {t("org.coordinatedBy")}: {coSupervisors.map((r) => r.title).join(", ")}
            </span>
          )}
          {role.floorLabel && <span className={styles.floorHint}>{role.floorLabel}</span>}
        </div>
        <Link
          href={`/organization/role/${role.id}`}
          className={styles.detailLink}
          title={t("roleDetail.title")}
        >
          {t("roleDetail.viewDetail")} →
        </Link>
        {canEdit && (
          <button
            type="button"
            className={styles.deleteBtn}
            title={t("org.deleteRole")}
            aria-label={`${t("org.deleteRole")} ${role.title}`}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon />
          </button>
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

      {/* Members — list of real User accounts in this role (via
          UserRole). Adding a member inserts a UserRole row, which
          auth reads on the next request, so the user's role list and
          permission set update immediately. Removing deletes the
          UserRole row. Free-text name input was removed in DEC-059
          because it produced duplicate, unsynced state with the
          user's actual role list. */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t("org.members")}</span>
        {role.employees.length === 0 && !canManageMembers && (
          <span className={styles.emptyHint}>{t("org.noMembers")}</span>
        )}
        {role.employees.length > 0 && (
          <ul className={styles.memberList}>
            {role.employees.map((m) => (
              <li key={m.id} className={styles.memberChip}>
                <span>{m.name}</span>
                {canManageMembers && (
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`${t("org.removeMember")} ${m.name}`}
                    onClick={() => setConfirmingRemoveMember(m.id)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManageMembers && (
          <form className={styles.inlineForm} onSubmit={addMember}>
            <select
              className={styles.memberSelect}
              value={memberDraft}
              onChange={(e) => setMemberDraft(e.target.value)}
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
        )}
        {confirmingRemoveMember && (
          <ConfirmDialog
            title={t("org.removeMember")}
            message={t("org.confirmRemoveMember")}
            confirmText={t("org.removeMember")}
            confirmLabel={t("org.removeMember")}
            onCancel={() => setConfirmingRemoveMember(null)}
            onConfirm={() => removeMember(confirmingRemoveMember)}
          />
        )}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t("org.jobdesk")}</span>
        {role.jobdesk.length === 0 && !addingJobdesk && (
          <span className={styles.emptyHint}>{t("org.noJobdesk")}</span>
        )}
        {role.jobdesk.length > 0 && (
          <ul className={styles.jobdeskList}>
            {role.jobdesk.map((item, i) => {
              const isEditing = editingJobdeskId === item.id;
              return (
                <li key={item.id} className={styles.jobdeskItem}>
                  {isEditing ? (
                    <form
                      className={styles.jobdeskEditForm}
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitJobdesk();
                      }}
                    >
                      <input
                        autoFocus
                        className={styles.jobdeskEditInput}
                        value={editingJobdeskText}
                        onChange={(e) => setEditingJobdeskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelEditJobdesk();
                        }}
                      />
                      <button type="submit" className={styles.jobdeskEditSave}>
                        {t("common.save")}
                      </button>
                      <button type="button" onClick={cancelEditJobdesk}>
                        {t("common.cancel")}
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className={styles.jobdeskText}>{item.text}</span>
                      {canEdit && (
                        <span className={styles.jobdeskActions}>
                          <button
                            type="button"
                            className={styles.jobdeskAction}
                            title={t("org.editJobdesk")}
                            onClick={() => startEditJobdesk(item.id, item.text)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className={styles.jobdeskActionDanger}
                            title={t("org.removeJobdesk")}
                            onClick={() => {
                              if (window.confirm(`${t("org.confirmRemoveJobdesk")} "${item.text}"?`)) {
                                org.removeJobdeskItem(role.id, i);
                              }
                            }}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit &&
          (addingJobdesk ? (
            <form
              className={styles.inlineForm}
              onSubmit={(e) => {
                e.preventDefault();
                org.addJobdeskItem(role.id, jobdeskDraft);
                setJobdeskDraft("");
                setAddingJobdesk(false);
              }}
            >
              <input
                autoFocus
                placeholder={t("org.jobdeskPlaceholder")}
                value={jobdeskDraft}
                onChange={(e) => setJobdeskDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setAddingJobdesk(false)}
              />
              <button type="submit">{t("common.add")}</button>
            </form>
          ) : (
            <div className={styles.inlineForm}>
              <button type="button" onClick={() => setAddingJobdesk(true)}>
                + {t("org.addJobdesk")}
              </button>
            </div>
          ))}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t("org.summary")}</span>
        {canEdit ? (
          <textarea
            className={styles.textarea}
            placeholder={t("org.jobDescriptionPlaceholder")}
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => org.updateJobDescription(role.id, descDraft)}
          />
        ) : role.jobDescription ? (
          <p className={styles.readOnlyDescription}>{role.jobDescription}</p>
        ) : (
          <span className={styles.emptyHint}>{t("org.noJobDescription")}</span>
        )}
      </div>

      {canEdit && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>{t("org.additionalSupervisors")}</span>
          <SupervisorMultiSelect
            options={allRoles.filter((r) => r.id !== role.id)}
            selectedIds={role.coSupervisorIds}
            onChange={(ids) => org.setCoSupervisors(role.id, ids)}
            placeholder={`— ${t("org.noAdditionalSupervisors")} —`}
          />
        </div>
      )}
    </div>
  );
}

function AddRoleForm({ org }: { org: UseOrgRoles }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const ordered = orderDepthFirst(org.roles);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("org.newRole")}
      </Button>
    );
  }

  return (
    <form
      className={styles.addRoleForm}
      onSubmit={(e) => {
        e.preventDefault();
        org.addRole(parentId || null, title);
        setTitle("");
        setParentId("");
        setOpen(false);
      }}
    >
      <input
        autoFocus
        placeholder={t("org.newRolePlaceholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">— {t("org.topRole")} —</option>
        {ordered.map((r) => (
          <option key={r.id} value={r.id}>
            {t("org.under")} {r.title}
          </option>
        ))}
      </select>
      <Button type="submit">{t("common.add")}</Button>
      <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
        {t("common.cancel")}
      </Button>
    </form>
  );
}

export function RoleList({ org, canEdit, canManageMembers }: { org: UseOrgRoles; canEdit: boolean; canManageMembers: boolean }) {
  const { t } = usePreferences();
  const ordered = orderDepthFirst(org.roles);

  return (
    <div className={styles.wrap}>
      {canEdit && <AddRoleForm org={org} />}

      {ordered.length === 0 ? (
        <p className={styles.emptyHint}>{t("org.noRoles")}</p>
      ) : (
        <div className={styles.list}>
          {ordered.map((role) => (
            <RoleCard key={role.id} role={role} allRoles={org.roles} org={org} canEdit={canEdit} canManageMembers={canManageMembers} />
          ))}
        </div>
      )}
    </div>
  );
}
