import { rm, writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';

// PUBLIC_SITE_ENV=production marks a deliberate launch build: indexable, no internal concept routes.
const production = process.env.PUBLIC_SITE_ENV === 'production';

// _headers is generated so a preview's X-Robots-Tag: noindex can never leak into a launch build
// (robots.txt and the meta tag follow the same flag).
const headers = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  "  Content-Security-Policy: frame-ancestors 'none'", // the meta CSP cannot set frame-ancestors
  '  X-Frame-Options: DENY',
  ...(production ? [] : ['  X-Robots-Tag: noindex, nofollow']),
  '/admin/*',
  '  X-Robots-Tag: noindex, nofollow',
  '  Cache-Control: no-store',
  '/media/*',
  '  Cache-Control: public, max-age=31536000, immutable',
].join('\n') + '\n';

const envOutput = {
  name: 'env-output',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      if (production) await rm(new URL('concepts/', dir), { recursive: true, force: true });
      await writeFile(new URL('_headers', dir), headers);
    },
  },
};

// The dev proxy only applies to `astro dev`: the local form talks to the local Worker (npm run dev:api) same-origin.
// Hash-based CSP (Astro emits a <meta> for static pages). Turnstile needs its script, frame and verification calls.
const turnstile = 'https://challenges.cloudflare.com';
const csp = {
  scriptDirective: { resources: ["'self'", turnstile] },
  styleDirective: { resources: [{ resource: "'unsafe-inline'", kind: 'attribute' }] },
  directives: ["default-src 'self'", `frame-src ${turnstile}`, `connect-src 'self' ${turnstile}`, "img-src 'self' blob: data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'"],
};
export default defineConfig({ output: 'static', security: { csp }, devToolbar: { enabled: false }, integrations: [envOutput], vite: { server: { proxy: { '/api': 'http://127.0.0.1:8787', '/admin/api': 'http://127.0.0.1:8787' } } } });
