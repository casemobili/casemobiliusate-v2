#!/usr/bin/env node
// Genera /.well-known/agent-skills/index.json (Agent Skills Discovery RFC v0.2.0).
//
// Gira DOPO `astro build`, quando public/ è già stato copiato in dist/.
// Legge ogni public/.well-known/agent-skills/<nome>/SKILL.md, ne estrae nome e
// descrizione dal frontmatter e ne calcola il digest SHA-256.
//
// Il digest è il motivo per cui questo file si genera invece di scriverlo a mano:
// scritto a mano, alla prima modifica di una SKILL.md diventerebbe sbagliato, e un
// digest sbagliato è peggio di nessun digest — un agente lo legge come contenuto
// manomesso.
//
// Come generate-markdown.mjs, non deve mai far fallire il build.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const SITE = 'https://www.casemobiliusate.com';
const REL = '.well-known/agent-skills';

function frontmatterField(text, field) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return '';
  const m = fm[1].match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

try {
  const skillsDir = path.join(projectRoot, 'public', REL);
  const distDir = path.join(projectRoot, 'dist', REL);

  if (!fs.existsSync(skillsDir)) {
    console.log('build-agent-skills-index: nessuna skill, salto.');
    process.exit(0);
  }

  const skills = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;

    const raw = fs.readFileSync(file);
    const text = raw.toString('utf-8');
    const digest = crypto.createHash('sha256').update(raw).digest('hex');

    skills.push({
      name: frontmatterField(text, 'name') || entry.name,
      type: 'skill-md',
      description: frontmatterField(text, 'description'),
      url: `${SITE}/${REL}/${entry.name}/SKILL.md`,
      digest: `sha256:${digest}`,
    });
  }

  if (skills.length === 0) {
    console.log('build-agent-skills-index: nessuna SKILL.md trovata, salto.');
    process.exit(0);
  }

  const index = {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills,
  };

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf-8');
  console.log(`build-agent-skills-index: ${skills.length} skill indicizzate.`);
} catch (e) {
  console.warn(`build-agent-skills-index: errore non fatale — ${e.message}`);
}

process.exit(0);
