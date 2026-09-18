"use client";

import type { ApiTask } from "@/lib/projects-api";
import { isTaskMine } from "@/lib/projects-api";
import { usePreferences } from "@/hooks/usePreferences";
import { formatDate } from "@/lib/format";
import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "./page.module.css";

const STATUS_CLASS: Record<string, string> = {
  TODO: styles.ganttBarTodo,
  IN_PROGRESS: styles.ganttBarInProgress,
  WAITING_APPROVAL: styles.ganttBarWaiting,
  DONE: styles.ganttBarDone,
  REJECTED: styles.ganttBarRejected,
};

export function TaskGantt({
  tasks,
  currentUser,
  onSelect,
}: {
  tasks: ApiTask[];
  currentUser: { isSuperAdmin: boolean; roleIds: string[] } | null;
  onSelect: (taskId: string) => void;
}) {
  const { t, locale } = usePreferences();
  const fmt = (d: Date) => formatDate(d, locale);
  const scheduled = tasks.filter((task) => task.startDate || task.dueDate);
  const unscheduled = tasks.filter((task) => !task.startDate && !task.dueDate);

  if (scheduled.length === 0) {
    return <EmptyState icon={<InboxIcon />} title={t("tasks.ganttEmpty")} compact />;
  }

  const dates = scheduled.flatMap((task) => [task.startDate, task.dueDate].filter(Boolean).map((d) => new Date(d as string)));
  let rangeStart = new Date(Math.min(...dates.map((d) => d.getTime())));
  let rangeEnd = new Date(Math.max(...dates.map((d) => d.getTime())));
  if (rangeEnd.getTime() - rangeStart.getTime() < 1000 * 60 * 60 * 24 * 3) {
    rangeEnd = new Date(rangeStart.getTime() + 1000 * 60 * 60 * 24 * 7);
  }
  // Small padding on both ends.
  const pad = (rangeEnd.getTime() - rangeStart.getTime()) * 0.05;
  rangeStart = new Date(rangeStart.getTime() - pad);
  rangeEnd = new Date(rangeEnd.getTime() + pad);
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  const pct = (d: Date) => ((d.getTime() - rangeStart.getTime()) / totalMs) * 100;
  const todayPct = pct(new Date());

  return (
    <div className={styles.gantt}>
      <div className={styles.ganttHeader}>
        <span>{fmt(rangeStart)}</span>
        <span>{fmt(rangeEnd)}</span>
      </div>
      <div className={styles.ganttChart}>
        {todayPct >= 0 && todayPct <= 100 && (
          <div className={styles.ganttToday} style={{ left: `${todayPct}%` }} title={t("tasks.today")} />
        )}
        {scheduled.map((task) => {
          const start = task.startDate ? new Date(task.startDate) : new Date(task.dueDate as string);
          const end = task.dueDate ? new Date(task.dueDate) : new Date(task.startDate as string);
          const left = Math.max(0, pct(start));
          const width = Math.max(1.5, pct(end) - pct(start));
          const mine = isTaskMine(currentUser, task);
          return (
            <div
              key={task.id}
              className={`${styles.ganttRow} ${styles.ganttRowClickable}`}
              data-mine={mine ? "true" : "false"}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(task.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(task.id);
                }
              }}
              title={t("tasks.drawerHint")}
            >
              <div className={styles.ganttLabel}>
                <span className={styles.ganttLabelTitle}>{task.title}</span>
                {mine && <span className={styles.mineBadge}>{t("tasks.mineBadge")}</span>}
                {task.assignedRoleTitle && <span className={styles.roleBadge}>{task.assignedRoleTitle}</span>}
              </div>
              <div className={styles.ganttTrack}>
                <div
                  className={`${styles.ganttBar} ${STATUS_CLASS[task.status] ?? ""} ${mine ? styles.ganttBarMine : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${task.title}${mine ? ` (${t("tasks.mineHint")})` : ""} (${task.startDate ? fmt(new Date(task.startDate)) : "?"} → ${task.dueDate ? fmt(new Date(task.dueDate)) : "?"})`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <div className={styles.ganttUnscheduled}>
          <span className={styles.sectionLabel}>{t("tasks.unscheduled")}</span>
          <ul className={styles.docList}>
            {unscheduled.map((task) => {
              const mine = isTaskMine(currentUser, task);
              return (
                <li
                  key={task.id}
                  className={`${styles.docItem} ${styles.docItemClickable} ${mine ? styles.docItemMine : ""}`}
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
                  <span className={styles.docName}>{task.title}</span>
                  {mine && <span className={styles.mineBadge}>{t("tasks.mineBadge")}</span>}
                  {task.assignedRoleTitle && <span className={styles.roleBadge}>{task.assignedRoleTitle}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
