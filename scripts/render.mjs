// HTML 樣板。所有來自外部的文字都過 esc()。

import { colorFor, groupByDay, mosaicCells, wordmarkCells } from './model.mjs'

const DEFAULT_PALETTE = ['#ffd84d', '#ff9ec4', '#7fd4ff', '#8be3b0', '#ffb067', '#c9a6ff', '#fff3c4']
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const paletteOf = (config) => (config.palette?.length ? config.palette : DEFAULT_PALETTE)
// 每個 render 函式一開始會設定，mono() 和 mosaic() 共用
let palette = DEFAULT_PALETTE

// 文字標誌：大寫點陣字，每一格一個顏色，跟頭貼那隻貓同一個做法。沒設定 wordmark 就用純文字
function brandMark(config) {
  if (!config.wordmark) return esc(config.brand)
  const cell = 4
  const { cols, rows, cells } = wordmarkCells(config.wordmark, { seed: 7, palette })
  const rects = cells
    .map((c) => `<rect x="${c.col * cell}" y="${c.row * cell}" width="${cell}" height="${cell}" fill="${esc(c.color)}"/>`)
    .join('')
  return `<svg class="wordmark" viewBox="0 0 ${cols * cell} ${rows * cell}" shape-rendering="crispEdges" role="img" aria-label="${esc(config.wordmark)}">${rects}</svg>`
}

// 馬賽克邊條。放在段落底部，方塊越往下越密
function mosaic(seed) {
  const cell = 10
  const cols = 180
  const rows = 6
  const rects = mosaicCells({ seed, cols, rows, palette })
    .map((c) => `<rect x="${c.col * cell}" y="${c.row * cell}" width="${cell}" height="${cell}" fill="${esc(c.color)}"/>`)
    .join('')
  return `<svg class="mosaic" viewBox="0 0 ${cols * cell} ${rows * cell}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`
}

