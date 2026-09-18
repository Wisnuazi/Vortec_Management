"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrgRoles } from "@/hooks/useOrgRoles";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { Skeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import styles from "./page.module.css";

// Role Charter page — the public-facing "what does this role do?"
// document for any role in the org. Reachable from the dashboard
// "ROLE ANDA" badges (where each badge is a link to
// /organization/role/<id>) and from the Organization → Roles
// list. The content is sourced from the existing Role data
// (title, jobDescription, jobdesk, parent, coSupervisors,
// employees, children) so this is a view, not a separate
// authoring surface — edits still go through the Roles list.
export default function RoleCharterPage() {
  const params = useParams<{ id: string }>();
  const org = useOrgRoles();
  const { user } = useAuth();
  const { t } = usePreferences();
  const role = org.roles.find((r) => r.id === params.id);

  useEffect(() => {
    document.title = role
      ? `${role.title} · ${t("nav.organization")} · Vortec Management`
      : `${t("roleDetail.title")} · Vortec Management`;
  }, [role, t]);

  if (!org.hydrated) {
    return (
      <div className={styles.wrap}>
        <Link href="/organization" className={styles.backLink}>
          ← {t("roleDetail.back")}
        </Link>
        <Skeleton width="60%" height="2rem" />
        <Skeleton width="90%" height="1rem" />
        <Skeleton width="80%" height="1rem" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className={styles.wrap}>
        <Link href="/organization" className={styles.backLink}>
          ← {t("roleDetail.back")}
        </Link>
        <EmptyState
          title={t("roleDetail.notFoundTitle")}
          description={t("roleDetail.notFoundDescription")}
        />
      </div>
    );
  }

  const parent = role.parentId ? org.roles.find((r) => r.id === role.parentId) : null;
  const coSupervisors = role.coSupervisorIds
    .map((id) => org.roles.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const children = org.roles.filter((r) => r.parentId === role.id);
  const canEdit = !!user?.isSuperAdmin;

  return (
    <div className={styles.wrap}>
      <PageHeader
        title={role.title}
        subtitle={role.floorLabel ? `${role.floorLabel} — ${t("roleDetail.heroHint")}` : t("roleDetail.heroHint")}
        eyebrow={
          <Link href="/organization" className={styles.backLink}>
            ← {t("roleDetail.back")}
          </Link>
        }
      />

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("roleDetail.summary")}</h2>
        {role.jobDescription.trim() ? (
          <p className={styles.description}>{role.jobDescription}</p>
        ) : (
          <p className={styles.emptyInline}>{t("roleDetail.summaryEmpty")}</p>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t("roleDetail.jobdesk")}{" "}
          <span className={styles.countChip}>
            {role.jobdesk.length}
          </span>
        </h2>
        {role.jobdesk.length === 0 ? (
          <p className={styles.emptyInline}>{t("roleDetail.jobdeskEmpty")}</p>
        ) : (
          <ol className={styles.jobdeskList}>
            {role.jobdesk.map((item, i) => (
              <li key={item.id} className={styles.jobdeskItem}>
                {item.text}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className={styles.twoCol}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t("roleDetail.supervisor")}</h2>
          {parent ? (
            <Link href={`/organization/role/${parent.id}`} className={styles.relatedLink}>
              {parent.title}
            </Link>
          ) : (
            <p className={styles.emptyInline}>{t("roleDetail.noSupervisor")}</p>
          )}
          {coSupervisors.length > 0 && (
            <div className={styles.coSupervisorBlock}>
              <h3 className={styles.subTitle}>{t("roleDetail.coSupervisor")}</h3>
              <ul className={styles.relatedList}>
                {coSupervisors.map((c) => (
                  <li key={c.id}>
                    <Link href={`/organization/role/${c.id}`} className={styles.relatedLink}>
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className={styles.relatedHint}>{t("roleDetail.coSupervisorHint")}</p>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            {t("roleDetail.subordinates")}{" "}
            <span className={styles.countChip}>{children.length}</span>
          </h2>
          {children.length === 0 ? (
            <p className={styles.emptyInline}>{t("roleDetail.noSubordinates")}</p>
          ) : (
            <ul className={styles.relatedList}>
              {children.map((c) => (
                <li key={c.id}>
                  <Link href={`/organization/role/${c.id}`} className={styles.relatedLink}>
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t("roleDetail.employees")}{" "}
          <span className={styles.countChip}>{role.employees.length}</span>
        </h2>
        {role.employees.length === 0 ? (
          <p className={styles.emptyInline}>{t("roleDetail.noEmployees")}</p>
        ) : (
          <ul className={styles.employeeList}>
            {role.employees.map((e) => (
              <li key={e.id} className={styles.employeeItem}>
                {e.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <p className={styles.editHint}>
          {t("roleDetail.editHint")}{" "}
          <Link href="/organization" className={styles.editLink}>
            {t("roleDetail.editLink")}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
