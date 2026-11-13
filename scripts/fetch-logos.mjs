// 從各個公開 repo 抓 logo / 圖示，縮成小圖放進 src/img/logos/。
//   node scripts/fetch-logos.mjs            只補還沒有的
//   node scripts/fetch-logos.mjs --force    全部重抓
// 需要本機有 ffmpeg。抓下來的圖會 commit 進 repo，所以部署時不需要 ffmpeg，也不會每次都打 API。
// 先跑過一次 npm run build（要用它快取的專案清單）。

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findToken } from './github.mjs'
import { buildProjects, firstReadmeImage, scoreLogoPath } from './model.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src', 'img', 'logos')
const tmpDir = join(root, '.cache', 'logos')
const cacheFile = join(root, '.cache', 'github.json')
const force = process.argv.includes('--force')
const SIZE = 128

if (!existsSync(cacheFile)) throw new Error('沒有專案快取，請先跑 npm run build')
const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'))
const projects = buildProjects(JSON.parse(readFileSync(cacheFile, 'utf8')).repos, config)
const token = findToken()
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'jeffrey-apps-build',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
}

mkdirSync(outDir, { recursive: true })
mkdirSync(tmpDir, { recursive: true })
const have = new Set(readdirSync(outDir).map((file) => file.replace(/\.[^.]+$/, '').toLowerCase()))

async function listFiles(name) {
  const res = await fetch(`https://api.github.com/repos/${config.user}/${name}/git/trees/HEAD?recursive=1`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const body = await res.json()
  return (body.tree ?? []).filter((entry) => entry.type === 'blob')
}

async function readmeImage(name) {
  const res = await fetch(`https://api.github.com/repos/${config.user}/${name}/readme`, { headers, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) return ''
  const body = await res.json()
  return firstReadmeImage(Buffer.from(body.content ?? '', 'base64').toString('utf8'))
}

function pickLogo(files, name, fromReadme) {
  const scored = files
    .map((file) => ({ path: file.path, score: scoreLogoPath(file.path, file.size ?? 0, name, fromReadme) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length)
  return scored[0]?.path ?? null
}

async function download(name, path) {
  const url = `https://raw.githubusercontent.com/${config.user}/${name}/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`下載失敗 ${res.status}`)
  const file = join(tmpDir, `${name}${path.slice(path.lastIndexOf('.')).toLowerCase()}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

// 縮成正方形小圖，保留透明背景，不放大、不變形
function convert(source, target) {
  const fit = `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', source, '-vf', fit, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '90', target], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
}

const found = []
const missing = []
const failed = []

// 抓到的不是自己的標誌（fork 上游的、框架預設的、別人的浮水印）就列進 site.config.json 的 logoSkip
const skip = new Set((config.logoSkip ?? []).map((name) => name.toLowerCase()))

for (const project of projects) {
  const key = project.name.toLowerCase()
  if (skip.has(key)) {
    missing.push(project.name)
    continue
  }
  if (!force && have.has(key)) {
    found.push(`${project.name}（已有）`)
    continue
  }
  try {
    const path = pickLogo(await listFiles(project.name), project.name, await readmeImage(project.name))
    if (!path) {
      missing.push(project.name)
      continue
    }
    const source = await download(project.name, path)
    // SVG 是向量圖，直接用原檔（瀏覽器會自己畫，放大也不糊）；點陣圖才縮成小圖
    if (/\.svg$/i.test(path)) copyFileSync(source, join(outDir, `${project.name}.svg`))
    else convert(source, join(outDir, `${project.name}.webp`))
    found.push(`${project.name} ← ${path}`)
  } catch (error) {
    failed.push(`${project.name}：${String(error.message).split('\n')[0]}`)
  }
}

rmSync(tmpDir, { recursive: true, force: true })
console.log(`有 logo 的 ${found.length} 個：\n  ${found.join('\n  ')}`)
if (failed.length) console.log(`\n失敗 ${failed.length} 個：\n  ${failed.join('\n  ')}`)
console.log(`\n沒找到 logo 的 ${missing.length} 個（維持字母方塊）`)