export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const shortDate = (iso) => {
  const date = new Date(iso)
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

const ICONS = {
  github:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>',
  star:
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="m12 2.5 2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L12 2.5Z"/></svg>',
  theme:
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.5-.04-.98-.12-1.45A6 6 0 0 1 12.45 3.12C12.3 3.04 12.15 3 12 3Z"/></svg>',
}

const stars = (count) => (count > 0 ? `<span class="stars">${ICONS.star}${count}</span>` : '')
const mono = (name) =>
  `<span class="mono-mark" style="--tile:${esc(colorFor(name, palette))}" aria-hidden="true">${esc([...name][0].toUpperCase())}</span>`

function layout({ config, root, title, description, active, body, asOf, images, version }) {
  const v = version ? `?v=${esc(version)}` : ''
  const ogImage = images?.og && config.siteUrl ? `${config.siteUrl.replace(/\/$/, '')}/assets/${images.og}` : ''
  const ogTags = ogImage
    ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:card" content="summary_large_image">`
    : ''
  const nav = [
    { id: 'home', label: '首頁', href: `${root}` },
    { id: 'work', label: '作品', href: `${root}work/` },
    { id: 'devlog', label: '日誌', href: `${root}devlog/` },
  ]
  const { github, email, instagram, threads } = config.links
  const socials = [
    github && `<a href="${esc(github)}" rel="noopener">GitHub</a>`,
    instagram && `<a href="${esc(instagram)}" rel="noopener">Instagram</a>`,
    threads && `<a href="${esc(threads)}" rel="noopener">Threads</a>`,
    email && `<a href="mailto:${esc(email)}">Email</a>`,
  ].filter(Boolean)

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${ogTags}
<meta name="color-scheme" content="light dark">
${config.favicon || config.avatar ? `<link rel="icon" href="${root}assets/${esc(config.favicon || config.avatar)}">` : ''}
<link rel="stylesheet" href="${root}assets/site.css${v}">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">跳至主要內容</a>
<header class="topbar">
  <a class="brand${config.wordmark ? ' has-wordmark' : ''}" href="${root}" aria-label="${esc(config.name ?? config.brand)} 首頁">${brandMark(config)}</a>
  <nav class="nav" aria-label="主選單">
    ${nav.map((item) => `<a href="${item.href}"${item.id === active ? ' aria-current="page"' : ''}>${item.label}</a>`).join('\n    ')}
    ${github ? `<a href="${esc(github)}" rel="noopener">GitHub</a>` : ''}
  </nav>
  <button class="theme-toggle" type="button" aria-label="切換深色模式">${ICONS.theme}</button>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <div>
      <div class="brand footer-brand">${brandMark(config)}</div>
      <p class="muted">${esc(config.description)}</p>
    </div>
    <nav aria-label="頁尾">
      <a href="${root}">首頁</a>
      <a href="${root}work/">全部作品</a>
      <a href="${root}devlog/">開發日誌</a>
      ${socials.join('\n      ')}
    </nav>
  </div>
  <div class="wrap footer-note">
    <span>${
      config.poweredBy?.url
        ? `Powered by <a class="powered" href="${esc(config.poweredBy.url)}" rel="noopener">${esc(config.poweredBy.label)}</a>・`
        : ''
    }數字截至 ${esc(asOf)}</span>
    <span>© ${new Date(asOf).getUTCFullYear()} ${esc(config.name ?? config.brand)}</span>
  </div>
</footer>
<script src="${root}assets/site.js${v}" defer></script>
</body>
</html>
`
}

const sectionHead = (number, label, heading, extra = '') => `
    <div class="section-head">
      <div>
        <p class="eyebrow"><span>${number}</span>${esc(label)}</p>
        <h2>${heading}</h2>
      </div>
      ${extra}
    </div>`

function heatmap(activity) {
  if (activity.cells.length === 0) return ''
  const cells = activity.cells
    .map((cell) => `<i class="lv${cell.level}" title="${esc(cell.date)}：${cell.count} 次"></i>`)
    .join('')
  return `<div class="heatmap" role="img" aria-label="${esc(shortDate(activity.from))} 到 ${esc(shortDate(activity.to))} 共 ${activity.total} 次更新">${cells}</div>`
}

function smallCard(project, thumb = '') {
  return `<a class="card small${thumb ? ' has-thumb' : ''}" href="${esc(project.link)}" rel="noopener">
        ${thumb ? `<img class="thumb" src="${thumb}" alt="" loading="lazy">` : ''}
        ${mono(project.name)}
        <h3>${esc(project.name)}</h3>
        <p>${esc(project.blurb)}</p>
      </a>`
}

function listRows(projects) {
  return projects
    .map(
      (project) => `<a class="row" href="${esc(project.link)}" rel="noopener">
            ${mono(project.name)}
            <span><strong>${esc(project.name)}</strong><span class="muted">${esc(project.blurb)}</span></span>
          </a>`,
    )
    .join('\n          ')
}

export function renderHome(data) {
  const { config, projects, summary, activity, updates, languages, asOf } = data
  palette = paletteOf(config)
  const images = data.images ?? { bg: {}, cat: {}, shots: {}, og: '' }
  const asset = (path) => `./assets/${esc(path)}`
  // 有背景圖的段落：圖的上段貼在段落上緣、下段貼在下緣，中間留白放卡片。
  // 路徑刻意寫成相對於樣式表（assets/site.css）：CSS 變數裡的網址是以樣式表的位置解析的
  const band = (id) => {
    const bg = images.bg[id]
    return `<section id="${id}" class="band band-${id}${bg ? ' has-bg' : ''}"${bg ? ` style="--bg:url('${esc(bg)}')"` : ''}>`
  }
  const cat = (slot) =>
    images.cat[slot] ? `<img class="cat cat-${slot}" src="${asset(images.cat[slot])}" alt="" loading="lazy">` : ''
  const shotOf = (name) => {
    const file = images.shots[String(name).toLowerCase()]
    return file ? asset(file) : ''
  }
  const find = (name) => projects.find((project) => project.name.toLowerCase() === String(name).toLowerCase())
  const pick = (names) => (names ?? []).map(find).filter(Boolean)
  const home = config.home
  const lead = find(home.lead)
  const dark = find(home.dark)
  const trio = pick(home.trio?.repos)
  const small = pick(home.small)
  const kits = projects.filter((project) => project.category === 'kit')
  const kitNames = pick(home.kitCard?.show).map((project) => project.name)
  const infra = pick(home.list?.repos)
  const latest = updates[0]
  const categoryCount = (id) => summary.byCategory.find((category) => category.id === id)?.count ?? 0

  const heroLines = config.hero.lines
    .map((line, index) => (index === config.hero.accentLine ? `<span class="accent">${esc(line)}</span>` : esc(line)))
    .join('<br>')

  const stages = [
    ['intro', '起點'],
    ['work', '作品'],
    ['recent', '最近'],
    ['tools', '工具'],
    ['contact', '聯絡'],
  ]

  const body = `
<nav class="stage-index" aria-label="段落">
  ${stages.map(([id, label], index) => `<a href="#${id}"><span>${index + 1}</span><em>${label}</em></a>`).join('\n  ')}
</nav>

${band('intro')}
  <div class="wrap">
    <p class="eyebrow"><span>01</span>起點</p>
    <div class="hero-grid">
      <div class="card hero${images.hero ? ' has-art' : ''}"${images.hero ? ` style="background-image:url('${asset(images.hero)}')"` : ''}>
        ${latest ? `<a class="now" href="#recent"><i></i>最近在改 ${esc(latest.name)}</a>` : ''}
        <h1>${heroLines}</h1>
        <p class="lede">${esc(config.hero.intro)}</p>
        <div class="actions">
          <a class="btn primary" href="#work">看作品</a>
          ${config.links.github ? `<a class="btn" href="${esc(config.links.github)}" rel="noopener">${ICONS.github}GitHub</a>` : ''}
        </div>
        ${images.hero ? '' : cat('hero')}
      </div>
      <a class="card stat ink with-avatar" href="./work/">
        <span class="label">公開的東西</span>
        <span class="big">${summary.projects}<small>件</small></span>
        <span class="muted">${summary.byCategory.filter((c) => c.count > 0).slice(0, 4).map((c) => esc(c.label)).join('、')}</span>
        ${config.avatar ? `<img class="avatar" src="./assets/${esc(config.avatar)}" alt="${esc(config.name ?? '')} 的吉祥物">` : ''}
      </a>
      <div class="card stat">
        <span class="label">Kit</span>
        <span class="big">${kits.length}<small>個</small></span>
        <span class="muted">零依賴、可複用</span>
      </div>
      <div class="card stat">
        <span class="label">GitHub 星星</span>
        <span class="big">${summary.stars}</span>
        <span class="muted">公開專案合計</span>
      </div>
    </div>
  </div>
  ${mosaic(11)}
</section>

${band('work')}
  <div class="wrap">${sectionHead('02', '作品', '挑幾個做過的東西，<br>給你看看。', `<a class="btn" href="./work/">全部 ${summary.projects} 件${ICONS.arrow}</a>`)}
    <div class="bento">
      ${
        lead
          ? `<a class="card lead${shotOf(lead.name) ? ' has-shot' : ''}" href="${esc(lead.link)}" rel="noopener">
        <p class="label">桌面 App・開源</p>
        <h3>${esc(lead.name)}</h3>
        <p>${esc(lead.blurb)}</p>
        <div class="meta">${stars(lead.stars)}<span class="chip">${esc(lead.language)}</span></div>
        ${
          shotOf(lead.name)
            ? `<img class="shot" src="${shotOf(lead.name)}" alt="${esc(lead.name)} 的畫面" loading="lazy">`
            : `<div class="waveform" aria-hidden="true">${Array.from({ length: 36 }, (_, i) => `<i style="--h:${18 + Math.round(Math.abs(Math.sin(i * 0.9) * 60 + Math.cos(i * 0.37) * 22))}%"></i>`).join('')}</div>`
        }
      </a>`
          : ''
      }
      ${
        dark
          ? `<a class="card ink dark-card" href="${esc(dark.link)}" rel="noopener">
        <p class="label">開源・GitHub</p>
        <h3>${esc(dark.name)}</h3>
        <p>${esc(dark.blurb)}</p>
        <div class="meta">${stars(dark.stars)}<span class="chip">${esc(dark.language)}</span></div>
      </a>`
          : ''
      }
      ${small.map((project) => smallCard(project, shotOf(project.name))).join('\n      ')}
      <div class="card list-card">
        <div class="list-head"><h3>${esc(home.trio.title)}</h3><span class="muted">${esc(home.trio.note)}</span></div>
        <div class="rows">
          ${listRows(trio)}
        </div>
      </div>
      <div class="card list-card">
        <div class="list-head"><h3>${esc(home.list.title)}</h3><span class="muted">${esc(home.list.note)}</span></div>
        <div class="rows">
          ${listRows(infra)}
        </div>
      </div>
      <a class="card kit-card" href="./work/#kit">
        <p class="label">${esc(home.kitCard.title)}</p>
        <span class="big">${kits.length}<small>個 kit</small></span>
        <p>${esc(home.kitCard.note)}</p>
        <div class="chips">${kitNames.map((name) => `<span class="chip">${esc(name)}</span>`).join('')}<span class="chip more">+${Math.max(0, kits.length - kitNames.length)}</span></div>
      </a>
    </div>
  </div>
  ${mosaic(23)}
</section>

${band('recent')}
  <div class="wrap">${sectionHead('03', '最近', '最近在忙什麼')}
    <div class="recent-grid">
      <div class="card">
        <div class="list-head"><h3><a href="./devlog/">開發日誌</a></h3><span class="muted">${activity.cells.length ? `${esc(shortDate(activity.from))} – ${esc(shortDate(activity.to))}・${activity.total} 次更新` : ''}</span></div>
        ${heatmap(activity)}
        <div class="rows log">
          ${updates
            .map(
              (update) => `<a class="row" href="${esc(update.url)}" rel="noopener">
            ${mono(update.name)}
            <span><strong>${esc(update.name)}</strong><span class="muted">${esc(update.message)}</span></span>
            <time datetime="${esc(update.date)}">${esc(shortDate(update.date))}</time>
          </a>`,
            )
            .join('\n          ')}
        </div>
        <a class="more-link" href="./devlog/">看完整日誌${ICONS.arrow}</a>
      </div>
      <div class="card">
        <div class="list-head"><h3>依類型</h3><span class="muted">點了看全部</span></div>
        <div class="rows">
          ${summary.byCategory
            .filter((category) => category.count > 0)
            .map(
              (category) => `<a class="row count-row" href="./work/#${esc(category.id)}">
            <strong>${esc(category.label)}</strong>
            <span class="num">${category.count}</span>
          </a>`,
            )
            .join('\n          ')}
        </div>
      </div>
      <div class="card stat-stack">
        <div><span class="big">${categoryCount('app')}</span><span class="muted">個桌面 App</span></div>
        <div><span class="big">${categoryCount('service')}</span><span class="muted">個自架服務</span></div>
        <div><span class="big">${summary.stars}<i class="accent">${ICONS.star}</i></span><span class="muted">開源星星</span></div>
      </div>
    </div>
  </div>
</section>

${band('tools')}
  <div class="wrap">${sectionHead('04', '工具', '常用的工具，<br>和做事的方式')}
    <div class="tools-grid">
      <div class="card">
        <h3>常用的語言</h3>
        <p class="muted">依公開專案的主要語言統計</p>
        <div class="chips big-chips">${languages.map((language) => `<span class="chip">${esc(language.name)}<b>${language.count}</b></span>`).join('')}</div>
      </div>
      <div class="card">
        <h3>做事的方式</h3>
        <ul class="principles">
          <li><strong>自己架。</strong>儲存、資料庫、登入、驗證碼都有自架版本，不被平台綁住。</li>
          <li><strong>抽成 kit。</strong>兩個專案都會用到的東西就抽出來，零依賴，改一次全部升級。</li>
          <li><strong>本機優先。</strong>語音輸入、看圖看片都在自己的電腦上跑，不上雲。</li>
          <li><strong>公開原始碼。</strong>做出來的東西大多放在 GitHub。</li>
        </ul>
      </div>
    </div>
  </div>
  ${mosaic(37)}
</section>

${band('contact')}
  <div class="wrap">
    <p class="eyebrow"><span>05</span>聯絡</p>
    <div class="card contact${images.contact ? ' has-art' : ''}"${images.contact ? ` style="background-image:url('${asset(images.contact)}')"` : ''}>
      <h2>${config.contact.lines.map(esc).join('<br>')}</h2>
      <p class="lede">${esc(config.contact.note)}</p>
      <div class="actions">
        ${config.links.email ? `<a class="btn primary" href="mailto:${esc(config.links.email)}">${esc(config.links.email)}</a>` : ''}
        ${config.links.github ? `<a class="btn${config.links.email ? '' : ' primary'}" href="${esc(config.links.github)}" rel="noopener">${ICONS.github}到 GitHub 找我</a>` : ''}
        ${config.links.instagram ? `<a class="btn" href="${esc(config.links.instagram)}" rel="noopener">Instagram</a>` : ''}
        ${config.links.threads ? `<a class="btn" href="${esc(config.links.threads)}" rel="noopener">Threads</a>` : ''}
      </div>
      ${images.contact ? '' : cat('contact')}
    </div>
  </div>
</section>`

  return layout({ config, root: './', title: config.title, description: config.description, active: 'home', body, asOf, images, version: data.version })
}

export function renderDevlog(data) {
  const { config, log, activityLong, asOf } = data
  palette = paletteOf(config)
  const days = groupByDay(log)
  const dayLabel = (iso) => {
    const date = new Date(`${iso}T00:00:00Z`)
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}（${WEEKDAYS[date.getUTCDay()]}）`
  }

  const body = `
<section class="band band-intro devlog-page">
  <div class="wrap narrow">
    <p class="eyebrow"><span>日誌</span>開發日誌</p>
    <h1 class="page-title">最近在忙什麼</h1>
    <p class="lede">各個公開專案的更新，合成一條時間線。每一筆都連到那個專案的原始碼。</p>
    <div class="card">
      <div class="list-head"><h3>活躍度</h3><span class="muted">${activityLong.cells.length ? `${esc(shortDate(activityLong.from))} – ${esc(shortDate(activityLong.to))}・${activityLong.total} 次更新` : ''}</span></div>
      <div class="heatmap-scroll">${heatmap(activityLong)}</div>
    </div>
    ${
      days.length === 0
        ? '<p class="muted">目前沒有可以顯示的更新。</p>'
        : days
            .map(
              (day) => `<div class="day">
      <h2 class="day-title">${esc(dayLabel(day.date))}<span class="muted">${day.entries.length} 筆</span></h2>
      <div class="card rows log">
        ${day.entries
          .map(
            (entry) => `<a class="row" href="${esc(entry.url)}" rel="noopener">
          ${mono(entry.name)}
          <span><strong>${esc(entry.name)}</strong><span class="muted">${esc(entry.message)}</span></span>
        </a>`,
          )
          .join('\n        ')}
      </div>
    </div>`,
            )
            .join('\n    ')
    }
  </div>
  ${mosaic(53)}
</section>`

  return layout({
    config,
    root: '../',
    title: `開發日誌｜${config.name ?? config.brand}`,
    description: `${config.name ?? ''} 各個公開專案的最近更新。`,
    active: 'devlog',
    body,
    asOf,
    images: data.images,
    version: data.version,
  })
}

