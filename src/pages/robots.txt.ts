// Previews disallow everything; only an explicit production build (PUBLIC_SITE_ENV=production) is crawlable.
const production = import.meta.env.PUBLIC_SITE_ENV === 'production';
const body = production ? ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin/', 'Sitemap: https://cakeopedia.com/sitemap.xml'] : ['User-agent: *', 'Disallow: /'];

export const GET = () => new Response(body.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
