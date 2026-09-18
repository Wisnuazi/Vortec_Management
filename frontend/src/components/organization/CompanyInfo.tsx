"use client";

import { COMPANY_INFO } from "@/lib/company-info";
import { useFloors } from "@/hooks/useFloors";
import { usePreferences } from "@/hooks/usePreferences";
import { FloorRow } from "./FloorRow";
import styles from "./CompanyInfo.module.css";

// DEC-064: floor layout description is only editable by super admin +
// Director + OM. Asset CRUD stays on the existing canEditAssets gate.
// OrgChart-level tree edits stay on canEdit (OL subtree).
export function CompanyInfo({
  canEdit,
  canEditAssets,
  canEditFloorLayout,
}: {
  canEdit: boolean;
  canEditAssets: boolean;
  canEditFloorLayout: boolean;
}) {
  const { t } = usePreferences();
  const floors = useFloors();

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h3>{COMPANY_INFO.name}</h3>
        <p className={styles.summary}>{COMPANY_INFO.summary}</p>
      </div>

      <div className={styles.card}>
        <span className={styles.sectionLabel}>{t("org.buildingLayout")}</span>
        <p className={styles.hint}>{t("org.buildingLayoutHint")}</p>
        {!floors.hydrated ? (
          <p className={styles.emptyHint}>{t("org.loadingFloors")}</p>
        ) : (
          <div className={styles.floorList}>
            {floors.floors.map((floor) => (
              <FloorRow key={floor.id} floor={floor} floors={floors} canEditAssets={canEditAssets} canEditFloorLayout={canEditFloorLayout} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
