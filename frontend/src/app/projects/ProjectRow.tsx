"use client";

import Link from "next/link";
import type { ApiProject } from "@/lib/projects-api";
import { stageLabel } from "@/lib/projects-api";
import { usePreferences } from "@/hooks/usePreferences";
import type { Layout } from "@/components/shared/LayoutToggle";
import styles from "./page.module.css";

export function ProjectRow({ project, layout = "list" }: { project: ApiProject; layout?: Layout }) {
  const { t, locale } = usePreferences();
  const doneCount = project.documents.filter((d) => d.done).length;
  const taskDoneCount = project.tasks.filter((task) => task.status === "DONE").length;

  return (
    <Link href={`/projects/${project.id}`} className={layout === "grid" ? styles.gridCard : styles.row}>
      <span className={styles.projName}>{project.name}</span>
      {project.clientName && <span className={styles.client}>{project.clientName}</span>}
      <span className={`${styles.stagePill} ${styles[`stage_${project.stage}`] ?? ""}`}>
        {stageLabel(project.stage, locale)}
      </span>
      <span className={styles.docProgress}>
        {taskDoneCount}/{project.tasks.length} {t("projects.taskCountSuffix")}
      </span>
      <span className={styles.docProgress}>
        {doneCount}/{project.documents.length} {t("projects.docCountSuffix")}
      </span>
    </Link>
  );
}
