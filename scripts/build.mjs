// 產生 dist/：抓 GitHub 公開資料 → 整理 → 輸出靜態網頁。
//   node scripts/build.mjs            重新抓資料
//   node scripts/build.mjs --offline  用上次抓的資料（改版面時用，快）

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchContributionDays, fetchRecentCommits, fetchRepos, findToken } from './github.mjs'
import { buildLog, buildProjects, languageCounts, latestPerRepo, recentActivity, summarize } from './model.mjs'
import { renderDevlog, renderHome, renderWork } from './render.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const cacheFile = join(root, '.cache', 'github.json')
const offline = process.argv.includes('--offline')
const UPDATE_COUNT = 5
const LOG_REPOS = 14
const COMMITS_PER_REPO = 12

const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'))

// 最近有動的專案各抓幾筆 commit，之後合成開發日誌
async function fetchCommits(projects, token) {
  const recent = [...projects].sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)).slice(0, LOG_REPOS)
  const entries = []
  for (const project of recent) {
    try {
      const commits = await fetchRecentCommits(config.user, project.name, token, COMMITS_PER_REPO)
      entries.push(...commits.map((commit) => ({ name: project.name, url: project.url, ...commit })))
    } catch (error) {
      console.warn(`略過 ${project.name} 的 commit：${error.message}`)
    }
  }
  return entries
}

async function loadRaw() {
  if (offline) {
    if (!existsSync(cacheFile)) throw new Error('沒有快取資料，請先跑一次 npm run build')
    return JSON.parse(readFileSync(cacheFile, 'utf8'))
  }
  const token = findToken()
  if (!token) console.warn('沒有 GitHub token：可能被流量限制擋住，而且沒有活躍度格子')
  const repos = await fetchRepos(config.user, token)
  const days = await fetchContributionDays(config.user, token).catch((error) => {
    console.warn(`抓不到活躍度：${error.message}`)
    return []
  })
  const commits = await fetchCommits(buildProjects(repos, config), token)
  const raw = { fetchedAt: new Date().toISOString(), repos, days, commits }
  mkdirSync(dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(raw), 'utf8')
  return raw
}

const raw = await loadRaw()
const projects = buildProjects(raw.repos, config)
const asOf = raw.fetchedAt.slice(0, 10)
const log = buildLog(raw.commits ?? [], config)
const data = {
  config,
  projects,
  summary: summarize(projects, config),
  activity: recentActivity(raw.days, 6, asOf),
  activityLong: recentActivity(raw.days, 26, asOf),
  updates: latestPerRepo(log, UPDATE_COUNT),
  log,
  languages: languageCounts(projects),
  asOf,
}

rmSync(dist, { recursive: true, force: true })
for (const page of ['work', 'devlog']) mkdirSync(join(dist, page), { recursive: true })
cpSync(join(root, 'src'), join(dist, 'assets'), { recursive: true })
writeFileSync(join(dist, 'index.html'), renderHome(data), 'utf8')
writeFileSync(join(dist, 'work', 'index.html'), renderWork(data), 'utf8')
writeFileSync(join(dist, 'devlog', 'index.html'), renderDevlog(data), 'utf8')
writeFileSync(join(dist, '.nojekyll'), '', 'utf8')

console.log(`完成：${projects.length} 件作品、${data.summary.stars} 顆星、資料時間 ${asOf}${offline ? '（離線）' : ''}`)
