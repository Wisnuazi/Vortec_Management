"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useOperational } from "@/hooks/useOperational";
import {
  canReviewKasbon,
  canMonitorOperational,
  canAccessKasbon,
  canCreateKasbonPhase,
} from "@/lib/auth-api";
import {
  KASBON_REASONS,
  KASBON_MAX_AMOUNT,
  type ApiDailyReport,
  type ApiAttachment,
  type ApiKasbonPhase,
  type ApiKasbonSubmission,
  type ApiKasbonItem,
  type KasbonPhaseStatus,
  type KasbonSubmissionStatus,
  type KasbonReason,
  type NewKasbonItemData,
  type RealizeKasbonItemData,
  type NewAttachmentData,
} from "@/lib/operational-api";
import { operationalApi } from "@/lib/operational-api";
import { readFileAsDataUrl } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { TrashIcon, PaperclipIcon, DownloadIcon } from "@/components/icons";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/shared/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import type { TranslationKey } from "@/lib/i18n";
import styles from "./page.module.css";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_DAILY_REPORT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function rupiah(amount: number, locale: "id" | "en") {
  return `Rp ${amount.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`;
}

function phaseStatusLabel(t: (key: TranslationKey) => string, status: KasbonPhaseStatus) {
  return t(`operational.phaseStatus_${status}` as TranslationKey);
}

function submissionStatusLabel(t: (key: TranslationKey) => string, status: KasbonSubmissionStatus) {
  return t(`operational.submissionStatus_${status}` as TranslationKey);
}

