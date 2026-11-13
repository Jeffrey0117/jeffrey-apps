// 產生 dist/：抓 GitHub 公開資料 → 整理 → 輸出靜態網頁。
//   node scripts/build.mjs            重新抓資料
//   node scripts/build.mjs --offline  用上次抓的資料（改版面時用，快）

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchContributionDays, fetchRecentCommits, fetchRepos, findToken } from './github.mjs'
import { buildLog, buildProjects, languageCounts, latestPerRepo, recentActivity, summarize } from './model.mjs'
import { renderMarkdown, splitFrontMatter, takeTitle } from './markdown.mjs'
import { renderAbout, renderDevlog, renderGuide, renderGuides, renderHome, renderProject, renderWork } from './render.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const cacheFile = join(root, '.cache', 'github.json')
const offline = process.argv.includes('--offline')
const UPDATE_COUNT = 5
const LOG_REPOS = 14
const COMMITS_PER_REPO = 12

const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'))
// 每個專案的一句說明集中在 descriptions.json（底線開頭的鍵是給人看的註解）
const descriptionsFile = join(root, 'descriptions.json')
if (existsSync(descriptionsFile)) {
  const entries = Object.entries(JSON.parse(readFileSync(descriptionsFile, 'utf8'))).filter(([name]) => !name.startsWith('_'))
  config.blurbs = { ...Object.fromEntries(entries), ...(config.blurbs ?? {}) }
}

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

// 圖片插槽：src/img/ 裡有對應檔名的圖就自動用上，沒有就維持純 CSS 的版本
function findImages() {
  const dir = join(root, 'src', 'img')
  const images = { cat: {}, shots: {}, logos: {}, cards: {}, og: '', hero: '', contact: '', about: '' }
  if (!existsSync(dir)) return images
  const isImage = (file) => /\.(png|jpe?g|webp|avif|svg)$/i.test(file)
  const base = (file) => file.replace(/\.[^.]+$/, '').toLowerCase()
  for (const file of readdirSync(dir).filter(isImage)) {
    const name = base(file)
    if (name.startsWith('cat-')) images.cat[name.slice(4)] = `img/${file}`
    else if (name === 'og') images.og = `img/${file}`
    else if (name === 'hero') images.hero = `img/${file}`
    else if (name === 'contact') images.contact = `img/${file}`
    else if (name === 'about') images.about = `img/${file}`
  }
  const logos = join(dir, 'logos')
  if (existsSync(logos)) {
    for (const file of readdirSync(logos).filter(isImage)) images.logos[base(file)] = `img/logos/${file}`
  }
  const cards = join(dir, 'cards')
  if (existsSync(cards)) {
    for (const file of readdirSync(cards).filter(isImage)) images.cards[base(file)] = `img/cards/${file}`
  }
  const shots = join(dir, 'shots')
  if (existsSync(shots)) {
    for (const file of readdirSync(shots).filter(isImage)) images.shots[base(file)] = `img/shots/${file}`
  }
  return images
}

// 樣式表與腳本的版本號 = 內容的雜湊。內容一改網址就變，瀏覽器不會拿舊的快取來配新的 HTML
function assetVersion() {
  const hash = createHash('sha256')
  for (const file of ['site.css', 'site.js']) hash.update(readFileSync(join(root, 'src', file)))
  return hash.digest('hex').slice(0, 10)
}

