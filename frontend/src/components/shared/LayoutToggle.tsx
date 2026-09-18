"use client";

import { usePreferences } from "@/hooks/usePreferences";
import { ListIcon, GridIcon } from "@/components/icons";
import styles from "./LayoutToggle.module.css";

export type Layout = "list" | "grid";

export function LayoutToggle({ value, onChange }: { value: Layout; onChange: (layout: Layout) => void }) {
  const { t } = usePreferences();
  return (
    <div className={styles.toggle} role="group" aria-label={t("common.layout")}>
      <button
        type="button"
        aria-label={t("common.layoutList")}
        aria-pressed={value === "list"}
        className={value === "list" ? `${styles.btn} ${styles.btnActive}` : styles.btn}
        onClick={() => onChange("list")}
      >
        <ListIcon />
      </button>
      <button
        type="button"
        aria-label={t("common.layoutGrid")}
        aria-pressed={value === "grid"}
        className={value === "grid" ? `${styles.btn} ${styles.btnActive}` : styles.btn}
        onClick={() => onChange("grid")}
      >
        <GridIcon />
      </button>
    </div>
  );
}
