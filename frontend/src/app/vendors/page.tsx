"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useVendors } from "@/hooks/useVendors";
import { usePreferences } from "@/hooks/usePreferences";
import { sortRows, type SortDir } from "@/lib/sort";
import { vendorsApi, type ApiVendor, type VendorType } from "@/lib/vendors-api";
import { TrashIcon, InboxIcon, DownloadIcon } from "@/components/icons";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination, type PageSize } from "@/components/shared/Pagination";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/shared/Button";
import styles from "./page.module.css";

function VendorForm({ onCreate }: { onCreate: (data: { name: string; type: VendorType; link: string | null; contact: string | null; notes: string }) => Promise<void> }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<VendorType>("COMPANY");
  const [link, setLink] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("vendors.addTrigger")}
      </Button>
    );
  }

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        await onCreate({ name, type, link: link || null, contact: contact || null, notes });
        setName("");
        setType("COMPANY");
        setLink("");
        setContact("");
        setNotes("");
        setOpen(false);
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>{t("vendors.name")}</span>
          <input required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>{t("vendors.type")}</span>
          <select value={type} onChange={(e) => setType(e.target.value as VendorType)}>
            <option value="COMPANY">{t("vendors.typeCompany")}</option>
            <option value="MARKETPLACE">{t("vendors.typeMarketplace")}</option>
          </select>
        </label>
        <label>
          <span>{t("vendors.link")}</span>
          <input autoComplete="off" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
        </label>
        <label>
          <span>{t("vendors.contact")}</span>
          <input autoComplete="off" value={contact} onChange={(e) => setContact(e.target.value)} />
        </label>
        <label>
          <span>{t("common.notesOptional")}</span>
          <input autoComplete="off" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
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

function VendorRow({
  vendor,
  canEdit,
  onUpdate,
  onRemove,
}: {
  vendor: ApiVendor;
  canEdit: boolean;
  onUpdate: (id: string, data: Partial<{ name: string; type: VendorType; link: string | null; contact: string | null; notes: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(vendor.name);
  const [type, setType] = useState<VendorType>(vendor.type);
  const [link, setLink] = useState(vendor.link ?? "");
  const [contact, setContact] = useState(vendor.contact ?? "");
  const [notes, setNotes] = useState(vendor.notes);

  if (editing) {
    return (
      <li className={styles.vendorItem}>
        <form
          className={styles.inlineForm}
          onSubmit={async (e) => {
            e.preventDefault();
            await onUpdate(vendor.id, { name, type, link: link || null, contact: contact || null, notes });
            setEditing(false);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value as VendorType)}>
            <option value="COMPANY">{t("vendors.typeCompany")}</option>
            <option value="MARKETPLACE">{t("vendors.typeMarketplace")}</option>
          </select>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("vendors.contact")} />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("common.notesOptional")} />
          <button type="submit">{t("common.save")}</button>
          <button type="button" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className={styles.vendorItem}>
      <span className={styles.vendorTypeBadge}>{vendor.type === "COMPANY" ? t("vendors.typeCompany") : t("vendors.typeMarketplace")}</span>
      <span className={styles.vendorName}>{vendor.name}</span>
      {vendor.link && (
        <a href={vendor.link} target="_blank" rel="noopener noreferrer" className={styles.vendorLink}>
          {vendor.link}
        </a>
      )}
      {vendor.contact && <span className={styles.hintSmall}>{vendor.contact}</span>}
      {vendor.notes && <span className={styles.hintSmall}>{vendor.notes}</span>}
      {canEdit && (
        <div className={styles.vendorActions}>
          <button type="button" onClick={() => setEditing(true)}>
            {t("assets.edit")}
          </button>
          <button
            type="button"
            className={styles.deleteBtn}
            aria-label={`${t("assets.delete")} ${vendor.name}`}
            onClick={() => {
              if (window.confirm(`${t("vendors.confirmDelete")} "${vendor.name}"?`)) onRemove(vendor.id);
            }}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}

type SortKey = "name" | "type";
type FilterType = "ALL" | VendorType;

export default function VendorsPage() {
  const { user, token } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();
  // canEdit: super admin + Purchasing + OM (DEC-062). Anyone in the
  // viewer set can read; mutations are gated to the same set.
  const canEdit = !!user?.isSuperAdmin ||
    (!!user && (user.roleTitles.includes("Purchasing") || user.roleTitles.includes("Operational Manager")));
  const vendors = useVendors();
  const [typeFilter, setTypeFilter] = useState<FilterType>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [downloading, setDownloading] = useState(false);
  // DEC-069: paginate the vendor list. Reset to page 0 when filters
  // change so the user always lands on the first matching row.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.vendors.filter((v) => {
      if (typeFilter !== "ALL" && v.type !== typeFilter) return false;
      if (q && !v.name.toLowerCase().includes(q) && !(v.contact ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vendors.vendors, typeFilter, search]);

  const sortValue: Record<SortKey, (v: ApiVendor) => unknown> = {
    name: (v) => v.name,
    type: (v) => v.type,
  };
  const sorted = sortRows(filtered, sortValue[sortKey], sortDir);
  const pagedVendors = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const onDownload = async () => {
    setDownloading(true);
    try {
      const blob = await vendorsApi.exportVendors(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Daftar Vendor Vortec.xlsx";
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

  const hasActiveFilter = typeFilter !== "ALL" || search.trim() !== "";

  return (
    <div className={styles.wrap}>
      <PageHeader title={t("nav.vendors")} subtitle={t("vendors.pageDescription")} />

      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("vendors.searchHint")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <span>{t("common.filterBy")}:</span>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as FilterType);
            setPage(0);
          }}
        >
          <option value="ALL">{t("common.all")}</option>
          <option value="COMPANY">{t("vendors.typeCompany")}</option>
          <option value="MARKETPLACE">{t("vendors.typeMarketplace")}</option>
        </select>
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={onDownload}
          disabled={downloading || vendors.vendors.length === 0}
          aria-busy={downloading}
        >
          <DownloadIcon /> {downloading ? t("common.downloading") : t("vendors.downloadButton")}
        </button>
      </div>

      {canEdit && <VendorForm onCreate={vendors.createVendor} />}

      {!vendors.hydrated ? (
        <p className={styles.loading}>{t("vendors.loading")}</p>
      ) : vendors.vendors.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("vendors.empty")} />
      ) : sorted.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("vendors.noResults")} description={search} compact />
      ) : (
        <>
          <div className={styles.sortBar}>
            <span>{t("common.sortBy")}:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="name">{t("vendors.name")}</option>
              <option value="type">{t("vendors.type")}</option>
            </select>
            <button type="button" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
              {sortDir === "asc" ? "▲" : "▼"}
            </button>
          </div>
          <ul className={styles.vendorList}>
            {pagedVendors.map((v) => (
              <VendorRow
                key={v.id}
                vendor={v}
                canEdit={canEdit}
                onUpdate={vendors.updateVendor}
                onRemove={vendors.removeVendor}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={sorted.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </div>
  );
}
