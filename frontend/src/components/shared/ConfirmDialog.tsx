"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePreferences } from "@/hooks/usePreferences";
import styles from "./ConfirmDialog.module.css";

// High-impact, cascading deletes (Project, Role, User, Material) require
// typing the item's name before the destructive action is enabled — a
// second, deliberate confirmation step beyond a plain yes/no. See DEC-025.
export function ConfirmDialog({
  title,
  message,
  confirmText,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = usePreferences();
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === confirmText;

  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <p className={styles.hint}>
          {t("confirmDialog.typeToConfirm")} <strong>{confirmText}</strong>
        </p>
        <input
          autoFocus
          className={styles.input}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && matches) onConfirm();
          }}
        />
        <div className={styles.actions}>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className={styles.dangerBtn} disabled={!matches} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
