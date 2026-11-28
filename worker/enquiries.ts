import { fingerprint, InvalidInput, validate } from './contract.ts';
import { Conflict, EnquiryStore } from './store.ts';

export interface Dependencies {
  store: EnquiryStore;
  origin: string;
  creationIds: ReadonlySet<string>;
  allowRequest: (request: Request) => Promise<boolean>;
  verifyBot: (token: string) => Promise<boolean>;
  /** Required to accept attachmentIds: true only if all belong, unattached, to this submission. */
  ownsUploads?: (submissionId: string, ids: string[]) => Promise<boolean>;
}
const maxBytes = 12288;
class TooLarge extends Error {}
async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidInput();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new TooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InvalidInput(); }
}
function response(status: number, value: object): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function handleEnquiry(request: Request, deps: Dependencies): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  if (request.headers.get('Origin') !== deps.origin) return response(403, { error: 'forbidden' });
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return response(415, { error: 'unsupported_media_type' });
  try {
    // Limit replay traffic too. Origin is an abuse signal, never authentication.
    if (!await deps.allowRequest(request)) return response(429, { error: 'try_later' });
    const { enquiry, botToken } = validate(await readBody(request), deps.creationIds);
    const hash = await fingerprint(enquiry);
    const previous = await deps.store.find(enquiry.submissionId);
    if (previous) {
      if (previous.hash !== hash) throw new Conflict();
      // Safe retry after a lost response: do not consume the same single-use bot token.
      return response(200, { received: true, reference: previous.reference, notificationStatus: 'pending' });
    }
    if (enquiry.attachmentIds.length > 0 && !(await deps.ownsUploads?.(enquiry.submissionId, enquiry.attachmentIds))) throw new InvalidInput();
    if (!await deps.verifyBot(botToken)) return response(400, { error: 'verification_failed' });
    const result = await deps.store.save(enquiry, hash);
    return response(result.replay ? 200 : 201, { received: true, reference: result.receipt.reference, notificationStatus: 'pending' });
  } catch (error) {
    if (error instanceof TooLarge) return response(413, { error: 'payload_too_large' });
    if (error instanceof InvalidInput) return response(400, { error: 'invalid_input' });
    if (error instanceof Conflict) return response(409, { error: 'submission_conflict' });
    // Never leak payloads, provider errors, tokens or SQL into the response/logs.
    return response(503, { error: 'receipt_unconfirmed', retrySameSubmission: true });
  }
}
