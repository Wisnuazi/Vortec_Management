"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useActivityLog } from "@/hooks/useActivityLog";
import { activityApi, type ActivityLogFilters } from "@/lib/activity-api";
import { canViewActivityLog } from "@/lib/auth-api";
import { formatDate } from "@/lib/format";
import { categorizeActivity, activityDomain, type ActivityDomain } from "@/lib/activityCategory";
import { ActivityCategoryBadge } from "@/components/shared/ActivityCategoryBadge";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { useToast } from "@/components/shared/Toast";
import { InboxIcon, SearchIcon, DownloadIcon, XIcon } from "@/components/icons";
import styles from "./page.module.css";

type Filter = ActivityDomain | "all";

// DEC-078: in-page filter state lives here so users can compose search +
// date range freely. The hook pushes the filters into the entries
// fetch. The domain tab (All/Login/Actions/Project/Operational) is a
// pure UI-side filter because it maps cleanly to client-side data.
export default function ActivityLogPage() {
  const { user } = useAuth();
  const { token } = useAuth();
  const { t, locale } = usePreferences();
  const activity = useActivityLog();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  // DEC-078: free-text + date-range state. `from` / `to` use the
  // <input type="date"> string format (YYYY-MM-DD). The hook converts
  // them to ISO timestamps when querying the backend.
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [downloading, setDownloading] = useState(false);

  if (!canViewActivityLog(user)) {
    return <p className={styles.forbidden}>{t("activityLog.forbidden")}</p>;
  }

  // Apply the current free-text + date-range filters to the hook's
  // entries. The hook does the network call; we just decide what to
  // show below. We debounce search by letting them click "Apply" via
  // the filter bar (or pressing Enter) — see the form below.
  const applyFilters = (overrides?: Partial<ActivityLogFilters>) => {
    activity.setFilters({
      q: (overrides?.q ?? search).trim() || undefined,
      from: (overrides?.from ?? fromDate) || undefined,
      to: (overrides?.to ?? toDate) || undefined,
    });
  };

  const resetFilters = () => {
    setSearch("");
    setFromDate("");
    setToDate("");
    activity.setFilters({});
  };

  // Domain tab + search/date filters are all client-side; we already
  // pushed the search/date ones into the API call so the network
  // payload is the filtered set. The domain tab then narrows the
  // already-filtered list visually.
  const filteredEntries = useMemo(() => {
    if (filter === "all") return activity.entries;
    return activity.entries.filter((e) => activityDomain(e.entityType) === filter);
  }, [activity.entries, filter]);

  const hasActiveFilters = Boolean(search.trim() || fromDate || toDate);

  // DEC-078: download the currently-filtered set as CSV. Uses the
  // same filters as the in-page list so what the user sees matches
  // what they download. No month cap — from/to are forwarded
  // verbatim.
  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const filters: ActivityLogFilters = {
        q: search.trim() || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      };
      const res = await activityApi.downloadCsv(token, filters);
      const blob = await res.blob();
      // Try to honour the server-provided filename; fall back to a
      // sensible default if the browser dropped the header.
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(cd);
      const filename = match?.[1] ?? "activity-log.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (blob.size === 0) {
        toast.info(t("activityLog.downloadEmpty"));
      } else {
        toast.success(t("activityLog.downloadSuccess"));
      }
    } catch (err) {
      toast.error(
        t("activityLog.downloadFailed"),
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <PageHeader
        title={t("nav.activityLog")}
        subtitle={t("activityLog.pageDescription")}
        actions={
          <Button
            type="button"
            variant="secondary"
            iconLeft={<DownloadIcon />}
            loading={downloading}
            onClick={handleDownload}
            title={t("activityLog.downloadHint")}
          >
            {t("activityLog.downloadCsv")}
          </Button>
        }
      />

      <form
        className={styles.filterBar}
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
      >
        <label className={styles.searchField}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("activityLog.searchHint")}
            aria-label={t("activityLog.searchHint")}
          />
        </label>
        <label className={styles.dateField}>
          <span className={styles.dateLabel}>{t("activityLog.dateFrom")}</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} max={toDate || undefined} />
        </label>
        <label className={styles.dateField}>
          <span className={styles.dateLabel}>{t("activityLog.dateTo")}</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={fromDate || undefined}
          />
        </label>
        <Button type="submit" variant="primary" size="md">
          {t("common.apply")}
        </Button>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            iconLeft={<XIcon />}
            onClick={resetFilters}
            title={t("activityLog.resetFilters")}
          >
            {t("activityLog.resetFilters")}
          </Button>
        )}
        {hasActiveFilters && activity.entries.length > 0 && (
          <span className={styles.resultHint}>
            {activity.entries.length} {t("activityLog.resultsCount")}
          </span>
        )}
      </form>

      {!activity.hydrated ? (
        <div role="status" aria-label={t("activityLog.loading")}>
          <Skeleton variant="heading" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {/* DEC-077: "Online sekarang" card removed. The global presence
              indicator now lives in the Topbar (next to the breadcrumb)
              so it follows the user across every page, not just /activity-log. */}
          <section className={styles.feedSection}>
            <div className={styles.feedHead}>
              <span className={styles.sectionLabel}>{t("activityLog.feed")}</span>
              <div className={styles.filterTabs} role="tablist">
                {(["all", "login", "crud", "project", "operational"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    className={filter === f ? `${styles.filterTab} ${styles.filterTabActive}` : styles.filterTab}
                    onClick={() => setFilter(f)}
                  >
                    {t(
                      f === "all"
                        ? "activityLog.filterAll"
                        : f === "login"
                          ? "activityLog.filterLogin"
                          : f === "crud"
                            ? "activityLog.filterCrud"
                            : f === "project"
                              ? "activityLog.filterProject"
                              : "activityLog.filterOperational"
                    )}
                  </button>
                ))}
              </div>
            </div>
            {filteredEntries.length === 0 ? (
              <EmptyState
                icon={<InboxIcon />}
                title={hasActiveFilters ? t("activityLog.noActivity") : t("activityLog.noActivity")}
                description={t("activityLog.noActivityHint")}
                compact
              />
            ) : (
              <ul className={styles.feedList}>
                {filteredEntries.map((e) => (
                  <li key={e.id} className={styles.feedItem}>
                    <span className={styles.feedTime}>
                      {formatDate(e.createdAt, locale, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <ActivityCategoryBadge category={categorizeActivity(e.action)} />
                    <span className={styles.feedDescription}>{e.description}</span>
                    <span className={styles.feedUser}>{e.userName}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}