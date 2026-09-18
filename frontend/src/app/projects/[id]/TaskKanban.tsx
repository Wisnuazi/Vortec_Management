"use client";

import { useState, type DragEvent } from "react";
import {
  TASK_STATUSES,
  canActOnTask,
  isTaskMine,
  type ApiTask,
  type TaskStatus,
} from "@/lib/projects-api";
import { PaperclipIcon } from "@/components/icons";
import { usePreferences } from "@/hooks/usePreferences";
import { formatDate } from "@/lib/format";
import styles from "./page.module.css";

function TaskCard({
  task,
  draggable,
  mine,
  onSelect,
  onDelete,
}: {
  task: ApiTask;
  draggable: boolean;
  mine: boolean;
  onSelect: (taskId: string) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = usePreferences();
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/plain", task.id);
  };
  const attachCount = task.attachments.length;
  const subtaskCount = task.subtasks.length;
  const subtaskDone = task.subtasks.filter((s) => s.done).length;

  return (
    <div
      className={`${styles.kanbanCard} ${mine ? styles.kanbanCardMine : ""}`}
      data-mine={mine ? "true" : "false"}
      title={mine ? t("tasks.mineHint") : undefined}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className={styles.kanbanCardHead}>
        <span className={styles.kanbanCardTitle}>{task.title}</span>
        {mine && <span className={styles.mineBadge}>{t("tasks.mineBadge")}</span>}
        {onDelete && (
          <button
            type="button"
            className={styles.kanbanCardDelete}
            aria-label={t("tasks.delete")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ×
          </button>
        )}
      </div>
      <div className={styles.kanbanCardMeta}>
        {task.assignedRoleTitle && <span className={styles.roleBadge}>{task.assignedRoleTitle}</span>}
        {task.requiresApproval && <span className={styles.approvalBadge}>{t("tasks.requiresApproval")}</span>}
        {task.dueDate && (
          <span className={styles.dueDate}>
            {t("tasks.target")}: {formatDate(task.dueDate, locale, { day: "2-digit", month: "short", year: undefined })}
          </span>
        )}
      </div>
      {(subtaskCount > 0 || attachCount > 0) && (
        <div className={styles.kanbanCardBadges}>
          {subtaskCount > 0 && (
            <span
              className={styles.subtaskProgressBadge}
              data-complete={subtaskDone === subtaskCount}
            >
              {subtaskDone}/{subtaskCount}
            </span>
          )}
          {attachCount > 0 && (
            <span className={styles.attachBadge}>
              <PaperclipIcon /> {attachCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskKanban({
  tasks,
  currentUser,
  onStatusChange,
  onSelect,
  onDelete,
}: {
  tasks: ApiTask[];
  currentUser: { isSuperAdmin: boolean; roleIds: string[] } | null;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const { locale } = usePreferences();
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  return (
    <div className={styles.kanbanBoard}>
      {TASK_STATUSES.map((col) => {
        const colTasks = tasks.filter((task) => task.status === col.value);
        return (
          <div
            key={col.value}
            className={dragOverStatus === col.value ? `${styles.kanbanCol} ${styles.kanbanColOver}` : styles.kanbanCol}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(col.value);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === col.value ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStatus(null);
              const taskId = e.dataTransfer.getData("text/plain");
              if (taskId) onStatusChange(taskId, col.value);
            }}
          >
            <div className={styles.kanbanColHead}>
              {col.label[locale]} <span className={styles.kanbanColCount}>{colTasks.length}</span>
            </div>
            <div className={styles.kanbanColBody}>
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  draggable={canActOnTask(currentUser, task)}
                  mine={isTaskMine(currentUser, task)}
                  onSelect={onSelect}
                  onDelete={() => onDelete(task.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
