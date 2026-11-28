export interface Enquiry {
  submissionId: string;
  name: string;
  contact: { kind: 'email' | 'phone' | 'instagram'; value: string };
  eventDate: string | null;
  dateUndecided: boolean;
  occasion: string | null;
  servings: number | null;
  notes: string | null;
  size: string | null;
  flavour: string | null;
  addons: string[];
  fulfilment: 'pickup' | 'delivery' | 'not-sure';
  budgetCents: number | null;
  creationIds: string[];
  attachmentIds: string[];
}
export class InvalidInput extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = new Set(['submissionId', 'name', 'contact', 'eventDate', 'dateUndecided', 'occasion', 'servings', 'notes', 'creationIds', 'botToken', 'size', 'flavour', 'addons', 'fulfilment', 'budgetCents', 'privacyAck', 'attachmentIds']);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidInput();
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new InvalidInput();
    return null;
  }
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value)) throw new InvalidInput();
  const result = value.trim();
  if (required && !result) throw new InvalidInput();
  return result || null;
}
export function validate(value: unknown, allowedCreations: ReadonlySet<string>): { enquiry: Enquiry; botToken: string } {
  const data = object(value);
  if (Object.keys(data).some(key => !fields.has(key))) throw new InvalidInput();
  if (typeof data.submissionId !== 'string' || !uuid.test(data.submissionId)) throw new InvalidInput();
  const contact = object(data.contact);
  if (Object.keys(contact).some(key => !['kind', 'value'].includes(key))) throw new InvalidInput();
  const kind = contact.kind;
  if (kind !== 'email' && kind !== 'phone' && kind !== 'instagram') throw new InvalidInput();
  let contactValue = text(contact.value, 254, true)!;
  if (kind === 'email' && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(contactValue)) throw new InvalidInput();
  if (kind === 'phone') {
    // Normalise to digits (+ optional leading plus): 10-15 digits covers US and international numbers.
    const digits = contactValue.replace(/[\s().-]/g, '');
    if (!/^\+?\d{10,15}$/.test(digits)) throw new InvalidInput();
    contactValue = digits;
  }
  if (kind === 'instagram') {
    contactValue = contactValue.replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(contactValue)) throw new InvalidInput();
  }
  if (data.privacyAck !== true) throw new InvalidInput();
  const eventDate = text(data.eventDate, 10);
  if (eventDate && (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number(eventDate.slice(0, 4)) < 2000 || Number.isNaN(Date.parse(eventDate + 'T00:00:00Z')) || new Date(eventDate + 'T00:00:00Z').toISOString().slice(0, 10) !== eventDate)) throw new InvalidInput();
  if (typeof data.dateUndecided !== 'boolean' || (eventDate !== null) === data.dateUndecided) throw new InvalidInput();
  const servings = data.servings ?? null;
  if (servings !== null && (typeof servings !== 'number' || !Number.isInteger(servings) || servings < 1 || servings > 10000)) throw new InvalidInput();
  const budget = data.budgetCents ?? null;
  if (budget !== null && (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 0 || budget > 10_000_000)) throw new InvalidInput();
  const fulfilment = data.fulfilment ?? 'not-sure';
  if (fulfilment !== 'pickup' && fulfilment !== 'delivery' && fulfilment !== 'not-sure') throw new InvalidInput();
  const addonList = data.addons ?? [];
  if (!Array.isArray(addonList) || addonList.length > 8) throw new InvalidInput();
  const addons = addonList.map(a => text(a, 60, true)!);
  const files = data.attachmentIds ?? [];
  if (!Array.isArray(files) || files.length > 3 || files.some(id => typeof id !== 'string' || !uuid.test(id))) throw new InvalidInput();
  const refs = data.creationIds ?? [];
  if (!Array.isArray(refs) || refs.length > 5 || refs.some(id => typeof id !== 'string' || !allowedCreations.has(id))) throw new InvalidInput();
  const enquiry: Enquiry = {
    submissionId: data.submissionId.toLowerCase(), name: text(data.name, 100, true)!,
    contact: { kind, value: contactValue }, eventDate, dateUndecided: data.dateUndecided,
    occasion: text(data.occasion, 100), servings, notes: text(data.notes, 2000), size: text(data.size, 100), flavour: text(data.flavour, 100),
    addons: [...new Set(addons)].sort(), fulfilment, budgetCents: budget,
    creationIds: [...new Set(refs as string[])].sort(),
    attachmentIds: [...new Set((files as string[]).map(id => id.toLowerCase()))].sort(),
  };
  return { enquiry, botToken: text(data.botToken, 2048) ?? '' };
}
export async function fingerprint(enquiry: Enquiry): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(enquiry)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
