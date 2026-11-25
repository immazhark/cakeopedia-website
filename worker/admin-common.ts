export interface Stmt {
  bind(...values: (string | number | null)[]): Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface AdminDb { prepare(sql: string): Stmt; batch(statements: Stmt[]): Promise<unknown[]> }
export const STATUSES = ['new', 'replied', 'quoted', 'confirmed', 'closed'] as const;
export type Status = (typeof STATUSES)[number];
export const isStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Current status = latest event, else the legacy column ('booked' reads as 'confirmed'). `e` is the enquiries alias. */
export const CURRENT = `COALESCE((SELECT ev.status FROM enquiry_events ev WHERE ev.enquiry_id = e.id ORDER BY ev.created_at DESC, ev.rowid DESC LIMIT 1),
  CASE e.status WHEN 'booked' THEN 'confirmed' ELSE e.status END)`;
export const out = (status: number, body?: object) => new Response(body ? JSON.stringify(body) : null, { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export const isCents = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= 10_000_000;
export function isDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000 && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
}
export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const optText = (v: unknown, max: number): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(v) ? (v.trim() || null) : undefined;
