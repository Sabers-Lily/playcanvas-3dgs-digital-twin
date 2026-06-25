import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'src');
const distDir = resolve(rootDir, 'dist');

mkdirSync(distDir, { recursive: true });

if (existsSync(srcDir)) {
  cpSync(srcDir, distDir, { recursive: true });
}

console.log('[API] build completed');
