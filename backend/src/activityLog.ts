import { prisma } from "./prisma";
import type { AuthedRequest } from "./auth";

// Fire-and-forget audit logging — never let a logging failure break the
// mutation it's describing. See DEC-026.
export function logActivity(entry: {
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
}) {
  prisma.activityLog
    .create({
      data: {
        userId: entry.userId,
        userName: entry.userName,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        description: entry.description,
      },
    })
    .catch((err) => console.error("Failed to write activity log:", err));
}

// Convenience wrapper — pulls userId/userName off the authenticated request
// so call sites don't repeat `req.authUser!.id, req.authUser!.name`.
export function logActivityFor(
  req: AuthedRequest,
  entry: { action: string; entityType: string; entityId?: string | null; description: string }
) {
  logActivity({ userId: req.authUser!.id, userName: req.authUser!.name, ...entry });
}
