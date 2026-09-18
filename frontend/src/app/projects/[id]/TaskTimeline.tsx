"use client";

import { taskStatusLabel, isTaskMine, type ApiTask } from "@/lib/projects-api";
import { usePreferences } from "@/hooks/usePreferences";
import { formatDate } from "@/lib/format";
import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "./page.module.css";

const STATUS_DOT: Record<string, string> = {
  TODO: styles.timelineDotTodo,
  IN_PROGRESS: styles.timelineDotInProgress,
  WAITING_APPROVAL: styles.timelineDotWaiting,
  DONE: styles.timelineDotDone,
  REJECTED: styles.timelineDotRejected,
};

export function TaskTimeline({
  tasks,
  currentUser,
  onSelect,
}: {
  tasks: ApiTask[];
  currentUser: { isSuperAdmin: boolean; roleIds: string[] } | null;
  onSelect: (taskId: string) => void;
}) {
  const { t, locale } = usePreferences();
  const fmt = (iso: string | null) => (iso ? formatDate(iso, locale) : null);

  if (tasks.length === 0) {
    return <EmptyState icon={<InboxIcon />} title={t("tasks.empty")} compact />;
  }

  const sorted = [...tasks].sort((a, b) => {
    const ad = a.startDate ?? a.dueDate;
    const bd = b.startDate ?? b.dueDate;
    if (ad && bd) return new Date(ad).getTime() - new Date(bd).getTime();
    if (ad) return -1;
    if (bd) return 1;
    return a.order - b.order;
  });

  return (
    <ul className={styles.timeline}>
      {sorted.map((task) => {
        const mine = isTaskMine(currentUser, task);
        return (
          <li
            key={task.id}
            className={`${styles.timelineItem} ${styles.timelineItemClickable} ${mine ? styles.timelineItemMine : ""}`}
            data-mine={mine ? "true" : "false"}
            title={mine ? t("tasks.mineHint") : t("tasks.drawerHint")}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(task.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(task.id);
              }
            }}
          >
            <span className={`${styles.timelineDot} ${STATUS_DOT[task.status] ?? ""}`} />
            <div className={styles.timelineContent}>
              <div className={styles.timelineTop}>
                <span className={styles.timelineTitle}>{task.title}</span>
                {mine && <span className={styles.mineBadge}>{t("tasks.mineBadge")}</span>}
                <span className={styles.timelineStatus}>{taskStatusLabel(task.status, locale)}</span>
              </div>
              <div className={styles.timelineMeta}>
                {task.assignedRoleTitle && <span className={styles.roleBadge}>{task.assignedRoleTitle}</span>}
                {(task.startDate || task.dueDate) && (
                  <span className={styles.timelineDates}>
                    {fmt(task.startDate) ?? "?"} → {fmt(task.dueDate) ?? "?"}
                  </span>
                )}
                {task.requiresApproval && <span className={styles.approvalBadge}>{t("tasks.requiresApproval")}</span>}
                {task.approvedByUserName && (
                  <span className={styles.approvedBy}>
                    {task.status === "DONE"
                      ? t("tasks.approved")
                      : task.status === "REJECTED"
                        ? t("tasks.rejectedByLabel")
                        : ""}{" "}
                    {t("tasks.by")} {task.approvedByUserName}
                  </span>
                )}
              </div>
              {task.description && <p className={styles.timelineDescription}>{task.description}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
