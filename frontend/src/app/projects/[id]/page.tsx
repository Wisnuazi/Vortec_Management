"use client";

import { useState } from "react";
import { useViewPreference } from "@/hooks/useViewPreference";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useBasicUsers } from "@/hooks/useBasicUsers";
import { isPrivilegedClient, userHasRoleTitle, canReviewDocument } from "@/lib/auth-api";
import { PROJECT_STAGES, canActOnTask, type ProjectStage, type TaskStatus } from "@/lib/projects-api";
import { usePreferences } from "@/hooks/usePreferences";
import { useToast } from "@/components/shared/Toast";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { Button } from "@/components/shared/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { TaskKanban } from "./TaskKanban";
import { TaskTable } from "./TaskTable";
import { TaskGantt } from "./TaskGantt";
import { TaskTimeline } from "./TaskTimeline";
import { TaskDrawer } from "./TaskDrawer";
import { MaterialRequests } from "./MaterialRequests";
import { WorkflowDiagram } from "./WorkflowDiagram";
import { AttachmentList } from "./AttachmentList";
import { PaperclipIcon, XIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { ApiProjectDocument } from "@/lib/projects-api";
import type { UseProjects } from "@/hooks/useProjects";
import styles from "./page.module.css";

// DEC-064: DocumentRow now shows the PM/OM review gate:
// - done checkbox: owning role (team matches user's role titles) OR super admin
// - review status badge: PENDING (none) / APPROVED (green) / REVISION (orange)
// - review action buttons: PM/OM only when done=true and reviewStatus=PENDING/APPROVED
function DocumentRow({
  doc,
  projectId,
  userRoleTitles,
  canReview,
  projects,
}: {
  doc: ApiProjectDocument;
  projectId: string;
  userRoleTitles: string[];
  canReview: boolean;
  projects: UseProjects;
}) {
  const { t, locale } = usePreferences();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  // DEC-064: owning role = user's role titles include the document's team
  const isOwner = userRoleTitles.includes(doc.team);
  const canToggle = isOwner || canReview;
  const missingAttachment = !doc.done && doc.attachments.length === 0;

  const statusClass =
    doc.reviewStatus === "APPROVED"
      ? styles.reviewApproved
      : doc.reviewStatus === "REVISION"
      ? styles.reviewRevision
      : "";

  const reviewLabel =
    doc.reviewStatus === "APPROVED"
      ? t("projects.docReviewApproved")
      : doc.reviewStatus === "REVISION"
      ? t("projects.docReviewRevision")
      : t("projects.docReviewPending");

  const handleReview = async (decision: "APPROVED" | "REVISION") => {
    setError("");
    setReviewing(true);
    try {
      await projects.reviewDocument(projectId, doc.id, {
        reviewStatus: decision,
        reviewNote: reviewNote.trim() || undefined,
      });
      setReviewNote("");
      setReviewing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projects.documentReviewFailed"));
      setReviewing(false);
    }
  };

  return (
    <li className={styles.docItemWrap}>
      <div className={styles.docItem}>
        <input
          type="checkbox"
          checked={doc.done}
          disabled={!canToggle || missingAttachment || doc.reviewStatus === "APPROVED"}
          title={missingAttachment ? t("projects.attachBeforeDone") : doc.reviewStatus === "APPROVED" ? t("projects.docLockedAfterApproval") : undefined}
          onChange={async (e) => {
            setError("");
            try {
              await projects.toggleDocument(projectId, doc.id, e.target.checked);
            } catch (err) {
              setError(err instanceof Error ? err.message : t("projects.documentStatusFailed"));
              setOpen(true);
            }
          }}
        />
        <span className={doc.done ? `${styles.docName} ${styles.docDone}` : styles.docName}>{doc.name}</span>
        {missingAttachment && <span className={styles.approvalBadge}>{t("projects.attachmentRequired")}</span>}
        {doc.reviewStatus !== "PENDING" && (
          <span className={`${styles.reviewBadge} ${statusClass}`}>{reviewLabel}</span>
        )}
        {doc.reviewedByUserName && (
          <span className={styles.docReviewedBy}>
            {t("projects.by")} {doc.reviewedByUserName}
            {doc.reviewNote ? `: "${doc.reviewNote}"` : ""}
          </span>
        )}
        <span className={styles.docTeam}>{doc.team}</span>
        <button type="button" className={styles.docAttachToggle} onClick={() => setOpen((v) => !v)}>
          <PaperclipIcon /> {doc.attachments.length}
        </button>
      </div>

      {/* DEC-064: PM/OM review action — only when owned role marked done */}
      {canReview && doc.done && (
        <div className={styles.docReviewPanel}>
          {doc.reviewStatus !== "APPROVED" && (
            <div className={styles.docReviewActions}>
              <input
                className={styles.reviewNoteInput}
                placeholder={t("projects.docReviewNotePlaceholder")}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
              />
              <button
                type="button"
                className={styles.approveBtn}
                disabled={reviewing}
                onClick={() => handleReview("APPROVED")}
              >
                {t("projects.docApprove")}
              </button>
              <button
                type="button"
                className={styles.rejectBtn}
                disabled={reviewing || !reviewNote.trim()}
                onClick={() => handleReview("REVISION")}
              >
                {t("projects.docRevision")}
              </button>
            </div>
          )}
          {doc.reviewStatus === "APPROVED" && (
            <div className={styles.docReviewActions}>
              <button
                type="button"
                className={styles.rejectBtn}
                disabled={reviewing}
                onClick={() => handleReview("REVISION")}
              >
                {t("projects.docSendBack")}
              </button>
            </div>
          )}
          {error && <p className={styles.attachmentError}>{error}</p>}
        </div>
      )}

      {open && (
        <div className={styles.docAttachPanel}>
          <AttachmentList
            attachments={doc.attachments}
            canEdit={canReview}
            uploadUrl={`/api/projects/${projectId}/documents/${doc.id}/attachments/upload`}
            replaceUrl={(attachmentId) => `/api/projects/${projectId}/documents/${doc.id}/attachments/${attachmentId}/replace`}
            onUpload={(data) => projects.addDocumentAttachment(projectId, doc.id, data)}
            onUploaded={() => projects.refreshProject(projectId)}
            onUpdate={(attachmentId, data) =>
              projects.updateDocumentAttachment(projectId, doc.id, attachmentId, data)
            }
            onRemove={(attachmentId) => projects.removeDocumentAttachment(projectId, doc.id, attachmentId)}
          />
        </div>
      )}
    </li>
  );
}

// DEC-068: BOM tab removed from the Task view; only task layouts remain.
type ViewMode = "kanban" | "list" | "gantt" | "timeline";

function AddTaskForm({
  roles,
  onCreate,
}: {
  roles: { id: string; title: string }[];
  onCreate: (data: {
    title: string;
    description: string;
    // DEC-064: multi-role — assignedRoleIds is canonical
    assignedRoleIds: string[] | null;
    assignedRoleId: string | null; // backward compat for backend
    requiresApproval: boolean;
    // DEC-065: required — workflow lane (filter dimension).
    stage: ProjectStage;
    startDate: string | null;
    dueDate: string | null;
  }) => Promise<unknown>;
}) {
  const { t, locale } = usePreferences();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // DEC-069: keep the form compact by default. Only the essentials
  // (title + stage + due date) show upfront; everything else hides
  // behind a "more options" disclosure to avoid overwhelming users
  // who just want to capture a quick task.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<ProjectStage | "">("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("tasks.addTrigger")}
      </Button>
    );
  }

  const close = () => {
    setOpen(false);
    setError(null);
  };

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) {
          setError(t("tasks.titleRequired"));
          return;
        }
        // DEC-065: stage is required so the workflow filter stays consistent.
        if (!stage) {
          setError(t("tasks.stageRequired"));
          return;
        }
        setSubmitting(true);
        setError(null);
        try {
          await onCreate({
            title,
            description,
            stage: stage as ProjectStage,
            assignedRoleIds: selectedRoleIds.length > 0 ? selectedRoleIds : null,
            assignedRoleId: selectedRoleIds[0] ?? null, // backward compat
            requiresApproval,
            startDate: startDate || null,
            dueDate: dueDate || null,
          });
          toast.success(t("tasks.createSuccess"));
          setTitle("");
          setDescription("");
          setStage("");
          setSelectedRoleIds([]);
          setRequiresApproval(false);
          setStartDate("");
          setDueDate("");
          close();
        } catch (err) {
          const message = err instanceof Error ? err.message : t("tasks.createError");
          setError(message);
          toast.error(message);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>{t("tasks.titleLabel")}</span>
          <input required autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>{t("tasks.workflowStage")} <span className={styles.required}>*</span></span>
          <select
            required
            className={styles.fieldInput}
            value={stage}
            onChange={(e) => setStage(e.target.value as ProjectStage | "")}
          >
            <option value="">— {t("common.notSet")} —</option>
            {PROJECT_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label[locale]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("tasks.target")}</span>
          <input type="date" className={styles.fieldInput} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>

      {/* Advanced — hidden behind a disclosure so the default form is short. */}
      {showAdvanced && (
        <>
          <div className={styles.formGrid}>
            <label className={styles.fullRow}>
              <span>{t("tasks.assignToRole")}</span>
              <MultiSelect
                options={roles.map((r) => ({ value: r.id, label: r.title }))}
                value={selectedRoleIds}
                onChange={setSelectedRoleIds}
                placeholder={t("tasks.unassignedRole")}
                ariaLabel={t("tasks.assignToRole")}
                searchThreshold={6}
              />
            </label>
            <label>
              <span>{t("tasks.start")}</span>
              <input type="date" className={styles.fieldInput} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>
          <label className={styles.problemLabel}>
            <span>{t("common.descriptionOptional")}</span>
            <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
            {t("tasks.requiresApprovalCheckbox")}
          </label>
        </>
      )}

      <button
        type="button"
        className={styles.moreOptionsToggle}
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? "▾" : "▸"} {t("tasks.moreOptions")}
      </button>

      {error && <p className={styles.formError} role="alert">{error}</p>}
      <div className={styles.formActions}>
        <Button type="submit" loading={submitting}>
          {submitting ? t("common.processing") : t("common.add")}
        </Button>
        <Button type="button" variant="secondary" onClick={close} disabled={submitting}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, locale } = usePreferences();
  const projects = useProjects();
  const org = useOrgRoles();
  const basicUsers = useBasicUsers();
  // PIC is how an Operational Manager delegates a project to its
  // responsible Project Manager — not an arbitrary user. See DEC-037.
  const projectManagers = basicUsers.filter((u) => u.roleTitles.includes("Project Manager"));
  // DEC-069: remember the user's preferred Task view per-project so the
  // last-opened layout (Kanban/List/Gantt/Timeline) is restored when
  // they navigate back. Survives page reload + cross-session. Reuses
  // the `params` already read at the top of this component.
  const projectRouteId = params.id;
  const [view, setView] = useViewPreference<ViewMode>(
    `project.${projectRouteId}.taskView`,
    "kanban",
    ["kanban", "list", "gantt", "timeline"] as const
  );
  const [confirmingDeleteProject, setConfirmingDeleteProject] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // DEC-065: workflow lane filter. null = "all stages" (default).
  const [stageFilter, setStageFilter] = useState<ProjectStage | null>(null);

  const project = projects.projects.find((p) => p.id === params.id);

  if (!projects.hydrated) {
    return <p className={styles.loading}>{t("projects.loading")}</p>;
  }
  if (!project) {
    return (
      <div className={styles.wrap}>
        <PageHeader
          title={t("projects.notFound")}
          eyebrow={
            <Link href="/projects" className={styles.backLink}>
              ← {t("projects.backToList")}
            </Link>
          }
        />
      </div>
    );
  }

  // Project record management mirrors who can create one (OM/Director/
  // super admin per DEC-016/051).
  const canManageProject = isPrivilegedClient(user);
  // Full task CRUD is limited to Project Manager, Operational Manager, or
  // super admin — see DEC-032 (extended by DEC-051 to include Director via
  // isPrivilegedClient). Other roles get subtask CRUD only (handled
  // separately in TaskTable), plus their existing ability to change a task's
  // own status when it's assigned to them.
  const canManageTasks = isPrivilegedClient(user) || userHasRoleTitle(user, "Project Manager");

  // DEC-065: apply the stage filter to both documents and tasks. Legacy
  // rows (stage === null) are only shown when no filter is active — they
  // don't belong to any specific workflow lane yet.
  const matchesStage = (s: ProjectStage | null | undefined) =>
    stageFilter === null || s === stageFilter;
  const visibleTasks = project.tasks.filter((t) => matchesStage(t.stage));
  const visibleDocuments = project.documents.filter((d) => matchesStage(d.stage));
  const myActionableCount = visibleTasks.filter((t) => canActOnTask(user, t) && t.status !== "DONE" && t.status !== "REJECTED").length;

  return (
    <div className={styles.wrap}>
      <PageHeader
        title={project.name}
        eyebrow={
          <Link href="/projects" className={styles.backLink}>
            ← {t("projects.backToList")}
          </Link>
        }
        subtitle={
          myActionableCount > 0
            ? `${t("projects.myTaskHintPrefix")} ${myActionableCount} ${t("projects.myTaskHintSuffix")}`
            : undefined
        }
      />

      <WorkflowDiagram
        stage={project.stage}
        selected={stageFilter}
        onSelect={setStageFilter}
      />

      <div className={styles.card}>
        {canManageProject ? (
          <div className={styles.editGrid}>
            <label>
              <span>{t("projects.name")}</span>
              <input value={project.name} onChange={(e) => projects.updateProject(project.id, { name: e.target.value })} />
            </label>
            <label>
              <span>{t("projects.client")}</span>
              <input
                value={project.clientName}
                onChange={(e) => projects.updateProject(project.id, { clientName: e.target.value })}
              />
            </label>
            <label>
              <span>{t("projects.targetProduct")}</span>
              <input
                value={project.targetProduct}
                onChange={(e) => projects.updateProject(project.id, { targetProduct: e.target.value })}
              />
            </label>
            <label>
              <span>{t("projects.budget")}</span>
              <input value={project.budget} onChange={(e) => projects.updateProject(project.id, { budget: e.target.value })} />
            </label>
            <label>
              <span>{t("tasks.start")}</span>
              <input
                type="date"
                value={project.startDate?.slice(0, 10) ?? ""}
                onChange={(e) => projects.updateProject(project.id, { startDate: e.target.value || null })}
              />
            </label>
            <label>
              <span>{t("projects.targetDate")}</span>
              <input
                type="date"
                value={project.targetDate?.slice(0, 10) ?? ""}
                onChange={(e) => projects.updateProject(project.id, { targetDate: e.target.value || null })}
              />
            </label>
            <label>
              <span>{t("projects.stage")}</span>
              <select
                value={project.stage}
                onChange={(e) => projects.updateProject(project.id, { stage: e.target.value as never })}
              >
                {PROJECT_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label[locale]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("projects.pic")}</span>
              <select
                value={project.picUserId ?? ""}
                onChange={(e) => projects.updateProject(project.id, { picUserId: e.target.value || null })}
              >
                <option value="">— {t("common.notSet")} —</option>
                {projectManagers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className={styles.summaryRow}>
            {project.clientName && (
              <span>
                {t("projects.client")}: {project.clientName}
              </span>
            )}
            <span>
              {t("projects.targetProduct")}: {project.targetProduct || "—"}
            </span>
            <span>
              {t("projects.budget")}: {project.budget || "—"}
            </span>
            {project.picUserName && (
              <span>
                {t("projects.pic")}: {project.picUserName}
              </span>
            )}
          </div>
        )}

        {canManageProject ? (
          <label className={styles.problemLabel}>
            <span className={styles.sectionLabel}>{t("projects.problemUseCase")}</span>
            <textarea
              className={styles.textarea}
              value={project.problemStatement}
              placeholder={t("projects.problemPlaceholder")}
              onChange={(e) => projects.updateProject(project.id, { problemStatement: e.target.value })}
            />
          </label>
        ) : (
          project.problemStatement && (
            <div>
              <span className={styles.sectionLabel}>{t("projects.problemUseCase")}</span>
              <p className={styles.notes}>{project.problemStatement}</p>
            </div>
          )
        )}

        {canManageProject && (
          <button
            type="button"
            className={styles.deleteProjectBtn}
            onClick={() => setConfirmingDeleteProject(true)}
          >
            {t("projects.deleteThisProject")}
          </button>
        )}
        {confirmingDeleteProject && (
          <ConfirmDialog
            title={t("projects.deleteThisProject")}
            message={t("projects.confirmDeleteProject")}
            confirmText={project.name}
            confirmLabel={t("projects.deleteThisProject")}
            onCancel={() => setConfirmingDeleteProject(false)}
            onConfirm={() => {
              setConfirmingDeleteProject(false);
              projects.removeProject(project.id);
            }}
          />
        )}
      </div>

      <div className={styles.card}>
        <span className={styles.sectionLabel}>
          {t("projects.documentChecklist")} <span className={styles.hintSmall}>{t("projects.documentChecklistHint")}</span>
        </span>
        <ul className={styles.docList}>
          {visibleDocuments.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              projectId={project.id}
              userRoleTitles={user?.roleTitles ?? []}
              canReview={canReviewDocument(user)}
              projects={projects}
            />
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <div className={styles.viewSwitcher}>
          <span className={styles.sectionLabel} style={{ marginBottom: 0 }}>
            {t("tasks.title")}
          </span>
          <div className={styles.viewTabs}>
            <button
              type="button"
              className={view === "kanban" ? `${styles.viewTab} ${styles.viewTabActive}` : styles.viewTab}
              onClick={() => setView("kanban")}
            >
              {t("tasks.viewKanban")}
            </button>
            <button
              type="button"
              className={view === "list" ? `${styles.viewTab} ${styles.viewTabActive}` : styles.viewTab}
              onClick={() => setView("list")}
            >
              {t("tasks.viewList")}
            </button>
            <button
              type="button"
              className={view === "gantt" ? `${styles.viewTab} ${styles.viewTabActive}` : styles.viewTab}
              onClick={() => setView("gantt")}
            >
              {t("tasks.viewGantt")}
            </button>
            <button
              type="button"
              className={view === "timeline" ? `${styles.viewTab} ${styles.viewTabActive}` : styles.viewTab}
              onClick={() => setView("timeline")}
            >
              {t("tasks.viewTimeline")}
            </button>
            {/* DEC-068: BOM tab removed from the Task view per user
                request — the per-project BOM lives behind /bom (top-
                level nav) and the Pengajuan Bahan Baku lives in the
                MaterialRequests section. Task view stays Kanban /
                List / Gantt / Timeline only. */}
          </div>
        </div>

        <>
          {canManageTasks && (
            <AddTaskForm roles={org.roles} onCreate={(data) => projects.createTask(project.id, data)} />
          )}

        {view === "kanban" && (
          <TaskKanban
            tasks={visibleTasks}
            currentUser={user}
            onStatusChange={(taskId, status) => projects.updateTask(project.id, taskId, { status: status as TaskStatus })}
            onSelect={setSelectedTaskId}
            onDelete={(taskId) => {
              if (window.confirm(t("tasks.confirmDelete"))) projects.removeTask(project.id, taskId);
            }}
          />
        )}
        {view === "list" && (
          <TaskTable
            tasks={visibleTasks}
            currentUser={user}
            canEdit={canManageTasks}
            projectId={project.id}
            projects={projects}
            onStatusChange={(taskId, status) => projects.updateTask(project.id, taskId, { status: status as TaskStatus })}
            onSelect={setSelectedTaskId}
            onDelete={(taskId) => {
              if (window.confirm(t("tasks.confirmDelete"))) projects.removeTask(project.id, taskId);
            }}
          />
        )}
        {view === "gantt" && (
          <TaskGantt tasks={visibleTasks} currentUser={user} onSelect={setSelectedTaskId} />
        )}
        {view === "timeline" && (
          <TaskTimeline tasks={visibleTasks} currentUser={user} onSelect={setSelectedTaskId} />
        )}
        </>
      </div>

      <TaskDrawer
        task={selectedTaskId ? (project.tasks.find((t) => t.id === selectedTaskId) ?? null) : null}
        projectId={project.id}
        currentUser={user}
        canManage={canManageTasks}
        projects={projects}
        onClose={() => setSelectedTaskId(null)}
        onDelete={
          canManageTasks
            ? (taskId) => projects.removeTask(project.id, taskId)
            : undefined
        }
      />

      <MaterialRequests project={project} projects={projects} currentUser={user} />
    </div>
  );
}
