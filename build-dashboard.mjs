import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const configSource = read('./web/config.js').replace('export const config', 'const config');
const apiSource = read('./web/assets/api.js').replace('export class DashboardApi', 'class DashboardApi');
const appSource = read('./web/assets/app.js').replace(/^import .*;\r?\n/gm, '');
const logoUrl = 'https://subayb2.github.io/pea-guard-admin/assets/pea_logo.png';
const css = read('./web/assets/style.css').replace(/^@import .*?;\r?\n/, '');
const script = [configSource, apiSource, appSource].join('\n').replace(/<\/script/gi, '<\\/script');
const html = read('./web/dashboard.html')
  .replace('<link rel="stylesheet" href="assets/style.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="assets/app.js"></script>', '')
  .replaceAll('assets/pea_logo.png', logoUrl)
  .replace('</body>', `<script>\n${script}\n</script></body>`);
fs.writeFileSync(new URL('./backend/Dashboard.html', import.meta.url), html);
