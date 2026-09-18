"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useApprovals } from "@/hooks/useApprovals";
import { useNotifications } from "@/hooks/useNotifications";
import { useProjects } from "@/hooks/useProjects";
import { useBom, useBomSummary } from "@/hooks/useBom";
import { usePurchasing } from "@/hooks/usePurchasing";
import { useOperational } from "@/hooks/useOperational";
import { useVendors } from "@/hooks/useVendors";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  canViewBom,
  canOwnBomType,
  canReviewBom,
  canProcessBom,
  canViewPurchasing,
  canViewActivityLog,
  canAccessApprovals,
  canAccessKasbon,
  getDashboardVariant,
  isPrivilegedClient,
  userHasRoleTitle,
  type AuthUser,
} from "@/lib/auth-api";
import { BOM_TYPES, type ApiBomItem, type BomType } from "@/lib/bom-api";
import { PROJECT_STAGES, taskStatusLabel, type ApiProject, type ApiTask } from "@/lib/projects-api";
import { formatDate } from "@/lib/format";
import { dateSeverity } from "@/lib/severity";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { ActivityCategoryBadge } from "@/components/shared/ActivityCategoryBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { categorizeActivity } from "@/lib/activityCategory";
import {
  AlertIcon,
  ActivityIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckSquareIcon,
  ClipboardCheckIcon,
  ClockIcon,
  FolderIcon,
  PackageIcon,
  ShoppingCartIcon,
  UsersIcon,
  WalletIcon,
  StoreIcon,
} from "@/components/icons";
import styles from "./page.module.css";

const INACTIVE_STAGES = ["RELEASED", "REJECTED", "ON_HOLD"];

// === Time-of-day greeting ===================================================
function greetingFor(date: Date, locale: string): string {
  const h = date.getHours();
  if (locale.startsWith("id")) {
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 19) return "Selamat sore";
    return "Selamat malam";
  }
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// === Role badges =============================================================
function RoleBadges({ user }: { user: AuthUser }) {
  const { t } = usePreferences();
  const pairs = user.roleIds.map((id, i) => ({ id, title: user.roleTitles[i] ?? "" }));
  return (
    <div className={styles.rolePanel}>
      <UsersIcon />
      <span className={styles.roleLabel}>{t("home.yourRoles")}</span>
      <div className={styles.roleBadges}>
        {user.isSuperAdmin && (
          <span className={`${styles.roleBadge} ${styles.roleBadgeAdmin}`}>Super Admin</span>
        )}
        {pairs.map(({ id, title }) => (
          <Link
            key={id}
            href={`/organization/role/${id}`}
            className={`${styles.roleBadge} ${styles.roleBadgeLink}`}
            title={t("home.yourRolesHint")}
          >
            {title}
          </Link>
        ))}
        {!user.isSuperAdmin && pairs.length === 0 && (
          <span className={styles.roleBadgeNone}>{t("home.noRoles")}</span>
        )}
      </div>
    </div>
  );
}

// === Stat tile with icon =====================================================
function StatTile({
  label,
  value,
  tone,
  href,
  icon,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning" | "info";
  href: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link href={href} className={styles.tile} data-tone={tone}>
      {icon && <span className={styles.tileIcon} data-tone={tone}>{icon}</span>}
      <div className={styles.tileBody}>
        <span className={styles.tileValue} data-tone={tone}>
          {value}
        </span>
        <span className={styles.tileLabel}>{label}</span>
      </div>
      <span className={styles.tileArrow} aria-hidden="true">
        <ArrowRightIcon />
      </span>
    </Link>
  );
}

