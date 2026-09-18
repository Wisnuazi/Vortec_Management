export type SortDir = "asc" | "desc";

export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows<T>(rows: T[], getValue: (row: T) => unknown, dir: SortDir): T[] {
  const sorted = [...rows].sort((a, b) => compareValues(getValue(a), getValue(b)));
  return dir === "asc" ? sorted : sorted.reverse();
}
