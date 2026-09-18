"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWorkflows } from "@/hooks/useOrgLibrary";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useToast } from "@/components/shared/Toast";
import { isPrivilegedClient } from "@/lib/auth-api";
import { workflowsApi, type Workflow, type OrgLibraryAttachment } from "@/lib/org-library-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { LayoutToggle, type Layout } from "@/components/shared/LayoutToggle";
import { PageHeader } from "@/components/shared/PageHeader";
import { useViewPreference } from "@/hooks/useViewPreference";
import { Skeleton } from "@/components/shared/Skeleton";
import { PaperclipIcon, PlusIcon, SearchIcon, TrashIcon, XIcon, PencilIcon, InboxIcon } from "@/components/icons";
import { attachmentDownloadUrl } from "@/lib/files-api";
import styles from "./page.module.css";

type EditForm = {
  id: string | null;
  name: string;
  description: string;
  steps: string;
  category: string;
};

const EMPTY_FORM: EditForm = { id: null, name: "", description: "", steps: "", category: "" };

export default function WorkflowsPage() {
  const { user, token } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();
  const { items, hydrated, reload } = useWorkflows();
  const canEdit = isPrivilegedClient(user);
  const [layout, setLayout] = useViewPreference<Layout>("organization.workflow", "grid", ["list", "grid"] as const);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<{ open: boolean; workflowId: string | null; fileName: string; url: string }>(
    { open: false, workflowId: null, fileName: "", url: "" }
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        w.category.toLowerCase().includes(q) ||
        w.steps.toLowerCase().includes(q)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const out: Record<string, Workflow[]> = {};
    for (const w of filtered) {
      const key = w.category || "Lainnya";
      out[key] = out[key] ?? [];
      out[key].push(w);
    }
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const open = (w: Workflow) => {
    setOpenId(w.id === openId ? null : w.id);
  };

  const startCreate = () => {
    setEditing({ ...EMPTY_FORM });
    setError(null);
  };
  const startEdit = (w: Workflow) => {
    setEditing({ id: w.id, name: w.name, description: w.description, steps: w.steps, category: w.category });
    setError(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError(t("orgLibrary.nameRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing.id) {
        await workflowsApi.update(token, editing.id, {
          name: editing.name,
          description: editing.description,
          steps: editing.steps,
          category: editing.category,
        });
        toast.success(t("orgLibrary.workflow.updateSuccess"));
      } else {
        await workflowsApi.create(token, {
          name: editing.name,
          description: editing.description,
          steps: editing.steps,
          category: editing.category,
        });
        toast.success(t("orgLibrary.workflow.createSuccess"));
      }
      setEditing(null);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.workflow.saveError");
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workflowsApi.remove(token, id);
      toast.success(t("orgLibrary.workflow.deleteSuccess"));
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.workflow.deleteError");
      toast.error(message);
    }
  };

  const uploadAttachment = async (workflowId: string, file: File) => {
    try {
      await workflowsApi.uploadAttachment(token, workflowId, file);
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
    if (!linkForm.workflowId || !linkForm.fileName.trim() || !linkForm.url.trim()) return;
    try {
      await workflowsApi.addAttachmentLink(token, linkForm.workflowId, linkForm.fileName, linkForm.url);
      toast.success(t("orgLibrary.attachmentLinkAdded"));
      setLinkForm({ open: false, workflowId: null, fileName: "", url: "" });
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("orgLibrary.uploadError");
      toast.error(message);
    }
  };

  const removeAttachment = async (workflowId: string, att: OrgLibraryAttachment) => {
    try {
      await workflowsApi.removeAttachment(token, workflowId, att.id);
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
        title={t("orgLibrary.workflow.title")}
        subtitle={canEdit ? t("orgLibrary.pageDescriptionEditable") : t("orgLibrary.pageDescriptionReadOnly")}
        actions={
          canEdit ? (
            <Button type="button" onClick={startCreate} iconLeft={<PlusIcon />}>
              {t("orgLibrary.workflow.addTrigger")}
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
          title={t("orgLibrary.workflow.empty")}
          description={query ? t("orgLibrary.emptySearch") : t("orgLibrary.workflow.emptyHint")}
          compact
        />
      ) : (
        <div className={styles.groupedWrap}>
          {grouped.map(([category, workflows]) => (
            <section key={category} className={styles.categoryBlock}>
              <h2 className={styles.categoryTitle}>{category}</h2>
              <div className={layout === "grid" ? styles.grid : styles.list}>
                {workflows.map((w) => (
                  <WorkflowCard
                    key={w.id}
                    workflow={w}
                    isOpen={openId === w.id}
                    onToggle={() => open(w)}
                    canEdit={canEdit}
                    onEdit={() => startEdit(w)}
                    onDelete={() => setConfirmDelete({ id: w.id, name: w.name })}
                    onUploadFile={(file) => {
                      setUploadingFor(w.id);
                      uploadAttachment(w.id, file);
                    }}
                    onAddLink={() =>
                      setLinkForm({ open: true, workflowId: w.id, fileName: w.name + " (link)", url: "" })
                    }
                    onRemoveAttachment={(att) => removeAttachment(w.id, att)}
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
        <WorkflowFormModal
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
          form={linkForm}
          setForm={setLinkForm}
          onSave={addLink}
          onCancel={() => setLinkForm({ open: false, workflowId: null, fileName: "", url: "" })}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t("orgLibrary.confirmDeleteTitle")}
          message={`${t("orgLibrary.confirmDeleteMessagePrefix")} "${confirmDelete.name}"? ${t("orgLibrary.confirmDeleteMessageSuffix")}`}
          confirmText={confirmDelete.name}
          confirmLabel={t("common.delete")}
          onConfirm={() => handleDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function WorkflowCard({
  workflow,
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
  workflow: Workflow;
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

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <button type="button" className={styles.cardTitleBtn} onClick={onToggle} aria-expanded={isOpen}>
          <span className={styles.cardTitle}>{workflow.name}</span>
          <span className={styles.cardMeta}>
            {workflow.attachments.length > 0 && (
              <span className={styles.attachmentCount}>
                <PaperclipIcon /> {workflow.attachments.length}
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

      {workflow.description && <p className={styles.cardDescription}>{workflow.description}</p>}

      {isOpen && (
        <div className={styles.cardBody}>
          {workflow.steps && (
            <div className={styles.stepsBlock}>
              <h3>{t("orgLibrary.steps")}</h3>
              <pre className={styles.stepsText}>{workflow.steps}</pre>
            </div>
          )}

          <div className={styles.attachmentsBlock}>
            <h3>
              {t("orgLibrary.attachments")} ({workflow.attachments.length})
            </h3>
            {workflow.attachments.length === 0 ? (
              <EmptyState icon={<InboxIcon />} title={t("orgLibrary.noAttachments")} compact />
            ) : (
              <ul className={styles.attachmentList}>
                {workflow.attachments.map((att) => (
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
                  id={`workflow-file-${workflow.id}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className={styles.uploadBtn}
                  disabled={uploadingFor === workflow.id}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingFor === workflow.id
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
              {t("orgLibrary.createdBy")} {workflow.createdByUserName} {t("orgLibrary.on")} {new Date(workflow.createdAt).toLocaleDateString()}
            </span>
            {workflow.updatedByUserName && (
              <span className={styles.auditText}>
                {t("orgLibrary.updatedBy")} {workflow.updatedByUserName} {t("orgLibrary.on")} {new Date(workflow.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function WorkflowFormModal({
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
          <h2>{isEdit ? t("orgLibrary.workflow.editTitle") : t("orgLibrary.workflow.addTitle")}</h2>
          <button type="button" onClick={onCancel} aria-label={t("common.cancel")}>
            <XIcon />
          </button>
        </div>
        <div className={styles.modalBody}>
          <label>
            <span>{t("orgLibrary.name")} <span className={styles.required}>*</span></span>
            <input
              required
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
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
            <span>{t("orgLibrary.description")}</span>
            <textarea
              rows={2}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
          </label>
          <label>
            <span>{t("orgLibrary.steps")}</span>
            <textarea
              rows={8}
              value={editing.steps}
              placeholder={t("orgLibrary.stepsPlaceholder")}
              onChange={(e) => setEditing({ ...editing, steps: e.target.value })}
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
