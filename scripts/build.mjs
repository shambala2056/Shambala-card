#!/usr/bin/env node
// data/employees.json -> e/<slug>/{contact.vcf,index.html} + root index.html
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'data/employees.json'), 'utf8'));
const site = cfg.site ?? {};
const base = (site.baseUrl ?? '').replace(/\/+$/, '');
// site.defaults нь ажилтан бүрт нэгдэнэ — org, website мэтийг 8 удаа давтахгүйн тулд.
// Хоосон слот өвлөхгүй: хүн нь тодроогүй байхад компани нь мэдэгдэхгүй.
const people = cfg.employees.map((p) => (p.placeholder ? p : { ...(site.defaults ?? {}), ...p }));

const esc = (v) =>
  String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const html = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Contacts дээр харагдах нэр: нэр, ард нь овгийн үсэг — "Shijirbat B."
// Товчлол бол цэг залгана. Кирилл нэг үсэг латинаар 2-3 болдог (Ц → Ts, Щ → Shch)
// тул 3 хүртэлх үсгийг товчлол гэж үзнэ; бүтэн овог бичигдсэн бол хэвээр нь үлдээнэ.
const surname = (v) => (v && v.length <= 3 && !v.endsWith('.') ? v + '.' : v);
const displayName = (p) =>
  p.displayName || [p.firstName, surname(p.lastName)].filter(Boolean).join(' ').trim();

// `websites` (жагсаалт) нь `website`-г дарж бичнэ — эхнийх нь эхэнд харагдана
const websitesOf = (p) => [].concat(p.websites ?? p.website ?? []).filter(Boolean);

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
  for (const w of websitesOf(p)) L.push(`URL;TYPE=WORK:${esc(w)}`);
  if (p.address) L.push(`ADR;TYPE=WORK:;;${esc(p.address)};;;;`);
  if (p.note) L.push(`NOTE:${esc(p.note)}`);
  L.push('REV:' + (cfg.buildDate || '2026-08-20T00:00:00Z'));
  L.push('END:VCARD');
  // CRLF is required — Android's contact importer rejects LF-only vCards.
  return L.map(fold).join('\r\n') + '\r\n';
}

// Брэндийн харанхуй загвар — лого хоёулаа цайвар тул #272727 дэвсгэр дээр тавина.
const THEME = `
:root{--bg:#272727;--card:#2f2f2f;--fg:#f4f4f4;--muted:#9b9b9b;--line:#3d3d3d;
 --accent:#a8cc30;--accent-ink:#1c1c1c;--yellow:#fce400;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
 font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
 padding:24px 16px calc(24px + env(safe-area-inset-bottom))}
img{max-width:100%;height:auto;display:block}
`;

