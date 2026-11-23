// Превращает выгруженную страницу артефакта Claude в самостоятельную страницу src/dashboard.html.
// Использование: node tools/from-artifact.mjs <страница артефакта.html> src/dashboard.html
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
let src = readFileSync(inPath, 'utf8');

// 1. Artifact skeleton: keep its base styles (the [hidden] rule matters for the tabs), drop the rest.
const skel = src.match(/^<!doctype html><html><head>.*?<style>(.*?)<\/style><\/head><body>\n/s);
if (!skel) throw new Error('artifact skeleton not found');
const baseStyle = skel[1];
let body = src.slice(skel[0].length);

// 2. Head-level tags that the artifact put into <body>.
const take = (re, name) => {
  const m = body.match(re);
  if (!m) throw new Error(name + ' not found');
  body = body.replace(m[0], '');
  return m;
};
const title = take(/<title>(.*?)<\/title>\n/, 'title')[1];
take(/<meta name="claude:viewport-fit-sides"[^>]*>\n/, 'claude meta');
take(/<link rel="preconnect" href="https:\/\/fonts.googleapis.com">\n/, 'preconnect');
const fonts = take(/<link rel="stylesheet" href="(https:\/\/fonts.googleapis.com\/[^"]+)">\n/, 'fonts')[1];
const pageStyle = take(/<style>\n(.*?)<\/style>\n/s, 'page style')[1];

// 3. Closing tags.
body = body.replace(/\n?<\/body><\/html>\s*$/, '\n');

const footerCss = 'footer a{color:inherit;text-decoration:underline;text-underline-offset:2px}\n';

const out = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>${baseStyle}</style>
<style>
${pageStyle}${footerCss}</style>
</head>
<body>
${body.replace(/^\n+/, '')}</body>
</html>
`;
writeFileSync(outPath, out);
console.log('wrote', outPath, out.length, 'chars; title:', title);
