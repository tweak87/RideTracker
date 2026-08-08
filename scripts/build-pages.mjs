import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const output = path.resolve(root, process.argv[2] || 'dist');
const version = process.env.VERSION || process.env.GITHUB_SHA || 'local-build';
const updates = [
  'update11.js','update12.js','update13.js','update14.js','update15.js','update16.js','update17.js','update18.js','update19.js',
  'update23.js','update24.js','update25.js','update26.js','update27.js','update28.js','update29.js',
  'update33.js','update34.js','update35.js','update36.js','update37.js','update38.js','update39.js','update40.js','update41.js','update42.js','update43.js','update44.js','update45.js','update46.js','update47.js',
  'update49.js','update50.js','update51.js','update52.js','update53.js','update54.js','update55.js','update56.js','update57.js','update58.js','update59.js','update60.js','update61.js','update62.js','update63.js'
];
const auditScripts = ['prepare-pages.mjs','audit-web-startup.mjs','audit-frontend-managers.mjs','audit-runtime-regressions.mjs'];

function copyFile(relative, destination = relative) {
  const source = path.join(root, relative);
  const target = path.join(output, destination);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.copyFileSync(source, target);
}
function copyDirectory(relative, destination = relative) {
  fs.cpSync(path.join(root, relative), path.join(output, destination), { recursive:true });
}
function run(file) {
  const result = spawnSync(process.execPath, [file], { cwd:output, stdio:'inherit' });
  if (result.status !== 0) throw new Error(`${file} failed with exit code ${result.status}`);
}
function scriptTag(source, module = false) {
  return `<script${module?' type="module"':''} src="${source}?v=${version}"></script>`;
}

fs.rmSync(output, { recursive:true, force:true });
fs.mkdirSync(path.join(output, 'shared'), { recursive:true });
copyFile('index.html');
for (const update of updates) copyFile(update);
copyDirectory('core');
for (const directory of ['shared/ride-engine','shared/overlay','shared/devices','shared/core','shared/visualization']) copyDirectory(directory);
for (const script of auditScripts) copyFile(`scripts/${script}`, `scripts/${script}`);

run('scripts/prepare-pages.mjs');

const tags = [
  scriptTag('core/storage/web-database-service.js'),
  scriptTag('shared/ride-engine/gps-speed.js'),
  scriptTag('shared/core/community-model.js'),
  scriptTag('shared/core/community-backend.js'),
  scriptTag('shared/visualization/track-3d.js'),
  scriptTag('shared/core/release-manifest.js'),
  scriptTag('shared/ride-engine/browser-adapter.js', true),
  scriptTag('update11.js', true),scriptTag('update12.js', true),scriptTag('update13.js'),scriptTag('update14.js'),scriptTag('update16.js'),scriptTag('update15.js'),scriptTag('update17.js'),scriptTag('update18.js'),scriptTag('update19.js'),
  scriptTag('update23.js'),scriptTag('update24.js'),scriptTag('update25.js'),scriptTag('update26.js'),scriptTag('update27.js'),scriptTag('update28.js'),scriptTag('update29.js'),
  scriptTag('update33.js'),scriptTag('update34.js'),scriptTag('update35.js'),scriptTag('update36.js'),scriptTag('update37.js'),
  scriptTag('core/adapters/web-runtime-adapter.mjs', true),scriptTag('core/adapters/web-plugin-runtimes.mjs', true),
  scriptTag('update38.js'),scriptTag('update39.js'),scriptTag('update43.js'),scriptTag('update44.js'),scriptTag('update45.js'),scriptTag('update41.js'),scriptTag('update42.js'),scriptTag('update40.js'),scriptTag('update46.js'),scriptTag('update47.js'),scriptTag('update49.js'),
  scriptTag('core/adapters/web-plugin-ui.mjs', true),scriptTag('update50.js'),scriptTag('update51.js'),scriptTag('update52.js'),scriptTag('update53.js'),scriptTag('update54.js'),scriptTag('update55.js'),scriptTag('update56.js'),scriptTag('update57.js'),scriptTag('update58.js'),scriptTag('update59.js'),scriptTag('update60.js'),scriptTag('update61.js'),scriptTag('update62.js'),scriptTag('update63.js')
];
let html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
if (!html.includes('</body>')) throw new Error('Built index.html has no closing body tag');
html = html.replace('</body>', `${tags.join('')}</body>`);
if (!html.includes('http-equiv="Cache-Control"')) html = html.replace('<head>', '<head><meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0">');
fs.writeFileSync(path.join(output, 'index.html'), html);
fs.writeFileSync(path.join(output, '.nojekyll'), '');

for (const audit of ['scripts/audit-web-startup.mjs','scripts/audit-frontend-managers.mjs','scripts/audit-runtime-regressions.mjs']) run(audit);
console.log(`Canonical pages build passed: ${output} (${version})`);
