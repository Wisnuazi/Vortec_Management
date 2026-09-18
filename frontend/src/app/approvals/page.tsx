"use client";

import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useApprovals } from "@/hooks/useApprovals";
import { TaskApprovalCard } from "@/components/approvals/ApprovalCards";
import { InboxIcon } from "@/components/icons";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "./page.module.css";

// DEC-082: /approvals is now the "Project approvals" route only.
// The other two sections (Pengajuan Bahan Baku, Kasbon) moved to
// dedicated sub-routes (/approvals/material-requests,
// /approvals/kasbon). The entry points live in the Sidebar submenu
// — the in-page tab strip is gone (same DEC-079 / DEC-082 pattern
// used for /organization). No PageHeader — the sidebar submenu +
// Topbar breadcrumb carry the navigation context.
export default function ApprovalsProjectPage() {
  const { user } = useAuth();
  const { t } = usePreferences();
  const approvals = useApprovals();

  const taskCount = approvals.tasks.length;

  return (
    <div className={styles.wrap}>
      {!approvals.hydrated ? (
        <div role="status" aria-label={t("approvals.loading")}>
          <Skeleton variant="heading" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : (
        <section className={styles.section}>
          {taskCount === 0 ? (
            <EmptyState
              icon={<InboxIcon />}
              title={t("approvals.noTasks")}
              description={t("approvals.noTasksHint")}
              compact
            />
          ) : (
            <div className={styles.list}>
              {approvals.tasks.map((task) => (
                <TaskApprovalCard key={task.id} task={task} onChanged={approvals.reload} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}