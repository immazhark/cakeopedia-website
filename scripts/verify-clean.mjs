// Runs checks/build in a mirror OUTSIDE OneDrive. Why: inside OneDrive, node_modules files are cloud reparse points and
// Vite/Astro fail to resolve them ("Tsconfig not found astro/tsconfigs/strictest"). The original folder is only read, never changed.
// Usage: node scripts/verify-clean.mjs [command ...]   (default: the same sequence as `npm run verify`, with no .env files)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const src = process.cwd();
const dest = join(process.env.LOCALAPPDATA ?? process.env.TMPDIR ?? '/tmp', 'cakeopedia-build');
const run = (cmd, cwd, shell = true) => { const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell }); if (r.status !== 0) { console.error(`failed: ${cmd}`); process.exit(r.status ?? 1); } };
mkdirSync(dest, { recursive: true });
for (const f of ['.env', '.env.staging', '.env.production', '.env.local', 'wrangler.staging.jsonc', 'wrangler.production.jsonc']) rmSync(join(dest, f), { force: true }); // a previous deploy build must not leak into verification
// Mirror source (robocopy /MIR deletes only inside dest); node_modules, git history and build output stay out.
const rc = spawnSync('robocopy', [src, dest, '/MIR', '/XD', 'node_modules', '.git', 'dist', 'browser-check-out', '.wrangler', '.astro', '/XF', '*.tmp', '.env', '.env.*', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'inherit' });
if ((rc.status ?? 16) >= 8) { console.error('mirror failed'); process.exit(1); }
const lock = join(src, 'package-lock.json'), stamp = join(dest, 'node_modules', '.lock-stamp');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== readFileSync(lock, 'utf8')) { run('npm ci', dest); copyFileSync(lock, stamp); }
// Hermetic by design: gitignored .env files are never mirrored, so the default build is a closed, non-indexable preview and every
// built-output test runs against exactly what CI sees. Builds meant for deployment use scripts/stage-env.mjs (below), never this pipeline.
const cmds = process.argv.length > 2 ? [process.argv.slice(2).join(' ')] : ['npm run check', 'npm test', 'npm run build', 'node --test tests/build.test.mjs tests/production-output.test.mjs', 'node --test tests/seo-output.test.mjs'];
for (const c of cmds) run(c, dest);
// Deployable staging build, only after everything above passed: STAGING_BUILD=1 copies the gitignored staging env and Worker config into the mirror.
if (process.env.STAGING_BUILD === '1') {
  for (const f of ['.env.staging', 'wrangler.staging.jsonc']) if (existsSync(join(src, f))) copyFileSync(join(src, f), join(dest, f)); else { console.error(`missing ${f}`); process.exit(1); }
  run('npx astro build --mode staging', dest);
  console.log('staging build ready: deploy with  (cd mirror) npx wrangler deploy --config wrangler.staging.jsonc');
}
console.log(`ok (mirror: ${dest})`);
