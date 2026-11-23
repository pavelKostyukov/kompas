#!/usr/bin/env node
// Сборка сайта «Компас целей» для GitHub Pages.
//
// Берёт открытые исходники из src/ (папка в .gitignore, в репозиторий не попадает):
//   src/dashboard.html  готовая страница дашборда
//   src/goals.md        исходный файл целей
// и пишет в корень репозитория index.html и goals.html.
//
// По умолчанию обе страницы шифруются паролем из переменной KOMPAS_PASSWORD:
// AES-256-GCM, ключ из пароля через PBKDF2-SHA256 (600 000 итераций).
// Браузер расшифровывает страницу через WebCrypto после ввода пароля.
//
//   KOMPAS_PASSWORD='...' node tools/build.mjs
//   node tools/build.mjs --plain      без шифрования (открытая версия)
//   node tools/build.mjs --no-goals   без goals.html
//
// Нужны Node 18+ и pandoc (рендер goals.md в HTML).

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const PLAIN = args.has('--plain');
const GOALS = !args.has('--no-goals');
const ITER = 600000;
const STORE_KEY = 'kompas-key-v1';
const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { writeFileSync(join(ROOT, p), s); console.log('  ' + p + '  ' + Buffer.byteLength(s) + ' байт'); };
const fill = (tpl, map) => tpl.replace(/__([A-Z]+)__/g, (m, k) => (k in map ? map[k] : m));
const LOGOUT = '<a href="?logout">Забыть пароль на этом устройстве</a>';

// ---------- дашборд ----------
function dashboardPage() {
  let html = read('src/dashboard.html');
  const FOOT = 'Собрано из goals.md';
  if (!html.includes(FOOT)) throw new Error('В src/dashboard.html нет футера «' + FOOT + '»');
  if (GOALS) html = html.replace(FOOT, () => 'Собрано из <a href="goals.html">goals.md</a>');
  if (!PLAIN) html = html.replace('</footer>', () => ' · ' + LOGOUT + '</footer>');
  return html;
}

// ---------- goals.md ----------
function goalsPage() {
  let md = read('src/goals.md');
  let updated = '';
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    const u = fm[1].match(/^updated:\s*(\d{4})-(\d{2})-(\d{2})/m);
    if (u) updated = u[3] + '.' + u[2] + '.' + u[1];
    md = md.slice(fm[0].length);
  }
  const r = spawnSync('pandoc', ['-f', 'gfm', '-t', 'html', '--wrap=none'], { input: md, encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error('pandoc не сработал: ' + (r.error || r.stderr));
  const body = r.stdout
    .replace(/<input type="checkbox"/g, '<input type="checkbox" disabled')
    .replace(/<table>/g, '<div class="tw"><table>')
    .replace(/<\/table>/g, '</table></div>');
  return fill(GOALS_TPL, {
    FONTS,
    NAV: '<a href="./">Назад к дашборду</a>' + (PLAIN ? '' : LOGOUT),
    META: 'goals.md' + (updated ? ' · обновлено ' + updated : ''),
    BODY: body,
  });
}

// ---------- шифрование ----------
function lock(plain, labels, salt, key) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]);
  // самопроверка: расшифровать тем же ключом
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const back = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8');
  if (back !== plain) throw new Error('самопроверка шифрования не прошла');
  const payload = { v: 1, iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
  return fill(LOADER_TPL, { ...labels, KEY: STORE_KEY, PAYLOAD: JSON.stringify(payload) });
}

