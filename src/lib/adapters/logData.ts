export type Data = Record<string, unknown>;
export function object(value: unknown): Data | undefined {
  if (typeof value === "string") value = JSON.parse(value);
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : undefined;
}
export function cards(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map(v => typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v);
  return result.every(v => typeof v === "number" && Number.isSafeInteger(v) && v > 0) ? result as number[] : undefined;
}
export function position(pack: unknown, pick: unknown, offset: number) {
  if (typeof pack !== "number" || typeof pick !== "number" || !Number.isSafeInteger(pack) || !Number.isSafeInteger(pick) || pack + offset < 0 || pick + offset < 0) return undefined;
  return { packNumber: pack + offset, pickNumber: pick + offset };
}
export const text = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
