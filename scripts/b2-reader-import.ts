// Puts the READ-ONLY Backblaze recovery key (from Bitwarden) into the secrets folder for a restore drill, then removes it afterwards. RUN IT YOURSELF:
//   node scripts/b2-reader-import.ts            asks for the key ID, then the application key at a HIDDEN prompt (paste from Bitwarden)
//   node scripts/b2-reader-import.ts --remove   deletes the file again when the drill is over
// The key is validated with one list request; a rejected key is not kept. Nothing is printed except OK/failed. Clear your clipboard afterwards.
import { existsSync, rmSync } from 'node:fs';
import { B2, credsPath, saveCreds, s3 } from './b2-lib.ts';
import { ask } from './prompt.ts';

try {
  const file = credsPath('reader');
  if (process.argv.includes('--remove')) {
    if (existsSync(file)) rmSync(file, { force: true });
    console.log('Reader key file removed from this PC (it stays in Bitwarden).');
  } else {
    const accessKeyId = await ask('Recovery (reader) key ID: ', false);
    const secretAccessKey = await ask('Recovery (reader) application key (hidden): ', true);
    const creds = { endpoint: B2.endpoint, region: B2.region, bucket: B2.bucketName, accessKeyId, secretAccessKey, prefix: '' };
    const probe = await s3(creds, 'GET', '', { query: 'list-type=2&max-keys=1&prefix=backups%2F' });
    if (probe.status !== 200) throw new Error(`Backblaze rejected that key (HTTP ${probe.status}). Nothing was saved.`);
    saveCreds(file, creds);
    console.log('Reader key accepted and saved for the drill. When finished run: node scripts/b2-reader-import.ts --remove');
  }
} catch (e) { console.error('STOPPED: ' + (e instanceof Error ? e.message : String(e))); process.exitCode = 1; }
