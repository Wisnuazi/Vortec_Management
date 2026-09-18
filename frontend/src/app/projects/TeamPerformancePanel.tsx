"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { projectsApi, type ApiPerformanceTask } from "@/lib/projects-api";
import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "./TeamPerformancePanel.module.css";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TeamStats = {
  roleTitle: string;
  completedCount: number;
  withDueDateCount: number;
  onTimeCount: number;
  avgDeltaDays: number | null; // negative = finishes early on average, positive = late
  avgCycleDays: number | null; // createdAt -> completedAt, regardless of due date
};

function computeTeamStats(tasks: ApiPerformanceTask[]): TeamStats[] {
  const byRole = new Map<string, ApiPerformanceTask[]>();
  for (const t of tasks) {
    if (!t.assignedRoleTitle || t.status !== "DONE" || !t.completedAt) continue;
    const list = byRole.get(t.assignedRoleTitle) ?? [];
    list.push(t);
    byRole.set(t.assignedRoleTitle, list);
  }

  const stats: TeamStats[] = [];
  for (const [roleTitle, list] of byRole) {
    const withDue = list.filter((t) => t.dueDate);
    const deltas = withDue.map((t) => (new Date(t.completedAt!).getTime() - new Date(t.dueDate!).getTime()) / MS_PER_DAY);
    const cycles = list.map((t) => (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / MS_PER_DAY);
    const avgDeltaDays = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
    const avgCycleDays = cycles.length > 0 ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;
    stats.push({
      roleTitle,
      completedCount: list.length,
      withDueDateCount: withDue.length,
      onTimeCount: deltas.filter((d) => d <= 0).length,
      avgDeltaDays,
      avgCycleDays,
    });
  }

  // Fastest-vs-deadline first; teams with no due-date data sink to the
  // bottom (ranked among themselves by raw cycle time instead).
  return stats.sort((a, b) => {
    if (a.avgDeltaDays !== null && b.avgDeltaDays !== null) return a.avgDeltaDays - b.avgDeltaDays;
    if (a.avgDeltaDays !== null) return -1;
    if (b.avgDeltaDays !== null) return 1;
    return (a.avgCycleDays ?? 0) - (b.avgCycleDays ?? 0);
  });
}

export function TeamPerformancePanel() {
  const { token } = useAuth();
  const { t, locale } = usePreferences();
  const [tasks, setTasks] = useState<ApiPerformanceTask[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    projectsApi
      .teamPerformance(token)
      .then((data) => {
        if (!cancelled) setTasks(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return null; // 403 for roles this panel isn't meant for — fail silently, not an error banner
  if (!tasks) return <p className={styles.loading}>{t("teamPerf.loading")}</p>;

  const stats = computeTeamStats(tasks);
  const ranked = stats.filter((s) => s.avgDeltaDays !== null);
  const unranked = stats.filter((s) => s.avgDeltaDays === null);
  const maxAbsDelta = Math.max(1, ...ranked.map((s) => Math.abs(s.avgDeltaDays!)));

  const fmtDays = (d: number) => {
    const rounded = Math.round(Math.abs(d) * 10) / 10;
    const unit = locale === "id" ? "hari" : rounded === 1 ? "day" : "days";
    return `${rounded} ${unit}`;
  };

  return (
    <section className={styles.panel}>
      <span className={styles.panelLabel}>{t("teamPerf.title")}</span>
      <p className={styles.hint}>{t("teamPerf.hint")}</p>
      {ranked.length === 0 && unranked.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("teamPerf.empty")} compact />
      ) : (
        <>
          {ranked.length > 0 && (
            <div className={styles.divergingChart}>
              {ranked.map((s) => {
                const isEarly = s.avgDeltaDays! <= 0;
                const widthPct = (Math.abs(s.avgDeltaDays!) / maxAbsDelta) * 50;
                const onTimeRate = Math.round((s.onTimeCount / s.withDueDateCount) * 100);
                return (
                  <div key={s.roleTitle} className={styles.row}>
                    <span className={styles.roleName}>{s.roleTitle}</span>
                    <div className={styles.track}>
                      <div className={styles.centerLine} />
                      <div
                        className={isEarly ? styles.barEarly : styles.barLate}
                        style={{ width: `${Math.max(widthPct, 1.5)}%` }}
                        title={`${s.roleTitle}: ${isEarly ? "-" : "+"}${fmtDays(s.avgDeltaDays!)}`}
                      />
                    </div>
                    <span className={isEarly ? styles.valueEarly : styles.valueLate}>
                      {isEarly ? "−" : "+"}
                      {fmtDays(s.avgDeltaDays!)}
                    </span>
                    <span className={styles.meta}>
                      {s.completedCount} {t("teamPerf.tasksDone")} · {onTimeRate}% {t("teamPerf.onTime")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <ul className={styles.legend}>
            <li className={styles.legendItem}>
              <span className={styles.legendDot} data-tone="early" /> {t("teamPerf.legendEarly")}
            </li>
            <li className={styles.legendItem}>
              <span className={styles.legendDot} data-tone="late" /> {t("teamPerf.legendLate")}
            </li>
          </ul>
          {unranked.length > 0 && (
            <div className={styles.unrankedWrap}>
              <span className={styles.unrankedLabel}>{t("teamPerf.noDeadlineData")}</span>
              <ul className={styles.unrankedList}>
                {unranked.map((s) => (
                  <li key={s.roleTitle} className={styles.unrankedItem}>
                    <span>{s.roleTitle}</span>
                    <span className={styles.meta}>
                      {s.completedCount} {t("teamPerf.tasksDone")}
                      {s.avgCycleDays !== null ? ` · ${t("teamPerf.avgCycle")}: ${fmtDays(s.avgCycleDays)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
