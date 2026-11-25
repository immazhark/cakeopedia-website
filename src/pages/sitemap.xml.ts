import { creations, categories } from '../data/creations';
import { SITE } from '../site';

// Only a deliberate production build lists URLs; previews publish an empty sitemap.
const production = import.meta.env.PUBLIC_SITE_ENV === 'production';
const paths = ['/', '/menu/', '/size-guide/', '/cake-care/', '/faq/', '/creations/', '/story/', '/enquiry/', ...Object.keys(categories).map((k) => `/collections/${k}/`), ...creations.map((c) => `/creations/${c.slug}/`)];
const urls = (production ? paths : []).map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('\n');

export const GET = () => new Response(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
