import ExcelJS from "exceljs";

// Tiny shared xlsx builder used by the asset, material, and
// kasbon-submission export endpoints. Each route assembles the rows
// and column headers it wants and calls buildXlsx(); the helper returns
// a Buffer that the route streams as the response body. No styling is
// applied beyond a bold header row + frozen first row, so the file
// stays small and the per-route code stays the source of truth for
// which columns matter (DEC-061).

export type XlsxColumn<T> = {
  header: string;
  // A value-extractor for the cell. Returning null/undefined produces
  // an empty cell; numbers/dates go through as-is; strings are
  // written as-is (the caller is responsible for any currency/date
  // formatting — keeps the helper free of business logic).
  value: (row: T) => string | number | Date | null | undefined;
  // Optional column width in characters (Excel column width units).
  // 12 is the default; widen for long strings.
  width?: number;
};

export async function buildXlsx<T>(rows: T[], columns: XlsxColumn<T>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vortec Management";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Data");
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.header, width: c.width ?? 14 }));
  // Bold + freeze the header row.
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) {
    const rowData: Record<string, string | number | Date | null | undefined> = {};
    for (const col of columns) {
      rowData[col.header] = col.value(row);
    }
    sheet.addRow(rowData);
  }
  // Auto-size the header height so the bold row doesn't get clipped.
  sheet.getRow(1).height = 18;
  const buffer = await workbook.xlsx.writeBuffer();
  // exceljs returns ArrayBuffer on some platforms and Buffer on others;
  // normalize to a real Node Buffer so Express can stream it.
  return Buffer.from(buffer as ArrayBuffer);
}

// Sanitise a user-supplied string so it can be used as part of a
// Content-Disposition filename (strip path separators and other
// characters that browsers don't allow).
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-");
}
