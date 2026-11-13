// 只讀 GitHub 的公開資料。有 token 只是為了不被流量限制擋住，不會讀到私人 repo。

import { execFileSync } from 'node:child_process'

const API = 'https://api.github.com'

export function findToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

async function request(path, token, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'jeffrey-apps-build',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}：${path}`)
  return res.json()
}

export async function fetchRepos(user, token) {
  const all = []
  for (let page = 1; page <= 10; page += 1) {
    const batch = await request(`/users/${user}/repos?type=owner&sort=pushed&per_page=100&page=${page}`, token)
    all.push(...batch)
    if (batch.length < 100) break
  }
  // 這個端點本來就只回公開 repo，再擋一次以防萬一
  return all
    .filter((repo) => repo.private === false)
    .map((repo) => ({
      name: repo.name,
      description: repo.description ?? '',
      stars: repo.stargazers_count ?? 0,
      language: repo.language ?? '',
      homepage: repo.homepage ?? '',
      url: repo.html_url,
      pushedAt: repo.pushed_at,
      fork: Boolean(repo.fork),
      archived: Boolean(repo.archived),
    }))
}

// 每天的貢獻次數（跟 GitHub 個人頁上那片格子同一份資料）。需要 token。
export async function fetchContributionDays(user, token) {
  if (!token) return []
  const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
    weeks { contributionDays { date contributionCount } } } } } }`
  const result = await request('/graphql', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: user } }),
  })
  const weeks = result?.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? []
  return weeks.flatMap((week) => week.contributionDays.map((day) => ({ date: day.date, count: day.contributionCount })))
}

export async function fetchRecentCommits(user, repo, token, count = 10) {
  const commits = await request(`/repos/${user}/${repo}/commits?per_page=${count}`, token)
  return commits.map((commit) => ({
    message: String(commit.commit?.message ?? '').split('\n')[0].trim(),
    date: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null,
  }))
}