export function renderWork(data) {
  const { config, projects, summary, asOf } = data
  palette = paletteOf(config)
  const groups = summary.byCategory.filter((category) => category.count > 0)

  const body = `
<section class="band band-intro work-page">
  <div class="wrap">
    <p class="eyebrow"><span>全部</span>作品</p>
    <h1 class="page-title">公開的 ${summary.projects} 件東西</h1>
    <p class="lede">桌面 App、自架服務、kit、開發工具和瀏覽器腳本。每一件都連到原始碼或介紹頁。</p>
    <div class="filters" role="group" aria-label="依類型篩選">
      <button type="button" class="chip filter" data-filter="all" aria-pressed="true">全部<b>${summary.projects}</b></button>
      ${groups.map((category) => `<button type="button" class="chip filter" data-filter="${esc(category.id)}" aria-pressed="false">${esc(category.label)}<b>${category.count}</b></button>`).join('\n      ')}
    </div>
    <p class="muted empty" hidden>這個類型目前沒有東西。</p>
    <div class="wall">
      ${projects
        .map(
          (project) => `<a class="card small wall-item" data-category="${esc(project.category)}" href="${esc(project.link)}" rel="noopener">
        <div class="wall-top">${mono(project.name)}${stars(project.stars)}</div>
        <h3>${esc(project.name)}</h3>
        <p>${esc(project.blurb)}</p>
        <div class="meta"><span class="chip">${esc(groups.find((category) => category.id === project.category)?.label ?? '')}</span>${project.language ? `<span class="chip">${esc(project.language)}</span>` : ''}</div>
      </a>`,
        )
        .join('\n      ')}
    </div>
  </div>
  ${mosaic(41)}
</section>`

  return layout({
    config,
    root: '../',
    title: `全部作品｜${config.name ?? config.brand}`,
    description: `公開的 ${summary.projects} 件作品：桌面 App、自架服務、kit、開發工具與瀏覽器腳本。`,
    active: 'work',
    body,
    asOf,
    images: data.images,
    version: data.version,
  })
}
