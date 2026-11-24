// Intentionally closed entry point. No live intake until auth, abuse controls,
// verified bot adapter, retention and provider gates have been proven.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ stage: 'local-foundation', intakeEnabled: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: 'intake_not_enabled' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  },
};