function reasonLabel(t: (key: TranslationKey) => string, reason: KasbonReason) {
  return t(`operational.kasbonReason_${reason}` as TranslationKey);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

// --- Daily Report (unchanged from before) -----------------------------------

function ReportForm({ onCreate }: { onCreate: (data: { date: string; activities: string; pendingFiles?: NewAttachmentData[] }) => Promise<void> }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [activities, setActivities] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ fileName: string; mimeType: string; fileSize: number; dataUrl: string }[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("operational.reportAddTrigger")}
      </Button>
    );
  }

  const handleFile = async (file: File) => {
    setError("");
    if (file.size > MAX_DAILY_REPORT_ATTACHMENT_BYTES) {
      setError(t("operational.attachmentTooLarge"));
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setPendingFiles((prev) => [
      ...prev,
      { fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size, dataUrl },
    ]);
  };

  const handleAddLink = () => {
    setError("");
    const u = linkUrl.trim();
    if (!u) return;
    if (!/^https?:\/\/\S+$/i.test(u)) {
      setError(t("operational.attachmentLinkInvalid"));
      return;
    }
    setPendingFiles((prev) => [
      ...prev,
      { fileName: u, mimeType: "", fileSize: 0, dataUrl: u.startsWith("data:") ? u : "" },
    ]);
    // Convert LINK attachments to NewAttachmentData shape
    void u;
    setLinkUrl("");
    setAddingLink(false);
  };

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!activities.trim()) return;
        try {
          await onCreate({
            date,
            activities: activities.trim(),
            pendingFiles: pendingFiles.map((f) =>
              f.dataUrl.startsWith("data:")
                ? { kind: "FILE" as const, fileName: f.fileName, mimeType: f.mimeType, fileSize: f.fileSize, dataUrl: f.dataUrl }
                : { kind: "LINK" as const, fileName: f.fileName, url: f.fileName }
            ),
          });
          setActivities("");
          setDate(todayIso());
          setPendingFiles([]);
          setLinkUrl("");
          setError("");
          setOpen(false);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>{t("operational.reportDate")}</span>
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>
        <span>{t("operational.reportActivities")}</span>
        <textarea
          required
          value={activities}
          onChange={(e) => setActivities(e.target.value)}
          placeholder={t("operational.reportActivitiesPlaceholder")}
        />
      </label>

      <div className={styles.attachmentSection}>
        <span className={styles.attachmentLabel}>
          <PaperclipIcon /> {t("operational.attachmentsLabel")} ({pendingFiles.length})
        </span>
        {pendingFiles.length > 0 && (
          <ul className={styles.pendingFiles}>
            {pendingFiles.map((f, i) => (
              <li key={i}>
                <span className={styles.fileName}>{f.fileName}</span>
                <span className={styles.fileSize}>
                  {f.fileSize > 0 ? `(${(f.fileSize / 1024).toFixed(1)} KB)` : "🔗 link"}
                </span>
                <button
                  type="button"
                  className={styles.removePendingBtn}
                  onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`${t("operational.attachmentRemove")} ${f.fileName}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.attachmentActions}>
          <label className={styles.uploadBtn}>
            + {t("operational.attachmentAddFile")}
            <input
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {addingLink ? (
            <span className={styles.linkInputRow}>
              <input
                autoFocus
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddLink())}
              />
              <button type="button" onClick={handleAddLink}>
                {t("common.add")}
              </button>
              <button type="button" onClick={() => { setAddingLink(false); setLinkUrl(""); }}>
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setAddingLink(true)}>
              🔗 {t("operational.attachmentAddLink")}
            </button>
          )}
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.formActions}>
        <Button type="submit">{t("common.add")}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function ReportAttachments({
  attachments,
  canEdit,
  onAdd,
  onRemove,
}: {
  attachments: ApiAttachment[];
  canEdit: boolean;
  onAdd: (data: NewAttachmentData) => Promise<void>;
  onRemove: (attachmentId: string) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    if (file.size > MAX_DAILY_REPORT_ATTACHMENT_BYTES) {
      setError(t("operational.attachmentTooLarge"));
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    try {
      await onAdd({
        kind: "FILE",
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        dataUrl,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAddLink = async () => {
    setError("");
    const u = linkUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) {
      setError(t("operational.attachmentLinkInvalid"));
      return;
    }
    try {
      await onAdd({ kind: "LINK", fileName: u, url: u });
      setLinkUrl("");
      setAddingLink(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const downloadFile = (a: ApiAttachment) => {
    if (a.kind !== "FILE" || !a.dataUrl) return;
    const a2 = document.createElement("a");
    a2.href = a.dataUrl;
    a2.download = a.fileName;
    document.body.appendChild(a2);
    a2.click();
    a2.remove();
  };

  return (
    <div className={styles.attachmentSection}>
      <span className={styles.attachmentLabel}>
        <PaperclipIcon /> {t("operational.attachmentsLabel")} ({attachments.length})
      </span>
      {attachments.length > 0 && (
        <ul className={styles.attachmentList}>
          {attachments.map((a) => (
            <li key={a.id} className={styles.attachmentItem}>
              {a.kind === "LINK" ? (
                <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className={styles.fileName}>
                  🔗 {a.fileName}
                </a>
              ) : (
                <button type="button" className={styles.fileName} onClick={() => downloadFile(a)}>
                  📎 {a.fileName}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className={styles.removePendingBtn}
                  onClick={() => onRemove(a.id)}
                  aria-label={`${t("operational.attachmentRemove")} ${a.fileName}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className={styles.attachmentActions}>
          <label className={styles.uploadBtn}>
            + {t("operational.attachmentAddFile")}
            <input
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {addingLink ? (
            <span className={styles.linkInputRow}>
              <input
                autoFocus
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddLink())}
              />
              <button type="button" onClick={() => void handleAddLink()}>
                {t("common.add")}
              </button>
              <button type="button" onClick={() => { setAddingLink(false); setLinkUrl(""); }}>
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setAddingLink(true)}>
              🔗 {t("operational.attachmentAddLink")}
            </button>
          )}
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

function ReportCard({
  report,
  canEdit,
  onUpdate,
  onRemove,
  onAddAttachment,
  onRemoveAttachment,
}: {
  report: ApiDailyReport;
  canEdit: boolean;
  onUpdate: (id: string, data: Partial<{ date: string; activities: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onAddAttachment: (reportId: string, data: NewAttachmentData) => Promise<void>;
  onRemoveAttachment: (reportId: string, attachmentId: string) => Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [activities, setActivities] = useState(report.activities);

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.userTag}>{report.userName}</span>
        <span className={styles.title}>{formatDate(report.date, locale)}</span>
        {canEdit && (
          <div className={styles.cardActions}>
            <button type="button" className={styles.editBtn} onClick={() => setEditing((v) => !v)}>
              {t("assets.edit")}
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              aria-label={t("operational.reportConfirmDelete")}
              onClick={() => {
                if (window.confirm(t("operational.reportConfirmDelete"))) onRemove(report.id);
              }}
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <form
          className={styles.inlineForm}
          onSubmit={async (e) => {
            e.preventDefault();
            await onUpdate(report.id, { activities: activities.trim() });
            setEditing(false);
          }}
        >
          <input value={activities} onChange={(e) => setActivities(e.target.value)} style={{ flex: 1 }} />
          <Button type="submit">{t("common.save")}</Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </Button>
        </form>
      ) : (
        <p className={styles.notes}>{report.activities}</p>
      )}
      <ReportAttachments
        attachments={report.attachments ?? []}
        canEdit={canEdit}
        onAdd={(data) => onAddAttachment(report.id, data)}
        onRemove={(aid) => onRemoveAttachment(report.id, aid)}
      />
    </div>
  );
}

// --- Kasbon (DEC-061: phase + multi-submission) -----------------------------
// UI mirrors the new model: a phase (OPEN/REALIZED) holds submissions
// (PENDING/APPROVED/REJECTED). OL creates submissions + realises items;
// OM reviews + opens new phases. Rejected submissions stay visible as a
// read-only audit trail.

const PHASE_STATUS_PILL: Record<KasbonPhaseStatus, string> = {
  OPEN: "status_OPEN",
  REALIZED: "status_REALIZED",
};
const SUBMISSION_STATUS_PILL: Record<KasbonSubmissionStatus, string> = {
  PENDING: "status_SUBMITTED",
  APPROVED: "status_APPROVED",
  REJECTED: "status_REJECTED",
};

function RealizeItemForm({
  item,
  onRealize,
  onCancel,
}: {
  item: ApiKasbonItem;
  onRealize: (data: RealizeKasbonItemData) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [link, setLink] = useState(item.link ?? "");
  const [purchaseDate, setPurchaseDate] = useState(item.purchaseDate ? item.purchaseDate.slice(0, 10) : "");
  const [receivedDate, setReceivedDate] = useState(item.receivedDate ? item.receivedDate.slice(0, 10) : "");
  const [receipt, setReceipt] = useState<string | null>(item.receiptPhotoUrl);
  const [photo, setPhoto] = useState<string | null>(item.itemPhotoUrl);
  const [busy, setBusy] = useState(false);

  const onPickReceipt = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > MAX_PHOTO_BYTES * 2) throw new Error("too large");
      setReceipt(dataUrl);
    } catch {
      toast.error(t("operational.itemPhotoEvidence"), t("operational.itemPhotoTooLarge"));
    }
  };
  const onPickPhoto = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > MAX_PHOTO_BYTES * 2) throw new Error("too large");
      setPhoto(dataUrl);
    } catch {
      toast.error(t("operational.itemPhotoEvidence"), t("operational.itemPhotoTooLarge"));
    }
  };

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!link.trim() || !purchaseDate || !receivedDate || !receipt || !photo) {
          toast.error(t("operational.realizeItemTitle"), t("operational.realizeItemHint"));
          return;
        }
        setBusy(true);
        try {
          await onRealize({
            link: link.trim(),
            purchaseDate: purchaseDate || null,
            receivedDate: receivedDate || null,
            receiptPhotoUrl: receipt,
            itemPhotoUrl: photo,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className={styles.hintSmall}>{t("operational.realizeItemHint")}</p>
      <div className={styles.formGrid}>
        <label>
          <span>{t("operational.itemLink")}</span>
          <input
            required
            type="url"
            placeholder="https://..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <label>
          <span>Purchase Date</span>
          <input required type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </label>
        <label>
          <span>Received Date</span>
          <input required type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </label>
        <label>
          <span>{t("operational.itemReceiptPhoto")}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPickReceipt(f);
            }}
          />
          {receipt ? <span className={styles.hintSmall}>✓</span> : null}
        </label>
        <label>
          <span>{t("operational.itemPhotoEvidence")}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPickPhoto(f);
            }}
          />
          {photo ? <span className={styles.hintSmall}>✓</span> : null}
        </label>
      </div>
      <div className={styles.formActions}>
        <Button type="submit" loading={busy}>
          {busy ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function ItemAddForm({
  onAddItem,
  onCancel,
}: {
  onAddItem: (data: NewKasbonItemData) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = usePreferences();
  const [reason, setReason] = useState<KasbonReason>("DEVELOPMENT");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        const q = Number(qty);
        const p = Number(price);
        if (!item.trim() || !q || q <= 0 || !unit.trim() || p < 0) return;
        await onAddItem({ reason, item: item.trim(), qty: q, unit: unit.trim(), price: p });
        setItem("");
        setQty("1");
        setUnit("");
        setPrice("");
      }}
    >
      <p className={styles.hintSmall}>{t("operational.submissionNewHint")}</p>
      <div className={styles.formGrid}>
        <label>
          <span>{t("operational.itemReason")}</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as KasbonReason)}>
            {KASBON_REASONS.map((r) => (
              <option key={r} value={r}>
                {reasonLabel(t, r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("operational.itemName")}</span>
          <input required value={item} onChange={(e) => setItem(e.target.value)} />
        </label>
        <label>
          <span>{t("operational.itemQty")}</span>
          <input required type="number" min={0.001} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          <span>{t("operational.itemUnit")}</span>
          <input required value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <label>
          <span>{t("operational.itemPrice")}</span>
          <input required type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <div className={styles.formActions}>
        <Button type="submit">{t("operational.itemAdd")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function SubmissionCard({
  submission,
  phase,
  isOwner,
  canReview,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onRealizeItem,
  onSubmitSubmission,
  onReviewSubmission,
  onDownloadSubmission,
  busy,
}: {
  submission: ApiKasbonSubmission;
  phase: ApiKasbonPhase;
  isOwner: boolean;
  canReview: boolean;
  onAddItem: (submissionId: string, data: NewKasbonItemData) => Promise<void>;
  onUpdateItem: (itemId: string, data: Partial<NewKasbonItemData>) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onRealizeItem: (itemId: string, data: RealizeKasbonItemData) => Promise<void>;
  onSubmitSubmission: (submissionId: string) => Promise<void>;
  onReviewSubmission: (submissionId: string, decision: "APPROVED" | "REJECTED", reviewNote: string) => Promise<void>;
  onDownloadSubmission: (submissionId: string, filenameHint: string) => Promise<void>;
  busy: boolean;
}) {
  const { t, locale } = usePreferences();
  const [showAddItem, setShowAddItem] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [realizingItemId, setRealizingItemId] = useState<string | null>(null);

  const showAdd = isOwner && submission.status === "PENDING";
  const canSubmit = isOwner && submission.status === "PENDING" && submission.items.length > 0;
  const showReview = canReview && submission.status === "PENDING";
  const showRealize = isOwner && submission.status === "APPROVED";
  const showDownload = submission.status === "APPROVED";

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.userTag}>{submission.submittedByUserName}</span>
        <span
          className={`${styles.statusPill} ${styles[SUBMISSION_STATUS_PILL[submission.status]] ?? ""}`}
        >
          {submissionStatusLabel(t, submission.status)}
        </span>
        <span className={styles.hintSmall}>
          {rupiah(submission.total, locale)}
        </span>
        {showDownload ? (
          <button
            type="button"
            className={styles.downloadBtn}
            onClick={() =>
              onDownloadSubmission(
                submission.id,
                `Rekap Realisasi Kasbon ${phase.division} ${phase.period} Phase ${phase.phase}.xlsx`
              )
            }
            disabled={busy}
          >
            <DownloadIcon /> {t("operational.exportSubmission")}
          </button>
        ) : null}
      </div>

      {submission.batchNote ? <p className={styles.notes}>{submission.batchNote}</p> : null}

      {submission.reviewedByUserName && submission.reviewNote ? (
        <p className={styles.hintSmall}>
          <strong>{t("operational.submissionReviewed")} {submission.reviewedByUserName}</strong>
          {submission.reviewedAt ? ` · ${formatDate(submission.reviewedAt, locale)}` : ""}
          {` — "${submission.reviewNote}"`}
        </p>
      ) : null}

      {submission.status === "REJECTED" ? (
        <p className={styles.warningHint}>{t("operational.submissionRejected")}</p>
      ) : null}

      {submission.items.length === 0 ? (
        <p className={styles.emptyHint}>{t("operational.phaseNoItems")}</p>
      ) : (
        <table className={styles.itemTable}>
          <thead>
            <tr>
              <th>{t("operational.itemReason")}</th>
              <th>{t("operational.itemName")}</th>
              <th>{t("operational.itemQty")}</th>
              <th>{t("operational.itemUnit")}</th>
              <th>{t("operational.itemPrice")}</th>
              <th>{t("operational.itemLink")}</th>
              <th>Realisasi</th>
              {isOwner && submission.status === "PENDING" ? <th></th> : null}
              {isOwner && submission.status === "APPROVED" ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {submission.items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                isOwner={isOwner}
                submissionStatus={submission.status}
                realizingItemId={realizingItemId}
                setRealizingItemId={setRealizingItemId}
                onUpdateItem={onUpdateItem}
                onRemoveItem={onRemoveItem}
                onRealizeItem={onRealizeItem}
              />
            ))}
          </tbody>
        </table>
      )}

      {realizingItemId ? (
        <RealizeItemForm
          item={submission.items.find((i) => i.id === realizingItemId)!}
          onCancel={() => setRealizingItemId(null)}
          onRealize={async (data) => {
            await onRealizeItem(realizingItemId, data);
            setRealizingItemId(null);
          }}
        />
      ) : null}

      {showAdd && !showAddItem ? (
        <Button
          type="button"
          onClick={() => setShowAddItem(true)}
        >
          + {t("operational.itemAdd")}
        </Button>
      ) : null}
      {showAdd && showAddItem ? (
        <ItemAddForm
          onCancel={() => setShowAddItem(false)}
          onAddItem={async (data) => {
            await onAddItem(submission.id, data);
          }}
        />
      ) : null}

      {canSubmit ? (
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => onSubmitSubmission(submission.id)}
        >
          {t("operational.submissionSubmit")}
        </button>
      ) : null}

      {showReview && !reviewing ? (
        <Button type="button" onClick={() => setReviewing(true)}>
          {t("operational.kasbonApprove")} / {t("operational.kasbonReject")}
        </Button>
      ) : null}
      {showReview && reviewing ? (
        <ReviewForm
          onCancel={() => setReviewing(false)}
          onSubmit={async (decision, note) => {
            await onReviewSubmission(submission.id, decision, note);
            setReviewing(false);
          }}
        />
      ) : null}

      {isOwner && submission.status === "PENDING" && submission.items.length === 0 ? (
        <p className={styles.hintSmall}>{t("operational.submissionEmpty")}</p>
      ) : null}
    </div>
  );
}

function ReviewForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (decision: "APPROVED" | "REJECTED", reviewNote: string) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [note, setNote] = useState("");
  const canSubmit = decision === "APPROVED" || note.trim().length > 0;
  return (
    <form
      className={styles.inlineForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        await onSubmit(decision, note);
      }}
    >
      <select value={decision} onChange={(e) => setDecision(e.target.value as "APPROVED" | "REJECTED")}>
        <option value="APPROVED">{t("operational.kasbonApprove")}</option>
        <option value="REJECTED">{t("operational.kasbonReject")}</option>
      </select>
      <input
        required={decision === "REJECTED"}
        placeholder={t("operational.kasbonReviewNotePlaceholder")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" disabled={!canSubmit}>
        {decision === "APPROVED" ? t("operational.kasbonApprove") : t("operational.kasbonReject")}
      </Button>
      <Button type="button" variant="secondary" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
    </form>
  );
}

