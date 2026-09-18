"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import {
  allowedBomTypesClient,
  canCloseBomClient,
  canOwnBomType,
  canReviewBom,
  canProcessBom,
  type BomType,
  BOM_OWNER_ROLE,
} from "@/lib/auth-api";
import { useBom } from "@/hooks/useBom";
import { BOM_TYPES, bomApi, type ApiBomItem, bomItemStatusLabel, bomTypeLabel } from "@/lib/bom-api";
import { projectsApi } from "@/lib/projects-api";
import { TrashIcon, InboxIcon, ChevronDownIcon, CheckIcon } from "@/components/icons";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shared/Toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import styles from "./ProjectBom.module.css";

function AddItemForm({
  projectId,
  bomType,
  allowedTypes,
  onAdd,
  onCancel,
}: {
  projectId: string;
  bomType: BomType;
  allowedTypes: BomType[];
  onAdd: (data: { projectId: string; bomType: BomType; name: string; quantity: number; unit: string; price: number | null; notes: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t, locale } = usePreferences();
  const toast = useToast();
  // Type starts as the active tab; user can pick any of their allowed types.
  const [type, setType] = useState<BomType>(bomType);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        const q = Number(quantity);
        const p = price.trim() === "" ? null : Number(price);
        if (!name.trim() || !q || q <= 0 || !unit.trim()) return;
        setBusy(true);
        try {
          await onAdd({ projectId, bomType: type, name: name.trim(), quantity: q, unit: unit.trim(), price: p, notes });
          setName(""); setQuantity("1"); setUnit(""); setPrice(""); setNotes("");
        } catch (err) {
          toast.error(t("bom.addTrigger"), err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={styles.formGrid}>
        {allowedTypes.length > 1 && (
          <label>
            <span>{t("bom.type")}</span>
            <select value={type} onChange={(e) => setType(e.target.value as BomType)}>
              {allowedTypes.map((bt) => (
                <option key={bt} value={bt}>{bomTypeLabel(bt, locale)}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>{t("bom.itemName")}</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>{t("bom.quantity")}</span>
          <input required type="number" min={0.001} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <label>
          <span>{t("bom.unit")}</span>
          <input required value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <label>
          <span>{t("bom.price")}</span>
          <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Rp" />
        </label>
        <label>
          <span>{t("common.notesOptional")}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="URL / catatan" />
        </label>
      </div>
      <div className={styles.formActions}>
        <Button type="submit" loading={busy}>
          {busy ? t("common.saving") : t("common.add")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

function ItemRow({
  item,
  canEdit,
  canApprove,
  canProcess,
  onSave,
  onRemove,
  onApprove,
  onReject,
  onPurchasingStatus,
}: {
  item: ApiBomItem;
  canEdit: boolean;
  canApprove: boolean;
  canProcess: boolean;
  onSave: (id: string, data: Partial<{ name: string; quantity: number; unit: string; price: number | null; notes: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onApprove: (id: string, note: string) => Promise<void>;
  onReject: (id: string, note: string) => Promise<void>;
  onPurchasingStatus: (id: string, status: "PROCESSING" | "ARRIVED", note: string) => Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [price, setPrice] = useState(item.price != null ? String(item.price) : "");
  const [notes, setNotes] = useState(item.notes);
  const [approveNote, setApproveNote] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");

  const rupiah = (n: number) => `Rp ${n.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`;
  const locked = item.status !== "SUBMITTED";

  return (
    <tr>
      <td>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          item.name
        )}
      </td>
      <td>
        {editing ? (
          <input type="number" min={0.001} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        ) : (
          item.quantity
        )}
      </td>
      <td>{editing ? <input value={unit} onChange={(e) => setUnit(e.target.value)} /> : item.unit}</td>
      <td>
        {editing ? (
          <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Rp" />
        ) : item.price != null ? (
          rupiah(item.price)
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="URL / catatan" />
        ) : item.notes ? (
          item.notes.startsWith("http") ? (
            <a href={item.notes} target="_blank" rel="noopener noreferrer" className={styles.notesLink}>
              {item.notes}
            </a>
          ) : (
            <span className={styles.hintSmall}>{item.notes}</span>
          )
        ) : (
          "—"
        )}
      </td>
      <td>
        {item.approvedByUserName ? (
          <span className={styles.approverTag}>
            <strong>{item.approvedByUserName}</strong>
            {item.approvedAt ? <span className={styles.hintSmall}> · {new Date(item.approvedAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US")}</span> : null}
          </span>
        ) : (
          <span className={styles.unapproved}>{t("bom.notApprovedYet")}</span>
        )}
      </td>
      <td>
        <span className={`${styles.statusPill} ${styles[`status_${item.status}`] ?? ""}`}>
          {bomItemStatusLabel(item.status, locale)}
        </span>
        {item.processedByUserName ? (
          <div className={styles.hintSmall}>
            {item.processedByUserName}
            {item.purchasingUpdatedAt ? ` · ${new Date(item.purchasingUpdatedAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US")}` : ""}
          </div>
        ) : null}
      </td>
      <td>
        <div className={styles.rowActions}>
          {editing ? (
            <>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onSave(item.id, {
                      name: name.trim(),
                      quantity: Number(quantity) || item.quantity,
                      unit: unit.trim(),
                      price: price.trim() === "" ? null : Number(price),
                      notes,
                    });
                    setEditing(false);
                  } catch (err) {
                    toast.error(t("common.save"), err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                {t("common.save")}
              </button>
              <button type="button" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
            </>
          ) : (
            <>
              {canEdit && !locked && (
                <button type="button" onClick={() => setEditing(true)}>{t("assets.edit")}</button>
              )}
              {canEdit && !locked && (
                <button
                  type="button"
                  className={styles.deleteBtn}
                  aria-label={`${t("operational.itemRemove")} ${item.name}`}
                  onClick={() => {
                    if (window.confirm(`${t("operational.itemRemove")} "${item.name}"?`)) onRemove(item.id);
                  }}
                >
                  <TrashIcon />
                </button>
              )}
            </>
          )}
        </div>
        {canApprove && item.status === "SUBMITTED" && (
          <form
            className={styles.inlineForm}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onApprove(item.id, approveNote);
                setApproveNote("");
              } catch (err) {
                toast.error(t("bom.approveItem"), err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <input
              placeholder={t("bom.approveNoteOptional")}
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
            />
            <button type="submit" className={styles.approveBtn}>{t("bom.approveItem")}</button>
            <button
              type="button"
              className={styles.rejectBtn}
              onClick={async () => {
                try {
                  await onReject(item.id, approveNote);
                  setApproveNote("");
                } catch (err) {
                  toast.error(t("bom.approveItem"), err instanceof Error ? err.message : String(err));
                }
              }}
            >
              {t("operational.kasbonReject")}
            </button>
          </form>
        )}
        {canProcess && (item.status === "APPROVED" || item.status === "PROCESSING") && (
          <form
            className={styles.inlineForm}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onPurchasingStatus(item.id, item.status === "APPROVED" ? "PROCESSING" : "ARRIVED", purchaseNote);
                setPurchaseNote("");
              } catch (err) {
                toast.error(t("bom.markArrived"), err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <input
              placeholder={t("materialRequests.purchaseNotePlaceholder")}
              value={purchaseNote}
              onChange={(e) => setPurchaseNote(e.target.value)}
            />
            <button type="submit">
              {item.status === "APPROVED" ? t("bom.markProcessing") : t("bom.markArrived")}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

/**
 * DEC-067: a "submission card" groups items submitted by the same user
 * within the same calendar minute. The header collapses to the most
 * recent item + count; clicking expands to show the full row table.
 */
type SubmissionCard = {
  key: string;
  type: BomType;
  submitterId: string;
  submitterName: string;
  submittedAt: string; // ISO of the most recent item
  items: ApiBomItem[];
};

function groupItemsIntoSubmissions(items: ApiBomItem[]): SubmissionCard[] {
  const groups = new Map<string, SubmissionCard>();
  // Sort oldest-first so groups[] ends up in submission order (first
  // item of a session is the "header" representative).
  const sorted = [...items].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  for (const it of sorted) {
    // 1-minute window per (submitter, type) — items from the same user
    // within 60 seconds form one logical submission.
    const submittedMs = new Date(it.submittedAt).getTime();
    let matchedKey: string | null = null;
    for (const [key, card] of groups) {
      if (card.type !== it.bomType) continue;
      if (card.submitterId !== it.submittedByUserId) continue;
      const cardLastMs = new Date(card.submittedAt).getTime();
      if (Math.abs(submittedMs - cardLastMs) <= 60_000) {
        matchedKey = key;
        break;
      }
    }
    if (matchedKey) {
      const card = groups.get(matchedKey)!;
      card.items.push(it);
      // Update header representative: keep the most recent item + use
      // the latest submittedAt for further grouping decisions.
      if (submittedMs > new Date(card.submittedAt).getTime()) {
        card.submittedAt = it.submittedAt;
      }
    } else {
      const key = `${it.bomType}-${it.submittedByUserId}-${submittedMs}`;
      groups.set(key, {
        key,
        type: it.bomType,
        submitterId: it.submittedByUserId,
        submitterName: it.submittedByUserName,
        submittedAt: it.submittedAt,
        items: [it],
      });
    }
  }
  // Sort newest-submission first so the most recent activity is on top.
  return Array.from(groups.values()).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

function SubmissionCardView({
  card,
  canEdit,
  canApprove,
  canProcess,
  onSave,
  onRemove,
  onApprove,
  onReject,
  onPurchasingStatus,
  bomClosed,
}: {
  card: SubmissionCard;
  canEdit: boolean;
  canApprove: boolean;
  canProcess: boolean;
  onSave: (id: string, data: Partial<{ name: string; quantity: number; unit: string; price: number | null; notes: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onApprove: (id: string, note: string) => Promise<void>;
  onReject: (id: string, note: string) => Promise<void>;
  onPurchasingStatus: (id: string, status: "PROCESSING" | "ARRIVED", note: string) => Promise<void>;
  bomClosed: boolean;
}) {
  const { t, locale } = usePreferences();
  const [open, setOpen] = useState(false);
  const header = card.items[0]; // representative
  const statusSummary = card.items.reduce<Record<string, number>>((acc, it) => {
    acc[it.status] = (acc[it.status] ?? 0) + 1;
    return acc;
  }, {});
  const allArrived = card.items.every((it) => it.status === "ARRIVED");

  return (
    <div className={styles.card}>
      <div
        className={styles.cardHeader}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
      >
        <span className={`${styles.cardTypeBadge} ${styles[`cardTypeBadge_${card.type}`] ?? ""}`}>
          {card.type}
        </span>
        <span className={styles.cardItemName}>{header.name}</span>
        <span className={styles.cardItemCount}>
          {card.items.length > 1
            ? t("bom.itemCountPrefix") + " " + String(card.items.length) + " " + t("bom.itemCountSuffix")
            : t("bom.itemCountOne")}
        </span>
        <span className={styles.cardSubmitter}>
          {t("bom.submittedByShort")} {card.submitterName} ·{" "}
          {new Date(card.submittedAt).toLocaleString(locale === "id" ? "id-ID" : "en-US", { dateStyle: "short", timeStyle: "short" })}
        </span>
        <span className={`${styles.statusPill} ${allArrived ? styles.status_ARRIVED : (styles[`status_${header.status}`] ?? "")}`}>
          {allArrived ? bomItemStatusLabel("ARRIVED", locale) : bomItemStatusLabel(header.status, locale)}
        </span>
        <span className={`${styles.cardChevron} ${open ? styles.cardChevronOpen : ""}`}>
          <ChevronDownIcon />
        </span>
      </div>
      {open && (
        <div className={styles.cardBody}>
          <div className={styles.tableWrap}>
            <table className={styles.cardTable}>
              <thead>
                <tr>
                  <th>{t("bom.itemName")}</th>
                  <th>{t("bom.quantity")}</th>
                  <th>{t("bom.unit")}</th>
                  <th>{t("bom.price")}</th>
                  <th>{t("common.notes")}</th>
                  <th>{t("bom.approver")}</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {card.items.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    canEdit={canEdit && !bomClosed}
                    canApprove={canApprove}
                    canProcess={canProcess}
                    onSave={onSave}
                    onRemove={onRemove}
                    onApprove={onApprove}
                    onReject={onReject}
                    onPurchasingStatus={onPurchasingStatus}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectBom({ projectId, bomClosed, bomClosedAt, bomClosedByUserName }: {
  projectId: string;
  bomClosed: boolean;
  bomClosedAt: string | null;
  bomClosedByUserName: string | null;
}) {
  const { user, token } = useAuth();
  const { t, locale } = usePreferences();
  const toast = useToast();
  const bom = useBom();
  const [activeType, setActiveType] = useState<BomType>("MBOM");
  const [showAdd, setShowAdd] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // DEC-067: load the user's allowed submit types from the API (source
  // of truth). Fall back to the client-side helper if the endpoint
  // isn't reachable (older backend).
  const [allowedTypes, setAllowedTypes] = useState<BomType[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    bomApi.allowedTypes(token)
      .then((res) => { if (!cancelled) setAllowedTypes(res.types); })
      .catch(() => { if (!cancelled) setAllowedTypes(allowedBomTypesClient(user)); });
    return () => { cancelled = true; };
  }, [token, user]);

  useEffect(() => {
    bom.reload(projectId).catch((err) => console.error("Failed to reload BOM for project:", err));
  }, [projectId, bom]);

  if (!user) return null;
  const items = bom.items.filter((i) => i.projectId === projectId && i.bomType === activeType);
  // canEdit = can submit + the project's BOM is still open
  const canSubmitType = allowedTypes.includes(activeType);
  const canEdit = canSubmitType && !bomClosed;
  const canApprove = canReviewBom(user);
  const canProcess = canProcessBom(user);
  const canClose = canCloseBomClient(user) && !bomClosed;

  // DEC-067: "all non-rejected items ARRIVED" is the pre-condition for
  // closing. We surface a count of blocking items so the UI can show
  // the user exactly what's still in flight.
  const blockingCounts = items.reduce<Record<string, number>>((acc, it) => {
    if (it.status === "ARRIVED" || it.status === "REJECTED") return acc;
    acc[it.status] = (acc[it.status] ?? 0) + 1;
    return acc;
  }, {});
  const blockingTotal = Object.values(blockingCounts).reduce((a, b) => a + b, 0);
  const allArrived = blockingTotal === 0 && items.some((i) => i.status !== "REJECTED");

  const cards = useMemo(() => groupItemsIntoSubmissions(items), [items]);

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>{t("bom.tabHelp")}</p>

      {/* DEC-067: BOM status pill + Close action header */}
      <div className={styles.bomHeader}>
        <div className={bomClosed ? `${styles.bomStatusPill} ${styles.bomStatusClosed}` : `${styles.bomStatusPill} ${styles.bomStatusOpen}`}>
          {bomClosed ? (
            <>
              <CheckIcon /> {t("bom.statusClosed")}
              {bomClosedAt && bomClosedByUserName ? (
                <span className={styles.hintSmall}>
                  · {t("bom.closedBy") + " " + bomClosedByUserName} ({new Date(bomClosedAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US")})
                </span>
              ) : null}
            </>
          ) : (
            <>{t("bom.statusOpen")}</>
          )}
        </div>
        {canClose && items.length > 0 && (
          <div>
            <button
              type="button"
              className={styles.closeBtn}
              disabled={!allArrived}
              onClick={() => setCloseDialogOpen(true)}
            >
              {t("bom.closeBom")}
            </button>
            {!allArrived && (
              <div className={styles.closeBtnHint}>
                {t("bom.cannotCloseUntilArrivedPrefix") + " " +
                  Object.entries(blockingCounts).map(([k, v]) => `${v} ${k}`).join(", ") +
                  " " + t("bom.cannotCloseUntilArrivedSuffix")}
              </div>
            )}
          </div>
        )}
      </div>

      {bomClosed && (
        <div className={styles.bomClosedBanner}>
          <CheckIcon /> {t("bom.closedBannerHint")}
        </div>
      )}

      <div className={styles.subtabs} role="tablist">
        {BOM_TYPES.map((bt) => {
          const owner = BOM_OWNER_ROLE[bt];
          const ownable = canOwnBomType(user, bt);
          return (
            <button
              key={bt}
              type="button"
              role="tab"
              aria-selected={activeType === bt}
              className={activeType === bt ? `${styles.subtab} ${styles.subtabActive}` : styles.subtab}
              onClick={() => setActiveType(bt)}
            >
              {bomTypeLabel(bt, locale)} {ownable ? null : <span className={styles.subtabMuted}>({owner})</span>}
            </button>
          );
        })}
      </div>

      {/* Add form: only when user can submit this type AND BOM is still open */}
      {!bomClosed && allowedTypes.length > 0 && canSubmitType && !showAdd && (
        <Button type="button" onClick={() => setShowAdd(true)}>
          + {t("bom.addTrigger")}
        </Button>
      )}
      {!bomClosed && canSubmitType && showAdd && (
        <AddItemForm
          projectId={projectId}
          bomType={activeType}
          allowedTypes={allowedTypes}
          onCancel={() => setShowAdd(false)}
          onAdd={async (data) => {
            await bom.createItem(data);
            setShowAdd(false);
          }}
        />
      )}
      {bomClosed && (
        <p className={styles.hint}>{t("bom.closedAddBlocked")}</p>
      )}

      {!bom.hydrated ? (
        <div role="status" className={styles.loading}>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<InboxIcon />}
          title={t("bom.subEmpty")}
          compact
        />
      ) : (
        <div className={styles.cardList}>
          {cards.map((card) => (
            <SubmissionCardView
              key={card.key}
              card={card}
              canEdit={canEdit}
              canApprove={canApprove}
              canProcess={canProcess}
              bomClosed={bomClosed}
              onSave={bom.updateItem}
              onRemove={bom.removeItem}
              onApprove={(id: string, note: string) => bom.reviewItem(id, "APPROVED", note)}
              onReject={(id: string, note: string) => bom.reviewItem(id, "REJECTED", note)}
              onPurchasingStatus={bom.updatePurchasing}
            />
          ))}
        </div>
      )}

      {/* DEC-067: close-BOM confirmation dialog with typed-phrase verify */}
      {closeDialogOpen && items[0]?.projectName && (
        <ConfirmDialog
          title={t("bom.closeConfirmTitle")}
          message={
            t("bom.closeConfirmMessagePrefix") + " \"" + items[0].projectName + "\" " +
            t("bom.closeConfirmMessageSuffix")
          }
          confirmText={`close ${items[0].projectName}`}
          confirmLabel={t("bom.closeConfirmLabel")}
          onCancel={() => setCloseDialogOpen(false)}
          onConfirm={async () => {
            setClosing(true);
            try {
              await projectsApi.closeBom(token, projectId, `close ${items[0].projectName}`);
              toast.success(t("bom.closeBom"), t("bom.closeSuccess"));
              setCloseDialogOpen(false);
              // Refresh both the BOM items + project metadata (parent will
              // need to refetch project for the closed flag — page reload
              // is the simplest path here; the parent listens for state).
              window.location.reload();
            } catch (err) {
              toast.error(t("bom.closeBom"), err instanceof Error ? err.message : String(err));
            } finally {
              setClosing(false);
            }
          }}
        />
      )}
      {closing && <span aria-hidden="true" />}
    </div>
  );
}
