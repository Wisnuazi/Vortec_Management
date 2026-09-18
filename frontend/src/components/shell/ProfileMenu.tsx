"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import styles from "./ProfileMenu.module.css";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!user) return null;

  return (
    <div className={styles.wrap} ref={ref}>
      {open && (
        <div className={styles.menu} role="menu">
          <Link href="/profile" className={styles.item} onClick={() => setOpen(false)}>
            {t("topbar.profile")}
          </Link>
          <button
            type="button"
            className={`${styles.item} ${styles.itemDanger}`}
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            {t("topbar.logout")}
          </button>
        </div>
      )}

      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        <span className={styles.avatar} aria-hidden="true">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className={styles.avatarImg} />
          ) : (
            initials(user.name)
          )}
        </span>
        <span className={styles.info}>
          <span className={styles.name}>{user.name}</span>
          {user.isSuperAdmin && <span className={styles.role}>{t("topbar.superAdmin")}</span>}
        </span>
      </button>
    </div>
  );
}
