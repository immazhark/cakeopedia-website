// Build-time pull of the owner's published catalogue into src/data/catalogue-approved.json.
// No CATALOGUE_URL: do nothing (the committed snapshot or seed is used). Nothing published yet (404): keep the file.
// Any other failure or an invalid snapshot fails the build, so a broken pull can never silently revert prices on the public site.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { parseCatalogue } from '../src/data/catalogue.ts';

const url = process.env.CATALOGUE_URL;
if (!url) process.exit(0);
if (!url.startsWith('https://')) throw new Error('CATALOGUE_URL must be https');
const target = new URL('../src/data/catalogue-approved.json', import.meta.url);
const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
if (res.status === 404) { console.log('catalogue: nothing published yet; keeping current data'); process.exit(0); }
if (!res.ok) throw new Error(`catalogue pull failed: HTTP ${res.status}`);
const { version, catalogue } = await res.json();
const next = JSON.stringify(parseCatalogue(catalogue), null, 2) + '\n';
const prev = await readFile(target, 'utf8').catch(() => '');
if (prev !== next) { await writeFile(new URL('catalogue-approved.json.tmp', target), next); await rename(new URL('catalogue-approved.json.tmp', target), target); }
console.log(`catalogue: version ${version} ${prev === next ? 'unchanged' : 'written'}`);
