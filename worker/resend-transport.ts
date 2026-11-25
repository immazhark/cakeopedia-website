import type { Delivery } from './outbox.ts';

// The caller must persist the complete serialized payload before its first attempt.
// This transport does not resolve recipients or construct mutable messages.
const endpoint = 'https://api.resend.com/emails';
const maxResponseBytes = 16_384;
const unknown: Delivery = { kind: 'unknown' };

async function readSmallObject(response: Response, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let body = '';
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) {
        if (signal.aborted) return null;
        const value: unknown = JSON.parse(body + decoder.decode());
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
      }
      bytes += chunk.value.byteLength;
      if (bytes > maxResponseBytes) return null;
      body += decoder.decode(chunk.value, { stream: true });
    }
    return null;
  } catch { return null; }
  finally { signal.removeEventListener('abort', cancel); cancel(); }
}

function retryDelay(value: string | null): number | undefined {
  if (!value) return undefined;
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isSafeInteger(ms) ? Math.max(0, ms) : undefined;
}

export async function sendResendEmail(apiKey: string, key: string, serializedPayload: string,
  transport: typeof fetch, timeoutMs = 8_000): Promise<Delivery> {
  if (!/^[\x21-\x7e]{1,512}$/.test(apiKey) || !/^[\x21-\x7e]{1,256}$/.test(key) ||
      !serializedPayload || serializedPayload.length > 16_384 || new TextEncoder().encode(serializedPayload).byteLength > 16_384 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) return { kind: 'permanent' };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Delivery>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(unknown); }, timeoutMs);
  });
  const request = async (): Promise<Delivery> => {
    try {
      const response = await transport(endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: serializedPayload,
      });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return unknown; }
      if (response.ok || response.status === 409) {
        const body = await readSmallObject(response, controller.signal);
        if (response.ok && typeof body?.id === 'string' && /^[a-zA-Z0-9_-]{1,256}$/.test(body.id)) return { kind: 'accepted', providerId: body.id };
        if (response.status === 409 && body?.name === 'concurrent_idempotent_requests') return { kind: 'retry', reason: 'temporary' };
        // A conflicting payload may correspond to a previously accepted send. Never assert rejection.
        return unknown;
      }
      void response.body?.cancel().catch(() => {});
      if (response.status === 429) {
        const retryAfterMs = retryDelay(response.headers.get('Retry-After'));
        return retryAfterMs === undefined ? { kind: 'retry', reason: 'quota' } : { kind: 'retry', reason: 'quota', retryAfterMs };
      }
      if ([400, 401, 403, 404, 405, 413, 415, 422].includes(response.status)) return { kind: 'permanent' };
      return unknown;
    } catch { return unknown; }
  };
  try { return await Promise.race([deadline, request()]); }
  finally { clearTimeout(timer); }
}