function ItemRow({
  item,
  isOwner,
  submissionStatus,
  realizingItemId,
  setRealizingItemId,
  onUpdateItem,
  onRemoveItem,
  onRealizeItem,
}: {
  item: ApiKasbonItem;
  isOwner: boolean;
  submissionStatus: KasbonSubmissionStatus;
  realizingItemId: string | null;
  setRealizingItemId: (id: string | null) => void;
  onUpdateItem: (itemId: string, data: Partial<NewKasbonItemData>) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onRealizeItem: (itemId: string, data: RealizeKasbonItemData) => Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<KasbonReason>(item.reason);
  const [name, setName] = useState(item.item);
  const [qty, setQty] = useState(String(item.qty));
  const [unit, setUnit] = useState(item.unit);
  const [price, setPrice] = useState(String(item.price));

  if (realizingItemId === item.id) return null;

  return (
    <tr>
      <td>{reasonLabel(t, item.reason)}</td>
      <td>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          item.item
        )}
      </td>
      <td>
        {editing ? (
          <input type="number" min={0.001} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        ) : (
          item.qty
        )}
      </td>
      <td>
        {editing ? (
          <input value={unit} onChange={(e) => setUnit(e.target.value)} />
        ) : (
          item.unit
        )}
      </td>
      <td>
        {editing ? (
          <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        ) : (
          rupiah(item.price, locale)
        )}
      </td>
      <td>
        {item.link ? (
          <a href={item.link} target="_blank" rel="noopener noreferrer">
            {item.link.length > 32 ? `${item.link.slice(0, 32)}…` : item.link}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td>
        {submissionStatus === "APPROVED" ? (
          item.realized ? (
            <span className={styles.statusPill} style={{ background: "var(--color-success-wash)" }}>
              {t("operational.itemRealized")}
            </span>
          ) : (
            <span className={styles.statusPill} style={{ background: "var(--color-warning-wash)" }}>
              {t("operational.itemNotRealized")}
            </span>
          )
        ) : (
          "—"
        )}
      </td>
      {isOwner && submissionStatus === "PENDING" ? (
        <td>
          {editing ? (
            <>
              <select value={reason} onChange={(e) => setReason(e.target.value as KasbonReason)}>
                {KASBON_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {reasonLabel(t, r)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  await onUpdateItem(item.id, {
                    reason,
                    item: name.trim(),
                    qty: Number(qty) || item.qty,
                    unit: unit.trim(),
                    price: Number(price) || 0,
                  });
                  setEditing(false);
                }}
              >
                {t("common.save")}
              </button>
              <button type="button" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)}>
                {t("assets.edit")}
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                aria-label={`${t("operational.itemRemove")} ${item.item}`}
                onClick={() => {
                  if (window.confirm(`${t("operational.itemRemove")} "${item.item}"?`)) {
                    onRemoveItem(item.id);
                  }
                }}
              >
                <TrashIcon />
              </button>
            </>
          )}
        </td>
      ) : null}
      {isOwner && submissionStatus === "APPROVED" && !item.realized ? (
        <td>
          <button type="button" onClick={() => setRealizingItemId(item.id)}>
            {t("operational.realizeItemTitle")}
          </button>
        </td>
      ) : null}
    </tr>
  );
}

