// LOCAL DEVELOPMENT ONLY (wrangler.local.jsonc). The public entry point (index.ts) stays closed.
// Bot check and throttling are stubs here; real Turnstile and distributed limits are release gates.
import { handleEnquiry } from './enquiries.ts';
import { EnquiryStore, type Database } from './store.ts';

interface Env { DB: Database; LOCAL_DEV?: string }
const creationIds = new Set(['ruby-rose-mr-and-mrs', 'blush-rose-marble', 'crimson-cascade', 'pampas-and-peach-roses', 'pink-rose-crown', 'white-feather-bloom', 'love-three-tier', 'anniversary-neon-roses', 'texas-hearts-three-tier', 'gold-leaf-garden', 'vintage-piped-castle', 'vintage-fig-cross-stitch', 'blue-and-yellow-anniversary', 'polka-dot-roses', 'red-bow-birthday', 'balloon-he-or-she', 'blue-rainbow-pair', 'festive-orange-and-green', 'mini-cake-box-sign']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (env.LOCAL_DEV !== '1' || !['localhost', '127.0.0.1'].includes(url.hostname)) return Response.json({ error: 'intake_not_enabled' }, { status: 503 });
    if (url.pathname !== '/api/enquiries') return Response.json({ error: 'not_found' }, { status: 404 });
    return handleEnquiry(request, {
      store: new EnquiryStore(env.DB), origin: 'http://127.0.0.1:4321', creationIds,
      allowRequest: async () => true, verifyBot: async (token) => token === 'local-dev',
    });
  },
};
