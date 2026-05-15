const IGNORED_GITHUB_OWNERS = new Set([
  'features',
  'topics',
  'collections',
  'trending',
  'marketplace',
  'login',
  'signup',
  'settings',
  'notifications',
  'explore',
  'pricing',
  'about',
]);

export function parseClipboardText(text) {
  const raw = String(text || '').trim();

  if (!raw) return null;

  const sshGitHub = parseGitHubSshUrl(raw);
  if (sshGitHub) return sshGitHub;

  const url = extractFirstUrl(raw);
  if (!url) return null;

  return parseUrl(url);
}

function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

function parseGitHubSshUrl(text) {
  const match = text.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (!match) return null;

  const owner = match[1];
  const repo = cleanupRepoName(match[2]);

  return {
    type: 'github-repo',
    title: `${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}`,
    host: 'github.com',
    owner,
    repo,
  };
}

function parseUrl(input) {
  let url;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return null;
  }

  url.hash = '';

  if (isGitHubHost(url.hostname)) {
    const repo = parseGitHubRepoUrl(url);
    if (repo) return repo;
  }

  return {
    type: 'url',
    title: guessTitleFromUrl(url),
    url: url.toString(),
    host: url.hostname,
    owner: null,
    repo: null,
  };
}

function isGitHubHost(hostname) {
  return hostname === 'github.com' || hostname === 'www.github.com';
}

function parseGitHubRepoUrl(url) {
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = cleanupRepoName(parts[1]);

  if (!owner || !repo) return null;
  if (IGNORED_GITHUB_OWNERS.has(owner)) return null;

  return {
    type: 'github-repo',
    title: `${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}`,
    host: 'github.com',
    owner,
    repo,
  };
}

function cleanupRepoName(repo) {
  return repo.replace(/\.git$/i, '');
}

function guessTitleFromUrl(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts.at(-1);

  if (!last) return url.hostname;

  return decodeURIComponent(last)
    .replace(/[-_]+/g, ' ')
    .trim() || url.hostname;
}