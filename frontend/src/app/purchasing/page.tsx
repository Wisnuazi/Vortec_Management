"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { usePurchasing } from "@/hooks/usePurchasing";
import { useProjects } from "@/hooks/useProjects";
import { useFilterPreference } from "@/hooks/useFilterPreference";
import { Pagination, type PageSize } from "@/components/shared/Pagination";
import { canManagePurchasing } from "@/lib/auth-api";
import { materialRequestStatusLabel, taskStatusLabel, projectsApi, type TaskStatus } from "@/lib/projects-api";
import { formatDate } from "@/lib/format";
import type { PurchasingMaterialRequest, PurchasingTask, PurchasingBomItem } from "@/lib/purchasing-api";
import { PaperclipIcon, TrashIcon, InboxIcon } from "@/components/icons";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shared/Toast";
import styles from "./page.module.css";

function AttachmentsReadOnly({ attachments }: { attachments: PurchasingMaterialRequest["attachments"] }) {
  const { t, locale } = usePreferences();
  if (attachments.length === 0) return null;
  return (
    <ul className={styles.attachList}>
      {attachments.map((a) => (
        <li key={a.id} className={styles.attachItem}>
          <PaperclipIcon />
          {a.kind === "LINK" ? (
            <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer">
              {a.fileName}
            </a>
          ) : (
            <a href={a.dataUrl ?? "#"} download={a.fileName}>
              {a.fileName}
            </a>
          )}
          <span className={styles.hintSmall}>
            {a.uploadedByUserName} · {formatDate(a.createdAt, locale)}
          </span>
        </li>
      ))}
      {attachments.length === 0 && <li className={styles.hintSmall}>{t("attachments.empty")}</li>}
    </ul>
  );
}

function RequestCard({ request, canEdit, onChanged }: { request: PurchasingMaterialRequest; canEdit: boolean; onChanged: () => Promise<void> }) {
  const { t, locale } = usePreferences();
  const { token } = useAuth();
  // DEC-069: collapse long item lists by default. Requests with 4+
  // items get a "show all" disclosure so the queue stays scannable.
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const COLLAPSE_THRESHOLD = 3;
  const itemsToShow = itemsExpanded || request.items.length <= COLLAPSE_THRESHOLD
    ? request.items
    : request.items.slice(0, COLLAPSE_THRESHOLD);
  const [purchaseNote, setPurchaseNote] = useState("");

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.projectTag}>{request.projectName}</span>
        <span className={styles.title}>{request.title}</span>
        <span className={`${styles.statusPill} ${styles[`mrStatus_${request.status}`] ?? ""}`}>
          {materialRequestStatusLabel(request.status, locale)}
        </span>
      </div>
      <span className={styles.hintSmall}>
        {t("materialRequests.submittedBy")} {request.requestedByUserName}
      </span>
      {request.note && <p className={styles.notes}>{request.note}</p>}
      <ul className={styles.itemList}>
        {itemsToShow.map((i) => (
          <li key={i.id} className={styles.item}>
            {i.materialName} <span className={styles.hintSmall}>× {i.quantity} {i.unit}</span>
            {i.notes && <span className={styles.itemNotes}>{i.notes}</span>}
          </li>
        ))}
      </ul>
      {request.items.length > COLLAPSE_THRESHOLD && (
        <button
          type="button"
          className={styles.moreItemsToggle}
          onClick={() => setItemsExpanded((v) => !v)}
          aria-expanded={itemsExpanded}
        >
          {itemsExpanded ? "▾ " : "▸ "}
          {itemsExpanded
            ? t("common.collapse")
            : `${t("common.showAll")} (${request.items.length})`}
        </button>
      )}
      <AttachmentsReadOnly attachments={request.attachments} />
      {canEdit && (request.status === "APPROVED" || request.status === "PROCESSING") && (
        <form
          className={styles.inlineForm}
          onSubmit={async (e) => {
            e.preventDefault();
            await projectsApi.processMaterialRequest(token, request.projectId, request.id, {
              status: request.status === "APPROVED" ? "PROCESSING" : "COMPLETED",
              purchaseNote,
            });
            setPurchaseNote("");
            await onChanged();
          }}
        >
          <input
            placeholder={t("materialRequests.purchaseNotePlaceholder")}
            value={purchaseNote}
            onChange={(e) => setPurchaseNote(e.target.value)}
          />
          <button type="submit">
            {request.status === "APPROVED" ? t("materialRequests.startProcessing") : t("materialRequests.finishPurchasing")}
          </button>
        </form>
      )}
    </div>
  );
}

