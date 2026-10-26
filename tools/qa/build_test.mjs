// Test-only build: the Poki target with the playtest bot hook (window.__play) switched on.
// Never shipped. Usage: node build_test.mjs <repo> <outdir>
import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [repo, outArg] = process.argv.slice(2);
const root = resolve(repo);
const out = resolve(outArg);
const game = JSON.parse(readFileSync(join(root, 'src/game.json'), 'utf8'));
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(join(root, 'public'), out, { recursive: true });
const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace('<!-- PORTAL_SDK -->', '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>')
  .replaceAll('%GAME_TITLE%', game.title)
  .replaceAll('%GAME_BG%', game.background)
  .replace('<script type="module" src="/src/main.ts"></script>', '<link rel="stylesheet" href="./assets/main.css"><script type="module" src="./assets/main.js"></script>');
writeFileSync(join(out, 'index.html'), html);
const hook = {
  name: 'hook',
  setup(build) {
    build.onLoad({ filter: /PlayScene\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const a = "if (__TARGET__ === 'web') (window as unknown as { __play?: PlayScene }).__play = this;";
      if (!src.includes(a)) throw new Error('hook line not found');
      return { contents: src.replace(a, a.replace("__TARGET__ === 'web'", 'true')), loader: 'ts' };
    });
  },
};
await esbuild.build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  outdir: join(out, 'assets'),
  entryNames: 'main',
  assetNames: '[name]-[hash]',
  loader: { '.woff2': 'file', '.woff': 'file', '.json': 'json', '.png': 'file', '.wav': 'file' },
  alias: { '@core': join(root, 'core') },
  nodePaths: ['/home/claude/nm'],
  define: { __TARGET__: '"poki"', __GAME_ID__: JSON.stringify(game.id) },
  logLevel: 'error',
  legalComments: 'none',
  plugins: [hook],
});
console.log('built', out);
