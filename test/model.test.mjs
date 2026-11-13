import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildLog, buildProjects, categorize, cleanText, colorFor, firstReadmeImage, groupByDay, isSafeText, isVisible, languageCounts,
  latestPerRepo, recentActivity, scoreLogoPath, seededRandom, summarize, toProject, wordmarkCells,
} from '../scripts/model.mjs'
import { esc, renderAbout, renderDevlog, renderGuide, renderGuides, renderHome, renderProject, renderWork } from '../scripts/render.mjs'

const config = {
  user: 'someone',
  brand: 'Someone.',
  title: 'Someone',
  description: 'desc',
  hero: { lines: ['a', 'b'], accentLine: 1, intro: 'intro' },
  links: { github: 'https://github.com/someone', email: '', instagram: '', threads: '' },
  contact: { lines: ['hi'], note: 'note' },
  categories: [
    { id: 'app', label: 'App' },
    { id: 'kit', label: 'Kit' },
    { id: 'tool', label: 'Tool' },
    { id: 'script', label: 'Script' },
    { id: 'web', label: 'Web' },
  ],
  categoryOf: { app: ['BigApp'] },
  blurbs: { BigApp: '自訂說明' },
  home: {
    lead: 'BigApp',
    dark: 'cli-thing',
    trio: { title: 'Trio', note: 'n', repos: ['BigApp'] },
    small: ['foo-kit'],
    kitCard: { title: 'Kits', note: 'n', show: ['foo-kit'] },
    list: { title: 'Infra', note: 'n', repos: ['cli-thing'] },
  },
  hide: ['^secret', '^profile$'],
  redact: ['private[a-z]+\\.com', 'localhost'],
  hideUntouchedBefore: '2025-08-01',
}

const repo = (name, extra = {}) => ({
  name,
  description: `${name} does things`,
  stars: 0,
  language: 'JavaScript',
  homepage: '',
  url: `https://github.com/someone/${name}`,
  pushedAt: '2026-11-01T00:00:00Z',
  fork: false,
  archived: false,
  ...extra,
})

test('cleanText strips emoji and a leading "Name - " prefix', () => {
  assert.equal(cleanText('🔥 聲聲慢：最快的語音輸入'), '聲聲慢：最快的語音輸入')
  assert.equal(cleanText('🎬 InoVid - In and out video tool', 'inovid'), 'In and out video tool')
  assert.equal(cleanText('📏 LineX - Line-based text utility', 'lineX'), 'Line-based text utility')
  assert.equal(cleanText(null), '')
})

test('categorize: config wins, then name and language rules', () => {
  assert.equal(categorize(repo('BigApp'), config), 'app')
  assert.equal(categorize(repo('bigapp'), config), 'app')
  assert.equal(categorize(repo('auth-kit'), config), 'kit')
  assert.equal(categorize(repo('tampermonkey-x'), config), 'script')
  assert.equal(categorize(repo('cli', { language: 'Rust' }), config), 'tool')
  assert.equal(categorize(repo('site', { language: 'HTML' }), config), 'web')
})

test('isVisible hides forks, archived, hidden names, empty and stale repos', () => {
  assert.equal(isVisible(repo('ok'), config), true)
  assert.equal(isVisible(repo('f', { fork: true }), config), false)
  assert.equal(isVisible(repo('a', { archived: true }), config), false)
  assert.equal(isVisible(repo('secret-thing'), config), false)
  assert.equal(isVisible(repo('profile'), config), false)
  assert.equal(isVisible(repo('blank', { description: '' }), config), false)
  assert.equal(isVisible(repo('blank-but-starred', { description: '', stars: 3 }), config), true)
  assert.equal(isVisible(repo('old', { pushedAt: '2024-01-01T00:00:00Z' }), config), false)
  assert.equal(isVisible(repo('old-but-starred', { pushedAt: '2024-01-01T00:00:00Z', stars: 4 }), config), true)
})

test('nothing matching the redact list reaches a project', () => {
  assert.equal(isSafeText('see https://privatezone.com/x', config), false)
  assert.equal(isSafeText('fix: typo', config), true)

  const leaky = toProject(repo('leaky', { description: 'runs at privatezone.com', homepage: 'https://privatezone.com' }), config)
  assert.equal(leaky.blurb, '')
  assert.equal(leaky.homepage, '')
  assert.equal(leaky.link, 'https://github.com/someone/leaky')
})

