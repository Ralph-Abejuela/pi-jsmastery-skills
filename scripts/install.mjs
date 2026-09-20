#!/usr/bin/env node
// postinstall for pi-jsmastery-skills: link every skill under skills/ into the
// pi agent's skills dir (~/.pi/agent/skills) so pi loads them next session.
// Same pattern as the bigpowers pi-skills package. Skips inside a git checkout
// (the repo's own dev installs and CI), so it only acts on real installs.
// Windows: directory junctions (no admin needed). If a link can't be created,
// fall back to copying the skill folder. Never touches a real directory the
// user already has at the destination.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const skillsRoot = join(pkgRoot, 'skills');
const dest = join(homedir(), '.pi', 'agent', 'skills');

if (!existsSync(skillsRoot)) {
  console.log('pi-jsmastery-skills: no skills/ folder in this package, nothing to install.');
  process.exit(0);
}
if (existsSync(join(pkgRoot, '.git'))) {
  console.log('pi-jsmastery-skills: running from the git checkout — not linking skills (dev/CI).');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
const linkType = process.platform === 'win32' ? 'junction' : 'dir';
let linked = 0;

for (const name of readdirSync(skillsRoot)) {
  if (name.startsWith('.')) continue;
  const src = join(skillsRoot, name);
  const dst = join(dest, name);
  if (!existsSync(src)) continue;
  if (existsSync(dst)) {
    if (lstatSync(dst).isSymbolicLink()) {
      rmSync(dst, { force: true }); // refresh our own link
    } else {
      console.log(`  skip ${name} — a real folder already exists at ${dst}`);
      continue;
    }
  }
  try {
    symlinkSync(src, dst, linkType);
  } catch {
    cpSync(src, dst, { recursive: true }); // symlinks not permitted → copy
  }
  console.log(`  linked ${name} → ${dest}`);
  linked++;
}

console.log(`pi-jsmastery-skills: installed ${linked} skills. Restart pi to load them.`);
console.log('Update: npm update -g pi-jsmastery-skills. Uninstall: npm uninstall -g pi-jsmastery-skills (then remove the links above).');