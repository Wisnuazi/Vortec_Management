"use client";

import { usePreferences } from "@/hooks/usePreferences";
import styles from "./ThemeToggle.module.css";

export function LanguageToggle() {
  const { locale, setLocale } = usePreferences();

  return (
    <div className={styles.switch} role="group" aria-label="Bahasa / Language">
      <button
        type="button"
        className={locale === "id" ? `${styles.btn} ${styles.btnActive}` : styles.btn}
        aria-pressed={locale === "id"}
        onClick={() => setLocale("id")}
      >
        ID
      </button>
      <button
        type="button"
        className={locale === "en" ? `${styles.btn} ${styles.btnActive}` : styles.btn}
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
