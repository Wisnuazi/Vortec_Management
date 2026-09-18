"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";
import { useBasicUsers } from "@/hooks/useBasicUsers";
import { isPrivilegedClient, userHasRoleTitle } from "@/lib/auth-api";
import { usePreferences } from "@/hooks/usePreferences";
import { sortRows, type SortDir } from "@/lib/sort";
import type { ApiProject } from "@/lib/projects-api";
import { ProjectRow } from "./ProjectRow";
import { ProjectsDashboard } from "./ProjectsDashboard";
import { TeamPerformancePanel } from "./TeamPerformancePanel";
import { LayoutToggle, type Layout } from "@/components/shared/LayoutToggle";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination, type PageSize } from "@/components/shared/Pagination";
import { useViewPreference } from "@/hooks/useViewPreference";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/shared/Button";
import { InboxIcon } from "@/components/icons";
import styles from "./page.module.css";

function AddProjectForm({
  projectManagers,
  onCreate,
}: {
  projectManagers: { id: string; name: string }[];
  onCreate: (data: {
    name: string;
    clientName: string;
    problemStatement: string;
    targetProduct: string;
    budget: string;
    startDate: string | null;
    targetDate: string | null;
    picUserId: string | null;
  }) => Promise<unknown>;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"info" | "schedule">("info");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [targetProduct, setTargetProduct] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [picUserId, setPicUserId] = useState("");
  const [problemStatement, setProblemStatement] = useState("");

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("projects.addTrigger")}
      </Button>
    );
  }

  const close = () => {
    setOpen(false);
    setStep("info");
    setError(null);
  };

  const resetFields = () => {
    setName("");
    setClientName("");
    setTargetProduct("");
    setBudget("");
    setStartDate("");
    setTargetDate("");
    setPicUserId("");
    setProblemStatement("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await onCreate({
        name,
        clientName,
        problemStatement,
        targetProduct,
        budget,
        startDate: startDate || null,
        targetDate: targetDate || null,
        picUserId: picUserId || null,
      });
      if (created) {
        toast.success(t("projects.createSuccess"), name);
        resetFields();
        close();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("projects.createError");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // DEC-069: 2-step wizard. Step 1 captures the essentials that the
  // user almost always has ready (name, what we're building, for whom);
  // step 2 layers on scheduling + ownership which can wait. This
  // keeps the first impression short and unblocks the common case.
  const goToSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("projects.nameRequired"));
      return;
    }
    setError(null);
    setStep("schedule");
  };

  return (
    <form className={styles.createForm} onSubmit={step === "info" ? goToSchedule : handleSubmit}>
      {/* Step indicator — same shared pill style as /organization tabs. */}
      <div className="tabs" role="tablist" aria-label={t("projects.addTitle")}>
        <button
          type="button"
          role="tab"
          aria-selected={step === "info"}
          className={step === "info" ? "tab tabActive" : "tab"}
          onClick={() => setStep("info")}
        >
          1. {t("projects.stepInfo")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={step === "schedule"}
          className={step === "schedule" ? "tab tabActive" : "tab"}
          onClick={() => {
            if (name.trim()) setStep("schedule");
            else setError(t("projects.nameRequired"));
          }}
        >
          2. {t("projects.stepSchedule")}
        </button>
      </div>

      {step === "info" ? (
        <>
          <div className={styles.formGrid}>
            <label>
              <span>{t("projects.name")} <span className={styles.required}>*</span></span>
              <input required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <span>{t("projects.clientOptional")}</span>
              <input autoComplete="off" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </label>
            <label>
              <span>{t("projects.targetProduct")}</span>
              <input autoComplete="off" value={targetProduct} onChange={(e) => setTargetProduct(e.target.value)} />
            </label>
            <label>
              <span>{t("projects.budget")}</span>
              <input
                autoComplete="off"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder={t("projects.budgetPlaceholder")}
              />
            </label>
          </div>
          <label className={styles.problemLabel}>
            <span>{t("projects.problemUseCase")}</span>
            <textarea
              className={styles.textarea}
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              placeholder={t("projects.problemPlaceholder")}
            />
          </label>
          {error && <p className={styles.formError} role="alert">{error}</p>}

          <div className={styles.formActions}>
            <Button type="submit">{t("common.next")} →</Button>
            <Button type="button" variant="secondary" onClick={close}>
              {t("common.cancel")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.formGrid}>
            <label>
              <span>{t("tasks.start")}</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              <span>{t("projects.targetDate")}</span>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </label>
            <label>
              <span>{t("projects.pic")}</span>
              <select value={picUserId} onChange={(e) => setPicUserId(e.target.value)}>
                <option value="">— {t("common.notSet")} —</option>
                {projectManagers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <span className={styles.hintSmall}>{t("projects.picHint")}</span>
            </label>
          </div>
          {error && <p className={styles.formError} role="alert">{error}</p>}

          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={() => setStep("info")} disabled={submitting}>
              ← {t("common.back")}
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? t("common.processing") : t("common.add")}
            </Button>
            <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
              {t("common.cancel")}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

type SortKey = "name" | "stage" | "targetDate";
type Tab = "dashboard" | "list";

// DEC-082: tab state lives in the URL query (?tab=dashboard|list) so
// the Sidebar submenu can link to each section as a navigable target.
// Default is "dashboard" when no query param is set. The in-page tab
// strip is gone — the Sidebar submenu + Topbar breadcrumb carry the
// navigation context.
export default function ProjectsPage() {
  const { user } = useAuth();
  const { t } = usePreferences();
  // Project create + team performance include Director via isPrivilegedClient
  // (DEC-051 — Director full oversight).
  const canCreate = isPrivilegedClient(user);
  // Team performance is cross-team by nature (comparing which team finishes
  // faster/slower) — same viewer set as full task management authority.
  const canViewTeamPerformance = isPrivilegedClient(user) || userHasRoleTitle(user, "Project Manager");
  const projects = useProjects();
  const basicUsers = useBasicUsers();
  // PIC is how an Operational Manager delegates a project to its
  // responsible Project Manager — not an arbitrary user. See DEC-037.
  const projectManagers = basicUsers.filter((u) => u.roleTitles.includes("Project Manager"));
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "list" ? "list" : "dashboard";
  // setTab is exposed via Sidebar submenu navigation (URL replace) —
  // no in-page buttons left after DEC-082.
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [layout, setLayout] = useViewPreference<Layout>("projects.list", "list", ["list", "grid"] as const);
  // DEC-069: paginate the project list. Page resets to 0 whenever
  // the layout (list↔grid) flips so users land on the top.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const sortValue: Record<SortKey, (p: ApiProject) => unknown> = {
    name: (p) => p.name,
    stage: (p) => p.stage,
    targetDate: (p) => p.targetDate,
  };
  const sortedProjects = sortRows(projects.projects, sortValue[sortKey], sortDir);
  const pagedProjects = sortedProjects.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className={styles.wrap}>
      <PageHeader title={t("nav.projects")} subtitle={t("projects.pageDescription")} />

      {!projects.hydrated ? (
        <div role="status" aria-label={t("projects.loading")} className={styles.list}>
          <Skeleton variant="heading" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : tab === "dashboard" ? (
        <>
          <ProjectsDashboard projects={projects.projects} />
          {canViewTeamPerformance && <TeamPerformancePanel />}
        </>
      ) : (
        <>
          {canCreate && (
            <AddProjectForm projectManagers={projectManagers} onCreate={(data) => projects.createProject(data)} />
          )}

          {projects.projects.length === 0 ? (
            <EmptyState
              icon={<InboxIcon />}
              title={t("projects.empty")}
              description={t("projects.emptyHint")}
              compact
            />
          ) : (
            <>
              <div className={styles.sortBar}>
                <span>{t("common.sortBy")}:</span>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="name">{t("projects.name")}</option>
                  <option value="stage">{t("projects.stage")}</option>
                  <option value="targetDate">{t("projects.targetDate")}</option>
                </select>
                <button type="button" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                  {sortDir === "asc" ? "▲" : "▼"}
                </button>
                <LayoutToggle value={layout} onChange={setLayout} />
              </div>
              <div className={layout === "grid" ? styles.grid : styles.list}>
                {pagedProjects.map((p) => (
                  <ProjectRow key={p.id} project={p} layout={layout} />
                ))}
              </div>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={sortedProjects.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
