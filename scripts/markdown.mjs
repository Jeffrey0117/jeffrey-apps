// 最小的 Markdown → HTML，給 content/ 裡的作品介紹文章用。零依賴。
// 支援：# 標題（1–4 級）、段落、- 或 * 清單、1. 編號清單、> 引言、``` 程式碼區塊、--- 分隔線、
//       行內的 `程式碼`、**粗體**、*斜體*、[連結](網址)、![圖片說明](圖片路徑)。
// 不支援表格和內嵌 HTML：原始的 HTML 一律當成純文字顯示，不會被執行。

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// 只放行 http(s)、mailto 和站內相對路徑；javascript: 之類一律擋掉
function safeUrl(url) {
  const trimmed = String(url).trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return ''
  return trimmed
}

function inline(text, resolveImage) {
  // 先把行內程式碼抽出來，裡面的符號才不會被當成粗體或連結
  const codes = []
  let out = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  out = escapeHtml(out)
  // 網址裡允許一層成對的括號（例如 https://zh.wikipedia.org/wiki/貓_(動物)）
  const URL_PART = '((?:[^()\\s]|\\([^()\\s]*\\))+)'
  out = out.replace(new RegExp(`!\\[([^\\]]*)\\]\\(${URL_PART}\\)`, 'g'), (_, alt, src) => {
    const url = safeUrl(resolveImage(src.replace(/&amp;/g, '&')))
    return url ? `<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy">` : alt
  })
  out = out.replace(new RegExp(`\\[([^\\]]+)\\]\\(${URL_PART}\\)`, 'g'), (_, label, href) => {
    const url = safeUrl(href.replace(/&amp;/g, '&'))
    if (!url) return label
    const external = /^https?:/i.test(url)
    return `<a href="${escapeHtml(url)}"${external ? ' rel="noopener"' : ''}>${label}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)])
}

export function renderMarkdown(source, { resolveImage = (src) => src } = {}) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const html = []
  let paragraph = []
  let list = null // { tag, items }
  let quote = []

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '), resolveImage)}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item, resolveImage)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote><p>${inline(quote.join(' '), resolveImage)}</p></blockquote>`)
    quote = []
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    const fence = /^```\s*([\w-]*)\s*$/.exec(line)
    if (fence) {
      flushAll()
      const code = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i += 1
      }
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    const heading = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line)
    if (heading) {
      flushAll()
      // 文章的 # 是頁面裡的第二層標題（第一層是作品名稱）
      const level = Math.min(heading[1].length + 1, 5)
      html.push(`<h${level}>${inline(heading[2], resolveImage)}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushAll()
      html.push('<hr>')
      continue
    }

    const bullet = /^\s*[-*]\s+(.+)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      flushQuote()
      const tag = bullet ? 'ul' : 'ol'
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push((bullet ?? numbered)[1])
      continue
    }

    const quoted = /^>\s?(.*)$/.exec(line)
    if (quoted) {
      flushParagraph()
      flushList()
      quote.push(quoted[1])
      continue
    }

    // 清單項目的續行（有縮排）接在上一個項目後面
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(line.trim())
  }
  flushAll()
  return html.join('\n')
}