function PhaseCard({
  phase,
  currentUserId,
  canReview,
  onCreateSubmission,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onRealizeItem,
  onSubmitSubmission,
  onReviewSubmission,
  onDownloadSubmission,
  onRemovePhase,
  busy,
}: {
  phase: ApiKasbonPhase;
  currentUserId: string;
  canReview: boolean;
  onCreateSubmission: (phaseId: string, data: { batchNote?: string }) => Promise<void>;
  onAddItem: (submissionId: string, data: NewKasbonItemData) => Promise<void>;
  onUpdateItem: (itemId: string, data: Partial<NewKasbonItemData>) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onRealizeItem: (itemId: string, data: RealizeKasbonItemData) => Promise<void>;
  onSubmitSubmission: (submissionId: string) => Promise<void>;
  onReviewSubmission: (submissionId: string, decision: "APPROVED" | "REJECTED", reviewNote: string) => Promise<void>;
  onDownloadSubmission: (submissionId: string, filenameHint: string) => Promise<void>;
  onRemovePhase: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const { t, locale } = usePreferences();
  const [creating, setCreating] = useState(false);
  const [batchNote, setBatchNote] = useState("");

  const myPending = phase.submissions.find(
    (s) => s.submittedByUserId === currentUserId && s.status === "PENDING"
  );
  const canStartNew = phase.status === "OPEN" && !myPending;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.phaseTitle}>
          {phase.division} · {phase.period} · Phase {phase.phase}
        </h3>
        <span className={`${styles.statusPill} ${styles[PHASE_STATUS_PILL[phase.status]] ?? ""}`}>
          {phaseStatusLabel(t, phase.status)}
        </span>
        <span className={styles.hintSmall}>
          {t("operational.kasbonAmountLabel")} <strong>{rupiah(phase.total, locale)}</strong>
        </span>
        <span className={styles.hintSmall}>
          {t("operational.kasbonSisa")} <strong>{rupiah(Math.max(phase.remaining, 0), locale)}</strong>
        </span>
      </div>
      <p className={styles.hintSmall}>
        {t("operational.phaseCreatedBy")} {phase.createdByUserName}
        {phase.realizedAt ? ` · ${t("operational.phaseRealizedAt")} ${formatDate(phase.realizedAt, locale)}` : ""}
      </p>

      {phase.submissions.length === 0 ? (
        <p className={styles.emptyHint}>{t("operational.phaseNoItems")}</p>
      ) : (
        <div className={styles.submissionList}>
          {phase.submissions.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              phase={phase}
              isOwner={s.submittedByUserId === currentUserId}
              canReview={canReview}
              onAddItem={onAddItem}
              onUpdateItem={onUpdateItem}
              onRemoveItem={onRemoveItem}
              onRealizeItem={onRealizeItem}
              onSubmitSubmission={onSubmitSubmission}
              onReviewSubmission={onReviewSubmission}
              onDownloadSubmission={onDownloadSubmission}
              busy={busy}
            />
          ))}
        </div>
      )}

      {phase.status === "OPEN" && canStartNew && !creating ? (
        <button type="button" className={styles.primaryAction} onClick={() => setCreating(true)}>
          + {t("operational.submissionNew")}
        </button>
      ) : null}
      {phase.status === "OPEN" && myPending ? (
        <p className={styles.hintSmall}>{t("operational.submissionAlreadyPending")}</p>
      ) : null}
      {phase.status === "OPEN" && creating ? (
        <form
          className={styles.createForm}
          onSubmit={async (e) => {
            e.preventDefault();
            await onCreateSubmission(phase.id, { batchNote: batchNote.trim() || undefined });
            setBatchNote("");
            setCreating(false);
          }}
        >
          <label>
            <span>{t("operational.submissionBatchNote")}</span>
            <input value={batchNote} onChange={(e) => setBatchNote(e.target.value)} />
          </label>
          <p className={styles.hintSmall}>{t("operational.submissionNewHint")}</p>
          <div className={styles.formActions}>
            <Button type="submit">{t("operational.submissionNew")}</Button>
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {canReview && phase.submissions.length === 0 ? (
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={() => {
            if (window.confirm(`${t("operational.phaseNewTrigger")}?`)) {
              onRemovePhase(phase.id);
            }
          }}
        >
          {t("operational.itemRemove")} {t("operational.phaseCreatedBy")}
        </button>
      ) : null}
    </div>
  );
}

