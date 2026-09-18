"use client";

import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useOperational } from "@/hooks/useOperational";
import { canReviewKasbon } from "@/lib/auth-api";
import { KasbonSubmissionCard } from "@/components/approvals/ApprovalCards";
import { InboxIcon, BrochureIcon } from "@/components/icons";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import styles from "../page.module.css";

// DEC-082: /approvals/kasbon — the Kasbon review queue (OM/Finance
// review). Gated by `canReviewKasbon(user)`; users without access
// see the standard restricted empty state.
export default function ApprovalsKasbonPage() {
  const { user } = useAuth();
  const { t } = usePreferences();
  const operational = useOperational();

  const showKasbon = canReviewKasbon(user);
  const pendingKasbon = showKasbon && operational.hydrated
    ? operational.kasbonPhases.flatMap((phase) =>
        phase.submissions
          .filter((s) => s.status === "PENDING")
          .map((s) => ({
            submission: { ...s, submittedByUserName: s.submittedByUserName },
            phaseInfo: { division: phase.division, period: phase.period, phase: phase.phase },
          }))
      )
    : [];
  const kasbonCount = pendingKasbon.length;

  return (
    <div className={styles.wrap}>
      {!operational.hydrated ? (
        <div role="status" aria-label={t("approvals.loading")}>
          <Skeleton variant="heading" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : !showKasbon ? (
        <EmptyState
          icon={<BrochureIcon />}
          title={t("common.restricted")}
          description={t("common.restrictedHint")}
        />
      ) : (
        <section className={styles.section}>
          {kasbonCount === 0 ? (
            <EmptyState
              icon={<InboxIcon />}
              title={t("approvals.noKasbon")}
              description={t("approvals.noKasbonHint")}
              compact
            />
          ) : (
            <div className={styles.list}>
              {pendingKasbon.map((sub) => (
                <KasbonSubmissionCard
                  key={sub.submission.id}
                  submission={sub.submission}
                  phaseInfo={sub.phaseInfo}
                  onReview={async (decision, reviewNote) => {
                    await operational.reviewSubmission(sub.submission.id, decision, reviewNote);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}