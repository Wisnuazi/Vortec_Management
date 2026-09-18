"use client";

import { useRef, useState } from "react";
import type { ApiAttachment, NewAttachmentData } from "@/lib/projects-api";
import { formatFileSize, MAX_ATTACHMENT_BYTES } from "@/lib/files";
import { uploadFile, attachmentDownloadUrl } from "@/lib/files-api";
import { useAuth } from "@/hooks/useAuth";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { usePreferences } from "@/hooks/usePreferences";
import { formatDate } from "@/lib/format";
import styles from "./page.module.css";

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function AttachmentList({
  attachments,
  canEdit,
  uploadUrl,
  replaceUrl,
  onUpload,     // LINK upload — caller POSTs LINK via their API method, triggering project refetch
  onUploaded,    // FILE upload complete — called so caller can refetch the project
  onUpdate,     // rename (PATCH with fileName) — for LINK and FILE rename
  onRemove,
}: {
  attachments: ApiAttachment[];
  canEdit: boolean;
  /** Backend multipart upload endpoint for FILE attachments, e.g. /api/projects/:id/tasks/:tid/attachments/upload */
  uploadUrl: string;
  /** Backend multipart replace endpoint factory: given an attachmentId, returns the /replace URL */
  replaceUrl: (attachmentId: string) => string;
  /** Called after a LINK upload succeeds (POSTs JSON, triggers project refetch in the caller) */
  onUpload: (data: NewAttachmentData) => Promise<void>;
  /** DEC-064: Called after a FILE upload (multipart) succeeds so the caller can refetch the project */
  onUploaded: () => Promise<void>;
  /** Called for rename (PATCH with fileName) */
  onUpdate: (attachmentId: string, data: { fileName: string; url?: string }) => Promise<void>;
  /** Called to remove an attachment */
  onRemove: (attachmentId: string) => Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [replacePendingId, setReplacePendingId] = useState<string | null>(null);

  // DEC-064: FILE uploads go via multipart POST to disk storage.
  // After success, onUploaded is called so the caller can refetch the project.
  const handleFile = async (file: File) => {
    setError("");
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`${t("attachments.tooLarge")} (${t("attachments.maxSize")} ${formatFileSize(MAX_ATTACHMENT_BYTES)}).`);
      return;
    }
    setUploading(true);
    try {
      await uploadFile(uploadUrl, file, token);
      await onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attachments.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = async () => {
    setError("");
    const trimmedUrl = linkUrl.trim();
    if (!isValidHttpUrl(trimmedUrl)) {
      setError(t("attachments.invalidUrl"));
      return;
    }
    setUploading(true);
    try {
      await onUpload({ kind: "LINK", fileName: linkLabel.trim() || trimmedUrl, url: trimmedUrl });
      setLinkLabel("");
      setLinkUrl("");
      setLinkFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attachments.addLinkFailed"));
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (a: ApiAttachment) => {
    setEditingId(a.id);
    setEditName(a.fileName);
    setEditLinkUrl(a.url ?? "");
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditLinkUrl("");
    setError("");
  };

  const saveEdit = async (a: ApiAttachment) => {
    setError("");
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError(t("attachments.nameRequired"));
      return;
    }
    setEditSaving(true);
    try {
      await onUpdate(a.id, { fileName: trimmedName, url: a.kind === "LINK" ? editLinkUrl.trim() : undefined });
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attachments.updateFailed"));
    } finally {
      setEditSaving(false);
    }
  };

  // When the user picks a file via the hidden replace input, the
  // editingId tells us which attachment to replace.
  const triggerReplaceFor = (attachmentId: string) => {
    setReplacePendingId(attachmentId);
    replaceInputRef.current?.click();
  };

  // DEC-064: replace goes via multipart POST to the /replace endpoint.
  const handleReplaceFile = async (file: File) => {
    const targetId = replacePendingId;
    setReplacePendingId(null);
    if (!targetId) return;
    setError("");
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`${t("attachments.tooLarge")} (${t("attachments.maxSize")} ${formatFileSize(MAX_ATTACHMENT_BYTES)}).`);
      return;
    }
    setEditSaving(true);
    try {
      await uploadFile(replaceUrl(targetId), file, token);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attachments.updateFailed"));
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className={styles.attachmentWrap} onClick={(e) => e.stopPropagation()}>
      {/* hidden file input used for the replace flow */}
      {canEdit && (
        <input
          ref={replaceInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleReplaceFile(file);
            e.target.value = "";
          }}
        />
      )}

      {attachments.length === 0 ? (
        <p className={styles.attachmentEmpty}>{t("attachments.empty")}</p>
      ) : (
        <ul className={styles.attachmentList}>
          {attachments.map((a) => {
            const isEditing = editingId === a.id;
            return (
              <li key={a.id} className={styles.attachmentItem}>
                {isEditing ? (
                  <div className={styles.attachmentEditRow}>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t("attachments.namePlaceholder")}
                      aria-label={t("attachments.name")}
                      className={styles.attachmentEditName}
                    />
                    {a.kind === "LINK" && (
                      <input
                        value={editLinkUrl}
                        onChange={(e) => setEditLinkUrl(e.target.value)}
                        placeholder="https://..."
                        aria-label={t("attachments.url")}
                        className={styles.attachmentEditUrl}
                      />
                    )}
                    <div className={styles.attachmentEditActions}>
                      <button
                        type="button"
                        onClick={() => saveEdit(a)}
                        disabled={editSaving}
                      >
                        {editSaving ? t("common.saving") : t("common.save")}
                      </button>
                      {a.kind === "FILE" && (
                        <button
                          type="button"
                          onClick={() => triggerReplaceFor(a.id)}
                          disabled={editSaving}
                          className={styles.attachmentReplaceBtn}
                        >
                          {t("attachments.replaceFile")}
                        </button>
                      )}
                      <button type="button" onClick={cancelEdit} disabled={editSaving}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {a.kind === "LINK" ? (
                      <a
                        href={a.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.attachmentLink}
                      >
                        {a.fileName}
                      </a>
                    ) : (
                      // DEC-064: use GET /api/files/:id which streams from disk (new)
                      // or falls back to dataUrl (legacy). Both handled by the same URL.
                      <a
                        href={attachmentDownloadUrl(a.id)}
                        download={a.fileName}
                        className={styles.attachmentLink}
                      >
                        {a.fileName}
                      </a>
                    )}
                    <span className={styles.attachmentMeta}>
                      {a.kind === "LINK" ? t("attachments.link") : formatFileSize(a.fileSize)} ·{" "}
                      {a.uploadedByUserName} · {formatDate(a.createdAt, locale)}
                    </span>
                    {canEdit && (
                      <span className={styles.attachmentActions}>
                        <button
                          type="button"
                          className={styles.attachmentActionBtn}
                          aria-label={t("attachments.edit")}
                          title={t("attachments.edit")}
                          onClick={() => startEdit(a)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className={`${styles.attachmentActionBtn} ${styles.attachmentActionDanger}`}
                          aria-label={t("attachments.remove")}
                          title={t("attachments.remove")}
                          onClick={() => onRemove(a.id)}
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <div className={styles.attachmentUpload}>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div className={styles.attachmentUploadActions}>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? t("common.saving") : `+ ${t("attachments.attachFile")}`}
            </button>
            <button type="button" onClick={() => setLinkFormOpen((v) => !v)} disabled={uploading}>
              + {t("attachments.addLink")}
            </button>
          </div>
          {linkFormOpen && (
            <div className={styles.attachmentLinkForm}>
              <input
                autoComplete="off"
                placeholder={t("attachments.linkTitlePlaceholder")}
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
              />
              <input
                autoComplete="off"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <button type="button" onClick={handleAddLink} disabled={uploading || !linkUrl.trim()}>
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkFormOpen(false);
                  setLinkLabel("");
                  setLinkUrl("");
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
          {error && <p className={styles.attachmentError}>{error}</p>}
        </div>
      )}
    </div>
  );
}
