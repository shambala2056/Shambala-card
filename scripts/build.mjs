#!/usr/bin/env node
// data/employees.json -> e/<slug>/{contact.vcf,index.html} + root index.html
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'data/employees.json'), 'utf8'));
const site = cfg.site ?? {};
const base = (site.baseUrl ?? '').replace(/\/+$/, '');
// site.defaults нь ажилтан бүрт нэгдэнэ — org, website мэтийг 8 удаа давтахгүйн тулд
const people = cfg.employees.map((p) => ({ ...(site.defaults ?? {}), ...p }));

const esc = (v) =>
  String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const html = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Contacts дээр харагдах нэр: нэр, ард нь овгийн үсэг — "Shijirbat B."
// Ганц үсэг бол цэг залгана; бүтэн овог бичигдсэн бол хэвээр нь үлдээнэ.
const surname = (v) => (v && v.length === 1 ? v + '.' : v);
const displayName = (p) =>
  p.displayName || [p.firstName, surname(p.lastName)].filter(Boolean).join(' ').trim();

// RFC 2426 folding: max 75 octets per line, continuation starts with one space.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const limit = out.length === 0 ? 75 : 74;
    let take = Math.min(limit, bytes.length - i);
    // never split a multi-byte UTF-8 sequence
    while (take > 1 && (bytes[i + take] & 0xc0) === 0x80) take--;
    out.push((out.length ? ' ' : '') + bytes.slice(i, i + take).toString('utf8'));
    i += take;
  }
  return out.join('\r\n');
}

function vcard(p) {
  const L = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(p.lastName)};${esc(p.firstName)};;;`,
    `FN:${esc(displayName(p))}`,
  ];
  if (p.org) L.push(`ORG:${esc(p.org)}`);
  if (p.title) L.push(`TITLE:${esc(p.title)}`);
  if (p.phoneMobile) L.push(`TEL;TYPE=CELL,VOICE:${esc(p.phoneMobile)}`);
  if (p.phoneWork) L.push(`TEL;TYPE=WORK,VOICE:${esc(p.phoneWork)}`);
  if (p.email) L.push(`EMAIL;TYPE=INTERNET,WORK:${esc(p.email)}`);
  if (p.website) L.push(`URL:${esc(p.website)}`);
  if (p.address) L.push(`ADR;TYPE=WORK:;;${esc(p.address)};;;;`);
  if (p.note) L.push(`NOTE:${esc(p.note)}`);
  L.push('REV:' + (cfg.buildDate || '2026-08-20T00:00:00Z'));
  L.push('END:VCARD');
  // CRLF is required — Android's contact importer rejects LF-only vCards.
  return L.map(fold).join('\r\n') + '\r\n';
}

function page(p) {
  const fn = displayName(p);
  const initials = fn.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const color = site.brandColor || '#0f766e';
  const rows = [
    p.phoneMobile && ['Mobile', p.phoneMobile, `tel:${p.phoneMobile.replace(/\s/g, '')}`],
    p.phoneWork && ['Work', p.phoneWork, `tel:${p.phoneWork.replace(/\s/g, '')}`],
    p.email && ['Email', p.email, `mailto:${p.email}`],
    p.website && ['Website', p.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), p.website],
    p.address && ['Address', p.address, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`],
  ].filter(Boolean);

  return `<!doctype html>
<html lang="mn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${html(fn)}${p.org ? ' · ' + html(p.org) : ''}</title>
<meta name="theme-color" content="${html(color)}">
<meta property="og:title" content="${html(fn)}">
<meta property="og:description" content="${html([p.title, p.org].filter(Boolean).join(' · '))}">
<style>
:root{--brand:${html(color)};--bg:#f6f7f8;--card:#fff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb}
@media(prefers-color-scheme:dark){:root{--bg:#0b0f12;--card:#151a1f;--fg:#f3f4f6;--muted:#9aa3ad;--line:#262d34}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
 display:flex;justify-content:center;padding:24px 16px calc(24px + env(safe-area-inset-bottom))}
.card{width:100%;max-width:420px;background:var(--card);border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08),0 12px 32px rgba(0,0,0,.06)}
.hero{background:var(--brand);height:104px}
.body{padding:0 24px 24px;margin-top:-52px}
.avatar{width:104px;height:104px;border-radius:50%;border:4px solid var(--card);display:flex;align-items:center;
 justify-content:center;font-size:36px;font-weight:600;color:#fff;background:var(--brand)}
h1{font-size:24px;margin:16px 0 4px;letter-spacing:-.01em}
.sub{color:var(--muted);margin:0 0 20px;font-size:15px}
.save{display:block;text-align:center;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;
 padding:15px;border-radius:14px;margin-bottom:22px;-webkit-tap-highlight-color:transparent}
.save:active{opacity:.85}
.rows{border-top:1px solid var(--line)}
.row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line);
 text-decoration:none;color:inherit}
.row .k{color:var(--muted);font-size:13px;flex:0 0 auto}
.row .v{text-align:right;word-break:break-word;font-size:15px}
.note{color:var(--muted);font-size:14px;margin-top:18px}
</style>
</head>
<body>
<main class="card">
  <div class="hero"></div>
  <div class="body">
    <div class="avatar">${html(initials)}</div>
    <h1>${html(fn)}</h1>
    <p class="sub">${html([p.title, p.org].filter(Boolean).join(' · '))}</p>

    <a class="save" id="save" href="contact.vcf" type="text/vcard">Save contact</a>

    <div class="rows">
      ${rows.map(([k, v, href]) => `<a class="row" href="${html(href)}"><span class="k">${html(k)}</span><span class="v">${html(v)}</span></a>`).join('\n      ')}
    </div>
    ${p.note ? `<p class="note">${html(p.note)}</p>` : ''}
  </div>
</main>
<script>
// Fallback: if the host serves .vcf with a wrong Content-Type, hand the browser
// a blob tagged text/vcard so iOS/Android still recognise it as a contact.
document.getElementById('save').addEventListener('click', async function (ev) {
  try {
    const res = await fetch('contact.vcf', { cache: 'no-store' });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('vcard') || ct.includes('x-vcard')) return; // server is fine, let the link work
    ev.preventDefault();
    const blob = new Blob([await res.text()], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ${JSON.stringify(p.slug + '.vcf')};
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
  } catch (e) { /* offline or fetch blocked — the plain link already handles it */ }
});
</script>
</body>
</html>
`;
}

