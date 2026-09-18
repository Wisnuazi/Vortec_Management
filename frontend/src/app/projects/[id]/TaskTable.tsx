"use client";

import { useState } from "react";
import {
  TASK_STATUSES,
  canActOnTask,
  isTaskMine,
  taskStatusLabel,
  type ApiTask,
  type TaskStatus,
} from "@/lib/projects-api";
import { TrashIcon, PaperclipIcon, InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import { useDragScroll } from "@/hooks/useDragScroll";
import { usePreferences } from "@/hooks/usePreferences";
import { formatDate } from "@/lib/format";
import { sortRows, type SortDir } from "@/lib/sort";
import type { UseProjects } from "@/hooks/useProjects";
import styles from "./page.module.css";

type SortKey = "title" | "role" | "status" | "startDate" | "dueDate";

export function TaskTable({
  tasks,
  currentUser,
  canEdit,
  projectId,
  projects,
  onStatusChange,
  onSelect,
  onDelete,
}: {
  tasks: ApiTask[];
  currentUser: { isSuperAdmin: boolean; roleIds: string[] } | null;
  canEdit: boolean;
  projectId: string;
  projects: UseProjects;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const { t, locale } = usePreferences();
  const scrollRef = useDragScroll<HTMLDivElement>();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  void projects; void projectId; // unused after drawer refactor; kept for symmetry

  if (tasks.length === 0) {
    return <EmptyState icon={<InboxIcon />} title={t("tasks.empty")} compact />;
  }

  const sortValue: Record<SortKey, (task: ApiTask) => unknown> = {
    title: (task) => task.title,
    role: (task) => task.assignedRoleTitle,
    status: (task) => task.status,
    startDate: (task) => task.startDate,
    dueDate: (task) => task.dueDate,
  };
  const byOrder = [...tasks].sort((a, b) => a.order - b.order);
  const sorted = sortKey ? sortRows(byOrder, sortValue[sortKey], sortDir) : byOrder;
  const fmt = (iso: string | null) => (iso ? formatDate(iso, locale) : "—");
  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? "▲" : "▼") : "");

  return (
    <div className={styles.tableWrap} ref={scrollRef}>
      <table className={styles.taskTable}>
        <thead>
          <tr>
            <th>
              <button type="button" className={styles.sortHeaderBtn} onClick={() => onSort("title")}>
                {t("tasks.title")} <span className={styles.sortArrow}>{arrow("title")}</span>
              </button>
            </th>
            <th>
              <button type="button" className={styles.sortHeaderBtn} onClick={() => onSort("role")}>
                {t("tasks.role")} <span className={styles.sortArrow}>{arrow("role")}</span>
              </button>
            </th>
            <th>
              <button type="button" className={styles.sortHeaderBtn} onClick={() => onSort("status")}>
                {t("tasks.status")} <span className={styles.sortArrow}>{arrow("status")}</span>
              </button>
            </th>
            <th>
              <button type="button" className={styles.sortHeaderBtn} onClick={() => onSort("startDate")}>
                {t("tasks.start")} <span className={styles.sortArrow}>{arrow("startDate")}</span>
              </button>
            </th>
            <th>
              <button type="button" className={styles.sortHeaderBtn} onClick={() => onSort("dueDate")}>
                {t("tasks.target")} <span className={styles.sortArrow}>{arrow("dueDate")}</span>
              </button>
            </th>
            <th>{t("tasks.subtasks")}</th>
            <th>{t("tasks.attachments")}</th>
            {canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((task) => {
            const editable = canActOnTask(currentUser, task);
            const mine = isTaskMine(currentUser, task);
            const subtaskDoneCount = task.subtasks.filter((s) => s.done).length;
            const subtasksComplete = task.subtasks.length > 0 && subtaskDoneCount === task.subtasks.length;
            return (
              <tr
                key={task.id}
                className={`${styles.taskRowClickable} ${mine ? styles.taskRowMine : ""}`}
                data-mine={mine ? "true" : "false"}
                title={mine ? t("tasks.mineHint") : t("tasks.drawerHint")}
                onClick={() => onSelect(task.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(task.id);
                  }
                }}
                tabIndex={0}
                role="button"
              >
                <td>
                  <div className={styles.taskTableTitle}>
                    {task.title}
                    {mine && <span className={styles.mineBadgeInline}>{t("tasks.mineBadge")}</span>}
                  </div>
                </td>
                <td>{task.assignedRoleTitle ? <span className={styles.roleBadge}>{task.assignedRoleTitle}</span> : "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {editable ? (
                    <select
                      value={task.status}
                      onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label[locale]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    taskStatusLabel(task.status, locale)
                  )}
                </td>
                <td>{fmt(task.startDate)}</td>
                <td>{fmt(task.dueDate)}</td>
                <td>
                  <span
                    className={styles.subtaskProgressBadge}
                    data-complete={subtasksComplete}
                  >
                    {subtaskDoneCount}/{task.subtasks.length}
                  </span>
                </td>
                <td>
                  <span className={styles.docAttachToggle}>
                    <PaperclipIcon /> {task.attachments.length}
                  </span>
                </td>
                {canEdit && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={styles.kanbanCardDelete}
                      aria-label={t("tasks.delete")}
                      onClick={() => onDelete(task.id)}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
