// Creates the two least-privilege Backblaze B2 keys for the encrypted backups. RUN THIS YOURSELF in a normal terminal (not through an assistant):
//   node scripts/b2-keys.ts [--replace-stale]
// It asks for the account ID and the authorising key (ID, then the key typed at a HIDDEN prompt). The key is held in memory only and never printed, logged or saved.
// The two NEW keys are written to %LOCALAPPDATA%\cakeopedia-secrets\ (folder restricted to your Windows user, outside OneDrive and Git); only key IDs and
// capabilities are shown. The reader file is for YOU: move it into your password manager, then delete it from the folder.
// --replace-stale: delete same-named keys from an earlier run of this script (only if their permissions are exactly what this script creates) and recreate them.
import { setupKeys } from './b2-api.ts';
import { credsPath, saveCreds, secretsDir } from './b2-lib.ts';

function ask(prompt: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (hidden && !stdin.isTTY) return reject(new Error('This must run in an interactive terminal so the key can be typed hidden.'));
    process.stdout.write(prompt);
    let buf = '';
    if (hidden) stdin.setRawMode(true);
    stdin.resume(); stdin.setEncoding('utf8');
    const cleanup = () => { stdin.off('data', onData); if (hidden) stdin.setRawMode(false); stdin.pause(); };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') { cleanup(); return reject(new Error('Cancelled.')); }
        if (ch === '\r' || ch === '\n') { cleanup(); process.stdout.write('\n'); return resolve(buf.trim()); }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1); else if (ch >= ' ') buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

try {
  const accountId = await ask('Backblaze account ID (not secret): ', false);
  const authKeyId = await ask('Authorising key ID: ', false);
  const authKey = await ask('Authorising application key (hidden): ', true);
  await setupKeys({ accountId, authKeyId, authKey, replaceStale: process.argv.includes('--replace-stale') }, {
    fetchImpl: fetch, say: (l) => console.log(l), save: (role, c) => saveCreds(credsPath(role), c),
  });
  console.log(`\nSecrets were saved (not shown) in ${secretsDir()}`);
  console.log('NEXT: copy the reader file into your password manager and delete it from that folder; keep the writer file for the backup job.');
} catch (e) {
  console.error('\nSTOPPED: ' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
