"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMaterials } from "@/hooks/useMaterials";
import { usePreferences } from "@/hooks/usePreferences";
import { useFilterPreference } from "@/hooks/useFilterPreference";
import { sortRows, type SortDir } from "@/lib/sort";
import { materialsApi, type ApiMaterial } from "@/lib/materials-api";
import { canManageInventory } from "@/lib/auth-api";
import { MaterialRow } from "./MaterialRow";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination, type PageSize } from "@/components/shared/Pagination";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/shared/Button";
import { InboxIcon, DownloadIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import styles from "./page.module.css";

type DuplicatePrompt = {
  existing: ApiMaterial;
  attemptedCode: string;
  attemptedName: string;
};

function AddMaterialForm({
  onCreate,
  authToken,
}: {
  onCreate: (code: string, name: string, unit: string, notes: string) => Promise<void>;
  authToken: string | null;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null);
  const [mergeQuantity, setMergeQuantity] = useState("1");
  const [mergeNote, setMergeNote] = useState("");

  const reset = () => {
    setCode("");
    setName("");
    setUnit("");
    setNotes("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("inventory.addTrigger")}
      </Button>
    );
  }

  return (
    <>
      <form
        className={styles.createForm}
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          try {
            await onCreate(code, name, unit, notes);
            toast.success(t("inventory.addedTitle"), name);
            reset();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // 409-with-existing dedupe prompt (DEC-061). The API returns
            // a JSON body that includes `existing: ApiMaterial`; the
            // generic apiFetch wraps the error so we re-parse from the
            // text. We use a sentinel — the backend's error string
            // starts with "MATERIAL_ALREADY_EXISTS" if it was a
            // structured 409.
            if (msg.startsWith("MATERIAL_ALREADY_EXISTS")) {
              try {
                // The apiFetch wrapper throws `parsed.error` as the
                // message, so we don't get the full body. Fetch the
                // existing material separately to populate the dialog.
                // The server already validated the dedupe; we just
                // need the existing material to display it.
                const all = await materialsApi.list(authToken);
                const match = all.find(
                  (m) =>
                    m.name.toLowerCase() === name.trim().toLowerCase() ||
                    (code.trim() && m.code === code.trim())
                );
                if (match) {
                  setDuplicate({
                    existing: match,
                    attemptedCode: code.trim(),
                    attemptedName: name.trim(),
                  });
                  setMergeQuantity("1");
                  setMergeNote("");
                  return;
                }
              } catch {
                // fall through to generic error
              }
            }
            toast.error(t("inventory.addFailedTitle"), msg);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className={styles.formGrid}>
          <label>
            <span>{t("inventory.codeRequired")}</span>
            <input
              required
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="mis. BB-001"
            />
          </label>
          <label>
            <span>{t("inventory.materialName")}</span>
            <input required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>{t("inventory.unit")}</span>
            <input
              required
              autoComplete="off"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={t("inventory.unitPlaceholder")}
            />
          </label>
          <label>
            <span>{t("common.notesOptional")}</span>
            <input autoComplete="off" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className={styles.formActions}>
          <Button type="submit" loading={submitting}>
            {submitting ? t("common.saving") : t("common.add")}
          </Button>
          <Button type="button" variant="secondary" onClick={reset} disabled={submitting}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>

      {duplicate ? (
        <div className={styles.duplicateDialog}>
          <h3 className={styles.duplicateTitle}>{t("inventory.duplicateTitle")}</h3>
          <p>{t("inventory.duplicateExisting")}</p>
          <p className={styles.duplicateExistingLine}>
            <strong>{duplicate.existing.name}</strong>
            {duplicate.existing.code ? <span> ({duplicate.existing.code})</span> : null} — stok saat ini:{" "}
            {duplicate.existing.stock} {duplicate.existing.unit}
          </p>
          <p>{t("inventory.duplicateConfirm")}</p>
          <div className={styles.mergeForm}>
            <label>
              <span>{t("inventory.duplicateQuantity")}</span>
              <input
                type="number"
                min={0.001}
                step="any"
                value={mergeQuantity}
                onChange={(e) => setMergeQuantity(e.target.value)}
              />
            </label>
            <label>
              <span>{t("inventory.duplicateNote")}</span>
              <input value={mergeNote} onChange={(e) => setMergeNote(e.target.value)} />
            </label>
          </div>
          <div className={styles.formActions}>
            <button
              type="button"
              onClick={async () => {
                const qty = Number(mergeQuantity);
                if (!qty || qty <= 0) {
                  toast.error(t("inventory.duplicateTitle"), "Quantity harus lebih dari 0");
                  return;
                }
                try {
                  await materialsApi.confirmDuplicate(authToken, duplicate.existing.id, {
                    quantity: qty,
                    note: mergeNote || undefined,
                  });
                  toast.success(t("inventory.duplicateTitle"), duplicate.existing.name);
                  setDuplicate(null);
                  reset();
                } catch (err) {
                  toast.error(
                    t("inventory.duplicateTitle"),
                    err instanceof Error ? err.message : String(err)
                  );
                }
              }}
            >
              {t("inventory.duplicateAdd")}
            </button>
            <button type="button" onClick={() => setDuplicate(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

type SortKey = "name" | "code" | "stock";

export default function InventoryPage() {
  const { user, token } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();
  // canManageInventory mirrors the backend (DEC-061): super admin + OM +
  // OL + Inventory role. Director is included via isPrivilegedClient.
  const canEdit = canManageInventory(user);
  const materials = useMaterials();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useFilterPreference<string>("inventory.search", "");
  const [downloading, setDownloading] = useState(false);
  // DEC-069: paginate the material list — 50 per page keeps the
  // expanded row accordion from dominating the viewport.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(50);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials.materials;
    return materials.materials.filter(
      (m) => m.name.toLowerCase().includes(q) || (m.code ?? "").toLowerCase().includes(q)
    );
  }, [materials.materials, search]);

  const sortValue: Record<SortKey, (m: ApiMaterial) => unknown> = {
    name: (m) => m.name,
    code: (m) => m.code,
    stock: (m) => m.stock,
  };
  const sortedMaterials = sortRows(filtered, sortValue[sortKey], sortDir);
  const pagedMaterials = sortedMaterials.slice(page * pageSize, (page + 1) * pageSize);

  const onDownload = async () => {
    setDownloading(true);
    try {
      const blob = await materialsApi.exportMaterials(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Daftar Inventaris Vortec.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(t("common.download"), err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <PageHeader title={t("nav.inventory")} subtitle={t("inventory.pageDescription")} />

      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("inventory.searchHint")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={onDownload}
          disabled={downloading || materials.materials.length === 0}
          aria-busy={downloading}
        >
          <DownloadIcon /> {downloading ? t("common.downloading") : t("inventory.downloadButton")}
        </button>
      </div>

      {canEdit && (
        <AddMaterialForm
          authToken={token}
          onCreate={(code, name, unit, notes) => materials.createMaterial(code, name, unit, notes)}
        />
      )}

      {!materials.hydrated ? (
        <div role="status" aria-label={t("inventory.loading")} className={styles.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : materials.materials.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("inventory.empty")} description={t("inventory.emptyHint")} compact />
      ) : sortedMaterials.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("inventory.noResults")} description={search} compact />
      ) : (
        <>
          <div className={styles.sortBar}>
            <span>{t("common.sortBy")}:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="name">{t("inventory.materialName")}</option>
              <option value="code">{t("inventory.code")}</option>
              <option value="stock">{t("inventory.remaining")}</option>
            </select>
            <button type="button" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
              {sortDir === "asc" ? "▲" : "▼"}
            </button>
          </div>
          <div className={styles.list}>
            {pagedMaterials.map((m) => (
              <MaterialRow key={m.id} material={m} materials={materials} canEdit={canEdit} />
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={sortedMaterials.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </>
      )}
    </div>
  );
}
