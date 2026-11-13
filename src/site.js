// 深色模式切換、段落索引高亮、作品牆篩選。沒有這支 JS 頁面也看得了。
(() => {
  const html = document.documentElement

  const toggle = document.querySelector('.theme-toggle')
  if (toggle) {
    toggle.addEventListener('click', () => {
      const dark = html.dataset.theme
        ? html.dataset.theme === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches
      html.dataset.theme = dark ? 'light' : 'dark'
      try {
        localStorage.setItem('theme', html.dataset.theme)
      } catch {
        // 存不了就只維持這一次
      }
    })
  }

  // 首頁側邊的段落索引：捲到哪一段就亮哪一格
  const stageLinks = [...document.querySelectorAll('.stage-index a')]
  if (stageLinks.length > 0 && 'IntersectionObserver' in window) {
    const byId = new Map(stageLinks.map((link) => [link.getAttribute('href').slice(1), link]))
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          stageLinks.forEach((link) => link.removeAttribute('aria-current'))
          byId.get(entry.target.id)?.setAttribute('aria-current', 'true')
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    byId.forEach((_, id) => {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    })
  }

  // 作品牆篩選；網址的 #kit 之類可以直接帶到某一類
  const filters = [...document.querySelectorAll('.filter')]
  const items = [...document.querySelectorAll('.wall-item')]
  if (filters.length > 0) {
    const empty = document.querySelector('.empty')
    const apply = (wanted) => {
      const known = filters.some((button) => button.dataset.filter === wanted)
      const active = known ? wanted : 'all'
      let shown = 0
      for (const item of items) {
        const visible = active === 'all' || item.dataset.category === active
        item.hidden = !visible
        if (visible) shown += 1
      }
      filters.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === active)))
      if (empty) empty.hidden = shown > 0
    }
    filters.forEach((button) =>
      button.addEventListener('click', () => {
        const wanted = button.dataset.filter
        history.replaceState(null, '', wanted === 'all' ? location.pathname : `#${wanted}`)
        apply(wanted)
      }),
    )
    window.addEventListener('hashchange', () => apply(location.hash.slice(1)))
    apply(location.hash.slice(1))
  }
})()
