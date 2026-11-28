import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { secretsDir } from './b2-lib.ts';
import { MIN_PASSPHRASE } from './backup-lib.ts';

// The backup passphrase is protected with Windows DPAPI (user scope): the file is an encrypted blob that only the SAME Windows user on the SAME machine can
// open. The plain passphrase is only ever passed to PowerShell on stdin or read back from its stdout pipe: never as a command-line argument, an environment
// variable, a file, a log line or terminal output. Anything running as that Windows user can still decrypt it: DPAPI protects the file at rest, not from
// the logged-in account, so the real recovery copy stays in the owner's password manager.
export const passphraseFile = () => join(secretsDir(), 'backup-passphrase.dpapi');

type Run = (script: string, stdin?: string) => string;
const powershell: Run = (script, stdin) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
  { encoding: 'utf8', input: stdin ?? '', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const quote = (p: string) => `'${p.replaceAll("'", "''")}'`;

export function validatePassphrase(p: string): void {
  if (p.length < MIN_PASSPHRASE) throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE} characters.`);
  if (/^\s|\s$/.test(p)) throw new Error('The passphrase must not start or end with a space.');
}

/** Encrypts the passphrase with DPAPI and writes it to the file (the folder is restricted to the current user by saveCreds/b2-keys). */
export function storePassphrase(plain: string, file = passphraseFile(), run: Run = powershell): void {
  if (process.platform !== 'win32' && run === powershell) throw new Error('DPAPI storage is Windows-only.');
  validatePassphrase(plain);
  mkdirSync(dirname(file), { recursive: true });
  run(`$p = [Console]::In.ReadToEnd(); ConvertTo-SecureString -String $p -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath ${quote(file)} -Encoding ascii`, plain);
}

/** Returns the passphrase, or null if none is stored. Decryption failure (other user or other machine) throws without any detail. */
export function readPassphrase(file = passphraseFile(), run: Run = powershell): string | null {
  if (!existsSync(file)) return null;
  let out: string;
  try {
    out = run(`$s = ConvertTo-SecureString -String ((Get-Content -LiteralPath ${quote(file)} -Raw).Trim()); $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }`);
  } catch { throw new Error('The stored passphrase could not be decrypted (it can only be read by the Windows user and machine that stored it). Run: node scripts/backup-passphrase.ts set'); }
  validatePassphrase(out);
  return out;
}

export const hasStoredPassphrase = (file = passphraseFile()) => existsSync(file) && readFileSync(file, 'ascii').trim().length > 20;