// ---------- шаблоны ----------
const GOALS_TPL = String.raw`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>goals.md · Компас целей</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="__FONTS__">
<style>
:root{--bg:#eef1f4;--surface:#fff;--ink:#18202b;--muted:#5d6878;--line:#d8dee6;--accent:#2b4fd8;--accent-soft:#e3e9fd;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#10141b;--surface:#181e27;--ink:#e7ebf1;--muted:#97a2b3;--line:#2a3240;--accent:#8aa2ff;--accent-soft:#1f2948;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;padding:28px 16px 56px;background:var(--bg);color:var(--ink);font:15px/1.6 "Manrope",system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:780px;margin:0 auto}
nav{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;margin-bottom:16px;font-size:.88rem}
nav a{color:var(--accent);font-weight:600;text-decoration:none}
nav a:hover{text-decoration:underline}
nav a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
article{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:26px 24px;min-width:0}
@media (max-width:520px){article{padding:18px 16px}}
.meta{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:8px}
h1,h2,h3{font-family:"Unbounded","Manrope",system-ui,sans-serif;font-weight:500;letter-spacing:-.01em;line-height:1.25;text-wrap:balance}
h1{font-size:clamp(1.4rem,4vw,1.9rem);font-weight:700;margin:0 0 18px}
h2{font-size:1.08rem;margin:34px 0 12px}
h3{font-size:.95rem;margin:24px 0 8px}
p,ul,ol,blockquote{margin:0 0 12px}
ul,ol{padding-left:22px}
li{margin:4px 0}
ul.task-list{list-style:none;padding-left:2px}
.task-list label{display:flex;gap:10px;align-items:flex-start}
.task-list input{width:16px;height:16px;margin:4px 0 0;flex:none;accent-color:var(--accent)}
blockquote{border-left:3px solid var(--accent);background:var(--accent-soft);padding:10px 14px;border-radius:0 10px 10px 0}
blockquote p:last-child{margin:0}
hr{border:0;border-top:1px solid var(--line);margin:30px 0}
.tw{overflow-x:auto;margin:0 0 14px;border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{padding:8px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
tbody tr:last-child td{border-bottom:0}
th{background:var(--bg);font-weight:700}
@media (max-width:520px){th,td{min-width:110px}}
code{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.85em;background:var(--bg);padding:1px 5px;border-radius:5px}
</style>
</head>
<body>
<div class="wrap">
<nav>__NAV__</nav>
<article>
<div class="meta">__META__</div>
__BODY__
</article>
</div>
</body>
</html>
`;

