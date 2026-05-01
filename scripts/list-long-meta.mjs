#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const distDir = '/Users/mattia/Documents/CLAUDE/casemobiliusate/draft-site/dist';

function findHtml(dir, results = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findHtml(full, results);
    else if (e.isFile() && e.name === 'index.html') results.push(full);
  }
  return results;
}

const files = findHtml(distDir);
const longs = [];
for (const f of files) {
  const html = fs.readFileSync(f, 'utf-8');
  const meta = (html.match(/name="description"\s+content="([^"]+)"/) || [])[1];
  const rel = '/' + path.relative(distDir, f).replace(/\/index\.html$/, '');
  if (meta && meta.length > 165) {
    longs.push({ url: rel === '/.' ? '/' : rel, len: meta.length, meta });
  }
}

longs.sort((a, b) => b.len - a.len);
console.log(`${longs.length} pagine con meta > 165 char:\n`);
for (const l of longs) {
  console.log(`${l.len}c  ${l.url}`);
  console.log(`     "${l.meta}"\n`);
}
