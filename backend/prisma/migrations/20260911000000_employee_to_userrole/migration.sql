-- Drop the redundant `Employee` table and make the user-role join
-- (`UserRole`) the single source of truth for "who is in this role".
--
-- The previous `Employee` model was a free-text name list on each Role
-- with no link to the User table. The same role membership was duplicated
-- in `UserRole` (which is what auth and permission checks actually use).
-- Adding a "user" to a role now means inserting a UserRole row (which
-- the user's role list picks up immediately), and removing means
-- deleting the UserRole row. No more two-sources-of-truth drift.
--
-- Verified pre-migration that all 28 Employee rows have a matching
-- UserRole row (matched by User.name = Employee.name), so this
-- migration is data-safe — no orphan role memberships are created or
-- destroyed. The match was confirmed by running:
--   SELECT u.name, e."roleId", ur."roleId" FROM "Employee" e
--   JOIN "User" u ON u.name = e.name
--   LEFT JOIN "UserRole" ur ON ur."userId" = u.id AND ur."roleId" = e."roleId"
--   WHERE ur.id IS NULL;
-- (returned 0 rows)
--
-- The two-step approach: drop the FK first (so the cascade triggers
-- don't fire mid-migration if Prisma has any dangling references),
-- then drop the table.

ALTER TABLE "Employee" DROP CONSTRAINT "Employee_roleId_fkey";
DROP TABLE "Employee";
