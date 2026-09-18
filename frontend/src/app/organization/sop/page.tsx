"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSops } from "@/hooks/useOrgLibrary";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useToast } from "@/components/shared/Toast";
import { isPrivilegedClient } from "@/lib/auth-api";
import { sopsApi, type SOP, type OrgLibraryAttachment } from "@/lib/org-library-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { LayoutToggle, type Layout } from "@/components/shared/LayoutToggle";
import { PageHeader } from "@/components/shared/PageHeader";
import { useViewPreference } from "@/hooks/useViewPreference";
import { Skeleton } from "@/components/shared/Skeleton";
import { PaperclipIcon, PlusIcon, SearchIcon, TrashIcon, XIcon, PencilIcon, InboxIcon } from "@/components/icons";
import { attachmentDownloadUrl } from "@/lib/files-api";
import styles from "../workflow/page.module.css";

type EditForm = {
  id: string | null;
  title: string;
  summary: string;
  content: string;
  category: string;
};

const EMPTY_FORM: EditForm = { id: null, title: "", summary: "", content: "", category: "" };

export default function SopsPage() {
  const { user, token } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();
  const { items, hydrated, reload } = useSops();
  const canEdit = isPrivilegedClient(user);
  const [layout, setLayout] = useViewPreference<Layout>("organization.sop", "grid", ["list", "grid"] as const);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<{ open: boolean; sopId: string | null; fileName: string; url: string }>(
    { open: false, sopId: null, fileName: "", url: "" }
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const out: Record<string, SOP[]> = {};
    for (const s of filtered) {
      const key = s.category || "Lainnya";
      out[key] = out[key] ?? [];
      out[key].push(s);
    }
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const open = (s: SOP) => setOpenId(s.id === openId ? null : s.id);

  const startCreate = () => {
    setEditing({ ...EMPTY_FORM });
    setError(null);
  };
  const startEdit = (s: SOP) => {
    setEditing({ id: s.id, title: s.title, summary: s.summary, content: s.content, category: s.category });
    setError(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setError(t("orgLibrary.titleRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing.id) {
        await sopsApi.update(token, editing.id, {
          title: editing.title,
          summary: editing.summary,
          content: editing.content,
          category: editing.category,
        });
        toast.success(t("orgLibrary.sop.updateSuccess"));
      } else {
        await sopsApi.create(token, {
          title: editing.title,
          summary: editing.summary,
          content: editing.content,
          category: editing.category,
        });
        toast.success(t("orgLibrary.sop.createSuccess"));
      }
      setEditing(null);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.sop.saveError");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await sopsApi.remove(token, id);
      toast.success(t("orgLibrary.sop.deleteSuccess"));
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.sop.deleteError");
      toast.error(message);
    }
  };

  const uploadAttachment = async (sopId: string, file: File) => {
    try {
      await sopsApi.uploadAttachment(token, sopId, file);
      toast.success(t("orgLibrary.attachmentUploaded"));
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.uploadError");
      toast.error(message);
    } finally {
      setUploadingFor(null);
    }
  };

  const addLink = async () => {
    if (!linkForm.sopId || !linkForm.fileName.trim() || !linkForm.url.trim()) return;
    try {
      await sopsApi.addAttachmentLink(token, linkForm.sopId, linkForm.fileName, linkForm.url);
      toast.success(t("orgLibrary.attachmentLinkAdded"));
      setLinkForm({ open: false, sopId: null, fileName: "", url: "" });
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.uploadError");
      toast.error(message);
    }
  };

  const removeAttachment = async (sopId: string, att: OrgLibraryAttachment) => {
    try {
      await sopsApi.removeAttachment(token, sopId, att.id);
      toast.success(t("orgLibrary.attachmentRemoved"));
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.deleteError");
      toast.error(message);
    }
  };

  return (
    <div className={styles.wrap}>
      <PageHeader
        eyebrow={<Link href="/organization" className={styles.backLink}>← {t("nav.organization")}</Link>}
        title={t("orgLibrary.sop.title")}
        subtitle={canEdit ? t("orgLibrary.pageDescriptionEditable") : t("orgLibrary.pageDescriptionReadOnly")}
        actions={
          canEdit ? (
            <Button type="button" onClick={startCreate} iconLeft={<PlusIcon />}>
              {t("orgLibrary.sop.addTrigger")}
            </Button>
          ) : null
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <SearchIcon />
          <input
            type="text"
            placeholder={t("orgLibrary.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear">
              <XIcon />
            </button>
          )}
        </div>
        <LayoutToggle value={layout} onChange={setLayout} />
      </div>

      {!hydrated ? (
        <div role="status" aria-label={t("common.loading")}>
          <Skeleton variant="heading" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="row" />)}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<PaperclipIcon />}
          title={t("orgLibrary.sop.empty")}
          description={query ? t("orgLibrary.emptySearch") : t("orgLibrary.sop.emptyHint")}
          compact
        />
      ) : (
        <div className={styles.groupedWrap}>
          {grouped.map(([category, sops]) => (
            <section key={category} className={styles.categoryBlock}>
              <h2 className={styles.categoryTitle}>{category}</h2>
              <div className={layout === "grid" ? styles.grid : styles.list}>
                {sops.map((s) => (
                  <SopCard
                    key={s.id}
                    sop={s}
                    isOpen={openId === s.id}
                    onToggle={() => open(s)}
                    canEdit={canEdit}
                    onEdit={() => startEdit(s)}
                    onDelete={() => setConfirmDelete({ id: s.id, title: s.title })}
                    onUploadFile={(file) => {
                      setUploadingFor(s.id);
                      uploadAttachment(s.id, file);
                    }}
                    onAddLink={() =>
                      setLinkForm({ open: true, sopId: s.id, fileName: s.title + " (link)", url: "" })
                    }
                    onRemoveAttachment={(att) => removeAttachment(s.id, att)}
                    fileInputRef={fileInputRef}
                    uploadingFor={uploadingFor}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <SopFormModal
          editing={editing}
          setEditing={setEditing}
          submitting={submitting}
          error={error}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      )}

      {linkForm.open && (
        <LinkFormModal
          form={{
            open: linkForm.open,
            workflowId: linkForm.sopId,
            fileName: linkForm.fileName,
            url: linkForm.url,
          }}
          setForm={(v) => setLinkForm({ open: v.open, sopId: v.workflowId, fileName: v.fileName, url: v.url })}
          onSave={addLink}
          onCancel={() => setLinkForm({ open: false, sopId: null, fileName: "", url: "" })}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t("orgLibrary.confirmDeleteTitle")}
          message={`${t("orgLibrary.confirmDeleteMessagePrefix")} "${confirmDelete.title}"? ${t("orgLibrary.confirmDeleteMessageSuffix")}`}
          confirmText={confirmDelete.title}
          confirmLabel={t("common.delete")}
          onConfirm={() => handleDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function SopCard({
  sop,
  isOpen,
  onToggle,
  canEdit,
  onEdit,
  onDelete,
  onUploadFile,
  onAddLink,
  onRemoveAttachment,
  fileInputRef,
  uploadingFor,
}: {
  sop: SOP;
  isOpen: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUploadFile: (file: File) => void;
  onAddLink: () => void;
  onRemoveAttachment: (att: OrgLibraryAttachment) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  uploadingFor: string | null;
}) {
  const { t } = usePreferences();
  const primaryAttachment = sop.attachments[0];

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <button type="button" className={styles.cardTitleBtn} onClick={onToggle} aria-expanded={isOpen}>
          <span className={styles.cardTitle}>{sop.title}</span>
          <span className={styles.cardMeta}>
            {sop.attachments.length > 0 && (
              <span className={styles.attachmentCount}>
                <PaperclipIcon /> {sop.attachments.length}
              </span>
            )}
            <span className={styles.cardCaret} data-open={isOpen}>▾</span>
          </span>
        </button>
        {canEdit && (
          <div className={styles.cardActions}>
            <button type="button" onClick={onEdit} aria-label={t("common.edit")}>
              <PencilIcon />
            </button>
            <button type="button" onClick={onDelete} aria-label={t("common.delete")} className={styles.dangerBtn}>
              <TrashIcon />
            </button>
          </div>
        )}
      </header>

      {sop.summary && <p className={styles.cardDescription}>{sop.summary}</p>}

      {primaryAttachment && !isOpen && (
        <a
          href={primaryAttachment.kind === "LINK" ? primaryAttachment.url ?? "#" : attachmentDownloadUrl(primaryAttachment.id)}
          target={primaryAttachment.kind === "LINK" ? "_blank" : undefined}
          rel={primaryAttachment.kind === "LINK" ? "noopener noreferrer" : undefined}
          className={styles.attachmentLink}
          style={{ marginTop: 6 }}
        >
          <PaperclipIcon />
          <span className={styles.attachmentName}>{primaryAttachment.fileName}</span>
          <span className={styles.attachmentSize}>
            {primaryAttachment.kind === "LINK"
              ? t("orgLibrary.linkAttachment")
              : `${(primaryAttachment.fileSize / 1024).toFixed(1)} KB`}
          </span>
        </a>
      )}

      {isOpen && (
        <div className={styles.cardBody}>
          {sop.content && (
            <div className={styles.stepsBlock}>
              <h3>{t("orgLibrary.content")}</h3>
              <pre className={styles.stepsText}>{sop.content}</pre>
            </div>
          )}

          <div className={styles.attachmentsBlock}>
            <h3>
              {t("orgLibrary.attachments")} ({sop.attachments.length})
            </h3>
            {sop.attachments.length === 0 ? (
              <EmptyState icon={<InboxIcon />} title={t("orgLibrary.noAttachments")} compact />
            ) : (
              <ul className={styles.attachmentList}>
                {sop.attachments.map((att) => (
                  <li key={att.id} className={styles.attachmentRow}>
                    <a
                      href={att.kind === "LINK" ? att.url ?? "#" : attachmentDownloadUrl(att.id)}
                      target={att.kind === "LINK" ? "_blank" : undefined}
                      rel={att.kind === "LINK" ? "noopener noreferrer" : undefined}
                      className={styles.attachmentLink}
                    >
                      <PaperclipIcon />
                      <span className={styles.attachmentName}>{att.fileName}</span>
                      <span className={styles.attachmentSize}>
                        {att.kind === "LINK"
                          ? t("orgLibrary.linkAttachment")
                          : `${(att.fileSize / 1024).toFixed(1)} KB`}
                      </span>
                    </a>
                    {canEdit && (
                      <button
                        type="button"
                        className={styles.removeBtn}
                        aria-label={t("common.delete")}
                        onClick={() => onRemoveAttachment(att)}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className={styles.uploadRow}>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  id={`sop-file-${sop.id}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className={styles.uploadBtn}
                  disabled={uploadingFor === sop.id}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingFor === sop.id
                    ? t("common.processing")
                    : t("orgLibrary.uploadFile")}
                </button>
                <span className={styles.uploadOr}>·</span>
                <button type="button" className={styles.uploadBtn} onClick={onAddLink}>
                  {t("orgLibrary.addLink")}
                </button>
              </div>
            )}
          </div>

          <div className={styles.cardFoot}>
            <span className={styles.auditText}>
              {t("orgLibrary.createdBy")} {sop.createdByUserName} {t("orgLibrary.on")} {new Date(sop.createdAt).toLocaleDateString()}
            </span>
            {sop.updatedByUserName && (
              <span className={styles.auditText}>
                {t("orgLibrary.updatedBy")} {sop.updatedByUserName} {t("orgLibrary.on")} {new Date(sop.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function SopFormModal({
  editing,
  setEditing,
  submitting,
  error,
  onSave,
  onCancel,
}: {
  editing: EditForm;
  setEditing: (v: EditForm) => void;
  submitting: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = usePreferences();
  const isEdit = Boolean(editing.id);
  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h2>{isEdit ? t("orgLibrary.sop.editTitle") : t("orgLibrary.sop.addTitle")}</h2>
          <button type="button" onClick={onCancel} aria-label={t("common.cancel")}>
            <XIcon />
          </button>
        </div>
        <div className={styles.modalBody}>
          <label>
            <span>{t("orgLibrary.title")} <span className={styles.required}>*</span></span>
            <input
              required
              autoFocus
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </label>
          <label>
            <span>{t("orgLibrary.category")}</span>
            <input
              value={editing.category}
              placeholder={t("orgLibrary.categoryPlaceholder")}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            />
          </label>
          <label>
            <span>{t("orgLibrary.summary")}</span>
            <textarea
              rows={3}
              value={editing.summary}
              onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              placeholder={t("orgLibrary.summaryPlaceholder")}
            />
          </label>
          <label>
            <span>{t("orgLibrary.content")}</span>
            <textarea
              rows={8}
              value={editing.content}
              placeholder={t("orgLibrary.contentPlaceholder")}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
          </label>
          {error && <p className={styles.formError} role="alert">{error}</p>}
        </div>
        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={onSave} loading={submitting}>
            {submitting ? t("common.processing") : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LinkFormModal({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: { open: boolean; workflowId: string | null; fileName: string; url: string };
  setForm: (v: { open: boolean; workflowId: string | null; fileName: string; url: string }) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = usePreferences();
  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h2>{t("orgLibrary.addLink")}</h2>
          <button type="button" onClick={onCancel} aria-label={t("common.cancel")}>
            <XIcon />
          </button>
        </div>
        <div className={styles.modalBody}>
          <label>
            <span>{t("orgLibrary.linkName")}</span>
            <input
              value={form.fileName}
              onChange={(e) => setForm({ ...form, fileName: e.target.value })}
              placeholder={t("orgLibrary.linkNamePlaceholder")}
            />
          </label>
          <label>
            <span>{t("orgLibrary.linkUrl")}</span>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://..."
            />
          </label>
        </div>
        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!form.fileName.trim() || !form.url.trim()}
          >
            {t("common.add")}
          </Button>
        </div>
      </div>
    </div>
  );
}
