"use client";

import { useState } from "react";
import type { ApiSubtask } from "@/lib/projects-api";
import { TrashIcon } from "@/components/icons";
import { usePreferences } from "@/hooks/usePreferences";
import styles from "./page.module.css";

export function SubtaskList({
  subtasks,
  canEdit,
  onAdd,
  onToggle,
  onRemove,
}: {
  subtasks: ApiSubtask[];
  canEdit: boolean;
  onAdd: (title: string) => Promise<void>;
  onToggle: (subtaskId: string, done: boolean) => Promise<void>;
  onRemove: (subtaskId: string) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAdd(title);
      setTitle("");
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...subtasks].sort((a, b) => a.order - b.order);

  return (
    <div className={styles.subtaskWrap} onClick={(e) => e.stopPropagation()}>
      {sorted.length === 0 ? (
        <p className={styles.attachmentEmpty}>{t("tasks.subtaskEmpty")}</p>
      ) : (
        <ul className={styles.subtaskList}>
          {sorted.map((s) => (
            <li key={s.id} className={styles.subtaskItem}>
              <label className={styles.subtaskCheckLabel}>
                <input
                  type="checkbox"
                  checked={s.done}
                  disabled={!canEdit}
                  onChange={(e) => onToggle(s.id, e.target.checked)}
                />
                <span className={s.done ? styles.subtaskTitleDone : styles.subtaskTitle}>{s.title}</span>
              </label>
              {canEdit && (
                <button
                  type="button"
                  className={styles.attachmentRemove}
                  aria-label={t("tasks.subtaskDelete")}
                  onClick={() => onRemove(s.id)}
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className={styles.subtaskAddForm}>
          <input
            autoComplete="off"
            placeholder={t("tasks.subtaskPlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <button type="button" onClick={handleAdd} disabled={saving || !title.trim()}>
            + {t("tasks.subtaskAdd")}
          </button>
        </div>
      )}
    </div>
  );
}
