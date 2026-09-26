// `npm start`: installs dependencies on the first run, then starts the dev server.
// Arguments after `--` go to Vite, e.g. `npm start -- --host` to open from a phone.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(vite)) {
  console.log('Первый запуск: ставлю зависимости (npm install)…');
  const install = spawnSync('npm', ['install'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (install.status !== 0) {
    console.error('npm install не удался, см. вывод выше.');
    process.exit(install.status ?? 1);
  }
}

const server = spawnSync(process.execPath, [vite, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(server.status ?? 0);
