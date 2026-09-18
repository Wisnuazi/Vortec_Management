import "dotenv/config";
import express, { type Response } from "express";
import cors from "cors";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { rolesRouter } from "./routes/roles";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { floorsRouter } from "./routes/floors";
import { materialsRouter } from "./routes/materials";
import { projectsRouter } from "./routes/projects";
import { purchasingRouter } from "./routes/purchasing";
import { vendorsRouter } from "./routes/vendors";
import { approvalsRouter } from "./routes/approvals";
import { notificationsRouter } from "./routes/notifications";
import { notificationsInboxRouter } from "./routes/notificationsInbox";
import { activityRouter } from "./routes/activity";
import { documentTemplatesRouter } from "./routes/documentTemplates";
import { bomRouter } from "./routes/bom";
import { operationalRouter } from "./routes/operational";
import { workflowsRouter } from "./routes/workflows";
import { sopsRouter } from "./routes/sops";
import { prisma } from "./prisma";
import { requireAuth, type AuthedRequest } from "./auth";

const app = express();
const port = Number(process.env.PORT ?? 4000);

// Comma-separated so the team can reach this machine over the LAN (e.g.
// "http://localhost:3000,http://192.168.1.23:3000") in addition to
// localhost — see DEC-039.
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins }));
// Honor X-Forwarded-For only from the local reverse proxy (see
// DEC-039/040 and src/rateLimit.ts). Must be set BEFORE any rate-limit
// middleware is mounted.
app.set("trust proxy", "loopback");
// 8MB attachment cap (enforced again per-file in routes/projects.ts) plus
// base64 + JSON overhead. Kasbon items can carry two 4MB evidence photos
// at once (routes/operational.ts), so this needs headroom beyond a single
// 8MB attachment.
app.use(express.json({ limit: "16mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// DEC-064: serve disk-stored attachment files. Any authenticated user can
// download any attachment they can already see (authorization on which
// attachments are visible to the caller is enforced by the project/task/MR
// read routes that return the attachment list — we simply stream the file
// here without re-checking entity-level permissions, mirroring how base64
// dataUrl attachments were served implicitly via the API response).
// Legacy dataUrl records fall back to sending the embedded data.
app.get("/api/files/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const attachment = await prisma.attachment.findUnique({
    where: { id: req.params.id },
    select: { diskPath: true, dataUrl: true, fileName: true, mimeType: true },
  });
  if (!attachment) { res.status(404).json({ error: "file not found" }); return; }

  if (attachment.diskPath) {
    try {
      const stat = await fs.stat(attachment.diskPath);
      res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);
      res.setHeader("Content-Length", stat.size);
      createReadStream(attachment.diskPath).pipe(res);
    } catch {
      res.status(404).json({ error: "file not found on disk" });
    }
  } else if (attachment.dataUrl) {
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);
    res.send(attachment.dataUrl);
  } else {
    res.status(404).json({ error: "file has no content" });
  }
});
app.use("/api/roles", rolesRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/floors", floorsRouter);
app.use("/api/materials", materialsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/purchasing", purchasingRouter);
app.use("/api/vendors", vendorsRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/notifications-inbox", notificationsInboxRouter);
app.use("/api/activity-log", activityRouter);
app.use("/api/document-templates", documentTemplatesRouter);
app.use("/api/bom", bomRouter);
app.use("/api/operational", operationalRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/sops", sopsRouter);

// Explicit 0.0.0.0 so the API is reachable from other machines on the LAN
// (not just this host) — matches the frontend dev server's own default.
app.listen(port, "0.0.0.0", () => {
  console.log(`Backend API listening on http://localhost:${port} (and on the LAN at this machine's IP)`);
});