const LOADER_TPL = String.raw`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700&family=Manrope:wght@400;600;700&display=swap">
<script>try{if(!/[?&]logout\b/.test(location.search)&&(sessionStorage.getItem('__KEY__')||localStorage.getItem('__KEY__')))document.documentElement.className='auto'}catch(e){}</script>
<style>
:root{--bg:#eef1f4;--surface:#fff;--ink:#18202b;--muted:#5d6878;--line:#d8dee6;--accent:#2b4fd8;--bad:#c2402f;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#10141b;--surface:#181e27;--ink:#e7ebf1;--muted:#97a2b3;--line:#2a3240;--accent:#8aa2ff;--bad:#f08572;color-scheme:dark}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--ink);font:15px/1.55 "Manrope",system-ui,-apple-system,"Segoe UI",sans-serif}
.auto main{visibility:hidden}
main{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:28px 24px}
.eyebrow{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:600}
h1{font:700 1.5rem/1.2 "Unbounded","Manrope",system-ui,sans-serif;letter-spacing:-.01em;margin:4px 0 10px}
p{margin:0 0 20px;color:var(--muted);font-size:.9rem}
form{display:grid;gap:14px}
.field{display:grid;gap:6px;font-weight:600;font-size:.88rem}
input[type=password]{font:inherit;font-size:16px;font-weight:400;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);width:100%}
input[type=password]:focus{outline:2px solid var(--accent);outline-offset:1px}
.remember{display:flex;gap:10px;align-items:center;font-size:.88rem;color:var(--muted);cursor:pointer}
.remember input{width:18px;height:18px;margin:0;accent-color:var(--accent)}
button{font:700 1rem "Manrope",system-ui,sans-serif;padding:12px 16px;border:0;border-radius:10px;background:var(--accent);color:var(--surface);cursor:pointer}
button:disabled{opacity:.6;cursor:progress}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.err{color:var(--bad);font-size:.88rem;min-height:1.4em}
</style>
</head>
<body>
<main>
<div class="eyebrow">__EYEBROW__</div>
<h1>__HEADING__</h1>
<p>Страница зашифрована. Введи пароль, чтобы открыть её.</p>
<form id="f">
<input type="text" name="username" value="kompas" autocomplete="username" hidden>
<label class="field">Пароль<input type="password" id="pw" name="password" autocomplete="current-password" required></label>
<label class="remember"><input type="checkbox" id="rm">Запомнить на этом устройстве</label>
<button id="go" type="submit">Открыть</button>
<div class="err" id="err" role="alert"></div>
</form>
<noscript><p class="err">Для расшифровки нужен JavaScript.</p></noscript>
</main>
<script>
(function(){
var P=__PAYLOAD__,K='__KEY__';
function $(i){return document.getElementById(i)}
function get(n){try{return window[n].getItem(K)}catch(e){return null}}
function put(n,v){try{window[n].setItem(K,v)}catch(e){}}
function del(n){try{window[n].removeItem(K)}catch(e){}}
function b2u(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
function u2b(u){var s='';for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)}
function unlock(raw){
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt'])
    .then(function(k){return crypto.subtle.decrypt({name:'AES-GCM',iv:b2u(P.iv)},k,b2u(P.ct))})
    .then(function(b){return new TextDecoder().decode(b)});
}
// document.open() во время разбора страницы не очищает её, а дописывает в конец,
// поэтому подменяем страницу только после того, как парсер закончил.
function show(html){
  function swap(){document.open();document.write(html);document.close()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(swap,0)});
  else setTimeout(swap,0);
}
function forget(){del('localStorage');del('sessionStorage')}
function ask(){document.documentElement.className='';$('pw').focus()}
if(!(window.crypto&&crypto.subtle&&window.TextDecoder)){
  $('err').textContent='Этот браузер не умеет расшифровывать страницу. Открой её в свежем Chrome, Safari или Firefox.';
  $('go').disabled=true;ask();return;
}
if(/[?&]logout\b/.test(location.search)){forget();history.replaceState(null,'',location.pathname+location.hash)}
var saved=get('sessionStorage')||get('localStorage');
if(saved)Promise.resolve().then(function(){return unlock(b2u(saved))}).then(show,function(){forget();ask()});
else ask();
$('f').addEventListener('submit',function(e){
  e.preventDefault();
  var pw=$('pw').value.trim().normalize('NFC'),go=$('go');
  if(!pw)return;
  go.disabled=true;go.textContent='Открываю…';$('err').textContent='';
  crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits'])
    .then(function(k){return crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:b2u(P.salt),iterations:P.iter},k,256)})
    .then(function(bits){
      var raw=new Uint8Array(bits);
      return unlock(raw).then(function(html){
        var b=u2b(raw);put('sessionStorage',b);
        if($('rm').checked)put('localStorage',b);else del('localStorage');
        show(html);
      });
    })
    .catch(function(){go.disabled=false;go.textContent='Открыть';$('err').textContent='Пароль не подошёл. Попробуй ещё раз.';$('pw').select()});
});
})();
</script>
</body>
</html>
`;

// ---------- сборка ----------
const pages = [['index.html', dashboardPage(), { TITLE: 'Компас целей', EYEBROW: 'Личная страница', HEADING: 'Компас целей' }]];
if (GOALS) pages.push(['goals.html', goalsPage(), { TITLE: 'goals.md · Компас целей', EYEBROW: 'Компас целей', HEADING: 'goals.md' }]);

console.log(PLAIN ? 'Сборка без шифрования:' : 'Сборка с шифрованием:');
if (PLAIN) {
  for (const [file, html] of pages) write(file, html);
  if (GOALS) write('goals.md', read('src/goals.md'));
} else {
  const password = (process.env.KOMPAS_PASSWORD || '').trim().normalize('NFC');
  if (password.length < 12) throw new Error('Задай KOMPAS_PASSWORD, не короче 12 символов');
  const salt = randomBytes(16); // одна соль на сайт: сохранённый ключ открывает обе страницы
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITER, 32, 'sha256');
  for (const [file, html, labels] of pages) write(file, lock(html, labels, salt, key));
  rmSync(join(ROOT, 'goals.md'), { force: true }); // открытый goals.md рядом с шифром не нужен
}
if (!GOALS) rmSync(join(ROOT, 'goals.html'), { force: true });
