"use client";

import { useEffect, useState } from "react";
import {
  TASK_STATUSES,
  PROJECT_STAGES,
  stageLabel,
  canActOnTask,
  taskStatusLabel,
  type ApiTask,
  type ProjectStage,
  type TaskStatus,
} from "@/lib/projects-api";
import { usePreferences } from "@/hooks/usePreferences";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useToast } from "@/components/shared/Toast";
import { MultiSelect, type MultiSelectOption } from "@/components/shared/MultiSelect";
import { formatDate, formatDateTime } from "@/lib/format";
import { TrashIcon, XIcon } from "@/components/icons";
import { TaskNoteEditor } from "./TaskNoteEditor";
import { SubtaskList } from "./SubtaskList";
import { AttachmentList } from "./AttachmentList";
import type { UseProjects } from "@/hooks/useProjects";
import styles from "./TaskDrawer.module.css";

type TaskDrawerProps = {
  task: ApiTask | null;
  projectId: string;
  currentUser: { id: string; isSuperAdmin: boolean; roleIds: string[] } | null;
  canManage: boolean; // canManageProjectTasks — structural edits
  projects: UseProjects;
  onClose: () => void;
  onDelete?: (taskId: string) => void;
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DD in local time (date input is timezone-naive).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  // Treat the date input as a local calendar day at 00:00; the server
  // stores DateTime in UTC. We send ISO with local offset so the
  // calendar day is preserved.
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function TaskDrawer({
  task,
  projectId,
  currentUser,
  canManage,
  projects,
  onClose,
  onDelete,
}: TaskDrawerProps) {
  const { t, locale } = usePreferences();
  const org = useOrgRoles();
  const toast = useToast();
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const open = task !== null;
  const editable = task ? canActOnTask(currentUser, task) : false;
  const canEditStructure = task ? canManage : false;
  const canAct = editable || canEditStructure;

  // Sync local drafts whenever a different task is opened.
  useEffect(() => {
    if (!task) return;
    setTitleDraft(task.title);
    setDescriptionDraft(task.description);
    setDescOpen(Boolean(task.description));
  }, [task?.id, task?.title, task?.description]);

  // Esc to close + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !task) return null;

  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === task.title) {
      setTitleDraft(task.title);
      return;
    }
    setTitleSaving(true);
    try {
      await projects.updateTask(projectId, task.id, { title: next });
    } finally {
      setTitleSaving(false);
    }
  };

  const saveDescription = async () => {
    const next = descriptionDraft.trim();
    if (next === task.description) return;
    setDescriptionSaving(true);
    try {
      await projects.updateTask(projectId, task.id, { description: next });
    } finally {
      setDescriptionSaving(false);
    }
  };

  const onStatusChange = async (status: TaskStatus) => {
    if (status === task.status) return;
    try {
      await projects.updateTask(projectId, task.id, { status });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengubah status task.";
      toast.error(message);
    }
  };

  const onAssignedRolesChange = async (roleIds: string[]) => {
    // DEC-064: multi-role — store null when empty so backend treats "no
    // assignment" as "task is currently unassigned", not as a stale id list.
    try {
      await projects.updateTask(
        projectId,
        task.id,
        { assignedRoleIds: roleIds.length === 0 ? null : roleIds }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengubah assignment task.";
      toast.error(message);
    }
  };

  const onStartDateChange = async (value: string) => {
    try {
      await projects.updateTask(projectId, task.id, { startDate: dateInputToIso(value) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengubah tanggal mulai.";
      toast.error(message);
    }
  };

  const onDueDateChange = async (value: string) => {
    try {
      await projects.updateTask(projectId, task.id, { dueDate: dateInputToIso(value) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengubah due date.";
      toast.error(message);
    }
  };

  const onDeleteClick = () => {
    if (!onDelete) return;
    if (window.confirm(t("tasks.confirmDelete"))) {
      onDelete(task.id);
      onClose();
    }
  };

  const subtaskDone = task.subtasks.filter((s) => s.done).length;
  const subtaskTotal = task.subtasks.length;
  const subtaskPct = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;

  return (
    <div
      className={styles.scrim}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
      >
        <header className={styles.header}>
          <div className={styles.statusBar}>
            <select
              className={styles.statusPill}
              value={task.status}
              onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
              disabled={!canAct}
              aria-label={t("tasks.status")}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label[locale]}
                </option>
              ))}
            </select>
            <span className={styles.headerMeta}>
              #{task.id.slice(-6)}
            </span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <XIcon />
          </button>
        </header>

        <div className={styles.body}>
          <input
            id="task-drawer-title"
            className={styles.titleInput}
            value={titleDraft}
            disabled={!canEditStructure}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={t("tasks.titlePlaceholder")}
            aria-label={t("tasks.title")}
          />
          {titleSaving && <span className={styles.savingHint}>{t("common.saving")}</span>}

          <section className={styles.fieldsRow}>
            <FieldRow label={t("tasks.assignedRole")}>
              {canEditStructure ? (
                <MultiSelect
                  options={org.roles.map((r): MultiSelectOption => ({ value: r.id, label: r.title }))}
                  value={task.assignedRoleIds ?? []}
                  onChange={onAssignedRolesChange}
                  placeholder={t("tasks.unassignedRole")}
                  ariaLabel={t("tasks.assignedRole")}
                  searchThreshold={6}
                />
              ) : (
                <span className={styles.fieldReadonly}>
                  {task.assignedRoleTitles?.join(", ") || "—"}
                </span>
              )}
            </FieldRow>

            <FieldRow label={t("tasks.workflowStage")}>
              {canEditStructure ? (
                <select
                  className={styles.fieldInput}
                  value={task.stage ?? ""}
                  onChange={async (e) => {
                    const next = e.target.value as ProjectStage | "";
                    if (!next) return;
                    try {
                      await projects.updateTask(projectId, task.id, { stage: next });
                    } catch (err) {
                      const message = err instanceof Error ? err.message : "Gagal mengubah stage.";
                      toast.error(message);
                    }
                  }}
                >
                  <option value="" disabled>— {t("common.notSet")} —</option>
                  {PROJECT_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label[locale]}
                    </option>
                  ))}
                </select>
              ) : task.stage ? (
                <span className={styles.fieldReadonly}>{stageLabel(task.stage, locale)}</span>
              ) : (
                <span className={styles.fieldReadonly}>—</span>
              )}
            </FieldRow>

            <FieldRow label={t("tasks.start")}>
              {canEditStructure ? (
                <input
                  type="date"
                  className={styles.fieldInput}
                  value={toDateInput(task.startDate)}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              ) : (
                <span className={styles.fieldReadonly}>
                  {task.startDate ? formatDate(task.startDate, locale) : "—"}
                </span>
              )}
            </FieldRow>

            <FieldRow label={t("tasks.due")}>
              {canEditStructure ? (
                <input
                  type="date"
                  className={styles.fieldInput}
                  value={toDateInput(task.dueDate)}
                  onChange={(e) => onDueDateChange(e.target.value)}
                />
              ) : (
                <span className={styles.fieldReadonly}>
                  {task.dueDate ? formatDate(task.dueDate, locale) : "—"}
                </span>
              )}
            </FieldRow>
          </section>

          {task.requiresApproval && (
            <div className={styles.approvalBox}>
              <div className={styles.approvalHead}>
                {t("tasks.requiresApproval")}
              </div>
              {task.approvedByUserName && (task.status === "DONE" || task.status === "REJECTED") ? (
                <div className={styles.approvalDetail}>
                  {task.status === "DONE" ? t("tasks.approved") : t("tasks.rejectedByLabel")}{" "}
                  {t("tasks.by")} <strong>{task.approvedByUserName}</strong>
                  {task.approvedAt && (
                    <span className={styles.approvalDate}>
                      {" · "}
                      {formatDateTime(task.approvedAt, locale)}
                    </span>
                  )}
                </div>
              ) : (
                <div className={styles.approvalHint}>
                  {t("tasks.approvalHint")}
                </div>
              )}
            </div>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <button
                type="button"
                className={styles.sectionToggle}
                onClick={() => setDescOpen((v) => !v)}
                aria-expanded={descOpen}
              >
                <span className={styles.caret} data-open={descOpen}>▶</span>
                {t("tasks.description")}
              </button>
            </div>
            {descOpen && (
              <div className={styles.sectionBody}>
                <textarea
                  className={styles.descriptionArea}
                  value={descriptionDraft}
                  disabled={!canEditStructure}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onBlur={saveDescription}
                  rows={5}
                  placeholder={t("tasks.descriptionPlaceholder")}
                  aria-label={t("tasks.description")}
                />
                {descriptionSaving && (
                  <span className={styles.savingHint}>{t("common.saving")}</span>
                )}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>{t("tasks.notes")}</span>
            </div>
            <div className={styles.sectionBody}>
              <TaskNoteEditor
                note={task.note}
                canEdit={canAct}
                multiline
                onSave={(next) => projects.updateTask(projectId, task.id, { note: next })}
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>{t("tasks.subtasks")}</span>
              {subtaskTotal > 0 && (
                <span className={styles.progressChip}>
                  {subtaskDone}/{subtaskTotal}
                </span>
              )}
            </div>
            {subtaskTotal > 0 && (
              <div
                className={styles.progressBar}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={subtaskPct}
              >
                <div
                  className={styles.progressFill}
                  data-complete={subtaskDone === subtaskTotal}
                  style={{ width: `${subtaskPct}%` }}
                />
              </div>
            )}
            <div className={styles.sectionBody}>
              <SubtaskList
                subtasks={task.subtasks}
                canEdit={canAct}
                onAdd={(title) => projects.addSubtask(projectId, task.id, title)}
                onToggle={(subtaskId, done) =>
                  projects.updateSubtask(projectId, task.id, subtaskId, { done })
                }
                onRemove={(subtaskId) => projects.removeSubtask(projectId, task.id, subtaskId)}
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionTitle}>{t("tasks.attachments")}</span>
              <span className={styles.progressChip}>{task.attachments.length}</span>
            </div>
            <div className={styles.sectionBody}>
              <AttachmentList
                attachments={task.attachments}
                canEdit={canAct}
                uploadUrl={`/api/projects/${projectId}/tasks/${task.id}/attachments/upload`}
                replaceUrl={(attachmentId) => `/api/projects/${projectId}/tasks/${task.id}/attachments/${attachmentId}/replace`}
                onUpload={(data) => projects.addTaskAttachment(projectId, task.id, data)}
                onUploaded={() => projects.refreshProject(projectId)}
                onUpdate={(attachmentId, data) =>
                  projects.updateTaskAttachment(projectId, task.id, attachmentId, data)
                }
                onRemove={(attachmentId) =>
                  projects.removeTaskAttachment(projectId, task.id, attachmentId)
                }
              />
            </div>
          </section>

          <section className={styles.metaSection}>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>{t("tasks.createdAt")}</span>
              <span className={styles.metaValue}>{formatDateTime(task.createdAt, locale)}</span>
            </div>
            {task.completedAt && (
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>{t("tasks.completedAt")}</span>
                <span className={styles.metaValue}>{formatDateTime(task.completedAt, locale)}</span>
              </div>
            )}
          </section>
        </div>

        {onDelete && canEditStructure && (
          <footer className={styles.footer}>
            <button type="button" className={styles.deleteBtn} onClick={onDeleteClick}>
              <TrashIcon /> {t("tasks.delete")}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  );
}