const entry = (name, message, date) => ({ name, url: `https://github.com/someone/${name}`, message, date })

test('buildLog drops routine and unsafe commits, dedupes, and sorts newest first', () => {
  const log = buildLog(
    [
      entry('a', 'chore: describe this repository', '2026-11-13T05:00:00Z'),
      entry('a', 'docs: readme', '2026-11-13T04:00:00Z'),
      entry('a', 'fix: point at privatezone.com', '2026-11-13T03:00:00Z'),
      entry('a', 'feat: camera download', '2026-11-12T02:00:00Z'),
      entry('b', 'feat: shared wording', '2026-11-13T01:00:00Z'),
      entry('c', 'feat: shared wording', '2026-11-11T01:00:00Z'),
      entry('b', 'fix: older', '2026-11-10T01:00:00Z'),
      entry('d', '', '2026-11-13T09:00:00Z'),
    ],
    config,
  )
  assert.deepEqual(log.map((item) => `${item.name}:${item.message}`), [
    'b:feat: shared wording',
    'a:feat: camera download',
    'b:fix: older',
  ])
  assert.deepEqual(latestPerRepo(log, 5).map((item) => item.name), ['b', 'a'])
  assert.deepEqual(groupByDay(log).map((day) => [day.date, day.entries.length]), [
    ['2026-11-13', 1],
    ['2026-11-12', 1],
    ['2026-11-10', 1],
  ])
  assert.equal(buildLog([entry('a', 'feat: x', '2026-11-01T00:00:00Z'), entry('a', 'feat: y', '2026-11-02T00:00:00Z')], config, 1).length, 1)
})

test('decoration is deterministic and stays inside the palette', () => {
  const palette = ['#111111', '#222222']
  const mark = wordmarkCells('htmlcat', { seed: 7, palette })
  assert.equal(mark.cols, 7 * 6 - 1)
  assert.equal(mark.rows, 7)
  assert.ok(mark.cells.length > 60 && mark.cells.every((cell) => cell.col < mark.cols && palette.includes(cell.color)))
  assert.deepEqual(mark, wordmarkCells('HTMLCAT', { seed: 7, palette }))
  assert.throws(() => wordmarkCells('cat9', { palette }), /點陣字/)
  assert.equal(colorFor('Pokkit', palette), colorFor('Pokkit', palette))
  assert.ok(seededRandom(1)() < 1)
})

test('scoreLogoPath picks real logos and ignores look-alikes', () => {
  const score = (path, size = 20_000, repo = 'MyApp') => scoreLogoPath(path, size, repo)
  // 明確的 logo 贏過 icon，放在根目錄的贏過放很深的
  assert.ok(score('logo.png') > score('assets/icon.png'))
  assert.ok(score('myapp-logo.png') > score('assets/icon.png'))
  assert.ok(score('logo.png') > score('packages/web/public/logo.png'))
  assert.ok(score('public/icon-512.png') > 0)
  assert.ok(score('assets/icon.png') > score('assets/icon-32.png'))
  // 不是 logo 的東西一律 0
  for (const path of [
    'public/favicon.png', 'public/vite.png', 'src/assets/react.png', 'node_modules/x/logo.png',
    'docs/screenshot.png', 'assets/demo.png', 'assets/tray-icon.png', 'assets/wechat-qrcode.png',
    'logo.ico', 'README.md', 'src/logo.ts', 'test/fixtures/logo.png', '.history/logo_2025.svg',
  ]) {
    assert.equal(score(path), 0, path)
  }
  assert.equal(score('logo.png', 300), 0) // 太小
  // SVG 是向量，很小也可以是完整的標誌；太大的多半是插畫
  assert.ok(score('app/icon.svg', 529) > 0)
  assert.equal(score('app/icon.svg', 100), 0)
  assert.equal(score('art/logo.svg', 200_000), 0)

  // README 第一張圖是最強的線索，但要看起來像標誌才算
  const withReadme = (path, readme, repo = 'DuckShot') => scoreLogoPath(path, 20_000, repo, readme)
  assert.ok(withReadme('assets/icons/app-icon.png', 'assets/icons/app-icon.png') > withReadme('assets/icons/logo-other.png', 'assets/icons/app-icon.png'))
  assert.ok(withReadme('where.png', 'where.png', 'whereismywindow') > 0) // 檔名是專案名的開頭
  assert.equal(withReadme('assets/preview-v2.png', 'assets/preview-v2.png'), 0) // 預覽圖不是標誌
  assert.equal(withReadme('shot.png', 'shot.png'), 0)

  assert.equal(firstReadmeImage('<p align="center"><img src="./app/icon.svg" width="80"></p>'), 'app/icon.svg')
  assert.equal(firstReadmeImage('![badge](https://img.shields.io/x.svg) ![logo](/assets/logo.png?raw=true)'), 'assets/logo.png')
  assert.equal(firstReadmeImage('![shot](https://i.imgur.com/a.png)'), '')
  assert.equal(firstReadmeImage(''), '')
})

