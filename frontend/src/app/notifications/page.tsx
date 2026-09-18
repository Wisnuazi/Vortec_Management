"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useNotifications } from "@/hooks/useNotifications";
import { isPrivilegedClient, userHasRoleTitle, canAccessKasbon } from "@/lib/auth-api";
import { formatDate } from "@/lib/format";
import { dateSeverity } from "@/lib/severity";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { InboxIcon } from "@/components/icons";
import type {
  NotificationTask,
  NotificationProject,
  NotificationTaskApproval,
  NotificationMaterialRequestApproval,
  NotificationKasbonPhase,
  NotificationBomItem,
} from "@/lib/notifications-api";
import Link from "next/link";
import styles from "./page.module.css";

function TaskRow({ task }: { task: NotificationTask }) {
  const { locale } = usePreferences();
  return (
    <Link href={`/projects/${task.projectId}`} className={task.overdue ? `${styles.row} ${styles.rowOverdue}` : styles.row}>
      <SeverityBadge severity={dateSeverity(task.dueDate, task.overdue)} />
      <span className={styles.projectTag}>{task.projectName}</span>
      <span className={styles.title}>{task.title}</span>
      {task.assignedRoleTitle && <span className={styles.roleBadge}>{task.assignedRoleTitle}</span>}
      <span className={styles.dueDate}>{formatDate(task.dueDate, locale)}</span>
    </Link>
  );
}

function ProjectRow({ project }: { project: NotificationProject }) {
  const { locale } = usePreferences();
  return (
    <Link href={`/projects/${project.id}`} className={project.overdue ? `${styles.row} ${styles.rowOverdue}` : styles.row}>
      <SeverityBadge severity={dateSeverity(project.targetDate, project.overdue)} />
      <span className={styles.title}>{project.name}</span>
      <span className={styles.dueDate}>{formatDate(project.targetDate, locale)}</span>
    </Link>
  );
}

function TaskApprovalRow({ task }: { task: NotificationTaskApproval }) {
  const { t, locale } = usePreferences();
  return (
    <Link href="/approvals" className={`${styles.row} ${styles.rowApproval}`}>
      <span className={styles.approvalTag}>{t("notifications.approvalTagTask")}</span>
      <span className={styles.projectTag}>{task.projectName}</span>
      <span className={styles.title}>{task.title}</span>
      {task.assignedRoleTitle && <span className={styles.roleBadge}>{task.assignedRoleTitle}</span>}
      {task.dueDate && <span className={styles.dueDate}>{formatDate(task.dueDate, locale)}</span>}
    </Link>
  );
}

function MaterialRequestApprovalRow({ request }: { request: NotificationMaterialRequestApproval }) {
  const { t, locale } = usePreferences();
  return (
    <Link href="/approvals" className={`${styles.row} ${styles.rowApproval}`}>
      <span className={styles.approvalTag}>{t("notifications.approvalTagMaterialRequest")}</span>
      <span className={styles.projectTag}>{request.projectName}</span>
      <span className={styles.title}>{request.title}</span>
      <span className={styles.dueDate}>
        {request.requestedByUserName} · {formatDate(request.createdAt, locale)}
      </span>
    </Link>
  );
}

function KasbonPendingReviewRow({ phase }: { phase: NotificationKasbonPhase }) {
  const { locale } = usePreferences();
  return (
    <Link href="/operational" className={`${styles.row} ${styles.rowApproval}`}>
      <span className={styles.approvalTag}>{phase.division}</span>
      <span className={styles.title}>
        {phase.period} · Phase {phase.phase}
      </span>
      <span className={styles.dueDate}>
        {phase.requestedByUserName} {phase.submittedAt ? `· ${formatDate(phase.submittedAt, locale)}` : ""}
      </span>
    </Link>
  );
}

function KasbonNeedsRevisionRow({ phase }: { phase: NotificationKasbonPhase }) {
  const { locale } = usePreferences();
  return (
    <Link href="/operational" className={`${styles.row} ${styles.rowOverdue}`}>
      <span className={styles.title}>
        {phase.division} · {phase.period} · Phase {phase.phase}
      </span>
      <span className={styles.dueDate}>{phase.reviewedAt ? formatDate(phase.reviewedAt, locale) : ""}</span>
      {phase.reviewNote && <span className={styles.dueDate}>— &ldquo;{phase.reviewNote}&rdquo;</span>}
    </Link>
  );
}

