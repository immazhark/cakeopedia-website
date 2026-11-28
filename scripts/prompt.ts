// Interactive prompt for terminal scripts. A hidden prompt reads raw key presses, echoes nothing and keeps the value in memory only.
export function ask(prompt: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (hidden && !stdin.isTTY) return reject(new Error('This must run in an interactive terminal so the secret can be typed hidden.'));
    process.stdout.write(prompt);
    let buf = '';
    if (hidden) stdin.setRawMode(true);
    stdin.resume(); stdin.setEncoding('utf8');
    const cleanup = () => { stdin.off('data', onData); if (hidden) stdin.setRawMode(false); stdin.pause(); };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') { cleanup(); return reject(new Error('Cancelled.')); }
        if (ch === '\r' || ch === '\n') { cleanup(); process.stdout.write('\n'); return resolve(hidden ? buf : buf.trim()); }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1); else if (ch >= ' ') buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}
