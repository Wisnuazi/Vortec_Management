"use client";

import { useEffect, useRef, useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import styles from "./page.module.css";

type TaskNoteEditorProps = {
  note: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<void>;
  multiline?: boolean;
  placeholder?: string;
};

/**
 * Inline note editor for a task. Two modes:
 * - `multiline` (default for Table column / Kanban card) — textarea
 *   that auto-saves on blur (and on Cmd/Ctrl+Enter).
 * - `!multiline` (compact read-only display with edit-on-click) — single
 *   line placeholder; click the placeholder to enter edit mode, blur to save.
 *
 * Read-only (canEdit=false) renders the existing note as plain text, with
 * a "you can only view this" hint when the role gate is the reason.
 */
export function TaskNoteEditor({ note, canEdit, onSave, multiline = true, placeholder }: TaskNoteEditorProps) {
  const { t } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the local draft in sync with the prop when the row isn't being edited
  // (i.e. when something else updated the note server-side).
  useEffect(() => {
    if (!editing) setDraft(note);
  }, [note, editing]);

  // Auto-resize the textarea to fit the content so long notes don't get a
  // tiny 2-line scroll inside the cell.
  useEffect(() => {
    if (!multiline) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [draft, editing, multiline]);

  const save = async () => {
    const next = draft.trim();
    if (next === note.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(note);
    setEditing(false);
    setError(null);
  };

  if (!canEdit) {
    return (
      <div className={styles.taskNoteReadOnly} title={note ? undefined : t("tasks.notesEmpty")}>
        {note ? <span className={styles.taskNoteText}>{note}</span> : <span className={styles.taskNoteEmpty}>{t("tasks.notesEmpty")}</span>}
      </div>
    );
  }

  if (!multiline) {
    if (editing) {
      return (
        <div className={styles.taskNoteCompactEditor}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            disabled={saving}
            placeholder={placeholder ?? t("tasks.notesPlaceholder")}
            aria-label={t("tasks.notes")}
          />
          {error && <span className={styles.taskNoteError}>{error}</span>}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={styles.taskNoteCompactTrigger}
        onClick={() => setEditing(true)}
        title={t("tasks.notesHint")}
      >
        {note ? <span className={styles.taskNoteText}>{note}</span> : <span className={styles.taskNoteEmpty}>{t("tasks.notesEmpty")}</span>}
      </button>
    );
  }

  // multiline editor (the main one used in the table column and kanban card)
  return (
    <div className={styles.taskNoteEditor}>
      {editing ? (
        <>
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            disabled={saving}
            placeholder={placeholder ?? t("tasks.notesPlaceholder")}
            aria-label={t("tasks.notes")}
            rows={1}
          />
          <div className={styles.taskNoteEditorActions}>
            {saving ? (
              <span className={styles.taskNoteSaving}>{t("common.saving")}</span>
            ) : error ? (
              <span className={styles.taskNoteError}>{error}</span>
            ) : (
              <span className={styles.taskNoteHint}>{t("tasks.notesHint")}</span>
            )}
            <button type="button" onClick={cancel} className={styles.taskNoteCancel}>
              {t("common.cancel")}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className={styles.taskNoteTrigger}
          onClick={() => setEditing(true)}
          title={t("tasks.notesHint")}
        >
          {note ? <span className={styles.taskNoteText}>{note}</span> : <span className={styles.taskNoteEmpty}>{t("tasks.notesPlaceholder")}</span>}
        </button>
      )}
    </div>
  );
}
