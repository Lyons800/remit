#!/usr/bin/env node

import console from 'node:console';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { get } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(repositoryRoot, 'apps', 'web');
const requiredNodeVersion = readFileSync(
  join(repositoryRoot, '.node-version'),
  'utf8',
).trim();
const developmentOutput = join(webRoot, '.next-demo');

function nodeVersion(binary) {
  const result = spawnSync(binary, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function remitDemoIsRunning() {
  return new Promise((resolveRunning) => {
    const request = get(
      'http://127.0.0.1:3000/approvals/INV-2026-0912',
      { headers: { accept: 'text/html' } },
      (response) => {
        let page = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          if (page.length < 128_000) page += String(chunk);
        });
        response.once('end', () => {
          resolveRunning(
            response.statusCode === 200 &&
              page.includes(
                '<title>Remit · Accounts payable control room</title>',
              ),
          );
        });
      },
    );
    request.setTimeout(1_500, () => {
      request.destroy();
      resolveRunning(false);
    });
    request.once('error', () => resolveRunning(false));
  });
}

const candidates = [
  process.execPath,
  join(
    homedir(),
    '.nvm',
    'versions',
    'node',
    `v${requiredNodeVersion}`,
    'bin',
    'node',
  ),
  join(
    homedir(),
    '.local',
    'share',
    'mise',
    'installs',
    'node',
    requiredNodeVersion,
    'bin',
    'node',
  ),
].filter((binary, index, values) => values.indexOf(binary) === index);

const nodeBinary = candidates.find(
  (binary) => existsSync(binary) && nodeVersion(binary) === requiredNodeVersion,
);

if (nodeBinary === undefined) {
  console.error(
    `Remit requires Node ${requiredNodeVersion}. Install it or run "nvm install ${requiredNodeVersion}" before starting the demo.`,
  );
  process.exitCode = 1;
} else {
  const nextCli = join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(nextCli)) {
    console.error('Next.js is not installed. Run "corepack pnpm install".');
    process.exitCode = 1;
  } else if (await remitDemoIsRunning()) {
    console.log('Remit is already running at http://localhost:3000');
  } else {
    if (process.argv.includes('--reset')) {
      const resolvedOutput = resolve(developmentOutput);
      if (
        resolvedOutput !== join(realpathSync(webRoot), '.next-demo') ||
        !resolvedOutput.startsWith(`${realpathSync(webRoot)}/`)
      ) {
        throw new Error('Refusing to reset an unexpected development path.');
      }
      rmSync(resolvedOutput, { force: true, recursive: true });
    }

    // Next writes this marker asynchronously after startup. The web package is
    // "type": "module", so until the marker exists Node parses the compiled
    // CommonJS pages as ESM and the first page request kills the server with
    // "ReferenceError: require is not defined". Writing it up front closes the
    // race — Next later rewrites the same content harmlessly.
    mkdirSync(join(developmentOutput, 'dev'), { recursive: true });
    writeFileSync(
      join(developmentOutput, 'dev', 'package.json'),
      '{"type": "commonjs"}',
    );

    const existingNodeOptions = (process.env.NODE_OPTIONS ?? '')
      .replace(/--max-old-space-size(?:=|\s+)\d+/gu, '')
      .trim();
    const child = spawn(
      nodeBinary,
      [nextCli, 'dev', '--webpack', '--port', '3000'],
      {
        cwd: webRoot,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: '1',
          NODE_OPTIONS:
            `${existingNodeOptions} --max-old-space-size=2048`.trim(),
          REMIT_NEXT_DIST_DIR: '.next-demo',
        },
        stdio: 'inherit',
      },
    );

    let requestedStop = false;
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        requestedStop = true;
        child.kill(signal);
      });
    }

    child.once('exit', (code, signal) => {
      process.exitCode = requestedStop ? 0 : signal === null ? (code ?? 1) : 1;
    });
  }
}
