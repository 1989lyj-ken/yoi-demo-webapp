// FSD-UI01 automated checks: components reference spec 1.24.0 tokens only (see the contract's 9 rules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (path) => relative(root, path).split(sep).join('/');
// FSD-05's dev-only spike page is not a product screen; it is excluded until the spike is decided.
const excluded = (path) => /(^|\/)gas-spike-test\./.test(rel(path)) || rel(path).startsWith('src/ui/icons/phosphor/');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
// Binary assets (the yoi logo image) are not source text.
const srcFiles = walk(join(root, 'src')).filter((path) => !excluded(path) && !/\.(jpe?g|png|gif|webp)$/i.test(path));
const cssFiles = srcFiles.filter((path) => path.endsWith('.css'));
const tsFiles = srcFiles.filter((path) => path.endsWith('.ts'));
const htmlFiles = ['index.html', 'ui-preview.html'].map((name) => join(root, name));
const read = (path) => readFileSync(path, 'utf8');

// Token definitions (spec ch. 12 block and [延伸] tokens) are the only place raw values may appear.
function componentCss(text) {
  const start = text.indexOf('/* ===== Design tokens');
  const end = text.indexOf('/* ===== End of token definitions');
  const body = start >= 0 && end > start ? text.slice(0, start) + text.slice(end) : text;
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^@import[^;]*;/gm, '');
}
function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    decls: m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(':');
      return { prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() };
    }),
  }));
}
const allRules = cssFiles.flatMap((path) => rules(componentCss(read(path))).map((r) => ({ ...r, file: rel(path) })));
const decls = allRules.flatMap((r) => r.decls.map((d) => ({ ...d, selector: r.selector, file: r.file })));

const NAMED = /\b(white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|brown|navy|silver|gold|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|indigo|violet|beige|crimson|coral|salmon|tomato|khaki)\b/i;
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(/i;
const withoutVars = (value) => value.replace(/var\(--[\w-]+(,[^)]*)?\)/g, 'var()');
const COLOR_ATTR = /\b(fill|stroke|stop-color|color)="([^"]*)"/g;
const ALLOWED_ATTR = /^(currentColor|none|transparent|inherit)$/;

test('1. colours: CSS declarations and markup colour attributes use tokens only', () => {
  const bad = decls.filter((d) => !d.prop.startsWith('--')).filter((d) => {
    const value = withoutVars(d.value);
    return RAW_COLOR.test(value) || NAMED.test(value);
  }).map((d) => `${d.file} ${d.selector} { ${d.prop}: ${d.value} }`);
  for (const path of [...tsFiles, ...htmlFiles]) {
    for (const m of read(path).matchAll(COLOR_ATTR)) {
      if (!ALLOWED_ATTR.test(m[2]) && !m[2].includes('${')) bad.push(`${rel(path)} ${m[0]}`);
    }
    for (const m of read(path).matchAll(/\bstyle="([^"]*)"/g)) {
      const props = m[1].split(';').map((d) => d.trim()).filter(Boolean);
      if (props.some((d) => !d.startsWith('--'))) bad.push(`${rel(path)} style="${m[1]}"`);
    }
  }
  assert.deepEqual(bad, []);
});

test('2. type: font and font-size reference --yx-type-* tokens (or inherit)', () => {
  const bad = decls.filter((d) => d.prop === 'font' || d.prop === 'font-size')
    .filter((d) => !/^(var\(--yx-type-[\w-]+\)|inherit)$/.test(d.value))
    .map((d) => `${d.file} ${d.selector} { ${d.prop}: ${d.value} }`);
  assert.deepEqual(bad, []);
});

test('3. letter-spacing is always 0', () => {
  const bad = decls.filter((d) => d.prop === 'letter-spacing' && !/^0(px|em)?$/.test(d.value)).map((d) => `${d.file} ${d.selector}`);
  assert.deepEqual(bad, []);
});

test('4. box-shadow is none or --yx-shadow-float, only on floating map elements', () => {
  // FSD-08A-2 D2: the home mock's yoi button matches the screenshot's floating buttons (registered exception).
  const FLOATING = /^\.(yo-location-pill|yo-gps-state|yo-step-overlay|yo-map-marker|yo-map-move|home-squid)$/;
  const bad = decls.filter((d) => d.prop === 'box-shadow').filter((d) => {
    if (d.value === 'none') return false;
    if (d.value !== 'var(--yx-shadow-float)') return true;
    return !d.selector.split(',').every((s) => FLOATING.test(s.trim()));
  }).map((d) => `${d.file} ${d.selector} { box-shadow: ${d.value} }`);
  assert.deepEqual(bad, []);
});

test('5. border-radius references --yx-radius-* tokens only', () => {
  const bad = decls.filter((d) => d.prop === 'border-radius' && !/^var\(--yx-radius-[\w-]+\)$/.test(d.value))
    .map((d) => `${d.file} ${d.selector} { border-radius: ${d.value} }`);
  assert.deepEqual(bad, []);
});

test('6. no emoji or pictographic symbols are used as icons', () => {
  const LISTED = /[🎁👟✨⚙♧🔒👥🎟🎉✓⌖●↗＋›️]/u;
  const PICTO = /\p{Extended_Pictographic}/u;
  const bad = [];
  for (const path of [...srcFiles, ...htmlFiles]) {
    read(path).split('\n').forEach((line, i) => { if (LISTED.test(line) || PICTO.test(line)) bad.push(`${rel(path)}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
});

test('7. no Tailwind colour/radius/shadow/weight/size utilities in markup, and no @theme colours', () => {
  const UTILITY = /^(rounded(-\S+)?|shadow(-\S+)?|font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|text-(xs|sm|base|lg|xl|[2-9]xl)|text-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\S+)?|bg-\S+|tracking-\S+)$/;
  const bad = [];
  for (const path of [...tsFiles, ...htmlFiles]) {
    for (const m of read(path).matchAll(/\bclass="([^"]*)"/g)) {
      for (const cls of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean)) if (UTILITY.test(cls)) bad.push(`${rel(path)} ${cls}`);
    }
  }
  for (const path of cssFiles) if (/@theme\b/.test(read(path))) bad.push(`${rel(path)} @theme`);
  assert.deepEqual(bad, []);
});

test('8. the pre-token variables are gone', () => {
  const OLD = /(?<![\w-])--(brand-red|navy|muted|border)\b/;
  const bad = [...srcFiles, ...htmlFiles].filter((path) => OLD.test(read(path))).map(rel);
  assert.deepEqual(bad, []);
});

test('9. the dev-only preview never reaches Firebase config, main.ts or data services', () => {
  const FORBIDDEN = ['src/main.ts', 'src/firebase/config.ts', 'src/identity/firebase-identity-provider.ts', 'src/identity/firestore-shared-context.ts', 'src/daily/daily-service.ts', 'src/team/team-service.ts'];
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const text = read(path);
    for (const m of text.matchAll(/^\s*import\s+(?!type\b)(?:[^'"]*?from\s+)?["'](\.[^"']+)["']/gm)) {
      const target = resolve(dirname(path), m[1]);
      const file = [target, `${target}.ts`, join(target, 'index.ts')].find((candidate) => { try { return statSync(candidate).isFile(); } catch { return false; } });
      if (file && file.endsWith('.ts')) visit(file);
    }
  };
  visit(join(root, 'src/ui-preview.ts'));
  const reached = [...seen].map(rel);
  assert.deepEqual(reached.filter((path) => FORBIDDEN.includes(path)), []);
  assert.ok(reached.includes('src/app/shell-state.ts') && reached.includes('src/ui/views.ts'), 'graph walk sanity check');
});
