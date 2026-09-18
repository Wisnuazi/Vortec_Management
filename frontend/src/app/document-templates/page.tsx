"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useDocumentTemplates } from "@/hooks/useDocumentTemplates";
import { canManageDocumentTemplates } from "@/lib/auth-api";
import { readFileAsDataUrl, formatFileSize, MAX_ATTACHMENT_BYTES } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { TrashIcon, InboxIcon } from "@/components/icons";
import { LayoutToggle, type Layout } from "@/components/shared/LayoutToggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import type { ApiDocumentTemplate, NewTemplateFileData } from "@/lib/document-templates-api";
import styles from "./page.module.css";

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function TemplateForm({ onCreate }: { onCreate: (data: { name: string; description: string } & NewTemplateFileData) => Promise<void> }) {
  const { t } = usePreferences();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("documentTemplates.addTrigger")}
      </Button>
    );
  }

  const reset = () => {
    setName("");
    setDescription("");
    setLinkUrl("");
    setFile(null);
    setError("");
    setOpen(false);
  };

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const trimmedName = name.trim();
        if (!trimmedName) return;

        let fileData: NewTemplateFileData;
        if (file) {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            setError(`${t("attachments.tooLarge")} (${t("attachments.maxSize")} ${formatFileSize(MAX_ATTACHMENT_BYTES)}).`);
            return;
          }
          fileData = {
            kind: "FILE",
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            dataUrl: await readFileAsDataUrl(file),
          };
        } else {
          const trimmedUrl = linkUrl.trim();
          if (!isValidHttpUrl(trimmedUrl)) {
            setError(t("attachments.invalidUrl"));
            return;
          }
          fileData = { kind: "LINK", fileName: trimmedName, url: trimmedUrl };
        }

        setSaving(true);
        try {
          await onCreate({ name: trimmedName, description, ...fileData });
          reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : t("attachments.uploadFailed"));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>{t("documentTemplates.name")}</span>
          <input required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>{t("common.notesOptional")}</span>
          <input autoComplete="off" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <div className={styles.fileRow}>
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setLinkUrl("");
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()}>
          {file ? file.name : `+ ${t("attachments.attachFile")}`}
        </button>
        <span className={styles.fileHint}>{t("common.or")}</span>
        <input
          style={{ flex: 1, minWidth: 160 }}
          autoComplete="off"
          placeholder="https://..."
          value={linkUrl}
          onChange={(e) => {
            setLinkUrl(e.target.value);
            setFile(null);
          }}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formActions}>
        <Button type="submit" loading={saving}>
          {saving ? t("common.saving") : t("common.add")}
        </Button>
        <Button type="button" variant="secondary" onClick={reset}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function TemplateRow({
  template,
  canEdit,
  layout,
  onUpdate,
  onRemove,
}: {
  template: ApiDocumentTemplate;
  canEdit: boolean;
  layout: Layout;
  onUpdate: (id: string, data: Partial<{ name: string; description: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const itemClass = layout === "grid" ? styles.templateCard : styles.templateItem;

  if (editing) {
    return (
      <li className={itemClass}>
        <form
          className={styles.fileRow}
          onSubmit={async (e) => {
            e.preventDefault();
            await onUpdate(template.id, { name, description });
            setEditing(false);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("common.notesOptional")} />
          <Button type="submit">{t("common.save")}</Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className={itemClass}>
      <span className={styles.kindBadge}>{template.kind === "LINK" ? t("attachments.link") : formatFileSize(template.fileSize)}</span>
      <span className={styles.templateName}>{template.name}</span>
      {template.kind === "LINK" ? (
        <a href={template.url ?? "#"} target="_blank" rel="noopener noreferrer" className={styles.templateDownload}>
          {t("documentTemplates.open")}
        </a>
      ) : (
        <a href={template.dataUrl ?? "#"} download={template.fileName} className={styles.templateDownload}>
          {t("documentTemplates.download")}
        </a>
      )}
      {template.description && <span className={styles.templateMeta}>{template.description}</span>}
      <span className={styles.templateMeta}>
        {template.createdByUserName} · {formatDate(template.updatedAt, locale)}
      </span>
      {canEdit && (
        <div className={styles.templateActions}>
          <button type="button" onClick={() => setEditing(true)}>
            {t("assets.edit")}
          </button>
          <button
            type="button"
            className={styles.deleteBtn}
            aria-label={`${t("assets.delete")} ${template.name}`}
            onClick={() => {
              if (window.confirm(`${t("documentTemplates.confirmDelete")} "${template.name}"?`)) onRemove(template.id);
            }}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}

export default function DocumentTemplatesPage() {
  const { user } = useAuth();
  const { t } = usePreferences();
  const canEdit = canManageDocumentTemplates(user);
  const templates = useDocumentTemplates();
  const [layout, setLayout] = useViewPreference<Layout>("documentTemplates", "list", ["list", "grid"] as const);

  return (
    <div className={styles.wrap}>
      <PageHeader
        title={t("nav.documentTemplates")}
        subtitle={canEdit ? t("documentTemplates.pageDescriptionEditable") : t("documentTemplates.pageDescriptionReadOnly")}
      />

      {!templates.hydrated ? (
        <div role="status" aria-label={t("documentTemplates.loading")}>
          <Skeleton variant="heading" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            {canEdit && <TemplateForm onCreate={templates.createTemplate} />}
            <LayoutToggle value={layout} onChange={setLayout} />
          </div>
          {templates.templates.length === 0 ? (
            <EmptyState
            icon={<InboxIcon />}
            title={t("documentTemplates.empty")}
            description={t("documentTemplates.emptyHint")}
            compact
          />
          ) : (
            <ul className={layout === "grid" ? styles.templateGrid : styles.templateList}>
              {templates.templates.map((tpl) => (
                <TemplateRow key={tpl.id} template={tpl} canEdit={canEdit} layout={layout} onUpdate={templates.updateTemplate} onRemove={templates.removeTemplate} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