// === Section panel ===========================================================
function Panel({
  title,
  action,
  icon,
  children,
  tone,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "warning" | "danger" | "info";
  className?: string;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`} data-tone={tone}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>
          {icon && <span className={styles.panelIcon}>{icon}</span>}
          {title}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

// === My Tasks panel ==========================================================
function MyTasksPanel({ projects, user }: { projects: ApiProject[]; user: AuthUser }) {
  const { t, locale } = usePreferences();
  const roleIds = new Set(user.roleIds);
  const myTasks = projects
    .flatMap((p) => p.tasks.map((task) => ({ ...task, projectId: p.id, projectName: p.name })))
    .filter(
      (task) =>
        task.assignedRoleIds?.some((rid: string) => roleIds.has(rid)) &&
        task.status !== "DONE" &&
        task.status !== "REJECTED"
    )
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  return (
    <Panel
      title={t("home.myTasks")}
      icon={<CheckSquareIcon />}
      action={
        <Link href="/projects" className={styles.panelLink}>
          {t("home.seeAll")}
          <ArrowRightIcon />
        </Link>
      }
    >
      {myTasks.length === 0 ? (
        <EmptyState compact title={t("home.myTasksEmpty")} icon={<CheckSquareIcon />} />
      ) : (
        <ul className={styles.taskList}>
          {myTasks.slice(0, 6).map((task: ApiTask & { projectId: string; projectName: string }) => (
            <li key={task.id}>
              <Link href={`/projects/${task.projectId}`} className={styles.taskRow}>
                <span className={styles.taskTitle}>{task.title}</span>
                <span className={styles.taskProject}>{task.projectName}</span>
                <span className={styles.taskStatus}>{taskStatusLabel(task.status, locale)}</span>
                <span className={styles.taskDue}>{task.dueDate ? formatDate(task.dueDate, locale) : "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// === Project summary ========================================================
function ProjectSummaryPanel({ projects }: { projects: ApiProject[] }) {
  const { t } = usePreferences();
  const total = projects.length;
  const active = projects.filter((p) => !INACTIVE_STAGES.includes(p.stage)).length;
  const stageCounts = PROJECT_STAGES.map((s) => ({ ...s, count: projects.filter((p) => p.stage === s.value).length })).filter(
    (s) => s.count > 0
  );

  return (
    <Panel
      title={t("home.projectSummary")}
      icon={<FolderIcon />}
      action={
        <Link href="/projects" className={styles.panelLink}>
          {t("home.seeAll")}
          <ArrowRightIcon />
        </Link>
      }
    >
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <strong>{total}</strong>
          <span>{t("dashboard.totalProjects")}</span>
        </div>
        <div className={styles.miniStat}>
          <strong>{active}</strong>
          <span>{t("dashboard.activeProjects")}</span>
        </div>
      </div>
      {stageCounts.length > 0 && (
        <ul className={styles.stageChips}>
          {stageCounts.map((s) => (
            <li key={s.value} className={styles.stageChip}>
              {s.label.id} <strong>{s.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// === Needs attention (featured card) ========================================
function NeedsAttentionCard({ user }: { user: AuthUser }) {
  const { t } = usePreferences();
  const approvals = useApprovals();
  if (!approvals.hydrated) return null;
  if (approvals.tasks.length === 0) return null;

  const roleIds = new Set(user.roleIds);
  const myTasks = approvals.tasks.filter((task) =>
    task.assignedRoleIds?.some((rid: string) => roleIds.has(rid))
  );
  if (myTasks.length === 0) return null;

  return (
    <Panel
      title={t("notifications.needsAttention")}
      icon={<AlertIcon />}
      tone="warning"
      action={
        <Link href="/approvals" className={styles.panelLink}>
          {t("home.seeAll")}
          <ArrowRightIcon />
        </Link>
      }
    >
      <ul className={styles.taskList}>
        {myTasks.slice(0, 6).map((task) => (
          <li key={task.id}>
            <Link href={`/projects/${task.projectId}`} className={styles.taskRow}>
              <span className={styles.taskTitle}>{task.title}</span>
              <span className={styles.taskProject}>{task.projectName}</span>
              <SeverityBadge severity={dateSeverity(task.dueDate, !!task.dueDate && new Date(task.dueDate) < new Date())} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// === BOM widget ==============================================================
function BomWidget({ user }: { user: AuthUser }) {
  const { t, locale } = usePreferences();
  const bom = useBom();
  const summary = useBomSummary();
  if (!bom.hydrated || !summary.hydrated) return null;

  const ownedTypes = BOM_TYPES.filter((bt) => canOwnBomType(user, bt));
  const myPending = bom.items.filter(
    (i: ApiBomItem) => i.submittedByUserId === user.id && (i.status === "SUBMITTED" || i.status === "REJECTED")
  );
  const forMyReview = canReviewBom(user) ? bom.items.filter((i) => i.status === "SUBMITTED") : [];
  const forMyProcessing = canProcessBom(user) ? bom.items.filter((i) => i.status === "APPROVED" || i.status === "PROCESSING") : [];
  const showSpending = summary.summary && summary.summary.scope !== "none";

  const typeTotal = (bt: BomType) =>
    summary.summary?.byType.find((b) => b.bomType === bt)?.total ?? 0;
  const rupiah = (amount: number) =>
    `Rp ${amount.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`;

  return (
    <Panel title={t("bom.summaryTitle")} icon={<PackageIcon />}>
      <div className={styles.miniStats}>
        {showSpending &&
          BOM_TYPES.map((bt) => {
            const tKey = `bom.totalLabel_${bt}` as const;
            return (
              <div key={bt} className={styles.miniStat}>
                <strong>{rupiah(typeTotal(bt))}</strong>
                <span>{t(tKey)}</span>
              </div>
            );
          })}
        {showSpending && (
          <div className={styles.miniStat}>
            <strong>{rupiah(summary.summary?.grandTotal ?? 0)}</strong>
            <span>{t("bom.grandTotal")}</span>
          </div>
        )}
        {ownedTypes.length > 0 && (
          <div className={styles.miniStat}>
            <strong>{myPending.length}</strong>
            <span>{t("home.bomMySubmissions")}</span>
          </div>
        )}
        {canReviewBom(user) && (
          <div className={styles.miniStat}>
            <strong>{forMyReview.length}</strong>
            <span>{t("home.bomAwaitingReview")}</span>
          </div>
        )}
        {canProcessBom(user) && (
          <div className={styles.miniStat}>
            <strong>{forMyProcessing.length}</strong>
            <span>{t("home.bomAwaitingPurchasing")}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

// === Purchasing widget ======================================================
function PurchasingWidget() {
  const { t } = usePreferences();
  const purchasing = usePurchasing();
  if (!purchasing.hydrated) return null;

  return (
    <Panel
      title={t("nav.purchasing")}
      icon={<ShoppingCartIcon />}
      action={
        <Link href="/purchasing" className={styles.panelLink}>
          {t("home.seeAll")}
          <ArrowRightIcon />
        </Link>
      }
    >
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <strong>{purchasing.materialRequests.length}</strong>
          <span>{t("purchasing.readyToBuy")}</span>
        </div>
        <div className={styles.miniStat}>
          <strong>{purchasing.tasks.filter((task) => task.status !== "DONE" && task.status !== "REJECTED").length}</strong>
          <span>{t("purchasing.teamTasks")}</span>
        </div>
      </div>
    </Panel>
  );
}

// === Vendor widget (Purchasing dashboard) ===================================
function VendorWidget() {
  const { t } = usePreferences();
  const vendors = useVendors();
  if (!vendors.hydrated) return null;

  return (
    <Panel
      title={t("nav.vendors")}
      icon={<StoreIcon />}
      action={
        <Link href="/vendors" className={styles.panelLink}>
          {t("home.seeAll")}
          <ArrowRightIcon />
        </Link>
      }
    >
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <strong>{vendors.vendors.length}</strong>
          <span>{t("nav.vendors")}</span>
        </div>
      </div>
    </Panel>
  );
}

// === Activity widget ========================================================
function ActivityWidget() {
  const { t, locale } = usePreferences();
  const activity = useActivityLog();
  if (!activity.hydrated) return null;

  return (
    <Panel
      title={t("nav.activityLog")}
      icon={<ActivityIcon />}
      action={
        <Link href="/activity-log" className={styles.panelLink}>
          {t("home.seeAll")}
          <ArrowRightIcon />
        </Link>
      }
    >
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <strong>{activity.online.length}</strong>
          <span>{t("home.onlineNow")}</span>
        </div>
      </div>
      {activity.entries.length === 0 ? (
        <EmptyState compact title={t("activityLog.noActivity")} icon={<ActivityIcon />} />
      ) : (
        <ul className={styles.activityList}>
          {activity.entries.slice(0, 6).map((entry) => (
            <li key={entry.id} className={styles.activityRow}>
              <ActivityCategoryBadge category={categorizeActivity(entry.action)} />
              <span className={styles.activityDesc}>{entry.description}</span>
              <span className={styles.activityMeta}>
                {entry.userName} · {formatDate(entry.createdAt, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// === Kasbon widget (Operational Manager / Operational Leader) ===============
function KasbonWidget() {
  const { t, locale } = usePreferences();
  const operational = useOperational();
  if (!operational.hydrated) return null;
  const openPhases = operational.kasbonPhases.filter((p) => p.status === "OPEN").length;
  const mySubmissions = operational.kasbonPhases
    .flatMap((p) => p.submissions)
    .filter((s) => s.submittedByUserId === undefined).length;

  return (
    <Panel
      title={t("operational.kasbon")}
      icon={<WalletIcon />}
      action={
        <Link href="/operational" className={styles.panelLink}>
          {t("home.seeAll")}
          <ArrowRightIcon />
        </Link>
      }
    >
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <strong>{openPhases}</strong>
          <span>{t("operational.openPhases")}</span>
        </div>
        <div className={styles.miniStat}>
          <strong>{operational.kasbonPhases.length}</strong>
          <span>{t("operational.totalPhases")}</span>
        </div>
      </div>
      {operational.dailyReports.length > 0 && (
        <ul className={styles.activityList}>
          {operational.dailyReports.slice(0, 4).map((report) => (
            <li key={report.id} className={styles.activityRow}>
              <CalendarIcon />
              <span className={styles.activityDesc}>{report.activities.slice(0, 80)}</span>
              <span className={styles.activityMeta}>{formatDate(report.date, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// === Main dashboard =========================================================
export default function Home() {
  const { user } = useAuth();
  const { t, locale } = usePreferences();
  const approvals = useApprovals();
  const notifications = useNotifications();
  const projects = useProjects();
  const purchasing = usePurchasing();
  const operational = useOperational();

  if (!user) return null;

  const variant = getDashboardVariant(user);
  const hasAnyRole = user.roleIds.length > 0;
  const canManageProjectsPanel = isPrivilegedClient(user) || userHasRoleTitle(user, "Project Manager");
  const showBom = canViewBom(user);
  const showPurchasing = canViewPurchasing(user);
  const showActivity = canViewActivityLog(user);
  const showKasbon = canAccessKasbon(user);
  const showApprovals = canAccessApprovals(user);
  const showNeedsAttention =
    hasAnyRole &&
    showApprovals &&
    approvals.hydrated &&
    approvals.tasks.some((task) =>
      task.assignedRoleIds?.some((rid: string) => new Set(user.roleIds).has(rid))
    );
  const pendingApprovalsCount = showApprovals
    ? notifications.pendingApprovalsCount || approvals.tasks.length + approvals.materialRequests.length
    : 0;

  // === Variant-specific stat tiles (DEC-070) =================================
  let tiles: React.ReactNode = null;
  if (variant === "admin" || variant === "director" || variant === "pm" || variant === "om") {
    tiles = (
      <>
        <StatTile
          label={t("home.pendingApprovals")}
          value={String(pendingApprovalsCount)}
          tone={pendingApprovalsCount > 0 ? "warning" : undefined}
          href="/approvals"
          icon={<ClipboardCheckIcon />}
        />
        <StatTile
          label={t("notifications.overdueTasks")}
          value={String(notifications.overdueTasks.length)}
          tone={notifications.overdueTasks.length > 0 ? "danger" : undefined}
          href="/notifications"
          icon={<AlertIcon />}
        />
        <StatTile
          label={t("notifications.upcomingTasks")}
          value={String(notifications.upcomingTasks.length)}
          tone={notifications.upcomingTasks.length > 0 ? "info" : undefined}
          href="/notifications"
          icon={<ClockIcon />}
        />
        <StatTile
          label={t("notifications.overdueProjects")}
          value={String(notifications.overdueProjects.length)}
          tone={notifications.overdueProjects.length > 0 ? "danger" : undefined}
          href="/notifications"
          icon={<CalendarIcon />}
        />
      </>
    );
  } else if (variant === "purchasing") {
    const ready = purchasing.hydrated ? purchasing.materialRequests.length : 0;
    const inProcess = purchasing.hydrated
      ? purchasing.materialRequests.filter((r) => r.status === "APPROVED" || r.status === "PROCESSING").length
      : 0;
    const completed = purchasing.hydrated
      ? purchasing.materialRequests.filter((r) => r.status === "COMPLETED").length
      : 0;
    const teamTasks = purchasing.hydrated
      ? purchasing.tasks.filter((task) => task.status !== "DONE" && task.status !== "REJECTED").length
      : 0;
    tiles = (
      <>
        <StatTile label={t("purchasing.readyToBuy")} value={String(ready)} tone={ready > 0 ? "warning" : undefined} href="/purchasing" icon={<ShoppingCartIcon />} />
        <StatTile label={t("purchasing.tabQueue")} value={String(inProcess)} tone={inProcess > 0 ? "info" : undefined} href="/purchasing" icon={<ClipboardCheckIcon />} />
        <StatTile label={t("purchasing.statusCompleted")} value={String(completed)} href="/purchasing" icon={<CheckSquareIcon />} />
        <StatTile label={t("purchasing.teamTasks")} value={String(teamTasks)} href="/purchasing" icon={<UsersIcon />} />
      </>
    );
  } else if (variant === "ol") {
    const openPhases = operational.hydrated ? operational.kasbonPhases.filter((p) => p.status === "OPEN").length : 0;
    const myOverdue = notifications.overdueTasks.length;
    const myUpcoming = notifications.upcomingTasks.length;
    tiles = (
      <>
        <StatTile label={t("operational.openPhases")} value={String(openPhases)} tone={openPhases > 0 ? "info" : undefined} href="/operational" icon={<WalletIcon />} />
        <StatTile label={t("notifications.overdueTasks")} value={String(myOverdue)} tone={myOverdue > 0 ? "danger" : undefined} href="/notifications" icon={<AlertIcon />} />
        <StatTile label={t("notifications.upcomingTasks")} value={String(myUpcoming)} tone={myUpcoming > 0 ? "info" : undefined} href="/notifications" icon={<ClockIcon />} />
        <StatTile label={t("operational.kasbonTotal")} value={String(operational.hydrated ? operational.kasbonPhases.length : 0)} href="/operational" icon={<WalletIcon />} />
      </>
    );
  } else if (variant === "engineer") {
    const myActive = notifications.upcomingTasks.length + notifications.overdueTasks.length;
    tiles = (
      <>
        <StatTile label={t("notifications.overdueTasks")} value={String(notifications.overdueTasks.length)} tone={notifications.overdueTasks.length > 0 ? "danger" : undefined} href="/projects" icon={<AlertIcon />} />
        <StatTile label={t("notifications.upcomingTasks")} value={String(notifications.upcomingTasks.length)} tone={notifications.upcomingTasks.length > 0 ? "info" : undefined} href="/projects" icon={<ClockIcon />} />
        <StatTile label={t("home.activeTasks")} value={String(myActive)} href="/projects" icon={<CheckSquareIcon />} />
        <StatTile label={t("operational.dailyReport")} value={String(operational.hydrated ? operational.dailyReports.length : 0)} href="/operational" icon={<CalendarIcon />} />
      </>
    );
  } else if (variant === "default") {
    tiles = (
      <EmptyState
        title={t("home.noRolesAssigned")}
        description={t("home.noRolesAssignedHint")}
        icon={<UsersIcon />}
      />
    );
  }

  // === Variant-specific featured + grid =====================================
  let featured: React.ReactNode = null;
  if (showNeedsAttention && (variant === "admin" || variant === "director" || variant === "pm" || variant === "om")) {
    featured = <NeedsAttentionCard user={user} />;
  }

  let grid: React.ReactNode = null;
  if (variant === "admin" || variant === "director") {
    grid = (
      <div className={styles.grid}>
        {hasAnyRole && projects.hydrated && <MyTasksPanel projects={projects.projects} user={user} />}
        {canManageProjectsPanel && projects.hydrated && <ProjectSummaryPanel projects={projects.projects} />}
        {showBom && <BomWidget user={user} />}
        {showPurchasing && <PurchasingWidget />}
        {showActivity && <ActivityWidget />}
      </div>
    );
  } else if (variant === "pm") {
    grid = (
      <div className={styles.grid}>
        {hasAnyRole && projects.hydrated && <MyTasksPanel projects={projects.projects} user={user} />}
        {canManageProjectsPanel && projects.hydrated && <ProjectSummaryPanel projects={projects.projects} />}
        {showBom && <BomWidget user={user} />}
      </div>
    );
  } else if (variant === "om") {
    grid = (
      <div className={styles.grid}>
        {canManageProjectsPanel && projects.hydrated && <ProjectSummaryPanel projects={projects.projects} />}
        {showKasbon && <KasbonWidget />}
        {showBom && <BomWidget user={user} />}
        {showActivity && <ActivityWidget />}
      </div>
    );
  } else if (variant === "purchasing") {
    grid = (
      <div className={styles.grid}>
        {purchasing.hydrated && <PurchasingWidget />}
        <VendorWidget />
      </div>
    );
  } else if (variant === "ol") {
    grid = (
      <div className={styles.grid}>
        {hasAnyRole && projects.hydrated && <MyTasksPanel projects={projects.projects} user={user} />}
        {showKasbon && <KasbonWidget />}
        {showBom && <BomWidget user={user} />}
      </div>
    );
  } else if (variant === "engineer") {
    grid = (
      <div className={styles.grid}>
        {hasAnyRole && projects.hydrated && <MyTasksPanel projects={projects.projects} user={user} />}
        {showBom && <BomWidget user={user} />}
      </div>
    );
  }

  const now = new Date();
  const greeting = greetingFor(now, locale);
  const todayLabel = formatDate(now.toISOString(), locale);

  return (
    <div className={styles.wrap}>
      {/* === Hero greeting section (all roles) === */}
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.heroGreeting}>{greeting},</span>
          <h1 className={styles.heroName}>{user.name}</h1>
          <p className={styles.heroHint}>{t("home.pageDescription")}</p>
        </div>
        <div className={styles.heroMeta}>
          <CalendarIcon />
          <span>{todayLabel}</span>
        </div>
      </section>

      <RoleBadges user={user} />

      {/* === Stat tiles (variant-specific) === */}
      <div className={styles.tileGrid}>{tiles}</div>

      {/* === Featured (admin/director/pm/om only) === */}
      {featured}

      {/* === Grid panels (variant-specific) === */}
      {grid}
    </div>
  );
}
