import { prisma } from "../prisma";

// DEC-063: persistent notifications. Each BOM state change
// (submitted/approved/rejected/processing/arrived) writes one
// Notification row per recipient. The recipient set is computed
// at write time per the "role yang terhubung dengan BOM tersebut"
// rule — the submitter (the engineer who created the item), the
// project PIC, all users with the Project Manager role, all users
// with the Operational Manager role, and (for APPROVED) the
// Purchasing role. The actor (the user who triggered the event)
// is excluded so they don't get a "you did this" notification.

export type BomEvent = "submitted" | "approved" | "rejected" | "processing" | "arrived";

const ROLE_TITLES = {
  PM: "Project Manager",
  OM: "Operational Manager",
  PURCHASING: "Purchasing",
} as const;

function titleForEvent(event: BomEvent, itemName: string): string {
  switch (event) {
    case "submitted":
      return `BOM baru perlu direview: ${itemName}`;
    case "approved":
      return `BOM disetujui: ${itemName}`;
    case "rejected":
      return `BOM ditolak: ${itemName}`;
    case "processing":
      return `BOM mulai dibeli: ${itemName}`;
    case "arrived":
      return `BOM sudah sampai: ${itemName}`;
  }
}

function bodyForEvent(
  event: BomEvent,
  item: { name: string; quantity: number; unit: string },
  projectName: string
): string {
  const at = `${item.quantity} ${item.unit}`;
  switch (event) {
    case "submitted":
      return `${at} untuk project "${projectName}" menunggu review PM/OM.`;
    case "approved":
      return `${at} untuk project "${projectName}" sudah disetujui, sekarang masuk antrian Purchasing.`;
    case "rejected":
      return `${at} untuk project "${projectName}" ditolak oleh PM/OM. Ajukan item baru untuk menggantikannya.`;
    case "processing":
      return `${at} untuk project "${projectName}" sedang diproses oleh tim Purchasing.`;
    case "arrived":
      return `${at} untuk project "${projectName}" sudah diterima. Status item: ARRIVED.`;
  }
}

async function resolveRecipients(
  actorId: string,
  item: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    projectId: string;
    submittedByUserId: string;
    project: { picUserId: string | null; name: string };
  },
  event: BomEvent
): Promise<{ userIds: Set<string>; title: string; body: string }> {
  const recipients = new Set<string>();

  if (event === "submitted") {
    // The submitter is the actor here (they just hit "Tambah item"),
    // so we don't notify them. The role that needs to act next is
    // PM/OM (the reviewers), so always notify them.
    const reviewers = await prisma.userRole.findMany({
      where: { role: { title: { in: [ROLE_TITLES.PM, ROLE_TITLES.OM] } } },
      select: { userId: true },
    });
    for (const r of reviewers) recipients.add(r.userId);
    // Project PIC also gets the heads-up.
    if (item.project.picUserId) recipients.add(item.project.picUserId);
  } else {
    // For all downstream state changes (approved / rejected /
    // processing / arrived) the submitter wants to know what
    // happened to their item.
    recipients.add(item.submittedByUserId);
  }

  if (event === "approved") {
    // Purchasing picks it up next.
    const purchasers = await prisma.userRole.findMany({
      where: { role: { title: ROLE_TITLES.PURCHASING } },
      select: { userId: true },
    });
    for (const p of purchasers) recipients.add(p.userId);
    // Project PIC + PM/OM get the heads-up.
    const managers = await prisma.userRole.findMany({
      where: { role: { title: { in: [ROLE_TITLES.PM, ROLE_TITLES.OM] } } },
      select: { userId: true },
    });
    for (const m of managers) recipients.add(m.userId);
    if (item.project.picUserId) recipients.add(item.project.picUserId);
  }

  if (event === "rejected" || event === "processing" || event === "arrived") {
    // For downstream status changes: the project PIC + PM + OM
    // are all on the hook to know the item moved.
    const managers = await prisma.userRole.findMany({
      where: { role: { title: { in: [ROLE_TITLES.PM, ROLE_TITLES.OM] } } },
      select: { userId: true },
    });
    for (const m of managers) recipients.add(m.userId);
    if (item.project.picUserId) recipients.add(item.project.picUserId);
  }

  // Don't notify the actor about their own action.
  recipients.delete(actorId);

  return {
    userIds: recipients,
    title: titleForEvent(event, item.name),
    body: bodyForEvent(
      event,
      { name: item.name, quantity: item.quantity, unit: item.unit },
      item.project.name
    ),
  };
}

// Fire-and-record. Writes a row per recipient; never throws so the
// route's primary mutation can still succeed if the notification
// write fails (the .catch logs to stderr but doesn't surface).
export async function notifyBomEvent(
  actorId: string,
  item: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    projectId: string;
    submittedByUserId: string;
  },
  event: BomEvent
): Promise<void> {
  try {
    const full = await prisma.bomItem.findUnique({
      where: { id: item.id },
      include: { project: { select: { id: true, name: true, picUserId: true } } },
    });
    if (!full) return;
    const { userIds, title, body } = await resolveRecipients(actorId, { ...item, project: full.project }, event);
    if (userIds.size === 0) return;
    await prisma.notification.createMany({
      data: Array.from(userIds).map((userId) => ({
        userId,
        type: `bom.${event}`,
        title,
        body,
        projectId: item.projectId,
        entityType: "BomItem",
        entityId: item.id,
      })),
    });
  } catch (err) {
    console.error("notifyBomEvent failed:", err);
  }
}
