"use client";

import { usePreferences } from "@/hooks/usePreferences";
import type { ActivityCategory } from "@/lib/activityCategory";
import styles from "./ActivityCategoryBadge.module.css";

const CLASS_BY_CATEGORY: Record<ActivityCategory, string> = {
  create: styles.create,
  update: styles.update,
  delete: styles.delete,
  decision: styles.decision,
  auth: styles.auth,
};

const LABEL_KEY_BY_CATEGORY: Record<
  ActivityCategory,
  | "activityLog.categoryCreate"
  | "activityLog.categoryUpdate"
  | "activityLog.categoryDelete"
  | "activityLog.categoryDecision"
  | "activityLog.categoryAuth"
> = {
  create: "activityLog.categoryCreate",
  update: "activityLog.categoryUpdate",
  delete: "activityLog.categoryDelete",
  decision: "activityLog.categoryDecision",
  auth: "activityLog.categoryAuth",
};

export function ActivityCategoryBadge({ category }: { category: ActivityCategory }) {
  const { t } = usePreferences();
  return <span className={`${styles.badge} ${CLASS_BY_CATEGORY[category]}`}>{t(LABEL_KEY_BY_CATEGORY[category])}</span>;
}
