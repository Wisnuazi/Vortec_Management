"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@/lib/auth-api";
import {
  allowedBomTypesClient,
  isPrivilegedClient,
  userHasRoleTitle,
  type BomType,
} from "@/lib/auth-api";
import { bomApi, bomTypeLabel } from "@/lib/bom-api";
import {
  materialRequestStatusLabel,
  type ApiProject,
  type ApiMaterialRequest,
  type MaterialRequestStatus,
} from "@/lib/projects-api";
import type { UseProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { TrashIcon, PaperclipIcon, InboxIcon } from "@/components/icons";
import { usePreferences } from "@/hooks/usePreferences";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/shared/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { AttachmentList } from "./AttachmentList";
import styles from "./page.module.css";

type DraftItem = { materialName: string; quantity: string; unit: string; notes: string };

function SubmitForm({
  onSubmit,
  allowedTypes,
  locked,
}: {
  onSubmit: (title: string, note: string, bomType: string, items: DraftItem[]) => Promise<void>;
  allowedTypes: BomType[];
  locked: boolean;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  // DEC-068: Jenis BOM dropdown — restricted to the user's allowed
  // types. Defaults to the first option so submit isn't blocked when
  // the user has exactly one allowed type (the field is always
  // populated, never empty).
  const [bomType, setBomType] = useState<BomType>(allowedTypes[0] ?? "MBOM");
  const [items, setItems] = useState<DraftItem[]>([{ materialName: "", quantity: "1", unit: "", notes: "" }]);

  if (locked) {
    return (
      <p className={styles.lockedHint}>
        🔒 {t("materialRequests.lockedHint")}
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("materialRequests.submitTrigger")}
      </Button>
    );
  }

  if (allowedTypes.length === 0) {
    return (
      <p className={styles.lockedHint}>
        {t("materialRequests.noAllowedTypes")}
      </p>
    );
  }

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSubmit(title, note, bomType, items);
          setTitle("");
          setNote("");
          setItems([{ materialName: "", quantity: "1", unit: "", notes: "" }]);
          setOpen(false);
        } catch (err) {
          toast.error(t("materialRequests.submit"), err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>{t("materialRequests.titleLabel")}</span>
          <input
            required
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("materialRequests.titlePlaceholder")}
          />
        </label>
        <label>
          <span>{t("common.notesOptional")}</span>
          <input autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label>
          <span>{t("materialRequests.bomTypeLabel")}</span>
          <select value={bomType} onChange={(e) => setBomType(e.target.value as BomType)}>
            {allowedTypes.map((bt) => (
              <option key={bt} value={bt}>
                {bomTypeLabel(bt, "id")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.sectionLabel}>{t("materialRequests.itemsLabel")}</div>
      {items.map((item, i) => (
        <div key={i} className={styles.materialItemRow}>
          <input
            placeholder={t("materialRequests.itemName")}
            value={item.materialName}
            onChange={(e) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, materialName: e.target.value } : it)))}
          />
          <input
            type="number"
            min={0}
            step="any"
            placeholder={t("materialRequests.itemQty")}
            className={styles.materialItemQty}
            value={item.quantity}
            onChange={(e) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, quantity: e.target.value } : it)))}
          />
          <input
            placeholder={t("materialRequests.itemUnit")}
            className={styles.materialItemUnit}
            value={item.unit}
            onChange={(e) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, unit: e.target.value } : it)))}
          />
          <input
            placeholder={t("common.notes")}
            value={item.notes}
            onChange={(e) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, notes: e.target.value } : it)))}
          />
          {items.length > 1 && (
            <button type="button" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className={styles.addDocTrigger}
        onClick={() => setItems((prev) => [...prev, { materialName: "", quantity: "1", unit: "", notes: "" }])}
      >
        + {t("materialRequests.addItem")}
      </button>

      <div className={styles.formActions}>
        <Button type="submit">{t("materialRequests.submit")}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function RequestCard({
  request,
  currentUser,
  projectId,
  projects,
  onReview,
  onProcess,
  onDelete,
}: {
  request: ApiMaterialRequest;
  currentUser: AuthUser | null;
  projectId: string;
  projects: UseProjects;
  onReview: (decision: "APPROVED" | "REJECTED", note: string) => void;
  onProcess: (status: "PROCESSING" | "COMPLETED", note: string) => void;
  onDelete: () => void;
}) {
  const { t, locale } = usePreferences();
  const [reviewNote, setReviewNote] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  // Review: PM, OM, Director, or super admin (DEC-017/051).
  const canReview = request.status === "SUBMITTED" &&
    (isPrivilegedClient(currentUser) || userHasRoleTitle(currentUser, "Project Manager"));
  // Process: Purchasing, OM, Director, or super admin.
  const canProcess =
    (request.status === "APPROVED" || request.status === "PROCESSING") &&
    (isPrivilegedClient(currentUser) || userHasRoleTitle(currentUser, "Purchasing"));
  const canManageAttachments =
    isPrivilegedClient(currentUser) ||
    currentUser?.id === request.requestedByUserId ||
    userHasRoleTitle(currentUser, "Project Manager") ||
    userHasRoleTitle(currentUser, "Purchasing");

  return (
    <div className={styles.row}>
      <div className={styles.materialRequestHead}>
        <span className={styles.projName}>{request.title}</span>
        {/* DEC-068: Jenis BOM badge — visible so reviewers know which
            BOM type this request belongs to without scrolling to the
            items list. */}
        {request.bomType && (
          <span className={styles.cardTypeBadge} data-bomtype={request.bomType}>
            {request.bomType}
          </span>
        )}
        <span className={`${styles.stagePill} ${styles[`mrStatus_${request.status}`] ?? ""}`}>
          {materialRequestStatusLabel(request.status, locale)}
        </span>
        <button type="button" className={styles.docAttachToggle} onClick={() => setAttachmentsOpen((v) => !v)}>
          <PaperclipIcon /> {request.attachments.length}
        </button>
        {currentUser?.isSuperAdmin && (
          <button type="button" className={styles.kanbanCardDelete} aria-label={t("materialRequests.delete")} onClick={onDelete}>
            <TrashIcon />
          </button>
        )}
      </div>
      <div className={styles.detail}>
        <span className={styles.hintSmall}>
          {t("materialRequests.submittedBy")} {request.requestedByUserName}
        </span>
        {request.note && <p className={styles.notes}>{request.note}</p>}

        {attachmentsOpen && (
          <AttachmentList
            attachments={request.attachments}
            canEdit={canManageAttachments}
            uploadUrl={`/api/projects/${projectId}/material-requests/${request.id}/attachments/upload`}
            replaceUrl={(attachmentId) => `/api/projects/${projectId}/material-requests/${request.id}/attachments/${attachmentId}/replace`}
            onUpload={(data) => projects.addMaterialRequestAttachment(projectId, request.id, data)}
            onUploaded={() => projects.refreshProject(projectId)}
            onUpdate={(attachmentId, data) =>
              projects.updateMaterialRequestAttachment(projectId, request.id, attachmentId, data)
            }
            onRemove={(attachmentId) => projects.removeMaterialRequestAttachment(projectId, request.id, attachmentId)}
          />
        )}

        <ul className={styles.docList}>
          {request.items.map((it) => (
            <li key={it.id} className={styles.docItem}>
              <span className={styles.docName}>
                {it.materialName} <span className={styles.hintSmall}>× {it.quantity} {it.unit}</span>
              </span>
              {it.notes && <span className={styles.docTeam}>{it.notes}</span>}
            </li>
          ))}
        </ul>

        {request.reviewedByUserName && (
          <p className={styles.hintSmall}>
            {t("materialRequests.reviewedBy")} {request.reviewedByUserName}
            {request.reviewNote && `: "${request.reviewNote}"`}
          </p>
        )}
        {request.processedByUserName && (
          <p className={styles.hintSmall}>
            {t("materialRequests.processedBy")} {request.processedByUserName}
            {request.purchaseNote && `: "${request.purchaseNote}"`}
          </p>
        )}

        {canReview && (
          <form
            className={styles.docForm}
            onSubmit={(e) => {
              e.preventDefault();
              onReview("APPROVED", reviewNote);
              setReviewNote("");
            }}
          >
            <input
              placeholder={t("materialRequests.reviewNotePlaceholder")}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
            <Button type="submit">{t("materialRequests.approve")}</Button>
            <Button type="button" variant="danger" onClick={() => onReview("REJECTED", reviewNote)}>
              {t("materialRequests.reject")}
            </Button>
          </form>
        )}

        {canProcess && (
          <form
            className={styles.docForm}
            onSubmit={(e) => {
              e.preventDefault();
              onProcess(request.status === "APPROVED" ? "PROCESSING" : "COMPLETED", purchaseNote);
              setPurchaseNote("");
            }}
          >
            <input
              placeholder={t("materialRequests.purchaseNotePlaceholder")}
              value={purchaseNote}
              onChange={(e) => setPurchaseNote(e.target.value)}
            />
            <Button type="submit">
              {request.status === "APPROVED" ? t("materialRequests.startProcessing") : t("materialRequests.finishPurchasing")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function MaterialRequests({
  project,
  projects,
  currentUser,
}: {
  project: ApiProject;
  projects: UseProjects;
  currentUser: AuthUser | null;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const { token } = useAuth();
  // DEC-068: allowedTypes — the set of BomTypes this user can submit.
  // Source-of-truth is the backend /api/bom/allowed-types endpoint;
  // we fall back to the client helper on error (legacy roles, offline).
  const [allowedTypes, setAllowedTypes] = useState<BomType[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    bomApi.allowedTypes(token)
      .then((res) => { if (!cancelled) setAllowedTypes(res.types); })
      .catch(() => { if (!cancelled) setAllowedTypes(allowedBomTypesClient(currentUser)); });
    return () => { cancelled = true; };
  }, [token, currentUser]);

  // DEC-068: PM/OM toggle to lock/unlock. Gate mirrors the backend
  // canLockMaterialRequest — privileged OR has Project Manager role.
  const canLock =
    !!currentUser &&
    (isPrivilegedClient(currentUser) || userHasRoleTitle(currentUser, "Project Manager"));

  // DEC-068: status filter panels. Default = "all" so existing behavior
  // is preserved (the list shows every request). The user can click
  // a panel header to narrow to one status.
  const STATUSES: MaterialRequestStatus[] = ["SUBMITTED", "APPROVED", "PROCESSING", "COMPLETED", "REJECTED"];
  const [activeStatus, setActiveStatus] = useState<"ALL" | MaterialRequestStatus>("ALL");

  const filteredRequests = useMemo(() => {
    if (activeStatus === "ALL") return project.materialRequests;
    return project.materialRequests.filter((r) => r.status === activeStatus);
  }, [project.materialRequests, activeStatus]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { ALL: project.materialRequests.length };
    for (const s of STATUSES) out[s] = 0;
    for (const r of project.materialRequests) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }, [project.materialRequests]);

  const onToggleLock = async () => {
    const next = !project.materialRequestLocked;
    try {
      await projects.lockMaterialRequest(project.id, next);
      toast.success(
        t("materialRequests.lockToggle"),
        next ? t("materialRequests.lockedSuccess") : t("materialRequests.unlockedSuccess")
      );
    } catch (err) {
      toast.error(t("materialRequests.lockToggle"), err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>
          {t("materialRequests.sectionTitle")} <span className={styles.hintSmall}>{t("materialRequests.sectionHint")}</span>
        </span>
        {/* DEC-068: Lock/Unlock switch (PM/OM only). Shows the current
            state explicitly so the submitter knows why the form is
            locked. */}
        {canLock && (
          <button
            type="button"
            className={project.materialRequestLocked ? `${styles.lockToggle} ${styles.lockToggleOn}` : styles.lockToggle}
            aria-pressed={project.materialRequestLocked}
            onClick={onToggleLock}
          >
            {project.materialRequestLocked ? "🔒 " + t("materialRequests.lockedLabel") : "🔓 " + t("materialRequests.unlockedLabel")}
          </button>
        )}
      </div>

      <SubmitForm
        allowedTypes={allowedTypes}
        locked={project.materialRequestLocked}
        onSubmit={(title, note, bomType, items) =>
          projects.submitMaterialRequest(
            project.id,
            title,
            note,
            bomType,
            items
              .filter((i) => i.materialName.trim() && i.unit.trim() && Number(i.quantity) > 0)
              .map((i) => ({ materialName: i.materialName, quantity: Number(i.quantity), unit: i.unit, notes: i.notes }))
          )
        }
      />

      {/* DEC-068: status filter panels */}
      {project.materialRequests.length > 0 && (
        <div className={styles.statusPanels} role="tablist" aria-label={t("materialRequests.statusFilterAria")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeStatus === "ALL"}
            className={activeStatus === "ALL" ? `${styles.statusPanel} ${styles.statusPanelActive}` : styles.statusPanel}
            onClick={() => setActiveStatus("ALL")}
          >
            {t("materialRequests.statusAll")} <span className={styles.statusPanelCount}>{counts.ALL}</span>
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={activeStatus === s}
              className={`${styles.statusPanel} ${styles[`statusPanel_${s}`] ?? ""} ${activeStatus === s ? styles.statusPanelActive : ""}`}
              onClick={() => setActiveStatus(s)}
            >
              {materialRequestStatusLabel(s, "id")} <span className={styles.statusPanelCount}>{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {project.materialRequests.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("materialRequests.empty")} />
      ) : filteredRequests.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("materialRequests.emptyFiltered")} compact />
      ) : (
        <div className={styles.list}>
          {filteredRequests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              currentUser={currentUser}
              projectId={project.id}
              projects={projects}
              onReview={(decision, note) => projects.reviewMaterialRequest(project.id, r.id, decision, note)}
              onProcess={(status, note) => projects.processMaterialRequest(project.id, r.id, status, note)}
              onDelete={() => {
                if (window.confirm(`${t("materialRequests.confirmDelete")} "${r.title}"?`)) projects.removeMaterialRequest(project.id, r.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