test('toProject prefers the configured blurb and a real homepage', () => {
  const app = toProject(repo('BigApp', { homepage: 'https://bigapp.example', stars: 9 }), config)
  assert.equal(app.blurb, '自訂說明')
  assert.equal(app.link, 'https://bigapp.example')
  // homepage 指回 GitHub 本身的不算介紹頁
  assert.equal(toProject(repo('x', { homepage: 'https://github.com/someone/x' }), config).homepage, '')
})

test('buildProjects sorts by stars then recency; summaries add up', () => {
  const projects = buildProjects(
    [repo('b', { stars: 1 }), repo('a', { stars: 5 }), repo('c', { stars: 1, pushedAt: '2026-11-05T00:00:00Z' }), repo('foo-kit')],
    config,
  )
  assert.deepEqual(projects.map((p) => p.name), ['a', 'c', 'b', 'foo-kit'])
  const summary = summarize(projects, config)
  assert.equal(summary.projects, 4)
  assert.equal(summary.stars, 7)
  assert.equal(summary.byCategory.find((c) => c.id === 'kit').count, 1)
  assert.deepEqual(languageCounts(projects), [{ name: 'JavaScript', count: 4 }])
})

test('recentActivity pads to whole weeks ending today and scales levels', () => {
  const activity = recentActivity([{ date: '2026-11-12', count: 8 }, { date: '2026-11-13', count: 2 }], 2, '2026-11-13')
  assert.equal(activity.from, '2026-11-01') // 11/13 是週五 → 本週日 11/8，再往前一週
  assert.equal(activity.cells.length, 13)
  assert.equal(activity.total, 10)
  assert.equal(activity.cells.at(-2).level, 4)
  assert.equal(activity.cells.at(-1).level, 1)
  assert.equal(activity.cells[0].level, 0)
  assert.equal(recentActivity([], 2, '2026-11-13').total, 0)
})

