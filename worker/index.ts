import { liveHandler, type Env } from './live.ts';

// Closed unless every gate and secret in live.ts is present and valid. Request headers can never open it.
const closed = () => Response.json({ error: 'intake_not_enabled' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const live = liveHandler(env);
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ stage: live ? 'live' : 'local-foundation', intakeEnabled: live !== null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return live ? live.fetch(request) : closed();
  },
  async scheduled(_event: unknown, env?: Env): Promise<void> { await liveHandler(env)?.scheduled(); },
};
