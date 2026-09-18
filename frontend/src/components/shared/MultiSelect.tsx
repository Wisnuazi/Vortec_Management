"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "@/components/icons";
import styles from "./MultiSelect.module.css";

export type MultiSelectOption = {
  value: string;
  label: string;
  /** Optional secondary text (e.g. role description). */
  hint?: string;
  /** Optional disabled flag — selected values still appear as chips but cannot be unselected. */
  disabled?: boolean;
};

type MultiSelectProps = {
  options: MultiSelectOption[];
  /** Currently-selected values (controlled). */
  value: string[];
  onChange: (next: string[]) => void;
  /** Placeholder when nothing is selected. */
  placeholder?: string;
  /** Optional aria-label for the trigger button. */
  ariaLabel?: string;
  /** Show search input when option count >= this threshold. */
  searchThreshold?: number;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Render a custom trigger (e.g. a single-line chip list). Defaults to the chip-row trigger. */
  renderTrigger?: (selected: MultiSelectOption[]) => ReactNode;
  /** Visual size — "md" (default) or "sm" for tighter rows. */
  size?: "sm" | "md";
};

/**
 * Multi-select dropdown with chip display in the trigger and checkbox rows
 * in the popover. Replaces ad-hoc checkbox grids for multi-value fields
 * (task roles, document teams, etc.).
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  searchThreshold = 8,
  disabled = false,
  renderTrigger,
  size = "md",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedSet = new Set(value);
  const selectedOptions = options.filter((o) => selectedSet.has(o.value));
  const showSearch = options.length >= searchThreshold;

  // Filtered + sorted options — selected first to make "current selection"
  // obvious at the top of the list.
  const filtered = options.filter((o) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q);
  });
  const sorted = [
    ...filtered.filter((o) => selectedSet.has(o.value)),
    ...filtered.filter((o) => !selectedSet.has(o.value)),
  ];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setFocusIdx(-1);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Auto-focus the search input when opening
  useEffect(() => {
    if (open && showSearch) {
      // microtask so the input is mounted
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, showSearch]);

  const toggle = (optValue: string) => {
    if (disabled) return;
    const next = selectedSet.has(optValue)
      ? value.filter((v) => v !== optValue)
      : [...value, optValue];
    onChange(next);
  };

  const clearAll = () => {
    if (disabled) return;
    onChange([]);
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setFocusIdx(0);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, sorted.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = sorted[focusIdx];
      if (opt && !opt.disabled) toggle(opt.value);
    } else if (e.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={rootRef} className={`${styles.root} ${styles[`size-${size}`]}`}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setQuery("");
        }}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        {renderTrigger ? (
          renderTrigger(selectedOptions)
        ) : selectedOptions.length === 0 ? (
          <span className={styles.placeholder}>{placeholder ?? "—"}</span>
        ) : (
          <span className={styles.chipRow}>
            {selectedOptions.map((opt) => (
              <span key={opt.value} className={styles.chip}>
                {opt.label}
                {!disabled && (
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`Hapus ${opt.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(opt.value);
                    }}
                  >
                    <XIcon />
                  </button>
                )}
              </span>
            ))}
          </span>
        )}
        <span className={styles.triggerMeta}>
          {selectedOptions.length > 0 && (
            <span className={styles.count}>{selectedOptions.length}</span>
          )}
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div className={styles.popover} role="dialog">
          {showSearch && (
            <div className={styles.searchRow}>
              <SearchIcon />
              <input
                ref={searchRef}
                type="text"
                className={styles.searchInput}
                placeholder="Cari..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFocusIdx(0);
                }}
                onKeyDown={onListKeyDown}
                aria-label="Cari opsi"
              />
            </div>
          )}
          <ul
            ref={listRef}
            className={styles.optionsList}
            role="listbox"
            aria-multiselectable="true"
            onKeyDown={showSearch ? undefined : onListKeyDown}
          >
            {sorted.length === 0 ? (
              <li className={styles.emptyHint}>Tidak ada hasil</li>
            ) : (
              sorted.map((opt, i) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={checked}
                    aria-disabled={opt.disabled}
                    className={`${styles.option} ${i === focusIdx ? styles.optionFocused : ""} ${checked ? styles.optionChecked : ""} ${opt.disabled ? styles.optionDisabled : ""}`}
                    onClick={() => !opt.disabled && toggle(opt.value)}
                    onMouseEnter={() => setFocusIdx(i)}
                  >
                    <span className={styles.optionCheck} aria-hidden="true">
                      {checked && <CheckIcon />}
                    </span>
                    <span className={styles.optionBody}>
                      <span className={styles.optionLabel}>{opt.label}</span>
                      {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
          <div className={styles.popoverFooter}>
            <button
              type="button"
              className={styles.footerBtn}
              onClick={clearAll}
              disabled={selectedOptions.length === 0 || disabled}
            >
              Hapus semua
            </button>
            <button
              type="button"
              className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
              onClick={() => {
                setOpen(false);
                setQuery("");
                triggerRef.current?.focus();
              }}
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