function PhaseCreateForm({
  blockedByPrevious,
  onCreate,
}: {
  blockedByPrevious: boolean;
  onCreate: (data: { period: string }) => Promise<void>;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(currentPeriod());
  const [busy, setBusy] = useState(false);

  if (blockedByPrevious) {
    return <p className={styles.hintSmall}>{t("operational.phaseNewBlockedByPrevious")}</p>;
  }

  if (!open) {
    return (
      <button type="button" className={styles.primaryAction} onClick={() => setOpen(true)}>
        + {t("operational.phaseNewTrigger")}
      </button>
    );
  }

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onCreate({ period });
          setOpen(false);
        } catch (err) {
          toast.error(t("operational.phaseNewTrigger"), err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        <span>{t("operational.kasbonPeriod")}</span>
        <input
          required
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="YYYY-MM"
          pattern="\d{4}-\d{2}"
        />
      </label>
      <div className={styles.formActions}>
        <Button type="submit" loading={busy}>
          {busy ? t("common.saving") : t("operational.phaseNewTrigger")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

type Tab = "report" | "kasbon";
type KasbonView = "now" | "archive";

function ArchivePhaseCard({
  phase,
  currentUserId,
  canReview,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onRealizeItem,
  onSubmitSubmission,
  onReviewSubmission,
  onDownloadSubmission,
  onRemovePhase,
  busy,
}: {
  phase: ApiKasbonPhase;
  currentUserId: string;
  canReview: boolean;
  onAddItem: (submissionId: string, data: NewKasbonItemData) => Promise<void>;
  onUpdateItem: (itemId: string, data: Partial<NewKasbonItemData>) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onRealizeItem: (itemId: string, data: RealizeKasbonItemData) => Promise<void>;
  onSubmitSubmission: (submissionId: string) => Promise<void>;
  onReviewSubmission: (submissionId: string, decision: "APPROVED" | "REJECTED", reviewNote: string) => Promise<void>;
  onDownloadSubmission: (submissionId: string, filenameHint: string) => Promise<void>;
  onRemovePhase: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const { t } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.phaseTitle}>
          {phase.division} · {phase.period} · Phase {phase.phase}
        </h3>
        <span className={`${styles.statusPill} ${styles[PHASE_STATUS_PILL[phase.status]] ?? ""}`}>
          {phaseStatusLabel(t, phase.status)}
        </span>
        {phase.realizedAt ? (
          <span className={styles.hintSmall}>
            {t("operational.phaseRealizedAt")} {new Date(phase.realizedAt).toLocaleDateString("id-ID")}
          </span>
        ) : null}
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? t("operational.kasbonArchiveCollapse") : t("operational.kasbonArchiveExpand")}
        </button>
      </div>
      {expanded ? (
        <PhaseCard
          phase={phase}
          currentUserId={currentUserId}
          canReview={canReview}
          onCreateSubmission={async () => {
            // No-op in archive — phase is closed.
          }}
          onAddItem={onAddItem}
          onUpdateItem={onUpdateItem}
          onRemoveItem={onRemoveItem}
          onRealizeItem={onRealizeItem}
          onSubmitSubmission={onSubmitSubmission}
          onReviewSubmission={onReviewSubmission}
          onDownloadSubmission={onDownloadSubmission}
          onRemovePhase={onRemovePhase}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

export default function OperationalPage() {
  const { user } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();
  const operational = useOperational();
  // DEC-082: top-level tab state lives in URL query (?tab=kasbon) so
  // the Sidebar submenu can link to each section. The inner
  // now/archive filter is still a useState because it only affects
  // the visible kasbon rows — not a navigation target.
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "kasbon" ? "kasbon" : "report";
  const [kasbonView, setKasbonView] = useState<KasbonView>("now");
  const [busyDownload, setBusyDownload] = useState(false);
  // DEC-076: search + filter state for both daily report and kasbon
  // views. Filter changes don't reset to page 0 because these lists
  // aren't paginated yet — single scrollable column.
  const [reportSearch, setReportSearch] = useState("");
  const [kasbonSearch, setKasbonSearch] = useState("");
  const [kasbonStatusFilter, setKasbonStatusFilter] = useState<"ALL" | "OPEN" | "REALIZED">("ALL");

  if (!user) return null;
  const canReview = canReviewKasbon(user);
  const canOpenPhase = canCreateKasbonPhase(user);
  const hasKasbonAccess = canAccessKasbon(user);
  const canEditAnyReport = !!user.isSuperAdmin;
  const activeTab = hasKasbonAccess ? tab : "report";

  // DEC-062: split kasbon by current vs archive. "Sekarang" = the
  // single currently-OPEN phase (or empty state if none). "Arsip" =
  // every closed phase (REALIZED). No more "Phase 1/2/3" filter
  // dropdown — the user wanted the menu to feel like a single,
  // focused workspace.
  const openPhase = operational.kasbonPhases.find((p) => p.status === "OPEN") ?? null;
  const archivePhases = operational.kasbonPhases.filter((p) => p.status === "REALIZED");

  // For the "Open new phase" gate: the most recent phase (any status)
  // must be REALIZED before OM can open a new one. The sorted lookup
  // considers the period+phase number as the ordering.
  const sortedPhases = [...operational.kasbonPhases].sort(
    (a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : b.phase - a.phase)
  );
  const latestPhase = sortedPhases[0];
  const blockedByPrevious = !latestPhase || latestPhase.status !== "REALIZED";

  return (
    <div className={styles.wrap}>
      <PageHeader title={t("nav.operational")} subtitle={t("operational.pageDescription")} />

      {!operational.hydrated ? (
        <p className={styles.loading}>{t("operational.loading")}</p>
      ) : activeTab === "report" ? (
        <>
          <ReportForm
            onCreate={async ({ date, activities, pendingFiles }) => {
              const created = await operational.createReport({ date, activities });
              if (pendingFiles && pendingFiles.length > 0) {
                for (const f of pendingFiles) {
                  try {
                    await operational.addReportAttachment(created.id, f);
                  } catch (err) {
                    console.error("Failed to attach", f.fileName, err);
                  }
                }
              }
            }}
          />
          {/* DEC-076: search input above the daily-report list. Filters
              by date label, activities text, and the submitter's name
              so a user can find their own / others' entries quickly. */}
          {operational.dailyReports.length > 0 && (
            <input
              type="search"
              className={styles.filterInput}
              placeholder={t("operational.reportSearchHint")}
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              aria-label={t("operational.reportSearchHint")}
            />
          )}
          {operational.dailyReports.length === 0 ? (
            <p className={styles.emptyHint}>{t("operational.reportEmpty")}</p>
          ) : (() => {
            const q = reportSearch.trim().toLowerCase();
            const visibleReports = operational.dailyReports.filter((r) => {
              if (!q) return true;
              const hay = [r.date, r.activities, r.userName ?? ""].join(" ").toLowerCase();
              return hay.includes(q);
            });
            if (visibleReports.length === 0) {
              return <p className={styles.emptyHint}>{t("operational.noMatches")}</p>;
            }
            return (
              <div className={styles.list}>
                {visibleReports.map((r) => (
                  <ReportCard
                    key={r.id}
                    report={r}
                    canEdit={canEditAnyReport || r.userId === user.id}
                    onUpdate={operational.updateReport}
                    onRemove={operational.removeReport}
                    onAddAttachment={operational.addReportAttachment}
                    onRemoveAttachment={operational.removeReportAttachment}
                  />
                ))}
              </div>
            );
          })()}
        </>
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={kasbonView === "now"}
              className={kasbonView === "now" ? "tab tabActive" : "tab"}
              onClick={() => setKasbonView("now")}
            >
              {t("operational.kasbonTabNow")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kasbonView === "archive"}
              className={kasbonView === "archive" ? "tab tabActive" : "tab"}
              onClick={() => setKasbonView("archive")}
            >
              {t("operational.kasbonTabArchive")}{archivePhases.length > 0 ? ` (${archivePhases.length})` : ""}
            </button>
          </div>

          {/* DEC-076: search + status filter for kasbon. Search hits
              division / period / phase label so the user can quickly
              find a specific submission. Status filter is enforced by
              the existing tab strip ("now" / "archive"), but the
              extra status dropdown lets users restrict within each tab
              (e.g. only OPEN within "now", only REALIZED within
              "archive" — already the only status each tab holds, but
              the dropdown makes the intent explicit and is ready for
              future PENDING / REJECTED sub-states). */}
          <div className={styles.filterRow}>
            <input
              type="search"
              className={styles.filterInput}
              placeholder={t("operational.kasbonSearchHint")}
              value={kasbonSearch}
              onChange={(e) => setKasbonSearch(e.target.value)}
              aria-label={t("operational.kasbonSearchHint")}
            />
            <select
              className={styles.filterSelect}
              value={kasbonStatusFilter}
              onChange={(e) => setKasbonStatusFilter(e.target.value as "ALL" | "OPEN" | "REALIZED")}
              aria-label={t("operational.kasbonStatusFilter")}
            >
              <option value="ALL">{t("operational.kasbonStatusAll")}</option>
              <option value="OPEN">{t("operational.kasbonStatusOpen")}</option>
              <option value="REALIZED">{t("operational.kasbonStatusRealized")}</option>
            </select>
          </div>

          {kasbonView === "now" ? (
            <>
              {canOpenPhase && (
                <PhaseCreateForm
                  blockedByPrevious={blockedByPrevious}
                  onCreate={async (data) => {
                    try {
                      await operational.createPhase(data);
                    } catch (err) {
                      toast.error(t("operational.phaseNewTrigger"), err instanceof Error ? err.message : String(err));
                      throw err;
                    }
                  }}
                />
              )}

              {(() => {
                // DEC-076: search matches division/period/phase label,
                // and the status filter must include the phase status
                // (OPEN / REALIZED). Both filters apply regardless of
                // tab — the tab narrows further to "now" (OPEN) or
                // "archive" (REALIZED), and the status filter is an
                // additional explicit control.
                const kq = kasbonSearch.trim().toLowerCase();
                const kasbonMatches = (p: { division: string; period: string; phase: number; status: string }) => {
                  if (kasbonStatusFilter !== "ALL" && p.status !== kasbonStatusFilter) return false;
                  if (!kq) return true;
                  const hay = `${p.division} ${p.period} ${p.phase}`.toLowerCase();
                  return hay.includes(kq);
                };
                const visibleOpen = openPhase && kasbonMatches(openPhase) ? openPhase : null;
                return (
                  <>
                    {visibleOpen ? (
                      <PhaseCard
                        phase={visibleOpen}
                        currentUserId={user.id}
                        canReview={canReview}
                        onCreateSubmission={operational.createSubmission}
                        onAddItem={operational.addItem}
                        onUpdateItem={operational.updateItem}
                        onRemoveItem={operational.removeItem}
                        onRealizeItem={operational.realizeItem}
                        onSubmitSubmission={operational.submitSubmission}
                        onReviewSubmission={operational.reviewSubmission}
                        onDownloadSubmission={async (id, hint) => {
                          setBusyDownload(true);
                          try {
                            await operational.downloadSubmission(id, hint);
                          } catch (err) {
                            toast.error(
                              t("operational.exportSubmission"),
                              err instanceof Error ? err.message : String(err)
                            );
                          } finally {
                            setBusyDownload(false);
                          }
                        }}
                        onRemovePhase={operational.removePhase}
                        busy={busyDownload}
                      />
                    ) : openPhase && (kq || kasbonStatusFilter !== "ALL") ? (
                      <p className={styles.emptyHint}>{t("operational.noMatches")}</p>
                    ) : (
                      <div className={styles.emptyHint}>
                        <p className={styles.hint}>
                          <strong>{t("operational.kasbonNoOpenPhaseHeader")}</strong>
                        </p>
                        <p>{t("operational.kasbonNoOpenPhaseBody")}</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            <>
              {(() => {
                const kq = kasbonSearch.trim().toLowerCase();
                const visibleArchive = archivePhases.filter((p) => {
                  if (kasbonStatusFilter !== "ALL" && p.status !== kasbonStatusFilter) return false;
                  if (!kq) return true;
                  const hay = `${p.division} ${p.period} ${p.phase}`.toLowerCase();
                  return hay.includes(kq);
                });
                if (visibleArchive.length === 0) {
                  return <p className={styles.emptyHint}>{archivePhases.length === 0 ? t("operational.kasbonArchiveEmpty") : t("operational.noMatches")}</p>;
                }
                return (
                <div className={styles.list}>
                  {visibleArchive.map((p) => (
                    <ArchivePhaseCard
                      key={p.id}
                      phase={p}
                      currentUserId={user.id}
                      canReview={canReview}
                      onAddItem={operational.addItem}
                      onUpdateItem={operational.updateItem}
                      onRemoveItem={operational.removeItem}
                      onRealizeItem={operational.realizeItem}
                      onSubmitSubmission={operational.submitSubmission}
                      onReviewSubmission={operational.reviewSubmission}
                      onDownloadSubmission={async (id, hint) => {
                        setBusyDownload(true);
                        try {
                          await operational.downloadSubmission(id, hint);
                        } catch (err) {
                          toast.error(
                            t("operational.exportSubmission"),
                            err instanceof Error ? err.message : String(err)
                          );
                        } finally {
                          setBusyDownload(false);
                        }
                      }}
                      onRemovePhase={operational.removePhase}
                      busy={busyDownload}
                    />
                  ))}
                </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}
