"use client";

import { usePreferences } from "@/hooks/usePreferences";
import { useApprovals } from "@/hooks/useApprovals";
import { MaterialRequestApprovalCard } from "@/components/approvals/ApprovalCards";
import { InboxIcon } from "@/components/icons";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "../page.module.css";

// DEC-082: /approvals/material-requests — the Pengajuan Bahan Baku
// review queue. Dedicated sub-route so it can be linked directly
// from the Sidebar submenu.
export default function ApprovalsMaterialRequestsPage() {
  const { t } = usePreferences();
  const approvals = useApprovals();

  const mrCount = approvals.materialRequests.length;

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
          {mrCount === 0 ? (
            <EmptyState
              icon={<InboxIcon />}
              title={t("approvals.noMaterialRequests")}
              description={t("approvals.noMaterialRequestsHint")}
              compact
            />
          ) : (
            <div className={styles.list}>
              {approvals.materialRequests.map((r) => (
                <MaterialRequestApprovalCard key={r.id} request={r} onChanged={approvals.reload} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}