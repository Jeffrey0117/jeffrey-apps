import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderMarkdown, splitFrontMatter, takeTitle } from '../scripts/markdown.mjs'

test('headings, paragraphs, lists, quotes, rules and code blocks', () => {
  const html = renderMarkdown(
    [
      '# 為什麼做這個',
      '',
      '第一行',
      '接著同一段。',
      '',
      '## 怎麼用',
      '- 一',
      '- 二',
      '  還是二',
      '',
      '1. 先',
      '2. 後',
      '',
      '> 一句話',
      '',
      '---',
      '',
      '```js',
      'const a = "<b>" && 1',
      '```',
    ].join('\n'),
  )
  assert.match(html, /<h2>為什麼做這個<\/h2>/) // 文章的 # 是頁面的第二層
  assert.match(html, /<p>第一行 接著同一段。<\/p>/)
  assert.match(html, /<h3>怎麼用<\/h3>/)
  assert.match(html, /<ul><li>一<\/li><li>二 還是二<\/li><\/ul>/)
  assert.match(html, /<ol><li>先<\/li><li>後<\/li><\/ol>/)
  assert.match(html, /<blockquote><p>一句話<\/p><\/blockquote>/)
  assert.match(html, /<hr>/)
  assert.match(html, /<pre><code>const a = &quot;&lt;b&gt;&quot; &amp;&amp; 1<\/code><\/pre>/)
})

test('inline code, bold, italic, links and images', () => {
  const html = renderMarkdown('用 `npm run *dev*` 啟動，**很快**，*真的*。看[文件](https://example.com/a?b=1&c=2)和 ![畫面](img/shot.png)', {
    resolveImage: (src) => `../../assets/content/${src.replace(/^img\//, '')}`,
  })
  assert.match(html, /<code>npm run \*dev\*<\/code>/) // 程式碼裡的星號不會變斜體
  assert.match(html, /<strong>很快<\/strong>/)
  assert.match(html, /<em>真的<\/em>/)
  assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" rel="noopener">文件<\/a>/)
  assert.match(html, /<img src="\.\.\/\.\.\/assets\/content\/shot\.png" alt="畫面" loading="lazy">/)
})

test('raw HTML is shown as text and unsafe links are dropped', () => {
  const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[點我](javascript:alert(1)) [也點我](//evil.example/x) [站內](../Pokkit/)')
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'))
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.ok(!html.includes('javascript:') && !html.includes('evil.example'))
  assert.match(html, /點我 也點我 <a href="\.\.\/Pokkit\/">站內<\/a>/)
})

test('front matter and the leading title are separated from the body', () => {
  const { meta, body } = splitFrontMatter('---\ntitle: "怎麼用語音寫程式"\ndate: 2026-11-13\nsummary：三步驟\n---\n# 內文標題\n\n第一段')
  assert.deepEqual(meta, { title: '怎麼用語音寫程式', date: '2026-11-13', summary: '三步驟' })
  assert.deepEqual(takeTitle(body), { title: '內文標題', body: '\n第一段' })

  // 沒有設定區塊：整份都是內文。內文中間的 --- 是分隔線，不是設定
  assert.deepEqual(splitFrontMatter('# 標題\n\n---\n\n內文').meta, {})
  assert.equal(splitFrontMatter('# 標題\n\n---\n\n內文').body, '# 標題\n\n---\n\n內文')
  assert.deepEqual(takeTitle('沒有標題的內文'), { title: '', body: '沒有標題的內文' })
  assert.deepEqual(splitFrontMatter(null), { meta: {}, body: '' })
})

test('empty input renders nothing', () => {
  assert.equal(renderMarkdown(''), '')
  assert.equal(renderMarkdown(null), '')
  assert.equal(renderMarkdown('\n\n  \n'), '')
})