test('pages render the data and escape anything that came from outside', () => {
  const repos = [
    repo('BigApp', { stars: 12 }),
    repo('cli-thing', { language: 'Rust', description: '<script>alert(1)</script> & more' }),
    repo('foo-kit'),
  ]
  const projects = buildProjects(repos, config)
  const data = {
    config,
    projects,
    summary: summarize(projects, config),
    activity: recentActivity([{ date: '2026-11-13', count: 3 }], 2, '2026-11-13'),
    updates: [{ name: 'BigApp', url: 'https://github.com/someone/BigApp', message: 'feat: "quoted" <b>', date: '2026-11-13T01:00:00Z' }],
    log: [
      { name: 'BigApp', url: 'https://github.com/someone/BigApp', message: 'feat: "quoted" <b>', date: '2026-11-13T01:00:00Z' },
      { name: 'foo-kit', url: 'https://github.com/someone/foo-kit', message: 'fix: edge case', date: '2026-11-12T01:00:00Z' },
    ],
    activityLong: recentActivity([{ date: '2026-11-13', count: 3 }], 4, '2026-11-13'),
    languages: languageCounts(projects),
    asOf: '2026-11-13',
  }
  const home = renderHome(data)
  const work = renderWork(data)
  const devlog = renderDevlog(data)

  assert.match(devlog, /11\/13（五）/)
  assert.match(devlog, /11\/12（四）/)
  assert.match(devlog, /feat: &quot;quoted&quot; &lt;b&gt;/)
  assert.match(devlog, /href="\.\.\/assets\/site\.css"/)
  // 有版本號時，三頁的樣式表和腳本網址都要帶上，瀏覽器才不會用舊快取配新 HTML
  for (const page of [renderHome, renderWork, renderDevlog]) {
    const html = page({ ...data, version: 'abc123' })
    assert.match(html, /assets\/site\.css\?v=abc123"/)
    assert.match(html, /assets\/site\.js\?v=abc123"/)
  }
  // 段落順序固定；每一段都是素底，沒有背景圖、沒有交界裝飾
  const order = [...home.matchAll(/<section id="(\w+)"/g)].map((match) => match[1])
  assert.deepEqual(order, ['intro', 'work', 'recent', 'tools', 'contact'])
  for (const html of [home, work, devlog]) {
    assert.ok(!html.includes('mosaic') && !html.includes('scribble') && !html.includes('has-bg'))
  }
  assert.match(renderDevlog({ ...data, log: [] }), /目前沒有可以顯示的更新/)

  // 沒設定時用純文字站名、頁尾不出現 Powered by；設定了就是點陣字標誌加連結
  assert.ok(home.includes('>Someone.</a>') && !home.includes('Powered by'))
  const branded = renderHome({ ...data, config: { ...config, wordmark: 'CAT', poweredBy: { label: 'Maker', url: 'https://maker.example' } } })
  assert.match(branded, /<svg class="wordmark"[^>]*aria-label="CAT"/)
  assert.match(branded, /Powered by <a class="powered" href="https:\/\/maker\.example" rel="noopener">Maker<\/a>/)

  // 站內的作品連結一律到作品介紹頁，不直接跳 GitHub；各頁的相對路徑不同
  assert.match(home, /class="card lead" href="\.\/work\/BigApp\/"/)
  assert.match(home, /class="row" href="\.\/work\/BigApp\/"/)
  assert.match(work, /class="card small wall-item" data-category="app" href="\.\/BigApp\/"/)
  assert.match(devlog, /class="row" href="\.\.\/work\/foo-kit\/"/)
  assert.ok(!work.includes('href="https://github.com/someone/BigApp"'))

  // 作品介紹頁：資訊、原始碼按鈕、這個專案的更新、同類型的其他作品；有文章才出現文章區
  const bigApp = projects.find((project) => project.name === 'BigApp')
  const page = renderProject(data, bigApp)
  assert.match(page, /<h1 class="page-title">BigApp<\/h1>/)
  assert.match(page, /自訂說明/)
  assert.match(page, /class="btn primary" href="https:\/\/github\.com\/someone\/BigApp" rel="noopener"/)
  assert.match(page, /最後更新 2026-11-01/)
  assert.match(page, /feat: &quot;quoted&quot; &lt;b&gt;/)
  assert.ok(!page.includes('fix: edge case')) // 別的專案的更新不會跑進來
  assert.match(page, /href="\.\.\/\.\.\/assets\/site\.css"/)
  assert.match(page, /href="\.\.\/">全部作品<\/a>/)
  assert.ok(!page.includes('class="card prose"'))

  const kit = projects.find((project) => project.name === 'foo-kit')
  const withArticle = renderProject({ ...data, articles: { 'foo-kit': '<h2>為什麼做</h2>\n<p>內文</p>' } }, kit)
  assert.match(withArticle, /<article class="card prose">\s*<h2>為什麼做<\/h2>/)
  assert.ok(!withArticle.includes('更多 Kit')) // 同類型只有它自己，就不顯示那一區
  assert.match(withArticle, /href="https:\/\/github\.com\/someone\/foo-kit#readme"/)
  const tool = projects.find((project) => project.name === 'cli-thing')
  assert.match(renderProject(data, tool), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)

  // 教學：沒文章時是空狀態；有文章時列表連到各篇，單篇有標題、日期、內文
  const emptyGuides = renderGuides(data)
  assert.match(emptyGuides, /目前還沒有發布的文章/)
  assert.match(emptyGuides, /href="\.\.\/guides\/" aria-current="page"/)
  const guide = { slug: 'voice-coding', title: '用語音寫 <程式>', date: '2026-11-13', summary: '三個步驟', html: '<p>內文</p>' }
  const guideList = renderGuides({ ...data, guides: [guide] })
  assert.match(guideList, /class="card guide-card" href="\.\/voice-coding\/"/)
  assert.match(guideList, /用語音寫 &lt;程式&gt;/)
  assert.match(guideList, /2026 年 11 月 13 日/)
  assert.ok(!guideList.includes('目前還沒有發布的文章'))
  const guidePage = renderGuide(data, guide)
  assert.match(guidePage, /<h1 class="page-title">用語音寫 &lt;程式&gt;<\/h1>/)
  assert.match(guidePage, /<p>內文<\/p>/)
  assert.match(guidePage, /href="\.\.\/\.\.\/assets\/site\.css"/)
  assert.match(guidePage, /href="\.\.\/">教學<\/a>/)

  // 關於我：內文來自 pages/about.md，數字和做事的方式自動產生；首頁用同一份做事的方式
  const about = renderAbout({ ...data, about: { title: '關於我', html: '<p>我是誰</p>' } })
  assert.match(about, /<h1 class="page-title">關於我<\/h1>\s*<p>我是誰<\/p>/)
  assert.match(about, /<span class="big">3<small>件<\/small>/)
  assert.match(about, /自己架。/)
  assert.match(home, /自己架。/)
  assert.match(about, /href="\.\.\/me\/" aria-current="page"/)
  assert.ok(!about.includes('about-banner'))
  assert.match(renderAbout({ ...data, images: { about: 'img/about.webp' } }), /class="about-banner" src="\.\.\/assets\/img\/about\.webp"/)
  assert.match(renderAbout(data), /<h1 class="page-title">關於我<\/h1>/) // 沒有內文也有標題

  // 專案卡片的底圖
  const withCard = renderHome({ ...data, images: { cards: { 'cli-thing': 'img/cards/cli-thing.webp' } } })
  assert.match(withCard, /class="card ink dark-card has-art" href="\.\/work\/cli-thing\/" style="background-image:url\('\.\/assets\/img\/cards\/cli-thing\.webp'\)"/)
  assert.ok(!home.includes('dark-card has-art'))

  // 圖片插槽：沒圖時什麼都不多；有圖時背景、吉祥物、截圖、分享圖各就各位
  assert.ok(!home.includes('has-bg') && !home.includes('class="cat') && !home.includes('og:image'))
  const withImages = renderHome({
    ...data,
    config: { ...config, siteUrl: 'https://example.test/site/' },
    images: {
      logos: { bigapp: 'img/logos/BigApp.webp' },
      cat: { hero: 'img/cat-hero.png' },
      shots: { bigapp: 'img/shots/BigApp.png', 'foo-kit': 'img/shots/foo-kit.png' },
      og: 'img/og.png',
    },
  })
  assert.match(withImages, /class="cat cat-hero" src="\.\/assets\/img\/cat-hero\.png"/)
  // 有 logo 的專案用圖，沒有的維持字母方塊；各頁的相對路徑要對
  assert.match(withImages, /class="mono-mark logo-mark" src="\.\/assets\/img\/logos\/BigApp\.webp"/)
  assert.match(withImages, /<span class="mono-mark" style="--tile:/)
  assert.match(renderWork({ ...data, images: { logos: { bigapp: 'img/logos/BigApp.webp' } } }), /logo-mark" src="\.\.\/assets\/img\/logos\/BigApp\.webp"/)
  assert.ok(!home.includes('logo-mark'))
  assert.match(withImages, /class="shot" src="\.\/assets\/img\/shots\/BigApp\.png"/)
  assert.match(withImages, /class="thumb" src="\.\/assets\/img\/shots\/foo-kit\.png"/)
  assert.match(withImages, /og:image" content="https:\/\/example\.test\/site\/assets\/img\/og\.png"/)
  assert.ok(!withImages.includes('class="waveform"'))

  assert.match(home, /自訂說明/)
  assert.match(home, /最近在改 BigApp/)
  assert.match(home, /數字截至 2026-11-13/)
  assert.ok(!home.includes('<script>alert(1)</script>'))
  assert.match(home, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; more/)
  assert.match(home, /feat: &quot;quoted&quot; &lt;b&gt;/)
  assert.equal((work.match(/class="card small wall-item"/g) ?? []).length, 3)
  assert.match(work, /data-filter="kit"/)
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
})
