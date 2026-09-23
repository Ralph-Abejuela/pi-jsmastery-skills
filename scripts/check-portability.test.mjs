#!/usr/bin/env node
// Differential guard for check-portability.mjs.
//
// CI runs on Linux, so a Windows-only blind spot in the checker is invisible
// there: a CRLF checkout or a `\`-separated rel path used to skip rules 1/4/6/8,
// pick the wrong byte-budget table, and report ~60 phantom violations. This
// asserts the checker gives the same verdict for an LF tree and a CRLF tree.
//
// Run: node scripts/check-portability.test.mjs

import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'portability-'));

// The checker resolves skills/ from its own location, so the probe runs a copy.
// Both trees are written from a canonical LF read, so the repo's own checkout
// convention (core.autocrlf) cannot make the two runs agree by accident.
function eol(dir, ending) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) eol(p, ending);
    else if (/\.(md|ya?ml)$/.test(entry)) {
      writeFileSync(p, readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, ending));
    }
  }
}

function run() {
  const script = join(work, 'scripts', 'check-portability.mjs');
  // Capture BOTH streams: violations go to stderr, the passing report to stdout,
  // and a failing run prints no report at all. Inherited stderr would leak.
  try {
    return execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

cpSync(join(root, 'skills'), join(work, 'skills'), { recursive: true });
mkdirSync(join(work, 'scripts'));
cpSync(join(root, 'scripts', 'check-portability.mjs'), join(work, 'scripts', 'check-portability.mjs'));

eol(join(work, 'skills'), '\n');
const lf = run().trim();
eol(join(work, 'skills'), '\r\n');
const crlfOut = run().trim();
rmSync(work, { recursive: true, force: true });

if (lf !== crlfOut) {
  console.error('FAIL: check-portability.mjs is not line-ending independent.');
  console.error(`\n--- LF tree ---\n${lf}\n\n--- CRLF tree ---\n${crlfOut}`);
  process.exit(1);
}

console.log('check-portability.mjs: same verdict for LF and CRLF trees.');
