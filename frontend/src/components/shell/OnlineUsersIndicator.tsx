"use client";

import { useEffect, useRef, useState } from "react";
import { useActivityLog } from "@/hooks/useActivityLog";
import { usePreferences } from "@/hooks/usePreferences";
import type { TranslationKey } from "@/lib/i18n";
import { UsersIcon } from "@/components/icons";
import styles from "./OnlineUsersIndicator.module.css";

// DEC-077: global "Online sekarang" indicator. Lifted out of the
// /activity-log page and into the Topbar so the user sees who's online
// from any page — same pattern as Google Sheets / Miro / Figma where
// presence is part of the chrome, not a destination.

function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function OnlineUsersIndicator() {
  const { t } = usePreferences();
  const { online, hydrated } = useActivityLog();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click + Escape key (standard popover
  // behavior, no library).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = online.length;

  // Render nothing until hydrated so the pill doesn't flash 0 on first load.
  if (!hydrated) return null;

  return (
    <div ref={wrapperRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t("online.label" as TranslationKey)} — ${count}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.dot} aria-hidden="true" />
        <UsersIcon />
        <span className={styles.count}>
          {count} {t("online.label" as TranslationKey)}
        </span>
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label={t("online.label" as TranslationKey)}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>{t("online.label" as TranslationKey)}</span>
            <span className={styles.panelMeta}>
              {count} {t("online.count" as TranslationKey)}
            </span>
          </div>
          {count === 0 ? (
            <p className={styles.empty}>{t("online.empty" as TranslationKey)}</p>
          ) : (
            <ul className={styles.list}>
              {online.map((u) => (
                <li key={u.id} className={styles.userRow}>
                  <span className={styles.avatar} title={u.name}>
                    {userInitials(u.name)}
                  </span>
                  <span className={styles.userMeta}>
                    <span className={styles.userName}>{u.name}</span>
                    {u.roleTitles[0] && <span className={styles.userRole}>{u.roleTitles[0]}</span>}
                  </span>
                  {u.isSuperAdmin && <span className={styles.userBadge}>Super Admin</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
