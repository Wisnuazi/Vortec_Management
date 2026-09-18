"use client";

import Link from "next/link";
import { usePreferences } from "@/hooks/usePreferences";
import { PROJECT_STAGES, TASK_STATUSES, MATERIAL_REQUEST_STATUSES, type ApiProject, type ProjectStage, type TaskStatus } from "@/lib/projects-api";
import { formatDate } from "@/lib/format";
import { dateSeverity } from "@/lib/severity";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { InboxIcon } from "@/components/icons";
import styles from "./ProjectsDashboard.module.css";

const INACTIVE_STAGES: ProjectStage[] = ["RELEASED", "REJECTED", "ON_HOLD"];
const EXCEPTION_STAGES: ProjectStage[] = ["ON_HOLD", "REJECTED"];

function parseBudget(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue} data-tone={tone}>
        {value}
      </span>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}

export function ProjectsDashboard({ projects }: { projects: ApiProject[] }) {
  const { t, locale } = usePreferences();
  const now = new Date();

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => !INACTIVE_STAGES.includes(p.stage)).length;

  const allTasks = projects.flatMap((p) => p.tasks.map((task) => ({ ...task, projectId: p.id, projectName: p.name })));
  const nonRejectedTasks = allTasks.filter((t) => t.status !== "REJECTED");
  const doneTasks = allTasks.filter((t) => t.status === "DONE").length;
  const completionRate = nonRejectedTasks.length > 0 ? Math.round((doneTasks / nonRejectedTasks.length) * 100) : 0;

  const overdueTasks = allTasks.filter(
    (task) => task.dueDate && new Date(task.dueDate) < now && task.status !== "DONE" && task.status !== "REJECTED"
  );
  const overdueProjects = projects.filter(
    (p) => p.targetDate && new Date(p.targetDate) < now && !["RELEASED", "REJECTED"].includes(p.stage)
  );

  const totalBudget = projects.reduce((sum, p) => sum + parseBudget(p.budget), 0);

  const stageCounts = PROJECT_STAGES.map((s) => ({
    ...s,
    count: projects.filter((p) => p.stage === s.value).length,
  }));
  const maxStageCount = Math.max(1, ...stageCounts.map((s) => s.count));

  const taskStatusCounts = TASK_STATUSES.map((s) => ({
    ...s,
    count: allTasks.filter((t) => t.status === s.value).length,
  }));
  const totalTaskCount = allTasks.length;

  const materialRequests = projects.flatMap((p) => p.materialRequests);
  const materialRequestCounts = MATERIAL_REQUEST_STATUSES.map((s) => ({
    ...s,
    count: materialRequests.filter((r) => r.status === s.value).length,
  }));

  const attentionItems = [
    ...overdueProjects.map((p) => ({
      key: `project-${p.id}`,
      href: `/projects/${p.id}`,
      title: p.name,
      dateIso: p.targetDate as string,
      kind: t("dashboard.project"),
    })),
    ...overdueTasks.map((task) => ({
      key: `task-${task.id}`,
      href: `/projects/${task.projectId}`,
      title: `${task.title} — ${task.projectName}`,
      dateIso: task.dueDate as string,
      kind: t("tasks.title"),
    })),
  ].sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime());

  return (
    <div className={styles.wrap}>
      <div className={styles.tileGrid}>
        <StatTile label={t("dashboard.totalProjects")} value={String(totalProjects)} />
        <StatTile label={t("dashboard.activeProjects")} value={String(activeProjects)} />
        <StatTile label={t("dashboard.taskCompletionRate")} value={`${completionRate}%`} tone="success" />
        <StatTile
          label={t("dashboard.overdueTasks")}
          value={String(overdueTasks.length)}
          tone={overdueTasks.length > 0 ? "danger" : undefined}
        />
        <StatTile
          label={t("dashboard.overdueProjects")}
          value={String(overdueProjects.length)}
          tone={overdueProjects.length > 0 ? "danger" : undefined}
        />
        <StatTile label={t("dashboard.totalBudget")} value={`Rp ${totalBudget.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`} />
      </div>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <span className={styles.panelLabel}>{t("dashboard.byStage")}</span>
          <div className={styles.stageList}>
            {stageCounts.map((s, i) => {
              const isException = EXCEPTION_STAGES.includes(s.value);
              const widthPct = (s.count / maxStageCount) * 100;
              return (
                <div key={s.value} className={styles.stageRow}>
                  <span className={styles.stageName}>{s.label[locale]}</span>
                  <div className={styles.stageTrack}>
                    <div
                      className={isException ? (s.value === "ON_HOLD" ? styles.stageBarWarning : styles.stageBarDanger) : styles.stageBar}
                      style={{
                        width: `${Math.max(widthPct, s.count > 0 ? 4 : 0)}%`,
                        ...(isException ? {} : { opacity: 0.4 + (i / (PROJECT_STAGES.length - 1)) * 0.6 }),
                      }}
                      title={`${s.label[locale]}: ${s.count}`}
                    />
                  </div>
                  <span className={styles.stageCount}>{s.count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <div className={styles.sideColumn}>
          <section className={styles.panel}>
            <span className={styles.panelLabel}>{t("dashboard.taskStatus")}</span>
            {totalTaskCount === 0 ? (
              <EmptyState icon={<InboxIcon />} title={t("dashboard.noTasks")} compact />
            ) : (
              <>
                <div className={styles.stackedBar}>
                  {taskStatusCounts
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <div
                        key={s.value}
                        className={styles.stackedSegment}
                        data-status={s.value}
                        style={{ width: `${(s.count / totalTaskCount) * 100}%` }}
                        title={`${s.label[locale]}: ${s.count}`}
                      />
                    ))}
                </div>
                <ul className={styles.legend}>
                  {taskStatusCounts.map((s) => (
                    <li key={s.value} className={styles.legendItem}>
                      <span className={styles.legendDot} data-status={s.value} aria-hidden="true" />
                      {s.label[locale]} ({s.count})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className={styles.panel}>
            <span className={styles.panelLabel}>{t("dashboard.materialRequests")}</span>
            {materialRequests.length === 0 ? (
              <EmptyState icon={<InboxIcon />} title={t("materialRequests.empty")} compact />
            ) : (
              <ul className={styles.mrList}>
                {materialRequestCounts
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <li key={s.value} className={styles.mrItem}>
                      <span>{s.label[locale]}</span>
                      <strong>{s.count}</strong>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className={styles.panel}>
        <span className={styles.panelLabel}>{t("dashboard.needsAttention")}</span>
        {attentionItems.length === 0 ? (
          <EmptyState icon={<InboxIcon />} title={t("dashboard.noAttentionItems")} compact />
        ) : (
          <ul className={styles.attentionList}>
            {attentionItems.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className={styles.attentionRow}>
                  <SeverityBadge severity={dateSeverity(item.dateIso, true)} />
                  <span className={styles.attentionKind}>{item.kind}</span>
                  <span className={styles.attentionTitle}>{item.title}</span>
                  <span className={styles.attentionDate}>{formatDate(item.dateIso, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
