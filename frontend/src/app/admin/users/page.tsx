"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUsers } from "@/hooks/useUsers";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { usePreferences } from "@/hooks/usePreferences";
import { TrashIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/shared/Button";
import { Pagination, type PageSize } from "@/components/shared/Pagination";
import { InboxIcon } from "@/components/icons";
import { sortRows, type SortDir } from "@/lib/sort";
import { RoleMultiSelect } from "./RoleMultiSelect";
import type { ManagedUser } from "@/lib/auth-api";
import styles from "./page.module.css";

function CreateUserForm({
  roles,
  onCreate,
}: {
  roles: { id: string; title: string }[];
  onCreate: (data: {
    email: string;
    username: string | null;
    password: string;
    name: string;
    roleIds: string[];
    isSuperAdmin: boolean;
  }) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + {t("users.createTrigger")}
      </Button>
    );
  }

  return (
    <form
      className={styles.createForm}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
          await onCreate({ email, username: username || null, password, name, roleIds, isSuperAdmin });
          setEmail("");
          setUsername("");
          setPassword("");
          setName("");
          setRoleIds([]);
          setIsSuperAdmin(false);
          setOpen(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : t("users.createFailed"));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className={styles.formGrid}>
        <label>
          <span>{t("users.name")}</span>
          <input required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>{t("profile.email")}</span>
          <input
            required
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          <span>{t("users.usernameOptional")}</span>
          <input
            value={username}
            autoComplete="off"
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("users.usernameHint")}
          />
        </label>
        <label>
          <span>{t("users.initialPassword")}</span>
          <input
            required
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("users.passwordHint")}
          />
        </label>
        <label>
          <span>{t("users.rolesMultiple")}</span>
          <RoleMultiSelect roles={roles} selectedIds={roleIds} onChange={setRoleIds} />
        </label>
      </div>

      <label className={styles.checkboxLabel}>
        <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
        {t("users.superAdminCheckbox")}
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.formActions}>
        <Button type="submit" loading={submitting}>
          {submitting ? t("common.saving") : t("users.createSubmit")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  roles,
  isSelf,
  onUpdate,
  onRemove,
}: {
  user: ManagedUser;
  roles: { id: string; title: string }[];
  isSelf: boolean;
  onUpdate: (
    id: string,
    data: Partial<{ name: string; username: string | null; roleIds: string[]; isSuperAdmin: boolean; password: string }>
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [usernameDraft, setUsernameDraft] = useState(user.username ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <tr>
      <td>
        <div className={styles.nameCell}>
          {user.name}
          {isSelf && <span className={styles.selfHint}>({t("users.you")})</span>}
        </div>
        <div className={styles.emailHint}>{user.email}</div>
        <input
          className={styles.usernameInput}
          value={usernameDraft}
          autoComplete="off"
          placeholder={t("users.usernameFieldPlaceholder")}
          onChange={(e) => setUsernameDraft(e.target.value)}
          onBlur={() => {
            if (usernameDraft !== (user.username ?? "")) {
              onUpdate(user.id, { username: usernameDraft || null });
            }
          }}
        />
      </td>
      <td>
        <RoleMultiSelect roles={roles} selectedIds={user.roleIds} onChange={(ids) => onUpdate(user.id, { roleIds: ids })} />
      </td>
      <td>
        <input
          type="checkbox"
          checked={user.isSuperAdmin}
          disabled={isSelf}
          title={isSelf ? t("users.cannotRevokeSelf") : undefined}
          onChange={(e) => onUpdate(user.id, { isSuperAdmin: e.target.checked })}
        />
      </td>
      <td>
        {changingPassword ? (
          <form
            className={styles.passwordForm}
            onSubmit={async (e) => {
              e.preventDefault();
              await onUpdate(user.id, { password: newPassword });
              setNewPassword("");
              setChangingPassword(false);
            }}
          >
            <input
              type="password"
              autoFocus
              minLength={8}
              autoComplete="new-password"
              placeholder={t("profile.newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Button type="submit">{t("common.save")}</Button>
            <Button type="button" variant="secondary" onClick={() => setChangingPassword(false)}>
              {t("common.cancel")}
            </Button>
          </form>
        ) : (
          <div className={styles.passwordCell}>
            <span className={styles.passwordMask} title={t("users.passwordEncryptedHint")}>
              ••••••••
            </span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setChangingPassword(true)}>
              {t("users.changePassword")}
            </Button>
          </div>
        )}
      </td>
      <td>
        <button
          type="button"
          className={styles.deleteBtn}
          disabled={isSelf}
          title={isSelf ? t("users.cannotDeleteSelf") : t("users.deleteUser")}
          onClick={() => setConfirmingDelete(true)}
        >
          <TrashIcon />
        </button>
        {confirmingDelete && (
          <ConfirmDialog
            title={t("users.deleteUser")}
            message={`${t("users.confirmDelete")} "${user.name}" (${user.email})?`}
            confirmText={user.name}
            confirmLabel={t("users.deleteUser")}
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={() => {
              setConfirmingDelete(false);
              onRemove(user.id);
            }}
          />
        )}
      </td>
    </tr>
  );
}

type SortKey = "name" | "isSuperAdmin";

export default function UsersAdminPage() {
  const { user: currentUser } = useAuth();
  const { t } = usePreferences();
  const { users, loading, error, createUser, updateUser, removeUser } = useUsers();
  const org = useOrgRoles();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // DEC-076: search + role + super-admin filters. State lives here so
  // filters survive navigation. Filter changes reset to page 0 so the
  // user always lands on the first match.
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [superFilter, setSuperFilter] = useState<"all" | "admin" | "user">("all");
  // DEC-069: paginate the user table. 25 per page is comfortable for
  // the role-edit popovers to stay readable.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  if (!currentUser?.isSuperAdmin) {
    return <p className={styles.forbidden}>{t("users.forbidden")}</p>;
  }

  const sortValue: Record<SortKey, (u: ManagedUser) => unknown> = {
    name: (u) => u.name,
    isSuperAdmin: (u) => u.isSuperAdmin,
  };
  // DEC-076: filter pipeline — search hits name/email/username/role
  // titles; role filter requires the user to hold that role title;
  // super-filter narrows by isSuperAdmin flag. All filters are AND.
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (superFilter === "admin" && !u.isSuperAdmin) return false;
      if (superFilter === "user" && u.isSuperAdmin) return false;
      if (roleFilter !== "ALL" && !u.roleTitles.includes(roleFilter)) return false;
      if (!q) return true;
      const haystack = [
        u.name,
        u.email,
        u.username ?? "",
        ...u.roleTitles,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, search, roleFilter, superFilter]);

  const sortedUsers = sortRows(filteredUsers, sortValue[sortKey], sortDir);
  const pagedUsers = sortedUsers.slice(page * pageSize, (page + 1) * pageSize);
  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const sortIndicator = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? "▲" : "▼") : "");

  return (
    <div className={styles.wrap}>
      <PageHeader title={t("nav.users")} subtitle={t("users.pageDescription")} />

      <CreateUserForm roles={org.roles} onCreate={createUser} />

      {error && <p className={styles.error}>{error}</p>}

      {!loading && (
        <div className={styles.filterBar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder={t("users.searchHint")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            aria-label={t("users.searchHint")}
          />
          <select
            className={styles.filterSelect}
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(0);
            }}
            aria-label={t("users.filterByRole")}
          >
            <option value="ALL">{t("users.filterRoleAll")}</option>
            {org.roles.map((r) => (
              <option key={r.id} value={r.title}>
                {r.title}
              </option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={superFilter}
            onChange={(e) => {
              setSuperFilter(e.target.value as "all" | "admin" | "user");
              setPage(0);
            }}
            aria-label={t("users.filterByAccess")}
          >
            <option value="all">{t("users.filterAccessAll")}</option>
            <option value="admin">{t("users.filterAccessAdmin")}</option>
            <option value="user">{t("users.filterAccessUser")}</option>
          </select>
        </div>
      )}

      {loading ? (
        <div role="status" aria-label={t("users.loading")}>
          <Skeleton variant="heading" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>
                    <button type="button" className={styles.sortHeaderBtn} onClick={() => onSort("name")}>
                      {t("users.user")} <span className={styles.sortArrow}>{sortIndicator("name")}</span>
                    </button>
                  </th>
                  <th>{t("users.roles")}</th>
                  <th>
                    <button type="button" className={styles.sortHeaderBtn} onClick={() => onSort("isSuperAdmin")}>
                      {t("users.superAdmin")} <span className={styles.sortArrow}>{sortIndicator("isSuperAdmin")}</span>
                    </button>
                  </th>
                  <th>{t("users.password")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyRow}>
                      {t("users.noMatches")}
                    </td>
                  </tr>
                ) : (
                  pagedUsers.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      roles={org.roles}
                      isSelf={u.id === currentUser.id}
                      onUpdate={updateUser}
                      onRemove={removeUser}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={sortedUsers.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </div>
  );
}
