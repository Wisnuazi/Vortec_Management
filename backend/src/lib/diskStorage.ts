/**
 * DEC-064 — Attachment disk storage.
 *
 * Files are written to disk under ATTACHMENT_BASE_PATH / <subfolder> /
 * with a UUID filename to avoid collisions. The absolute path is stored in
 * Attachment.diskPath and served via GET /api/files/:id.
 *
 * Subfolder conventions:
 *   tasks              → project task attachments
 *   documents          → project document checklist attachments
 *   material-requests  → material request attachments
 *   daily-reports      → daily report attachments
 *
 * ATTACHMENT_BASE_PATH defaults to D:\Internal Vortec\Vortec Management\attachment.
 * Can be overridden via the ATTACHMENT_BASE_PATH environment variable.
 */

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export const ATTACHMENT_BASE_PATH =
  process.env.ATTACHMENT_BASE_PATH ??
  // Docker container default (Linux). When running locally on Windows
  // without Docker, set ATTACHMENT_BASE_PATH in backend/.env instead.
  "/data/attachments";

export type AttachmentSubfolder =
  | "tasks"
  | "documents"
  | "material-requests"
  | "daily-reports"
  | "workflows"
  | "sops";

/** Returns the absolute path for a new attachment file. Creates the
 *  subfolder if it doesn't exist. The file is NOT written here — call
 *  caller writes the buffer; this only reserves the path. */
export async function prepareDiskPath(
  subfolder: AttachmentSubfolder,
  originalFileName: string
): Promise<{ diskPath: string; fileName: string }> {
  const folder = path.join(ATTACHMENT_BASE_PATH, subfolder);
  await fs.mkdir(folder, { recursive: true });
  const ext = path.extname(originalFileName);
  const storedName = `${randomUUID()}${ext}`;
  const diskPath = path.join(folder, storedName);
  return { diskPath, fileName: storedName };
}

/** Write a Buffer to disk at diskPath. */
export async function writeDiskFile(diskPath: string, buffer: Buffer): Promise<void> {
  await fs.writeFile(diskPath, buffer);
}

/** Delete a file by its disk path. Silently succeeds if the file is already
 *  gone (e.g. the row was deleted before the file). */
export async function deleteDiskFile(diskPath: string): Promise<void> {
  try {
    await fs.unlink(diskPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
