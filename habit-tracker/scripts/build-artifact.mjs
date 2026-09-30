// Builds a single self-contained HTML page of the web app, for hosting as a
// Claude artifact (or any sandbox that can't serve the export's absolute
// asset paths). Output: artifact-dist/habitual.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'artifact-dist');

execSync('npx expo export --platform web --clear', { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' } });

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
let js = scripts.map((src) => fs.readFileSync(path.join(dist, src))).join('\n');

// Inline the assets the app actually uses: the Ionicons font and router PNGs.
const mime = { '.ttf': 'font/ttf', '.png': 'image/png' };
for (const [, url] of js.matchAll(/"(\/assets\/[^"]+)"/g)) {
  const used = url.endsWith('.png') || /\/Ionicons\.[0-9a-f]+\.ttf$/.test(url);
  if (!used) continue;
  const file = path.join(dist, url);
  const data = `data:${mime[path.extname(url)]};base64,${fs.readFileSync(file).toString('base64')}`;
  js = js.split(`"${url}"`).join(`"${data}"`);
}
// Keep the bundle from closing its own <script> tag.
js = js.replace(/<\/script/gi, '<\\/script');

const page = `<title>Habitual</title>
<style>
  /* Full-height app shell for react-native-web; colours match the app's theme tokens. */
  :root { --bg: #f9f9f7; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d0d0d; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #0d0d0d; color-scheme: dark; }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--bg); }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>
  // The app routes by URL path; start from "/" whatever path the host serves the page at.
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
</script>
<script>${js}</script>
`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'habitual.html'), page);
console.log(`artifact-dist/habitual.html  ${(page.length / 1e6).toFixed(2)} MB`);
