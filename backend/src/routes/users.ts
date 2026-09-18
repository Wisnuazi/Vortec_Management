import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { hashPassword, requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";

export const usersRouter = Router();

// Minimal directory (id + name only) for PIC-style pickers — any logged-in
// user needs this (e.g. an Operational Manager creating a project), not
// just super admin. Registered before the blanket super-admin gate below.
usersRouter.get("/basic", requireAuth, async (_req: AuthedRequest, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, userRoles: { select: { role: { select: { title: true } } } } },
    orderBy: { name: "asc" },
  });
  res.json(users.map((u) => ({ id: u.id, name: u.name, roleTitles: u.userRoles.map((ur) => ur.role.title) })));
});

usersRouter.use(requireAuth, requireSuperAdmin);

function serializeUser(user: {
  id: string;
  email: string;
  username: string | null;
  name: string;
  isSuperAdmin: boolean;
  userRoles: { role: { id: string; title: string } }[];
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    roleIds: user.userRoles.map((ur) => ur.role.id),
    roleTitles: user.userRoles.map((ur) => ur.role.title),
    createdAt: user.createdAt,
  };
}

const userInclude = { userRoles: { include: { role: { select: { id: true, title: true } } } } };

usersRouter.get("/", async (_req, res: Response) => {
  const users = await prisma.user.findMany({ include: userInclude, orderBy: { createdAt: "asc" } });
  res.json(users.map(serializeUser));
});

usersRouter.post("/", async (req: AuthedRequest, res: Response) => {
  const { email, username, password, name, roleIds, isSuperAdmin } = req.body as {
    email?: string;
    username?: string | null;
    password?: string;
    name?: string;
    roleIds?: string[];
    isSuperAdmin?: boolean;
  };

  const trimmedEmail = email?.trim().toLowerCase();
  const trimmedUsername = username?.trim().toLowerCase() || null;
  const trimmedName = name?.trim();
  if (!trimmedEmail || !password || !trimmedName) {
    return res.status(400).json({ error: "email, password, and name are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: trimmedEmail }, ...(trimmedUsername ? [{ username: trimmedUsername }] : [])] },
  });
  if (existing) return res.status(409).json({ error: "email or username already in use" });

  const user = await prisma.user.create({
    data: {
      email: trimmedEmail,
      username: trimmedUsername,
      name: trimmedName,
      passwordHash: await hashPassword(password),
      isSuperAdmin: isSuperAdmin ?? false,
      userRoles: {
        create: (roleIds ?? []).map((roleId) => ({ roleId })),
      },
    },
    include: userInclude,
  });
  logActivityFor(req, {
    action: "user.create",
    entityType: "User",
    entityId: user.id,
    description: `Membuat akun user "${user.name}" (${user.email})`,
  });
  res.status(201).json(serializeUser(user));
});

usersRouter.patch("/:id", async (req: AuthedRequest, res: Response) => {
  const { name, username, roleIds, isSuperAdmin, password } = req.body as {
    name?: string;
    username?: string | null;
    roleIds?: string[];
    isSuperAdmin?: boolean;
    password?: string;
  };

  if (isSuperAdmin === false && req.params.id === req.authUser!.id) {
    return res.status(400).json({ error: "Tidak bisa mencabut status super admin dari akun sendiri" });
  }

  if (username !== undefined && username) {
    const normalized = username.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { username: normalized } });
    if (existing && existing.id !== req.params.id) {
      return res.status(409).json({ error: "username already in use" });
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(username !== undefined ? { username: username?.trim().toLowerCase() || null } : {}),
        ...(isSuperAdmin !== undefined ? { isSuperAdmin } : {}),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
        ...(roleIds !== undefined
          ? { userRoles: { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) } }
          : {}),
      },
      include: userInclude,
    });
    logActivityFor(req, {
      action: "user.update",
      entityType: "User",
      entityId: user.id,
      description: `Mengubah akun user "${user.name}"`,
    });
    res.json(serializeUser(user));
  } catch {
    res.status(404).json({ error: "user not found" });
  }
});

usersRouter.delete("/:id", async (req: AuthedRequest, res: Response) => {
  if (req.params.id === req.authUser!.id) {
    return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "user.delete",
      entityType: "User",
      entityId: req.params.id,
      description: `Menghapus akun user "${user?.name ?? req.params.id}"`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "user not found" });
  }
});
