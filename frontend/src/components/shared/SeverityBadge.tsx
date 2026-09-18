"use client";

import { usePreferences } from "@/hooks/usePreferences";
import type { Severity } from "@/lib/severity";
import styles from "./SeverityBadge.module.css";

const CLASS_BY_SEVERITY: Record<Severity, string> = {
  urgent: styles.urgent,
  warning: styles.warning,
  info: styles.info,
};

const LABEL_KEY_BY_SEVERITY: Record<Severity, "notifications.severityUrgent" | "notifications.severityWarning" | "notifications.severityInfo"> = {
  urgent: "notifications.severityUrgent",
  warning: "notifications.severityWarning",
  info: "notifications.severityInfo",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = usePreferences();
  return <span className={`${styles.badge} ${CLASS_BY_SEVERITY[severity]}`}>{t(LABEL_KEY_BY_SEVERITY[severity])}</span>;
}