// DEC-073: BOM notification row. Links straight to the project page
// so the user can jump into the BOM tab. Status pill colors stay muted
// per DEC-071 (outline-only, never a solid red fill).
function BomRow({ item }: { item: NotificationBomItem }) {
  const { t, locale } = usePreferences();
  return (
    <Link href={`/projects/${item.projectId}`} className={styles.row}>
      <span className={styles.projectTag}>{item.projectName}</span>
      <span className={styles.title}>
        {item.name} <span className={styles.hintSmall}>× {item.quantity} {item.unit}</span>
      </span>
      {item.submittedByUserName && (
        <span className={styles.hintSmall}>
          {t("notifications.bomRowApproveNote")}{" "}
          {item.status === "REJECTED" && item.approveNote ? `&ldquo;${item.approveNote}&rdquo;` : ""}
        </span>
      )}
      <span className={styles.dueDate}>
        {item.approvedAt ? formatDate(item.approvedAt, locale) : ""}
      </span>
    </Link>
  );
}

type Tab = "project" | "operational" | "bom";

function InboxRow({
  item,
  onRead,
}: {
  item: import("@/lib/notifications-api").InboxNotification;
  onRead: (id: string) => void;
}) {
  const { t, locale } = usePreferences();
  // DEC-063: each inbox item is a state-change on a BOM (today).
  // Clicking the row deep-links to the project page; we also
  // optimistically mark it as read so the badge ticks down.
  const date = new Date(item.createdAt);
  const target = item.projectId ? `/projects/${item.projectId}` : null;
  const handleClick = () => {
    onRead(item.id);
    if (target) {
      window.location.href = target;
    }
  };
  const unread = !item.readAt;
  return (
    <div
      className={`${styles.approvalRow} ${unread ? styles.approvalRowUnread : ""}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className={styles.approvalRowHead}>
        <span className={`${styles.approvalTag} ${unread ? styles.approvalTagUnread : ""}`}>
          {t("notifications.inboxTagBom")}
        </span>
        <strong>{item.title}</strong>
      </div>
      <p className={styles.notes}>{item.body}</p>
      <span className={styles.hintSmall}>
        {date.toLocaleString(locale === "id" ? "id-ID" : "en-US")}
        {unread ? ` · ${t("notifications.inboxUnread")}` : ""}
      </span>
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { t } = usePreferences();
  const notifications = useNotifications();
  // Director/OM included for the Material Request approval count + MR
  // approval inbox on the Notifications page (DEC-051).
  const isProjectManager = isPrivilegedClient(user) || userHasRoleTitle(user, "Project Manager");
  const hasOperationalTab = canAccessKasbon(user);
  // DEC-082: tab state lives in URL query (?tab=project|operational|bom)
  // so the Sidebar submenu can link to each section. In-page tab strip
  // is gone.
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab = rawTab === "operational" ? "operational" : rawTab === "bom" ? "bom" : "project";
  const activeTab = hasOperationalTab ? tab : "project";
  // DEC-073: BOM tab is always shown — at least one BOM section is
  // populated for every role (submitter sees rejected/processing/arrived,
  // reviewer sees pendingReview, Purchasing sees approvedNeedsPurchase).
  const hasBomTab = notifications.hydrated;

  return (
    <div className={styles.wrap}>
      <PageHeader title={t("nav.notifications")} subtitle={t("notifications.pageDescription")} />

      {!notifications.hydrated ? (
        <div role="status" aria-label={t("notifications.loading")}>
          <Skeleton variant="heading" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : (
        <>
          {notifications.pendingApprovalsCount > 0 && (
            <Link href="/approvals" className={styles.approvalBanner}>
              {t("notifications.pendingApprovalsPrefix")} <strong>{notifications.pendingApprovalsCount}</strong>{" "}
              {isProjectManager ? t("notifications.pendingApprovalsSuffixPM") : t("notifications.pendingApprovalsSuffix")}
            </Link>
          )}

          {/* DEC-063: persistent notifications inbox. Newest first,
              each row deep-links to the project page and marks itself
              as read. "Mark all read" appears once at least one row
              is unread. */}
          <section className={styles.section}>
            <div className={styles.sectionHeadRow}>
              <span className={styles.sectionLabel}>
                {t("notifications.inboxTitle")}{" "}
                {notifications.unreadCount > 0 && (
                  <span className="tabBadge">{notifications.unreadCount}</span>
                )}
              </span>
              {notifications.unreadCount > 0 && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => notifications.markAllRead()}
                >
                  {t("notifications.inboxMarkAllRead")}
                </button>
              )}
            </div>
            {notifications.inbox.length === 0 ? (
              <p className={styles.emptyHint}>{t("notifications.inboxEmpty")}</p>
            ) : (
              <div className={styles.list}>
                {notifications.inbox.map((item) => (
                  <InboxRow key={item.id} item={item} onRead={notifications.markRead} />
                ))}
              </div>
            )}
          </section>

          {activeTab === "project" ? (
            <>
              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.taskApprovals")}</span>
                {notifications.project.taskApprovals.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneTaskApprovals")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.project.taskApprovals.map((task) => (
                      <TaskApprovalRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </section>

              {isProjectManager && (
                <section className={styles.section}>
                  <span className={styles.sectionLabel}>{t("notifications.materialRequestApprovals")}</span>
                  {notifications.project.materialRequestApprovals.length === 0 ? (
                    <p className={styles.emptyHint}>{t("notifications.noneMaterialRequestApprovals")}</p>
                  ) : (
                    <div className={styles.list}>
                      {notifications.project.materialRequestApprovals.map((r) => (
                        <MaterialRequestApprovalRow key={r.id} request={r} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.overdueTasks")}</span>
                {notifications.project.overdueTasks.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneOverdueTasks")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.project.overdueTasks.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.upcomingTasks")}</span>
                {notifications.project.upcomingTasks.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneUpcomingTasks")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.project.upcomingTasks.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.overdueProjects")}</span>
                {notifications.project.overdueProjects.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneOverdueProjects")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.project.overdueProjects.map((p) => (
                      <ProjectRow key={p.id} project={p} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.upcomingProjects")}</span>
                {notifications.project.upcomingProjects.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneUpcomingProjects")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.project.upcomingProjects.map((p) => (
                      <ProjectRow key={p.id} project={p} />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : activeTab === "operational" ? (
            <>
              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.kasbonPendingReview")}</span>
                {notifications.operational.kasbonPendingReview.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneKasbonPendingReview")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.operational.kasbonPendingReview.map((p) => (
                      <KasbonPendingReviewRow key={p.id} phase={p} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.kasbonNeedsRevision")}</span>
                {notifications.operational.kasbonNeedsRevision.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneKasbonNeedsRevision")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.operational.kasbonNeedsRevision.map((p) => (
                      <KasbonNeedsRevisionRow key={p.id} phase={p} />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <p className={styles.sectionHint}>{t("notifications.bomHint")}</p>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.bomPendingReview")}</span>
                {notifications.bom.pendingReview.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneBomPendingReview")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.bom.pendingReview.map((b) => (
                      <BomRow key={b.id} item={b} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.bomRejected")}</span>
                {notifications.bom.rejected.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneBomRejected")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.bom.rejected.map((b) => (
                      <BomRow key={b.id} item={b} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.bomApprovedNeedsPurchase")}</span>
                {notifications.bom.approvedNeedsPurchase.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneBomApprovedNeedsPurchase")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.bom.approvedNeedsPurchase.map((b) => (
                      <BomRow key={b.id} item={b} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.bomProcessing")}</span>
                {notifications.bom.processing.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneBomProcessing")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.bom.processing.map((b) => (
                      <BomRow key={b.id} item={b} />
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.section}>
                <span className={styles.sectionLabel}>{t("notifications.bomArrived")}</span>
                {notifications.bom.arrived.length === 0 ? (
                  <p className={styles.emptyHint}>{t("notifications.noneBomArrived")}</p>
                ) : (
                  <div className={styles.list}>
                    {notifications.bom.arrived.map((b) => (
                      <BomRow key={b.id} item={b} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
