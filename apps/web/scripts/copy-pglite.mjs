import { cpSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = fileURLToPath(import.meta.resolve('@electric-sql/pglite'));
const dist = dirname(entry);
const target = resolve(here, '..', 'public', 'pglite');

const files = readdirSync(dist);
if (!files.includes('index.js') || !files.some((f) => f.endsWith('.wasm'))) {
    console.error(`index.js ou .wasm não encontrados em ${dist}`);
    console.error('conteúdo: ', files);
    process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
console.log(`PGlite copiado para ${target}`);