// Хуучин slug-аар бичигдсэн NFC таг ажилласаар байхын тулд redirect үлдээнэ
function aliasPage(to) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${html(to)}">
<link rel="canonical" href="${html(to)}">
<title>Redirecting…</title></head>
<body><p>Redirecting to <a href="${html(to)}">${html(to)}</a>…</p>
<script>location.replace(${JSON.stringify(to)});</script>
</body></html>
`;
}

function indexPage(list) {
  const color = site.brandColor || '#0f766e';
  return `<!doctype html>
<html lang="mn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(site.org || 'Contacts')} — Team contacts</title>
<style>
:root{--brand:${html(color)};--bg:#f6f7f8;--card:#fff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb}
@media(prefers-color-scheme:dark){:root{--bg:#0b0f12;--card:#151a1f;--fg:#f3f4f6;--muted:#9aa3ad;--line:#262d34}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
 display:flex;justify-content:center;padding:32px 16px}
.wrap{width:100%;max-width:420px}
h1{font-size:22px;margin:0 0 4px}p.s{color:var(--muted);margin:0 0 20px;font-size:14px}
a.p{display:flex;justify-content:space-between;align-items:center;background:var(--card);border:1px solid var(--line);
 border-radius:14px;padding:14px 16px;margin-bottom:10px;text-decoration:none;color:inherit}
small{color:var(--muted)}
</style></head><body><div class="wrap">
<h1>${html(site.org || '')}</h1>
<p class="s">Open a card and tap Save contact.</p>
${list.map((p) => `<a class="p" href="e/${html(p.slug)}/"><span>${html(displayName(p))}</span><small>${html(p.title || '')}</small></a>`).join('\n')}
</div></body></html>
`;
}

// ---- build ----
rmSync(join(ROOT, 'e'), { recursive: true, force: true });
const seen = new Set();
for (const p of people) {
  if (!p.slug) throw new Error(`slug дутуу: ${JSON.stringify(p)}`);
  if (seen.has(p.slug)) throw new Error(`slug давхардсан: ${p.slug}`);
  seen.add(p.slug);
  const dir = join(ROOT, 'e', p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'contact.vcf'), vcard(p));
  writeFileSync(join(dir, 'index.html'), page(p));
  for (const alias of p.aliases ?? []) {
    if (seen.has(alias)) throw new Error(`alias slug-тай мөргөлдөж байна: ${alias}`);
    seen.add(alias);
    mkdirSync(join(ROOT, 'e', alias), { recursive: true });
    writeFileSync(join(ROOT, 'e', alias, 'index.html'), aliasPage(`${base}/e/${p.slug}/`));
    console.log(`    ↳ /e/${alias}/ → /e/${p.slug}/ (redirect)`);
  }
  console.log(`  ✓ ${displayName(p).padEnd(20)} ${base}/e/${p.slug}/`);
}
writeFileSync(join(ROOT, 'index.html'), indexPage(people));
writeFileSync(join(ROOT, '.nojekyll'), '');
console.log(`\n${people.length} ажилтан бэлэн.`);
