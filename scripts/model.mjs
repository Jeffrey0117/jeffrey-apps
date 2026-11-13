// 把 GitHub 的原始資料整理成網站要顯示的樣子。純函式，沒有網路、沒有檔案。

const TOOL_LANGUAGES = ['Python', 'Rust', 'Batchfile', 'PowerShell', 'Shell', 'Go']

// 描述開頭的 emoji 和「名稱 - 」前綴拿掉，只留內容
export function cleanText(text, name = '') {
  let result = String(text ?? '')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (name) {
    const spaced = name.replace(/[-_]/g, ' ')
    const prefix = new RegExp(`^(?:${escapeRegExp(name)}|${escapeRegExp(spaced)})\\s*[-–—:：|｜]\\s*`, 'i')
    result = result.replace(prefix, '')
  }
  return result
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function categorize(repo, config) {
  for (const [category, names] of Object.entries(config.categoryOf ?? {})) {
    if (names.some((name) => name.toLowerCase() === repo.name.toLowerCase())) return category
  }
  if (/-kit$/i.test(repo.name)) return 'kit'
  if (/tampermonkey|userscript/i.test(repo.name)) return 'script'
  if (TOOL_LANGUAGES.includes(repo.language)) return 'tool'
  return 'web'
}

export function isVisible(repo, config) {
  if (repo.fork || repo.archived) return false
  if ((config.hide ?? []).some((pattern) => new RegExp(pattern, 'i').test(repo.name))) return false
  if (!repo.description && repo.stars === 0) return false
  if (config.hideUntouchedBefore && repo.stars === 0 && repo.pushedAt < config.hideUntouchedBefore) return false
  return true
}

// 含有不該公開的字樣（私人網域、本機位址、IP）的文字整段不用
export function isSafeText(text, config) {
  return !(config.redact ?? []).some((pattern) => new RegExp(pattern, 'i').test(String(text)))
}

const ROUTINE_COMMIT = /^(?:chore|docs|ci|test|style|build|merge|revert|wip|bump)\b/i

// 從一個 repo 最近的 commit 裡挑一筆值得放上開發日誌的：
// 跳過例行維護、含敏感字樣的、和別的專案重複的訊息
export function pickUpdate(commits, config, used = new Set()) {
  return (
    commits.find(
      (commit) =>
        commit.message &&
        !ROUTINE_COMMIT.test(commit.message) &&
        isSafeText(commit.message, config) &&
        !used.has(commit.message),
    ) ?? null
  )
}

export function toProject(repo, config) {
  const blurb = config.blurbs?.[repo.name] ?? cleanText(repo.description, repo.name)
  const homepage = repo.homepage && isSafeText(repo.homepage, config) && !repo.homepage.includes('github.com/') ? repo.homepage : ''
  return {
    name: repo.name,
    blurb: isSafeText(blurb, config) ? blurb : '',
    category: categorize(repo, config),
    stars: repo.stars,
    language: repo.language,
    url: repo.url,
    homepage,
    link: homepage || repo.url,
    pushedAt: repo.pushedAt,
  }
}

export function buildProjects(repos, config) {
  return repos
    .filter((repo) => isVisible(repo, config))
    .map((repo) => toProject(repo, config))
    .sort((a, b) => b.stars - a.stars || b.pushedAt.localeCompare(a.pushedAt))
}

export function languageCounts(projects, limit = 12) {
  const counts = new Map()
  for (const project of projects) {
    if (project.language) counts.set(project.language, (counts.get(project.language) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

// 最近 N 週的每日活躍度，補滿成整週（週日開頭），給首頁那片格子用
export function recentActivity(days, weeks = 6, today = new Date().toISOString().slice(0, 10)) {
  const byDate = new Map(days.map((day) => [day.date, day.count]))
  const end = new Date(`${today}T00:00:00Z`)
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - end.getUTCDay() - (weeks - 1) * 7)

  const cells = []
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10)
    cells.push({ date, count: byDate.get(date) ?? 0 })
  }
  const max = Math.max(1, ...cells.map((cell) => cell.count))
  const level = (count) => (count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4)))
  return {
    from: cells[0]?.date ?? today,
    to: today,
    total: cells.reduce((sum, cell) => sum + cell.count, 0),
    cells: cells.map((cell) => ({ ...cell, level: level(cell.count) })),
  }
}

export function summarize(projects, config) {
  const count = (category) => projects.filter((project) => project.category === category).length
  return {
    projects: projects.length,
    stars: projects.reduce((sum, project) => sum + project.stars, 0),
    byCategory: (config.categories ?? []).map((category) => ({ ...category, count: count(category.id) })),
  }
}
