// Crawler policy for a production build. Search indexing and AI-search retrieval are allowed so the business can be found and cited;
// bots that collect content to train models are refused. DEFAULT PENDING OWNER CONFIRMATION: change here if the owner decides otherwise.
export const trainingCrawlers = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended', 'Bytespider', 'meta-externalagent', 'Amazonbot'] as const;

export function robotsLines(production: boolean, site: string): string[] {
  if (!production) return ['User-agent: *', 'Disallow: /']; // previews are never crawlable
  return [
    ...trainingCrawlers.flatMap((bot) => [`User-agent: ${bot}`, 'Disallow: /', '']),
    'User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin/', '',
    `Sitemap: ${site}/sitemap.xml`,
  ];
}
