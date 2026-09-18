"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePreferences } from "@/hooks/usePreferences";
import styles from "./page.module.css";

export function RoleMultiSelect({
  roles,
  selectedIds,
  onChange,
}: {
  roles: { id: string; title: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200) });
    }
    setOpen((v) => !v);
  };

  const selectedTitles = roles.filter((r) => selectedIds.includes(r.id)).map((r) => r.title);

  return (
    <div className={styles.roleMultiSelect}>
      <button type="button" ref={triggerRef} className={styles.roleMultiSelectTrigger} onClick={toggleOpen}>
        {selectedTitles.length === 0 ? (
          <span className={styles.roleMultiSelectPlaceholder}>— {t("users.noRoles")} —</span>
        ) : (
          selectedTitles.map((t) => (
            <span key={t} className={styles.roleChip}>
              {t}
            </span>
          ))
        )}
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.roleMultiSelectMenu}
            style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            {roles.map((r) => (
              <label key={r.id} className={styles.roleMultiSelectOption}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(r.id)}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...selectedIds, r.id]);
                    else onChange(selectedIds.filter((id) => id !== r.id));
                  }}
                />
                {r.title}
              </label>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
