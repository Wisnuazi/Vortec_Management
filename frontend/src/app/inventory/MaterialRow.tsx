"use client";

import { useState, type MouseEvent } from "react";
import type { ApiMaterial } from "@/lib/materials-api";
import type { UseMaterials } from "@/hooks/useMaterials";
import { TrashIcon, InboxIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePreferences } from "@/hooks/usePreferences";
import { formatDate } from "@/lib/format";
import styles from "./page.module.css";

function formatQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function MaterialRow({
  material,
  materials,
  canEdit,
}: {
  material: ApiMaterial;
  materials: UseMaterials;
  canEdit: boolean;
}) {
  const { t, locale } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const [addingMovement, setAddingMovement] = useState<"IN" | "OUT" | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [movementError, setMovementError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteMaterial, setConfirmingDeleteMaterial] = useState(false);

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className={expanded ? `${styles.row} ${styles.rowExpanded}` : styles.row}>
      <button type="button" className={styles.rowHead} onClick={() => setExpanded((v) => !v)}>
        {material.code && <span className={styles.code}>{material.code}</span>}
        <span className={styles.matName}>{material.name}</span>
        <span className={styles.unit}>{material.unit}</span>
        <span className={styles.stockBadge}>
          {formatQty(material.stock)} {material.unit}
        </span>
        <span className={expanded ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}>▾</span>
      </button>

      {expanded && (
        <div className={styles.detail} onClick={stop}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryItem}>
              <strong className={styles.inColor}>+{formatQty(material.totalIn)}</strong> {t("inventory.in")}
            </span>
            <span className={styles.summaryItem}>
              <strong className={styles.outColor}>-{formatQty(material.totalOut)}</strong> {t("inventory.out")}
            </span>
            <span className={styles.summaryItem}>
              {t("inventory.remaining")}: <strong>{formatQty(material.stock)} {material.unit}</strong>
            </span>
          </div>

          {material.notes && <p className={styles.notes}>{material.notes}</p>}

          {canEdit && (
            <div className={styles.movementActions}>
              <button
                type="button"
                className={styles.inBtn}
                onClick={() => {
                  setMovementError("");
                  setAddingMovement("IN");
                }}
              >
                + {t("inventory.stockIn")}
              </button>
              <button
                type="button"
                className={styles.outBtn}
                onClick={() => {
                  setMovementError("");
                  setAddingMovement("OUT");
                }}
              >
                − {t("inventory.stockOut")}
              </button>
            </div>
          )}

          {addingMovement && (
            <form
              className={styles.movementForm}
              onSubmit={async (e) => {
                e.preventDefault();
                setMovementError("");
                setSaving(true);
                try {
                  await materials.addMovement(material.id, addingMovement, Number(qty) || 0, note);
                  setQty("");
                  setNote("");
                  setAddingMovement(null);
                } catch (err) {
                  setMovementError(err instanceof Error ? err.message : t("inventory.movementSaveFailed"));
                } finally {
                  setSaving(false);
                }
              }}
            >
              <span className={addingMovement === "IN" ? styles.inColor : styles.outColor}>
                {addingMovement === "IN" ? t("inventory.stockIn") : t("inventory.stockOut")}
              </span>
              <input
                autoFocus
                type="number"
                min={0}
                step="any"
                placeholder={`${t("inventory.quantity")} (${material.unit})`}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <input
                placeholder={t("common.notesOptional")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMovementError("");
                  setAddingMovement(null);
                }}
              >
                {t("common.cancel")}
              </button>
              {movementError && <p className={styles.movementError}>{movementError}</p>}
            </form>
          )}

          <div>
            <span className={styles.sectionLabel}>{t("inventory.history")}</span>
            {material.movements.length === 0 ? (
              <EmptyState icon={<InboxIcon />} title={t("inventory.noHistory")} compact />
            ) : (
              <ul className={styles.movementList}>
                {material.movements.map((m) => (
                  <li key={m.id} className={styles.movementItem}>
                    <span className={m.type === "IN" ? styles.inColor : styles.outColor}>
                      {m.type === "IN" ? "+" : "−"}
                      {formatQty(m.quantity)} {material.unit}
                    </span>
                    <span className={styles.movementDate}>{formatDate(m.createdAt, locale)}</span>
                    {m.note && <span className={styles.movementNote}>{m.note}</span>}
                    {canEdit && (
                      <button
                        type="button"
                        className={styles.movementDeleteBtn}
                        aria-label={t("inventory.deleteHistoryEntry")}
                        onClick={() => {
                          if (window.confirm(t("inventory.confirmDeleteHistoryEntry"))) {
                            materials.removeMovement(material.id, m.id);
                          }
                        }}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canEdit && (
            <button type="button" className={styles.deleteMaterialBtn} onClick={() => setConfirmingDeleteMaterial(true)}>
              {t("inventory.deleteThisMaterial")}
            </button>
          )}
          {confirmingDeleteMaterial && (
            <ConfirmDialog
              title={t("inventory.deleteThisMaterial")}
              message={`${t("inventory.confirmDeleteMaterial")} "${material.name}"?`}
              confirmText={material.name}
              confirmLabel={t("inventory.deleteThisMaterial")}
              onCancel={() => setConfirmingDeleteMaterial(false)}
              onConfirm={() => {
                setConfirmingDeleteMaterial(false);
                materials.removeMaterial(material.id);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
