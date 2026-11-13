import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildLog, buildProjects, categorize, cleanText, colorFor, groupByDay, isSafeText, isVisible, languageCounts,
  latestPerRepo, recentActivity, seededRandom, summarize, toProject, wordmarkCells,
} from '../scripts/model.mjs'
import { esc, renderDevlog, renderHome, renderWork } from '../scripts/render.mjs'

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

  // 圖片插槽：沒圖時什麼都不多；有圖時背景、吉祥物、截圖、分享圖各就各位
  assert.ok(!home.includes('has-bg') && !home.includes('class="cat') && !home.includes('og:image'))
  const withImages = renderHome({
    ...data,
    config: { ...config, siteUrl: 'https://example.test/site/' },
    images: {
      cat: { hero: 'img/cat-hero.png' },
      shots: { bigapp: 'img/shots/BigApp.png', 'foo-kit': 'img/shots/foo-kit.png' },
      og: 'img/og.png',
    },
  })
  assert.match(withImages, /class="cat cat-hero" src="\.\/assets\/img\/cat-hero\.png"/)
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
