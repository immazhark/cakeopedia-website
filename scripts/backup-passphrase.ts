// Stores the backup passphrase protected by Windows DPAPI. RUN THIS YOURSELF in a normal terminal (not through an assistant):
//   node scripts/backup-passphrase.ts set       paste the passphrase from your password manager at the hidden prompt (twice); nothing is echoed
//   node scripts/backup-passphrase.ts check     proves the stored passphrase can be read back; prints only OK and its length, never the value
// The passphrase never appears in arguments, environment variables, files (the stored file is DPAPI-encrypted), logs or output.
import { ask } from './prompt.ts';
import { hasStoredPassphrase, passphraseFile, readPassphrase, storePassphrase, validatePassphrase } from './backup-secret.ts';

try {
  const command = process.argv[2];
  if (command === 'set') {
    const first = await ask('Backup passphrase (hidden): ', true);
    validatePassphrase(first);
    const second = await ask('Type it again to confirm (hidden): ', true);
    if (first !== second) throw new Error('The two entries do not match. Nothing was stored.');
    storePassphrase(first);
    const back = readPassphrase();
    if (back !== first) throw new Error('Stored value did not read back identically. Nothing is safe to rely on: run set again.');
    console.log(`Stored (Windows DPAPI, this user and machine only): ${passphraseFile()}`);
    console.log(`Read-back check OK (${first.length} characters). Keep the Bitwarden note: it is the only recovery copy if this PC is lost.`);
  } else if (command === 'check') {
    if (!hasStoredPassphrase()) throw new Error('No passphrase is stored. Run: node scripts/backup-passphrase.ts set');
    const p = readPassphrase();
    console.log(`OK: a passphrase of ${p?.length} characters can be read by this Windows user.`);
  } else throw new Error('Usage: node scripts/backup-passphrase.ts set | check');
} catch (e) {
  console.error('STOPPED: ' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
