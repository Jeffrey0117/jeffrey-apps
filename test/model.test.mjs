import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildProjects, categorize, cleanText, isSafeText, isVisible, languageCounts, pickUpdate, recentActivity, summarize, toProject } from '../scripts/model.mjs'
import { esc, renderHome, renderWork } from '../scripts/render.mjs'

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

test('pickUpdate skips routine, unsafe and already-used commit messages', () => {
  const commits = [
    { message: 'chore: describe this repository', date: 'd1' },
    { message: 'docs: readme', date: 'd2' },
    { message: 'fix: point at privatezone.com', date: 'd3' },
    { message: 'feat: already shown elsewhere', date: 'd4' },
    { message: 'feat: camera download', date: 'd5' },
  ]
  const used = new Set(['feat: already shown elsewhere'])
  assert.equal(pickUpdate(commits, config, used).message, 'feat: camera download')
  assert.equal(pickUpdate(commits.slice(0, 3), config), null)
  assert.equal(pickUpdate([], config), null)
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
    languages: languageCounts(projects),
    asOf: '2026-11-13',
  }
  const home = renderHome(data)
  const work = renderWork(data)

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
