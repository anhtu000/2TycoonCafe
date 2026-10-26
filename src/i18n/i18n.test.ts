// Every language has every string of English (game and core) with the same {placeholders}. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

type Tree = { [k: string]: string | Tree };
const read = (url: URL): Tree => JSON.parse(readFileSync(url, 'utf8'));
const flat = (o: Tree, p = ''): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => (typeof v === 'string' ? { ...acc, [p + k]: v } : { ...acc, ...flat(v, `${p}${k}.`) }), {});
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const dir = new URL('./', import.meta.url);
const english = { ...flat(read(new URL('../../core/i18n/en.json', import.meta.url))), ...flat(read(new URL('en.json', dir))) };
const langs = readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f) && f !== 'en.json');

test('six languages ship with the game', () => {
  assert.deepEqual(langs.map((f) => f.slice(0, 2)).sort(), ['de', 'es', 'fr', 'it', 'tr']);
});

for (const file of langs) {
  test(`${file}: every English string, same placeholders, nothing extra`, () => {
    const t = flat(read(new URL(file, dir)));
    const missing = Object.keys(english).filter((k) => !(k in t));
    const extra = Object.keys(t).filter((k) => !(k in english));
    const wrong = Object.keys(english).filter((k) => k in t && holes(english[k]) !== holes(t[k]));
    const empty = Object.keys(t).filter((k) => !t[k].trim());
    assert.deepEqual({ missing, extra, wrong, empty }, { missing: [], extra: [], wrong: [], empty: [] });
  });
}
