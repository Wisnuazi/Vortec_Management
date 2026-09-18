/**
 * DEC-067: per-BOM-type Excel rekap generator.
 *
 * Used by `POST /api/projects/:id/bom/close` — when PM/OM closes the
 * project's BOM, this generates one .xlsx per non-empty BomType and
 * hands back the file path + a buffer-shaped summary that the route
 * can attach to the matching ProjectDocument (auto-checking its
 * `done` flag).
 *
 * Uses `exceljs` (already in package.json — no new dep).
 */

import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";
import { prepareDiskPath, writeDiskFile, type AttachmentSubfolder } from "./diskStorage";

export type RekapItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number | null;
  status: string; // BomItemStatus string
  notes: string;
  submittedByUserName: string;
  submittedAt: Date;
  approvedByUserName: string | null;
  approvedAt: Date | null;
  processedByUserName: string | null;
  purchaseNote: string;
};

export type RekapType = "MBOM" | "EBOM" | "SBOM" | "QBOM";

const TYPE_LABEL: Record<RekapType, { id: string; en: string }> = {
  MBOM: { id: "MBOM (Mekanikal)", en: "MBOM (Mechanical)" },
  EBOM: { id: "EBOM (Elektrikal)", en: "EBOM (Electrical)" },
  SBOM: { id: "SBOM (Software)", en: "SBOM (Software)" },
  QBOM: { id: "QBOM (Quality)", en: "QBOM (Quality)" },
};

const SUBFOLDER_BY_TYPE: Record<RekapType, AttachmentSubfolder> = {
  MBOM: "documents",
  EBOM: "documents",
  SBOM: "documents",
  QBOM: "documents",
};

/**
 * Build a clean Excel rekap for one BomType. The header row is in
 * Indonesian (matches the rest of the system); columns:
 *   No, Item, Jumlah, Satuan, Harga (Rp), Status,
 *   Diajukan Oleh, Tanggal Diajukan,
 *   Disetujui Oleh, Tanggal Disetujui,
 *   Catatan Pembelian
 *
 * A totals row at the bottom shows total quantity (per type) and
 * total spend (price × qty for items that have a price).
 */
export async function buildBomRekapWorkbook(
  type: RekapType,
  items: RekapItem[],
  projectName: string,
  locale: "id" | "en" = "id"
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vortec Management";
  wb.created = new Date();

  const sheetName = TYPE_LABEL[type][locale];
  const ws = wb.addWorksheet(sheetName);

  // Title rows — give the rekap context (project + type + generated-at)
  ws.addRow([`Vortec Management — Rekap ${TYPE_LABEL[type][locale]}`]);
  ws.addRow([locale === "id" ? `Project: ${projectName}` : `Project: ${projectName}`]);
  ws.addRow([
    locale === "id"
      ? `Dibuat: ${new Date().toLocaleString("id-ID")}`
      : `Generated: ${new Date().toLocaleString("en-US")}`,
  ]);
  ws.addRow([]); // spacer

  // Header row
  const headers = locale === "id"
    ? ["No", "Item", "Jumlah", "Satuan", "Harga (Rp)", "Status",
       "Diajukan Oleh", "Tanggal Diajukan",
       "Disetujui Oleh", "Tanggal Disetujui",
       "Catatan Pembelian", "Catatan Item"]
    : ["#", "Item", "Quantity", "Unit", "Price (Rp)", "Status",
       "Submitted By", "Submitted At",
       "Approved By", "Approved At",
       "Purchase Note", "Item Notes"];

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E6EF" },
    };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Item rows
  items.forEach((it, idx) => {
    const row = ws.addRow([
      idx + 1,
      it.name,
      it.quantity,
      it.unit,
      it.price ?? "",
      it.status,
      it.submittedByUserName,
      it.submittedAt,
      it.approvedByUserName ?? "",
      it.approvedAt ?? "",
      it.purchaseNote,
      it.notes,
    ]);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });
  });

  // Totals row
  const totalQty = items.reduce((acc, it) => acc + it.quantity, 0);
  const totalSpend = items.reduce((acc, it) => acc + (it.price ?? 0) * it.quantity, 0);
  const totalsLabel = locale === "id" ? "TOTAL" : "TOTAL";
  const totalsRow = ws.addRow([
    "",
    totalsLabel,
    totalQty,
    "",
    totalSpend,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  totalsRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF2CC" },
    };
  });

  // Column widths — pick widths that fit the data without truncation
  // for the typical item name + status text.
  const colWidths = [4, 36, 10, 10, 14, 18, 22, 18, 22, 18, 28, 24];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Date formatting on Submitted / Approved columns
  ws.getColumn(8).numFmt = "yyyy-mm-dd hh:mm";
  ws.getColumn(10).numFmt = "yyyy-mm-dd hh:mm";

  return wb;
}

/**
 * Write a workbook to disk and return the path + filename.
 *
 * The file is written under `ATTACHMENT_BASE_PATH/<subfolder>/<uuid>.xlsx`
 * where `<subfolder>` is the type's storage bucket (`documents` for all
 * four BOM types — they're project-document attachments, not top-level
 * task/material-request files).
 */
export async function writeBomRekapToDisk(
  projectId: string,
  type: RekapType,
  workbook: ExcelJS.Workbook
): Promise<{ diskPath: string; fileName: string; mimeType: string; fileSize: number }> {
  const subfolder = SUBFOLDER_BY_TYPE[type];
  const originalName = `Rekap-${type}-${projectId}-${Date.now()}.xlsx`;
  const { diskPath, fileName } = await prepareDiskPath(subfolder, originalName);

  const buffer = await workbook.xlsx.writeBuffer();
  await writeDiskFile(diskPath, Buffer.from(buffer));

  const stat = await fs.stat(diskPath);
  return {
    diskPath,
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileSize: stat.size,
  };
}