function TaskCard({ task, canEdit, onChanged }: { task: PurchasingTask; canEdit: boolean; onChanged: () => Promise<void> }) {
  const { t, locale } = usePreferences();
  const { token } = useAuth();

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.projectTag}>{task.projectName}</span>
        <span className={styles.title}>{task.title}</span>
        {canEdit ? (
          <select
            value={task.status}
            onChange={async (e) => {
              await projectsApi.updateTask(token, task.projectId, task.id, { status: e.target.value as TaskStatus });
              await onChanged();
            }}
          >
            {(["TODO", "IN_PROGRESS", "WAITING_APPROVAL", "DONE", "REJECTED"] as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {taskStatusLabel(s, locale)}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.statusPill}>{taskStatusLabel(task.status, locale)}</span>
        )}
      </div>
      {task.description && <p className={styles.notes}>{task.description}</p>}
      <div className={styles.hintSmall}>
        {(task.startDate || task.dueDate) && (
          <span>
            {task.startDate ? formatDate(task.startDate, locale) : "?"} → {task.dueDate ? formatDate(task.dueDate, locale) : "?"}
          </span>
        )}
      </div>
      <AttachmentsReadOnly attachments={task.attachments} />
    </div>
  );
}

type Tab = "queue" | "bom";

function ApprovedBomCard({
  item,
  canEdit,
  onChanged,
}: {
  item: PurchasingBomItem;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const { token } = useAuth();
  const [purchaseNote, setPurchaseNote] = useState("");
  const rupiah = (amount: number | null) =>
    amount == null ? "—" : `Rp ${amount.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`;
  const typeLabel: Record<PurchasingBomItem["bomType"], string> = {
    MBOM: "MBOM",
    EBOM: "EBOM",
    SBOM: "SBOM",
  };
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.projectTag}>{item.projectName}</span>
        <span className={styles.typeTag}>{typeLabel[item.bomType]}</span>
        <span className={styles.title}>{item.name}</span>
        <span className={styles.qty}>
          {item.quantity} {item.unit} · {rupiah(item.price)}
        </span>
        <span className={`${styles.statusPill} ${styles[`mrStatus_${item.status}`] ?? ""}`}>
          {item.status === "APPROVED" ? t("bom.markProcessing") : item.status === "PROCESSING" ? t("bom.markArrived") : t("bom.status_ARRIVED" as never) || "Sudah Sampai"}
        </span>
      </div>
      {item.approvedByUserName ? (
        <span className={styles.hintSmall}>
          {t("bom.approvedBy")} {item.approvedByUserName}
          {item.approvedAt ? ` · ${new Date(item.approvedAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US")}` : ""}
        </span>
      ) : null}
      {item.notes ? (
        item.notes.startsWith("http") ? (
          <a href={item.notes} target="_blank" rel="noopener noreferrer" className={styles.hintSmall}>
            {item.notes}
          </a>
        ) : (
          <p className={styles.notes}>{item.notes}</p>
        )
      ) : null}
      {canEdit && item.status !== "ARRIVED" && (
        <form
          className={styles.inlineForm}
          onSubmit={async (e) => {
            e.preventDefault();
            const next = item.status === "APPROVED" ? "PROCESSING" : "ARRIVED";
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/bom/${item.id}/purchasing`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ status: next, purchaseNote }),
              }
            );
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? `Request failed (${res.status})`);
            }
            setPurchaseNote("");
            await onChanged();
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
    </div>
  );
}

export default function PurchasingPage() {
  const { user, token } = useAuth();
  const { t, locale } = usePreferences();
  const toast = useToast();
  const canEdit = canManagePurchasing(user);
  const purchasing = usePurchasing();
  const projects = useProjects();
  // DEC-082: tab state lives in URL query (?tab=queue|bom) so the
  // Sidebar submenu can link to each section. In-page tab strip is
  // gone — sidebar submenu + Topbar breadcrumb carry context.
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "bom" ? "bom" : "queue";
  const [projectFilter, setProjectFilter] = useFilterPreference<string>("purchasing.projectFilter", "ALL");
  const [search, setSearch] = useFilterPreference<string>("purchasing.search", "");
  // DEC-069: paginate the material-request queue. 25 per page keeps
  // each request card in the viewport without scrolling too far.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const q = search.trim().toLowerCase();
  const filteredRequests = useMemo(
    () =>
      purchasing.materialRequests.filter((r) => {
        if (projectFilter !== "ALL" && r.projectId !== projectFilter) return false;
        if (q && !r.title.toLowerCase().includes(q)) return false;
        return true;
      }),
    [purchasing.materialRequests, projectFilter, q]
  );
  const pagedRequests = filteredRequests.slice(page * pageSize, (page + 1) * pageSize);
  const filteredTasks = useMemo(
    () =>
      purchasing.tasks.filter((t) => {
        if (projectFilter !== "ALL" && t.projectId !== projectFilter) return false;
        if (q && !t.title.toLowerCase().includes(q)) return false;
        return true;
      }),
    [purchasing.tasks, projectFilter, q]
  );
  const hasActiveFilter = projectFilter !== "ALL" || q !== "";

  return (
    <div className={styles.wrap}>
      <PageHeader
        title={t("nav.purchasing")}
        subtitle={canEdit ? t("purchasing.pageDescriptionEditable") : t("purchasing.pageDescriptionReadOnly")}
      />

      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("purchasing.searchHint")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        {tab === "queue" && (
          <select
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="ALL">{t("common.allProjects")}</option>
            {projects.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === "queue" ? (
        !purchasing.hydrated ? (
          <div role="status" aria-label={t("purchasing.loading")}>
            <Skeleton variant="heading" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : (
          <>
            <section className={styles.section}>
              <span className={styles.sectionLabel}>{t("purchasing.readyToBuy")}</span>
              {filteredRequests.length === 0 ? (
                <EmptyState
                  icon={<InboxIcon />}
                  title={hasActiveFilter ? t("purchasing.noResults") : t("purchasing.noRequests")}
                  description={hasActiveFilter ? undefined : t("purchasing.noRequestsHint")}
                  compact
                />
              ) : (
                <>
                  <div className={styles.list}>
                    {pagedRequests.map((r) => (
                      <RequestCard key={r.id} request={r} canEdit={canEdit} onChanged={purchasing.reload} />
                    ))}
                  </div>
                  <Pagination
                    page={page}
                    pageSize={pageSize}
                    total={filteredRequests.length}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(0);
                    }}
                  />
                </>
              )}
            </section>

            <section className={styles.section}>
              <span className={styles.sectionLabel}>{t("purchasing.teamTasks")}</span>
              {filteredTasks.length === 0 ? (
                <EmptyState
                  icon={<InboxIcon />}
                  title={hasActiveFilter ? t("purchasing.noResults") : t("purchasing.noTasks")}
                  description={hasActiveFilter ? undefined : t("purchasing.noTasksHint")}
                  compact
                />
              ) : (
                <div className={styles.list}>
                  {filteredTasks.map((task) => (
                    <TaskCard key={task.id} task={task} canEdit={canEdit} onChanged={purchasing.reload} />
                  ))}
                </div>
              )}
            </section>
          </>
        )
      ) : (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>{t("purchasing.tabBomQueue")}</span>
          {purchasing.approvedBom.length === 0 ? (
            <p className={styles.emptyHint}>{t("purchasing.noBomQueue")}</p>
          ) : (
            <div className={styles.list}>
              {purchasing.approvedBom
                .filter((it) => projectFilter === "ALL" || it.projectId === projectFilter)
                .map((it) => (
                  <ApprovedBomCard key={it.id} item={it} canEdit={canEdit} onChanged={purchasing.reload} />
                ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
