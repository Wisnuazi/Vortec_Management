"use client";

import { stageLabel, type ProjectStage } from "@/lib/projects-api";
import { useDragScroll } from "@/hooks/useDragScroll";
import { usePreferences } from "@/hooks/usePreferences";
import { XIcon } from "@/components/icons";
import styles from "./page.module.css";

const MAIN_FLOW: ProjectStage[] = [
  "INITIATION",
  "REQUIREMENT",
  "DESIGN",
  "PROCUREMENT",
  "FABRICATION",
  "TESTING",
  "FINAL_REVIEW",
  "RELEASED",
  "PACKAGING",
];

function abbrev(stage: ProjectStage) {
  return stage
    .split("_")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

type WorkflowDiagramProps = {
  stage: ProjectStage;
  /** DEC-065: clicked stage (or null = "show all"). Used by the parent page
   *  to filter Document Checklist + Tasks by workflow lane. Clicking the
   *  active stage again clears the filter. */
  selected?: ProjectStage | null;
  onSelect?: (stage: ProjectStage | null) => void;
};

export function WorkflowDiagram({ stage, selected = null, onSelect }: WorkflowDiagramProps) {
  const { t, locale } = usePreferences();
  const isDiverged = stage === "ON_HOLD" || stage === "REJECTED";
  const currentIndex = MAIN_FLOW.indexOf(stage);
  const scrollRef = useDragScroll<HTMLDivElement>();

  const handleClick = (s: ProjectStage) => {
    if (!onSelect) return;
    // Toggle: clicking the active stage clears the filter.
    onSelect(selected === s ? null : s);
  };

  return (
    <div className={styles.workflowWrap}>
      <div className={styles.workflowHead}>
        <span className={styles.sectionLabel}>{t("projects.workflowTitle")}</span>
        {onSelect && (
          <div className={styles.workflowFilterMeta}>
            {selected ? (
              <>
                <span className={styles.workflowFilterActive}>
                  {t("workflow.filteredBy")} {stageLabel(selected, locale)}
                </span>
                <button
                  type="button"
                  className={styles.workflowFilterClear}
                  onClick={() => onSelect(null)}
                  aria-label={t("workflow.clearFilter")}
                >
                  <XIcon /> {t("workflow.clearFilter")}
                </button>
              </>
            ) : (
              <span className={styles.workflowHint}>{t("workflow.clickToFilter")}</span>
            )}
          </div>
        )}
      </div>
      <div className={styles.workflowScroll} ref={scrollRef}>
        <div className={styles.workflowRow}>
          {MAIN_FLOW.map((s, i) => {
            const label = stageLabel(s, locale);
            const state = isDiverged
              ? "faded"
              : i < currentIndex
                ? "done"
                : i === currentIndex
                  ? "current"
                  : "upcoming";
            const isSelected = selected === s;
            const isClickable = !!onSelect;
            return (
              <div key={s} className={styles.workflowNodeGroup}>
                <button
                  type="button"
                  className={`${styles.workflowNode} ${styles[`wfNode_${state}`]} ${isSelected ? styles.workflowNodeSelected : ""}`}
                  onClick={() => handleClick(s)}
                  disabled={!isClickable}
                  aria-pressed={isSelected}
                  aria-label={label}
                  title={isClickable ? t("workflow.clickToFilter") : undefined}
                  data-interactive={isClickable}
                >
                  <span className={styles.workflowNodeIcon}>{state === "done" ? "✓" : abbrev(s)}</span>
                  <span className={styles.workflowNodeLabel}>{label}</span>
                  {state === "current" && <span className={styles.workflowPulse} aria-hidden="true" />}
                </button>
                {i < MAIN_FLOW.length - 1 && (
                  <div className={`${styles.workflowConnector} ${i < currentIndex && !isDiverged ? styles.workflowConnectorDone : ""}`}>
                    <span className={styles.workflowArrow} aria-hidden="true">
                      ▸
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {isDiverged && (
            <>
              <div className={styles.workflowConnector}>
                <span className={styles.workflowArrow} aria-hidden="true">
                  ▸
                </span>
              </div>
              <div className={styles.workflowNodeGroup}>
                <div className={`${styles.workflowNode} ${styles[stage === "ON_HOLD" ? "wfNode_hold" : "wfNode_rejected"]}`}>
                  <span className={styles.workflowNodeIcon}>{stage === "ON_HOLD" ? "‖" : "✕"}</span>
                  <span className={styles.workflowNodeLabel}>{stageLabel(stage, locale)}</span>
                  <span className={styles.workflowPulse} aria-hidden="true" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
