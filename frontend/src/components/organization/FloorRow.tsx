"use client";

import { useState, type MouseEvent } from "react";
import type { ApiFloor } from "@/lib/floors-api";
import type { UseFloors } from "@/hooks/useFloors";
import { TrashIcon } from "@/components/icons";
import { usePreferences } from "@/hooks/usePreferences";
import styles from "./CompanyInfo.module.css";

export function FloorRow({
  floor,
  floors,
  canEditAssets,
  canEditFloorLayout,
}: {
  floor: ApiFloor;
  floors: UseFloors;
  canEditAssets: boolean;
  canEditFloorLayout: boolean;
}) {
  const { t } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const [descDraft, setDescDraft] = useState(floor.description);
  const [addingAsset, setAddingAsset] = useState(false);
  const [assetCode, setAssetCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetQty, setAssetQty] = useState("1");
  const [assetNotes, setAssetNotes] = useState("");

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className={expanded ? `${styles.floorRow} ${styles.floorRowExpanded}` : styles.floorRow}>
      <button type="button" className={styles.floorHead} onClick={() => setExpanded((v) => !v)}>
        <strong>{floor.label}</strong>
        <span>{floor.usage}</span>
        <span className={styles.assetCount}>
          {floor.assets.reduce((sum, a) => sum + a.quantity, 0)} {t("org.assetCountSuffix")}
        </span>
        <span className={expanded ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}>▾</span>
      </button>

      {expanded && (
        <div className={styles.floorDetail} onClick={stop}>
          <div>
            <span className={styles.sectionLabel}>{t("org.description")}</span>
            {canEditFloorLayout ? (
              <textarea
                className={styles.floorTextarea}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => {
                  if (descDraft !== floor.description) floors.updateDescription(floor.id, descDraft);
                }}
              />
            ) : (
              <p className={styles.floorDescription}>{floor.description || t("org.noDescription")}</p>
            )}
          </div>

          <div>
            <span className={styles.sectionLabel}>{t("org.assetsOnFloor")}</span>
            {floor.assets.length === 0 ? (
              <p className={styles.emptyHint}>{t("assets.empty")}</p>
            ) : (
              <ul className={styles.assetList}>
                {floor.assets.map((a) => (
                  <li key={a.id} className={styles.assetItem}>
                    {a.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photoUrl} alt="" className={styles.assetThumb} />
                    ) : (
                      <span className={styles.assetThumbPlaceholder} aria-hidden="true" />
                    )}
                    <div className={styles.assetInfo}>
                      <span className={styles.assetName}>
                        {a.code && <span className={styles.assetCode}>{a.code}</span>}
                        {a.name} <span className={styles.assetQty}>×{a.quantity}</span>
                      </span>
                      {a.notes && <span className={styles.assetNotes}>{a.notes}</span>}
                    </div>
                    {canEditAssets && (
                      <button
                        type="button"
                        className={styles.assetDeleteBtn}
                        aria-label={`${t("assets.delete")} ${a.name}`}
                        onClick={() => {
                          if (window.confirm(`${t("assets.confirmDelete")} "${a.name}"?`)) {
                            floors.removeAsset(floor.id, a.id);
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

            {canEditAssets &&
              (addingAsset ? (
                <form
                  className={styles.assetForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    floors.addAsset(floor.id, assetCode, assetName, Number(assetQty) || 1, assetNotes);
                    setAssetCode("");
                    setAssetName("");
                    setAssetQty("1");
                    setAssetNotes("");
                    setAddingAsset(false);
                  }}
                >
                  <input
                    placeholder={t("assets.codeOptional")}
                    className={styles.assetCodeInput}
                    value={assetCode}
                    onChange={(e) => setAssetCode(e.target.value)}
                  />
                  <input
                    autoFocus
                    placeholder={t("assets.name")}
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                  />
                  <input
                    type="number"
                    min={1}
                    className={styles.assetQtyInput}
                    value={assetQty}
                    onChange={(e) => setAssetQty(e.target.value)}
                  />
                  <input
                    placeholder={t("common.notesOptional")}
                    value={assetNotes}
                    onChange={(e) => setAssetNotes(e.target.value)}
                  />
                  <button type="submit">{t("common.add")}</button>
                  <button type="button" onClick={() => setAddingAsset(false)}>
                    {t("common.cancel")}
                  </button>
                </form>
              ) : (
                <button type="button" className={styles.addAssetTrigger} onClick={() => setAddingAsset(true)}>
                  + {t("assets.addTrigger")}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
