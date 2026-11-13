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

// 開發日誌：把各專案的 commit 合成一條時間線。
// 跳過例行維護、含敏感字樣的；同一句訊息出現在好幾個專案只留最新的一筆
export function buildLog(entries, config, limit = 60) {
  const seen = new Set()
  return [...entries]
    .filter((entry) => entry.message && entry.date && !ROUTINE_COMMIT.test(entry.message) && isSafeText(entry.message, config))
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((entry) => {
      if (seen.has(entry.message)) return false
      seen.add(entry.message)
      return true
    })
    .slice(0, limit)
}

// 首頁用：每個專案只取最新的一筆
export function latestPerRepo(log, count = 5) {
  const seen = new Set()
  return log
    .filter((entry) => {
      if (seen.has(entry.name)) return false
      seen.add(entry.name)
      return true
    })
    .slice(0, count)
}

export function groupByDay(log) {
  const days = new Map()
  for (const entry of log) {
    const day = entry.date.slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), entry])
  }
  return [...days].map(([date, entries]) => ({ date, entries }))
}

// 固定種子的亂數，讓裝飾圖每次 build 長得一樣
export function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 5×7 的點陣字。文字標誌用它一格一格拼出來，每格上不同的顏色
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
}
const GLYPH_WIDTH = 5
const GLYPH_HEIGHT = 7
const GLYPH_GAP = 1

// 回傳 { cols, rows, cells }；沒有字型的字元會直接丟錯，免得標誌默默缺一個字
export function wordmarkCells(text, { seed = 1, palette }) {
  const random = seededRandom(seed)
  const letters = [...String(text).toUpperCase()]
  const cells = []
  letters.forEach((letter, index) => {
    const glyph = GLYPHS[letter]
    if (!glyph) throw new Error(`文字標誌沒有「${letter}」這個字的點陣字`)
    const offset = index * (GLYPH_WIDTH + GLYPH_GAP)
    glyph.forEach((line, row) => {
      ;[...line].forEach((bit, col) => {
        if (bit === '1') cells.push({ col: offset + col, row, color: palette[Math.floor(random() * palette.length)] })
      })
    })
  })
  return { cols: letters.length * (GLYPH_WIDTH + GLYPH_GAP) - GLYPH_GAP, rows: GLYPH_HEIGHT, cells }
}

// 判斷 repo 裡的某個檔案像不像這個專案的 logo。分數越高越像，0 以下就不用。
// 只認名字明確是 logo / icon 的檔案：favicon 和框架附的預設圖（vite.svg 之類）太容易抓到不是自己的東西
// readmeImage：README 裡第一張圖的 repo 內路徑。作者會把 logo 放在 README 最上面，
// 所以它如果看起來像標誌（檔名有 logo/icon，或檔名就是專案名的開頭），就是最強的線索
export function scoreLogoPath(path, size, repoName = '', readmeImage = '') {
  const lower = path.toLowerCase()
  const file = lower.slice(lower.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  if (dot <= 0) return 0
  const ext = file.slice(dot + 1)
  const stem = file.slice(0, dot)
  if (!['png', 'webp', 'jpg', 'jpeg', 'svg'].includes(ext)) return 0
  if (/(^|\/)\.[^/]+\//.test(lower)) return 0 // .history/ 之類的隱藏資料夾
  if (/(^|\/)(node_modules|vendor|dist|build\/static|\.next|coverage|test|tests|__tests__|fixtures|examples?|screenshots?|samples?)\//.test(lower)) return 0
  if (/^(vite|react|next|vercel|nuxt|svelte|astro|webpack|electron|tauri|github|placeholder)$/.test(stem)) return 0
  if (/tray|badge|sprite|banner|cover|screenshot|preview|demo|qrcode|qr-|avatar|background|splash|og[-_.]|social/.test(stem)) return 0
  // 太小的點陣圖多半是 16×16 的東西；SVG 是向量，幾百個位元組也可以是完整的標誌
  if (size > 0 && size < (ext === 'svg' ? 150 : 800)) return 0
  if (ext === 'svg' && size > 80_000) return 0 // 太大的 SVG 多半是插畫，不是標誌

  const repo = repoName.toLowerCase()
  const isReadmeImage = Boolean(readmeImage) && lower === readmeImage.toLowerCase()
  const looksLikeMark = /logo|icon/.test(stem) || (stem.length >= 4 && repo.startsWith(stem))
  let score = 0
  if (isReadmeImage && looksLikeMark) score = 130
  else if (stem === 'logo' || stem === `${repo}-logo` || stem === `${repo}_logo`) score = 100
  else if (stem.includes('logo')) score = 85
  else if (stem === 'icon' || stem === 'app-icon' || stem === 'appicon' || stem === `${repo}-icon`) score = 70
  else if (/^icon[-_@]?(512|256|1024|192|128)/.test(stem) || /(512|256|1024)x\1/.test(stem)) score = 60
  else if (stem === repo) score = 40
  else return 0

  if (/(^|[-_@x])(16|24|32|48)([-_@x.]|$)/.test(stem)) score -= 30
  if (/dark|white|mono|small|mini/.test(stem)) score -= 8
  score += { png: 10, svg: 9, webp: 8, jpg: 2, jpeg: 2 }[ext]
  score -= (lower.split('/').length - 1) * 4 // 放得越深越不像是主要的 logo
  return score
}

// 從 README 的內容找出第一張「放在 repo 裡」的圖，回傳它的 repo 內路徑；外部網址（徽章、圖床）不算
export function firstReadmeImage(markdown) {
  const pattern = /<img[^>]+src=["']([^"']+)["']|!\[[^\]]*\]\(([^)\s]+)/gi
  for (const match of String(markdown ?? '').matchAll(pattern)) {
    const src = (match[1] || match[2]).trim()
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) || /^data:/i.test(src)) continue
    return src.replace(/[?#].*$/, '').replace(/^\.?\//, '')
  }
  return ''
}

export function colorFor(name, palette) {
  let hash = 0
  for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) >>> 0
  return palette[hash % palette.length]
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
