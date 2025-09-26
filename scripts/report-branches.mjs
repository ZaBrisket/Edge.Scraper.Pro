#!/usr/bin/env node
import { promisify } from 'node:util';
import { exec as execCb } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import fs from 'node:fs/promises';

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, 'stale-branches.md');

async function runGit(cmd) {
  const { stdout } = await exec(cmd, { cwd: ROOT });
  return stdout.trim();
}

async function ensureReportsDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function fetchRemotes() {
  const remotes = await runGit('git remote').catch(() => '');
  if (!remotes.trim()) {
    return false;
  }
  await exec('git fetch --all --prune --tags', { cwd: ROOT });
  return true;
}

async function listRemoteBranches() {
  const raw = await runGit("git branch --remotes --format='%(refname:short)'").catch(() => '');
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ''))
    .filter((line) => line && !line.endsWith('/HEAD') && line.startsWith('origin/'))
    .filter((line) => line !== 'origin/main');
}

async function listMergedBranches() {
  const raw = await runGit("git branch --remotes --merged origin/main --format='%(refname:short)'").catch(() => '');
  return new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ''))
      .filter((line) => line),
  );
}

async function aheadBehind(branch) {
  const raw = await runGit(`git rev-list --left-right --count origin/main...${branch}`);
  const [behindStr = '0', aheadStr = '0'] = raw.split(/\s+/);
  return { behind: Number(behindStr), ahead: Number(aheadStr) };
}

async function lastCommitDate(branch) {
  const raw = await runGit(`git log -1 --format=%cI ${branch}`);
  return raw || null;
}

function parseRepoSlug(remoteUrl) {
  if (!remoteUrl) return null;
  if (remoteUrl.startsWith('git@')) {
    const [, slug] = remoteUrl.split(':');
    return slug?.replace(/\.git$/, '') ?? null;
  }
  try {
    const url = new URL(remoteUrl);
    return url.pathname.replace(/^\//, '').replace(/\.git$/, '');
  } catch {
    return null;
  }
}

async function detectPullStatus(branch, repoSlug, token) {
  if (!repoSlug || !token) {
    return 'unknown';
  }
  const [owner] = repoSlug.split('/');
  const branchName = branch.replace('origin/', '');
  const encodedBranch = encodeURIComponent(branchName);
  const url = `https://api.github.com/repos/${repoSlug}/pulls?head=${owner}:${encodedBranch}&state=open`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'edge-scraper-branch-report',
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) {
      return 'unknown';
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return 'open';
    }
    return 'none';
  } catch {
    return 'unknown';
  }
}

function recommendStatus(merged, lastDate, hasOpenPr) {
  if (merged) return 'delete';
  if (!lastDate) return 'review';
  const ageMs = Date.now() - new Date(lastDate).getTime();
  const staleThreshold = 30 * 24 * 60 * 60 * 1000;
  if (ageMs > staleThreshold && hasOpenPr === 'none') {
    return 'delete';
  }
  return 'keep';
}

async function main() {
  const hasRemote = await fetchRemotes();
  const branches = hasRemote ? await listRemoteBranches() : [];
  const mergedSet = hasRemote ? await listMergedBranches() : new Set();
  const remoteUrl = hasRemote ? await runGit('git config --get remote.origin.url').catch(() => '') : '';
  const repoSlug = parseRepoSlug(remoteUrl);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

  const rows = [];

  for (const branch of branches) {
    const [aheadBehindCounts, lastDate, prStatus] = await Promise.all([
      aheadBehind(branch),
      lastCommitDate(branch),
      detectPullStatus(branch, repoSlug, token || null),
    ]);
    const recommendation = recommendStatus(mergedSet.has(branch), lastDate, prStatus);
    rows.push({
      branch,
      lastCommit: lastDate ?? 'unknown',
      ahead: aheadBehindCounts.ahead,
      behind: aheadBehindCounts.behind,
      prStatus,
      recommendation,
    });
  }

  console.log('\nRemote branch overview (excluding origin/main):');
  if (rows.length > 0) {
    console.table(
      rows.map((row) => ({
        Branch: row.branch,
        'Last Commit': row.lastCommit,
        'Ahead/Behind': `${row.ahead}/${row.behind}`,
        'PR Status': row.prStatus,
        Recommend: row.recommendation,
      })),
    );
  } else {
    console.log('No remote branches found.');
  }

  await ensureReportsDir();
  const lines = [
    '# Stale Branch Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Branch | Last Commit Date | Ahead/Behind main | PR status | Recommend |',
    '| ------ | ---------------: | ----------------: | --------- | --------- |',
  ];

  if (rows.length === 0) {
    lines.push('| _none_ | — | — | — | — |');
  } else {
    for (const row of rows) {
      lines.push(
        `| ${row.branch} | ${row.lastCommit ?? 'unknown'} | ${row.ahead}/${row.behind} | ${row.prStatus} | ${row.recommendation} |`,
      );
    }
  }

  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

main().catch((error) => {
  console.error('[report-branches] Failed:', error);
  process.exitCode = 1;
});
