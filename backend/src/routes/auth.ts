import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { hashPassword, verifyPassword, signToken, requireAuth, getUserRoles, type AuthedRequest } from "../auth";
import { logActivity } from "../activityLog";

export const authRouter = Router();

// Login rate-limit was added in DEC-052 (5 attempts per 15 min per IP
// via createRateLimiter in src/rateLimit.ts) but is currently DISABLED
// per the operator's request — see SECURITY.md. The factory is kept
// so the same pattern can be re-applied to /login (or any other
// route) by re-importing createRateLimiter and adding it as a
// middleware on the relevant route. See DEC-052 for the original
// rationale and SECURITY.md for the disable note.

const MAX_AVATAR_LENGTH = 1_500_000; // ~1.1MB decoded, generous for a small resized photo

async function serializeUser(user: {
  id: string;
  email: string;
  username: string | null;
  name: string;
  isSuperAdmin: boolean;
  avatarUrl: string | null;
  theme: string;
  locale: string;
}) {
  const roles = await getUserRoles(user.id);
  // DEC-067: union of the user's roles' allowedBomTypes (drives the
  // AddBomItemForm dropdown). We resolve each role's array via a
  // single follow-up query rather than extending getUserRoles so the
  // helper stays small.
  const allowed = new Set<string>();
  for (const r of roles) {
    for (const t of ((r as { allowedBomTypes?: string[] }).allowedBomTypes ?? [])) {
      allowed.add(t);
    }
  }
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    avatarUrl: user.avatarUrl,
    roleIds: roles.map((r) => r.id),
    roleTitles: roles.map((r) => r.title),
    allowedBomTypes: Array.from(allowed),
    theme: user.theme,
    locale: user.locale,
  };
}

authRouter.post("/login", async (req, res: Response) => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };
  if (!identifier || !password) {
    return res.status(400).json({ error: "identifier (email/username) and password are required" });
  }

  const normalized = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: normalized }, { username: normalized }] },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    if (user) {
      logActivity({
        userId: user.id,
        userName: user.name,
        action: "auth.loginFailed",
        entityType: "Auth",
        entityId: user.id,
        description: `Percobaan login gagal (password salah) untuk "${user.name}"`,
      });
    }
    return res.status(401).json({ error: "Email/username atau password salah" });
  }

  const token = signToken({ sub: user.id, isSuperAdmin: user.isSuperAdmin });
  logActivity({
    userId: user.id,
    userName: user.name,
    action: "auth.login",
    entityType: "Auth",
    entityId: user.id,
    description: `"${user.name}" login`,
  });
  res.json({ token, user: await serializeUser(user) });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.authUser!.id } });
  res.json({ user: await serializeUser(user) });
});

authRouter.patch("/me", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { name, theme, locale, password, avatarUrl } = req.body as {
    name?: string;
    theme?: string;
    locale?: string;
    password?: string;
    avatarUrl?: string | null;
  };

  if (theme !== undefined && !["light", "dark", "system"].includes(theme)) {
    return res.status(400).json({ error: "invalid theme" });
  }
  if (locale !== undefined && !["id", "en"].includes(locale)) {
    return res.status(400).json({ error: "invalid locale" });
  }
  if (password !== undefined && password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  if (avatarUrl && (!avatarUrl.startsWith("data:image/") || avatarUrl.length > MAX_AVATAR_LENGTH)) {
    return res.status(400).json({ error: "invalid or oversized avatar image" });
  }

  const user = await prisma.user.update({
    where: { id: req.authUser!.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(theme !== undefined ? { theme } : {}),
      ...(locale !== undefined ? { locale } : {}),
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
    },
  });
  res.json({ user: await serializeUser(user) });
});