function page(p, a = '../../') {
  const fn = p.placeholder ? 'Coming soon' : displayName(p);
  const initials = p.placeholder
    ? '?'
    : fn.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const rows = [
    p.phoneMobile && ['Mobile', p.phoneMobile, `tel:${p.phoneMobile.replace(/\s/g, '')}`],
    p.phoneWork && ['Work', p.phoneWork, `tel:${p.phoneWork.replace(/\s/g, '')}`],
    p.email && ['Email', p.email, `mailto:${p.email}`],
    ...websitesOf(p).map((w) => ['Website', w.replace(/^https?:\/\//, '').replace(/\/$/, ''), w]),
    p.address && ['Address', p.address, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`],
  ].filter(Boolean);
  const sub = [p.title, p.org].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${html(fn)}${p.org ? ' · ' + html(p.org) : ''}</title>
<meta name="theme-color" content="#272727">
<meta property="og:title" content="${html(fn)}">
<meta property="og:description" content="${html(sub)}">
<style>${THEME}
.card{width:100%;max-width:420px;margin:0 auto;background:var(--card);border-radius:22px;overflow:hidden;
 border:1px solid var(--line);box-shadow:0 18px 44px rgba(0,0,0,.45)}
.brand{background:var(--bg);padding:26px 24px 22px;border-bottom:1px solid var(--line)}
.brand img{width:172px;margin:0 auto}
.body{padding:26px 24px 24px;text-align:center}
.avatar{width:84px;height:84px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;
 justify-content:center;font-size:28px;font-weight:600;letter-spacing:.02em;
 color:var(--accent);border:2px solid var(--accent);background:rgba(168,204,48,.08)}
.avatar.q{color:var(--muted);border:2px dashed var(--line);background:none}
h1{font-size:25px;margin:0 0 6px;letter-spacing:-.01em}
.sub{color:var(--muted);margin:0 0 22px;font-size:14.5px}
.gap{height:22px}
.save{display:block;background:var(--accent);color:var(--accent-ink);text-decoration:none;font-weight:700;
 padding:15px;border-radius:13px;margin-bottom:24px;-webkit-tap-highlight-color:transparent}
.save:active{opacity:.85}
.pending{color:var(--muted);font-size:14px;border:1px dashed var(--line);border-radius:13px;
 padding:18px;margin:0}
.rows{text-align:left;border-top:1px solid var(--line)}
.row{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 0;
 border-bottom:1px solid var(--line);text-decoration:none;color:inherit}
.row:last-child{border-bottom:0}
.row .k{color:var(--muted);font-size:12.5px;letter-spacing:.03em;text-transform:uppercase;flex:0 0 auto}
.row .v{text-align:right;overflow-wrap:anywhere;min-width:0;font-size:15px}
.note{color:var(--muted);font-size:14px;margin:18px 0 0;text-align:left}
.foot{background:var(--bg);border-top:1px solid var(--line);padding:20px 24px}
.foot img{width:132px;margin:0 auto;opacity:.72}
</style>
</head>
<body>
<main class="card">
  <header class="brand"><img src="${a}assets/land-art-space.png" alt="Land-art space" width="720" height="212"></header>
  <div class="body">
    <div class="avatar${p.placeholder ? ' q' : ''}">${html(initials)}</div>
    <h1>${html(fn)}</h1>
    ${sub ? `<p class="sub">${html(sub)}</p>` : '<div class="gap"></div>'}

    ${p.placeholder
      ? `<p class="pending">This card hasn't been set up yet.<br>Please check back later.</p>`
      : `<a class="save" id="save" href="contact.vcf" type="text/vcard">Save contact</a>`}

    ${rows.length ? `<div class="rows">
      ${rows.map(([k, v, href]) => `<a class="row" href="${html(href)}"><span class="k">${html(k)}</span><span class="v">${html(v)}</span></a>`).join('\n      ')}
    </div>` : ''}
    ${p.note ? `<p class="note">${html(p.note)}</p>` : ''}
  </div>
  <footer class="foot"><img src="${a}assets/hexagon.png" alt="Hexagon — Land Art Community" width="514" height="142"></footer>
</main>
${p.placeholder ? '' : `<script>
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
</script>`}
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
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${html(site.org || 'Contacts')} — Team contacts</title>
<meta name="theme-color" content="#272727">
<style>${THEME}
.wrap{width:100%;max-width:420px;margin:0 auto}
.brand{padding:8px 0 28px}
.brand img{width:196px;margin:0 auto}
p.s{color:var(--muted);margin:0 0 18px;font-size:14px;text-align:center}
a.p{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--card);
 overflow-wrap:anywhere;
 border:1px solid var(--line);border-radius:14px;padding:15px 17px;margin-bottom:10px;
 text-decoration:none;color:inherit}
a.p:active{border-color:var(--accent)}
small{color:var(--muted);font-size:12.5px;letter-spacing:.03em;text-transform:uppercase;
 text-align:right;flex:0 0 auto}
.foot{padding:22px 0 4px}
.foot img{width:132px;margin:0 auto;opacity:.72}
</style></head><body><div class="wrap">
<header class="brand"><img src="assets/land-art-space.png" alt="Land-art space" width="720" height="212"></header>
<p class="s">Open a card and tap Save contact.</p>
${list.map((p) => `<a class="p" href="e/${html(p.slug)}/"><span>${html(p.placeholder ? (p.label ?? 'Reserved') : displayName(p))}</span><small>${html(p.placeholder ? 'reserved' : p.title || '')}</small></a>`).join('\n')}
<footer class="foot"><img src="assets/hexagon.png" alt="Hexagon — Land Art Community" width="514" height="142"></footer>
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
  if (!p.placeholder) writeFileSync(join(dir, 'contact.vcf'), vcard(p));
  writeFileSync(join(dir, 'index.html'), page(p));
  for (const alias of p.aliases ?? []) {
    if (seen.has(alias)) throw new Error(`alias slug-тай мөргөлдөж байна: ${alias}`);
    seen.add(alias);
    mkdirSync(join(ROOT, 'e', alias), { recursive: true });
    writeFileSync(join(ROOT, 'e', alias, 'index.html'), aliasPage(`${base}/e/${p.slug}/`));
    console.log(`    ↳ /e/${alias}/ → /e/${p.slug}/ (redirect)`);
  }
  const tag = p.placeholder ? '⏳' : '✓';
  const who = p.placeholder ? `${p.label ?? 'Reserved'} (хоосон)` : displayName(p);
  console.log(`  ${tag} ${who.padEnd(20)} ${base}/e/${p.slug}/`);
}
writeFileSync(join(ROOT, 'index.html'), indexPage(people));
writeFileSync(join(ROOT, '.nojekyll'), '');
console.log(`\n${people.length} ажилтан бэлэн.`);
