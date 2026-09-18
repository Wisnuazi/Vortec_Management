"use client";

import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

/**
 * DEC-069: shared PageHeader — consistent title row + subtitle + actions
 * slot for every top-level page. Replaces ad-hoc <h1> + bespoke actions
 * layout that varied between /projects, /inventory, /assets, etc.
 *
 *   <PageHeader
 *     title="Projects"
 *     subtitle="Daftar project yang sedang berjalan"
 *     actions={<Button>+ Project</Button>}
 *   />
 *
 * Slots:
 *   - title       : required, page title
 *   - subtitle    : optional muted line below title
 *   - actions     : optional right-aligned button row
 *   - tabs        : optional row below the header (e.g. tablist)
 *   - children    : optional extra content (breadcrumb, search, etc.)
 */

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  /** Optional small line above the title — usually a back link or breadcrumb. */
  eyebrow?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, tabs, eyebrow, children }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.row}>
        <div className={styles.titleCol}>
          {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
      {children ? <div className={styles.extra}>{children}</div> : null}
    </header>
  );
}
