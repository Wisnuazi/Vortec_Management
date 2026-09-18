"use client";

import { usePreferences } from "@/hooks/usePreferences";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  const { theme, setTheme, t } = usePreferences();

  return (
    <div className={styles.switch} role="group" aria-label="Tema">
      <button
        type="button"
        className={theme === "light" ? `${styles.btn} ${styles.btnActive}` : styles.btn}
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
      >
        {t("theme.light")}
      </button>
      <button
        type="button"
        className={theme === "dark" ? `${styles.btn} ${styles.btnActive}` : styles.btn}
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        {t("theme.dark")}
      </button>
      <button
        type="button"
        className={theme === "system" ? `${styles.btn} ${styles.btnActive}` : styles.btn}
        aria-pressed={theme === "system"}
        onClick={() => setTheme("system")}
      >
        {t("theme.system")}
      </button>
    </div>
  );
}
