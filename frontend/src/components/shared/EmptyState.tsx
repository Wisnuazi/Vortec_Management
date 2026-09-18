import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
};

/**
 * Friendly "nothing here yet" surface. Used wherever a list/table has
 * zero rows, so the user knows whether the app is broken, the data
 * really doesn't exist, or they need to add something.
 *
 * Pair with the i18n catalog: callers pass already-translated strings
 * via `t("...")` so this component stays locale-agnostic.
 */
export function EmptyState({ title, description, icon, actions, compact, className }: EmptyStateProps) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ""} ${className ?? ""}`} role="status">
      {icon ? <div className={styles.icon}>{icon}</div> : null}
      <h3 className={styles.title}>{title}</h3>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
