"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFloors } from "@/hooks/useFloors";
import { usePreferences } from "@/hooks/usePreferences";
import { useFilterPreference } from "@/hooks/useFilterPreference";
import { canManageAssets } from "@/lib/auth-api";
import { floorsApi } from "@/lib/floors-api";
import { resizeImageToDataUrl } from "@/lib/image";
import { formatDate } from "@/lib/format";
import { sortRows, type SortDir } from "@/lib/sort";
import {
  TrashIcon,
  InboxIcon,
  DownloadIcon,
  ChevronDownIcon,
  XIcon,
  ExpandIcon,
} from "@/components/icons";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination, type PageSize } from "@/components/shared/Pagination";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/shared/Button";
import styles from "./page.module.css";

function assetAge(acquiredAt: string | null, t: (key: never) => string): string | null {
  if (!acquiredAt) return null;
  const start = new Date(acquiredAt);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0 && remMonths === 0) return t("assets.ageLessThanMonth" as never);
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${t("assets.years" as never)}`);
  if (remMonths > 0) parts.push(`${remMonths} ${t("assets.months" as never)}`);
  return parts.join(" ");
}

function formatPrice(price: number, locale: "id" | "en"): string {
  return `Rp ${price.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`;
}

// === Photo lightbox (DEC-075) ============================================
// Click any thumbnail in the asset list to open the full-size image in
// an overlay. Closes on backdrop click, X button, or Escape key.
function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className={styles.lightboxBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={alt}>
      <button
        type="button"
        className={styles.lightboxClose}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        <XIcon />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function PhotoPicker({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const { t } = usePreferences();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.photoPicker}>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className={styles.photoPreview} />
      ) : (
        <span className={styles.photoPlaceholder}>{t("assets.noPhoto")}</span>
      )}
      <div className={styles.photoPickerActions}>
        <button type="button" onClick={() => inputRef.current?.click()}>
          {value ? t("assets.changePhoto") : t("assets.uploadPhoto")}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)}>
            {t("assets.removePhoto")}
          </button>
        )}
      </div>
      {error && <span className={styles.photoError}>{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (!file.type.startsWith("image/")) {
            setError(t("assets.photoMustBeImage"));
            return;
          }
          try {
            setError(null);
            onChange(await resizeImageToDataUrl(file, 480, 0.85));
          } catch {
            setError(t("assets.photoReadFailed"));
          }
        }}
      />
    </div>
  );
}

function AddAssetForm({
  floors,
  onCreate,
}: {
  floors: { id: string; label: string; usage: string }[];
  onCreate: (
    floorId: string,
    code: string,
    name: string,
    qty: number,
    notes: string,
    photoUrl: string | null,
    acquiredAt: string | null,
    price: number | null
  ) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [floorId, setFloorId] = useState(floors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [acquiredAt, setAcquiredAt] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (!floorId && floors.length > 0) setFloorId(floors[0].id);
  }, [floors, floorId]);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("assets.addTrigger")}
      </Button>
    );
  }

  const close = () => {
    setOpen(false);
    setCode("");
    setName("");
    setQty("1");
    setNotes("");
    setPhotoUrl(null);
    setAcquiredAt("");
    setPrice("");
  };

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!floorId) return;
        await onCreate(floorId, code.trim(), name.trim(), Number(qty) || 1, notes, photoUrl, acquiredAt || null, Number(price) || null);
        close();
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>{t("assets.floor")}</span>
          <select required value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.usage})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("assets.codeOptional")}</span>
          <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label>
          <span>{t("assets.name")}</span>
          <input required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>{t("assets.quantity")}</span>
          <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          <span>{t("assets.price")}</span>
          <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Rp" />
        </label>
        <label>
          <span>{t("assets.acquiredAt")}</span>
          <input type="date" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)} />
        </label>
        <label className={styles.fullRow}>
          <span>{t("common.notesOptional")}</span>
          <input autoComplete="off" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className={styles.fullRow}>
          <span>{t("assets.photoOptional")}</span>
          <PhotoPicker value={photoUrl} onChange={setPhotoUrl} />
        </label>
      </div>
      <div className={styles.formActions}>
        <Button type="submit" disabled={!floorId}>
          {t("common.add")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

// === Asset row + expansion panel =========================================
// DEC-075: replaced the 9-column table with a list of compact rows.
// Collapsed: photo + code + name + floor + qty + chevron.
// Expanded: full detail panel with all fields + edit + delete actions.
// The thumbnail opens the lightbox; the chevron expands the row.

type AssetRow = {
  id: string;
  code: string | null;
  name: string;
  quantity: number;
  notes: string;
  price: number | null;
  photoUrl: string | null;
  acquiredAt: string | null;
  floorId: string;
  floorLabel: string;
  floorUsage: string;
};

function AssetRowCard({
  asset,
  isEditing,
  isExpanded,
  canEdit,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onOpenLightbox,
}: {
  asset: AssetRow;
  isEditing: boolean;
  isExpanded: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: {
    code: string | null;
    name: string;
    quantity: number;
    notes: string;
    price: number | null;
    photoUrl: string | null;
    acquiredAt: string | null;
  }) => Promise<void>;
  onDelete: () => void;
  onOpenLightbox: (src: string, alt: string) => void;
}) {
  const { t, locale } = usePreferences();
  return (
    <li className={`${styles.assetCard} ${isExpanded ? styles.assetCardExpanded : ""}`}>
      <button
        type="button"
        className={styles.assetRowHead}
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`asset-detail-${asset.id}`}
      >
        <span
          className={styles.assetThumb}
          onClick={(e) => {
            if (asset.photoUrl) {
              e.stopPropagation();
              onOpenLightbox(asset.photoUrl, asset.name);
            }
          }}
          role={asset.photoUrl ? "button" : undefined}
          tabIndex={asset.photoUrl ? 0 : -1}
          onKeyDown={(e) => {
            if (asset.photoUrl && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              e.stopPropagation();
              onOpenLightbox(asset.photoUrl, asset.name);
            }
          }}
        >
          {asset.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.photoUrl} alt="" />
          ) : (
            <span className={styles.assetThumbPlaceholder} aria-hidden="true" />
          )}
          {asset.photoUrl && (
            <span className={styles.assetThumbHint} aria-hidden="true">
              <ExpandIcon />
            </span>
          )}
        </span>
        <span className={styles.assetCellCode}>{asset.code || "—"}</span>
        <span className={styles.assetCellName}>{asset.name}</span>
        <span className={styles.assetCellFloor}>
          {asset.floorLabel} <span className={styles.assetCellFloorUsage}>({asset.floorUsage})</span>
        </span>
        <span className={styles.assetCellQty}>{asset.quantity}</span>
        <span className={`${styles.assetChevron} ${isExpanded ? styles.assetChevronOpen : ""}`} aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {isExpanded && (
        <div className={styles.assetDetail} id={`asset-detail-${asset.id}`}>
          {isEditing && canEdit ? (
            <AssetEditForm
              asset={asset}
              onCancel={onCancelEdit}
              onSave={onSaveEdit}
            />
          ) : (
            <>
              <dl className={styles.assetGrid}>
                <div>
                  <dt>{t("assets.price")}</dt>
                  <dd>{asset.price != null ? formatPrice(asset.price, locale) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("assets.age")}</dt>
                  <dd>
                    {asset.acquiredAt
                      ? assetAge(asset.acquiredAt, t as never) ?? formatDate(asset.acquiredAt, locale)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{t("assets.acquiredAt")}</dt>
                  <dd>{asset.acquiredAt ? formatDate(asset.acquiredAt, locale) : "—"}</dd>
                </div>
                <div className={styles.assetGridFull}>
                  <dt>{t("common.notes")}</dt>
                  <dd>{asset.notes || "—"}</dd>
                </div>
              </dl>
              {canEdit && (
                <div className={styles.assetActions}>
                  <Button type="button" variant="secondary" size="sm" onClick={onStartEdit}>
                    {t("assets.edit")}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`${t("assets.confirmDelete")} "${asset.name}"?`)) {
                        onDelete();
                      }
                    }}
                  >
                    <TrashIcon /> {t("assets.delete")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function AssetEditForm({
  asset,
  onCancel,
  onSave,
}: {
  asset: AssetRow;
  onCancel: () => void;
  onSave: (data: {
    code: string | null;
    name: string;
    quantity: number;
    notes: string;
    price: number | null;
    photoUrl: string | null;
    acquiredAt: string | null;
  }) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [code, setCode] = useState(asset.code ?? "");
  const [name, setName] = useState(asset.name);
  const [qty, setQty] = useState(String(asset.quantity));
  const [notes, setNotes] = useState(asset.notes);
  const [photoUrl, setPhotoUrl] = useState<string | null>(asset.photoUrl);
  const [acquiredAt, setAcquiredAt] = useState(asset.acquiredAt ? asset.acquiredAt.slice(0, 10) : "");
  const [price, setPrice] = useState(asset.price != null ? String(asset.price) : "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className={styles.assetEditForm}
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
          await onSave({
            code: code.trim() || null,
            name: name.trim(),
            quantity: Number(qty) || 1,
            notes,
            price: Number(price) || null,
            photoUrl,
            acquiredAt: acquiredAt || null,
          });
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className={styles.assetEditGrid}>
        <label>
          <span>{t("assets.codeOptional")}</span>
          <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label>
          <span>{t("assets.name")}</span>
          <input required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>{t("assets.floor")}</span>
          <input disabled value={`${asset.floorLabel} — ${asset.floorUsage}`} />
        </label>
        <label>
          <span>{t("assets.quantity")}</span>
          <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          <span>{t("assets.price")}</span>
          <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Rp" />
        </label>
        <label>
          <span>{t("assets.acquiredAt")}</span>
          <input type="date" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)} />
        </label>
        <label className={styles.assetEditFull}>
          <span>{t("common.notesOptional")}</span>
          <input autoComplete="off" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className={styles.assetEditFull}>
          <span>{t("assets.photoOptional")}</span>
          <PhotoPicker value={photoUrl} onChange={setPhotoUrl} />
        </label>
      </div>
      <div className={styles.formActions}>
        <Button type="submit" loading={submitting}>
          {t("common.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

type SortKey = "name" | "code" | "floor" | "quantity" | "price" | "acquiredAt";

export default function AssetsPage() {
  const { user } = useAuth();
  const { t, locale } = usePreferences();
  const { token } = useAuth();
  const toast = useToast();
  const canEdit = canManageAssets(user);
  const floors = useFloors();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useFilterPreference<string>("assets.search", "");
  const [downloading, setDownloading] = useState(false);
  // DEC-075: 10 per page is the user-requested default — asset catalogs
  // tend to have many rows per floor and the per-row expansion panel
  // would crowd the viewport at 25.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  // DEC-075: track which row is expanded; null = all collapsed.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // DEC-075: photo lightbox state.
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const allRows = floors.floors.flatMap((f) =>
    f.assets.map((a) => ({ ...a, floorLabel: f.label, floorUsage: f.usage, floorId: f.id }))
  );
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q)
    );
  }, [allRows, search]);

  const sortValue: Record<SortKey, (r: AssetRow) => unknown> = {
    name: (r) => r.name,
    code: (r) => r.code ?? "",
    floor: (r) => r.floorLabel,
    quantity: (r) => r.quantity,
    price: (r) => r.price ?? 0,
    acquiredAt: (r) => r.acquiredAt,
  };
  const sortedRows = sortRows(filteredRows, sortValue[sortKey], sortDir);
  const pagedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const onDownload = async () => {
    setDownloading(true);
    try {
      const blob = await floorsApi.exportAssets(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vortec-assets-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("assets.exportSuccess"));
    } catch (err) {
      toast.error(t("assets.exportFailed"), err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <PageHeader title={t("nav.assets")} subtitle={t("assets.pageDescription")} />

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("assets.searchHint")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
            setExpandedId(null);
          }}
        />
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={onDownload}
          disabled={downloading || allRows.length === 0}
          aria-busy={downloading}
        >
          <DownloadIcon /> {downloading ? t("common.downloading") : t("assets.downloadButton")}
        </button>
      </div>

      {canEdit && (
        <AddAssetForm
          floors={floors.floors.map((f) => ({ id: f.id, label: f.label, usage: f.usage }))}
          onCreate={async (floorId, code, name, qty, notes, photoUrl, acquiredAt, price) => {
            await floors.addAsset(floorId, code, name, qty, notes, photoUrl, acquiredAt, price);
          }}
        />
      )}

      {!floors.hydrated ? (
        <div role="status" aria-label={t("assets.loading")} className={styles.tableWrap}>
          <Skeleton variant="heading" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : allRows.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("assets.empty")} description={t("assets.emptyHint")} />
      ) : sortedRows.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("assets.noResults")} description={search} compact />
      ) : (
        <>
          <ul className={styles.assetList}>
            {pagedRows.map((r) => (
              <AssetRowCard
                key={r.id}
                asset={r}
                isEditing={editingId === r.id}
                isExpanded={expandedId === r.id}
                canEdit={canEdit}
                onToggle={() => setExpandedId((id) => (id === r.id ? null : r.id))}
                onStartEdit={() => setEditingId(r.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={async (data) => {
                  await floors.updateAsset(r.floorId, r.id, data);
                  setEditingId(null);
                }}
                onDelete={() => {
                  floors.removeAsset(r.floorId, r.id);
                }}
                onOpenLightbox={(src, alt) => setLightbox({ src, alt })}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={sortedRows.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
              setExpandedId(null);
            }}
          />
        </>
      )}

      {lightbox && (
        <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