// 作品介紹文章：content/<專案名>.md。檔名（不分大小寫）要跟 GitHub 的 repo 名稱一樣。
// 底線開頭的檔案（例如 _說明.md）不是文章，略過。文章裡的圖放 content/img/，寫成 ![說明](img/檔名)
function loadArticles(projects) {
  const dir = join(root, 'content')
  const articles = {}
  if (!existsSync(dir)) return articles
  const known = new Set(projects.map((project) => project.name.toLowerCase()))
  for (const file of readdirSync(dir)) {
    if (!/\.md$/i.test(file) || file.startsWith('_')) continue
    const key = file.replace(/\.md$/i, '').toLowerCase()
    if (!known.has(key)) {
      console.warn(`content/${file} 對不上任何公開作品，沒有用到（檔名要跟 repo 名稱一樣）`)
      continue
    }
    const html = renderMarkdown(readFileSync(join(dir, file), 'utf8'), {
      resolveImage: (src) => (/^img\//.test(src) ? `../../assets/content/${src.slice(4)}` : src),
    })
    if (html) articles[key] = html
  }
  return articles
}

// 教學文章：guides/<檔名>.md，檔名就是網址（/guides/<檔名>/）。
// 開頭可以用 --- 包一段設定：title、date（YYYY-MM-DD）、summary。沒寫 title 就用內文第一個 # 標題。
// 底線開頭的檔案不是文章。圖放 guides/img/，寫成 ![說明](img/檔名)
function loadGuides() {
  const dir = join(root, 'guides')
  if (!existsSync(dir)) return []
  const guides = []
  for (const file of readdirSync(dir)) {
    if (!/\.md$/i.test(file) || file.startsWith('_')) continue
    const slug = file.replace(/\.md$/i, '')
    const { meta, body } = splitFrontMatter(readFileSync(join(dir, file), 'utf8'))
    const taken = takeTitle(body)
    const html = renderMarkdown(taken.body, {
      resolveImage: (src) => (/^img\//.test(src) ? `../../assets/guides/${src.slice(4)}` : src),
    })
    if (!html) continue
    const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '') ? meta.date : ''
    guides.push({ slug, title: meta.title || taken.title || slug, date, summary: meta.summary ?? '', html })
  }
  // 新的在前；沒寫日期的排最後
  return guides.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title))
}

// 關於我的內文：pages/about.md
function loadAbout() {
  const file = join(root, 'pages', 'about.md')
  if (!existsSync(file)) return { title: '', html: '' }
  const { meta, body } = splitFrontMatter(readFileSync(file, 'utf8'))
  const taken = takeTitle(body)
  return { title: meta.title || taken.title, html: renderMarkdown(taken.body) }
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
  images: findImages(),
  articles: loadArticles(projects),
  guides: loadGuides(),
  about: loadAbout(),
  version: assetVersion(),
  asOf,
}

rmSync(dist, { recursive: true, force: true })
for (const page of ['work', 'devlog']) mkdirSync(join(dist, page), { recursive: true })
cpSync(join(root, 'src'), join(dist, 'assets'), { recursive: true })
writeFileSync(join(dist, 'index.html'), renderHome(data), 'utf8')
writeFileSync(join(dist, 'work', 'index.html'), renderWork(data), 'utf8')
writeFileSync(join(dist, 'devlog', 'index.html'), renderDevlog(data), 'utf8')

// 每個作品一頁：/work/<專案名>/
for (const project of projects) {
  const dir = join(dist, 'work', project.name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), renderProject(data, project), 'utf8')
}
const contentImages = join(root, 'content', 'img')
if (existsSync(contentImages)) cpSync(contentImages, join(dist, 'assets', 'content'), { recursive: true })

// 教學（列表 + 每篇一頁）和關於我
mkdirSync(join(dist, 'guides'), { recursive: true })
writeFileSync(join(dist, 'guides', 'index.html'), renderGuides(data), 'utf8')
for (const guide of data.guides) {
  const dir = join(dist, 'guides', guide.slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), renderGuide(data, guide), 'utf8')
}
const guideImages = join(root, 'guides', 'img')
if (existsSync(guideImages)) cpSync(guideImages, join(dist, 'assets', 'guides'), { recursive: true })
mkdirSync(join(dist, 'me'), { recursive: true })
writeFileSync(join(dist, 'me', 'index.html'), renderAbout(data), 'utf8')
writeFileSync(join(dist, '.nojekyll'), '', 'utf8')

const { cat, shots, logos, og, hero, contact } = data.images
console.log(`圖片：${hero ? '首頁主視覺 1、' : ''}${contact ? '聯絡卡 1、' : ''}專案 logo ${Object.keys(logos).length}、吉祥物 ${Object.keys(cat).length}、截圖 ${Object.keys(shots).length}${og ? '、分享圖 1' : ''}`)
console.log(`作品介紹頁 ${projects.length} 頁，其中 ${Object.keys(data.articles).length} 頁有文章；教學 ${data.guides.length} 篇`)
console.log(`完成：${projects.length} 件作品、${data.summary.stars} 顆星、資料時間 ${asOf}${offline ? '（離線）' : ''}`)
