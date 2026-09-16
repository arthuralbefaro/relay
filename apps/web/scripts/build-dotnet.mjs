import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const project = join(root, 'dotnet', 'Relay.Nodes.Wasm');
const out = join(root, 'dist', 'wasm');
const target = resolve(here, '..', 'public', 'dotnet', '_framework');

rmSync(out, { recursive: true, force: true });
execSync(`dotnet publish "${project}" -c Release -o "${out}"`, { stdio: 'inherit' });

const framework = join(out, 'wwwroot', '_framework');
if (!existsSync(join(framework, 'dotnet.js'))) {
  // Falha alto: o layout do publish muda entre versões do SDK.
  console.error(`dotnet.js não encontrado em ${framework}`);
  console.error('conteúdo de dist/wasm:', readdirSync(out, { recursive: true }).slice(0, 40));
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(framework, target, { recursive: true });
console.log(`runtime .NET copiado para ${target}`);