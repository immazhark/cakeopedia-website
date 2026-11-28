// Previews disallow everything; only an explicit production build (PUBLIC_SITE_ENV=production) is crawlable.
import { robotsLines } from '../data/crawlers';
import { SITE } from '../site';
const body = robotsLines(import.meta.env.PUBLIC_SITE_ENV === 'production', SITE);

export const GET = () => new Response(body.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
