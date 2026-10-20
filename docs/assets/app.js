/**
 * 站点前端：读取构建阶段生成的 manifest.json，渲染导航、正文与搜索结果。
 * 搜索为纯字符串匹配，不依赖分词器，中文可直接命中。
 */
(function () {
  'use strict'

  var THEME_KEY = 'coaw-theme'

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function currentSlug() {
    return decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/+$/, '')
  }

  function renderMarkdown(markdown, docPath) {
    var holder = document.createElement('div')
    holder.innerHTML = marked.parse(markdown)

    var toc = []
    holder.querySelectorAll('h2').forEach(function (heading, index) {
      var id = 'sec-' + index
      heading.id = id
      toc.push({ id: id, text: heading.textContent })
    })

    holder.querySelectorAll('a[href]').forEach(function (link) {
      var href = link.getAttribute('href')
      if (!href) return
      if (/^https?:\/\//.test(href)) {
        link.target = '_blank'
        link.rel = 'noreferrer noopener'
        return
      }
      if (href.charAt(0) === '#') return
      var matched = href.match(/^(.*?)\.md(#.*)?$/)
      if (!matched) return
      var resolved = new URL(matched[1], 'https://local/' + docPath)
      var slug = resolved.pathname.replace(/^\//, '').replace(/\/index$/, '')
      link.setAttribute('href', '#/' + slug + (matched[2] || ''))
    })

    return { html: holder.innerHTML, toc: toc }
  }

  var markmapPromise = null

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-src="' + src + '"]')
      if (existing) {
        resolve()
        return
      }
      var script = document.createElement('script')
      script.src = src
      script.async = false
      script.onload = function () { resolve() }
      script.onerror = function () { reject(new Error('资源加载失败：' + src)) }
      script.setAttribute('data-src', src)
      document.head.appendChild(script)
    })
  }

  function ensureMarkmap() {
    if (window.markmap && window.markmap.Transformer && window.markmap.Markmap) {
      return Promise.resolve()
    }
    if (markmapPromise) return markmapPromise
    var base = new URL('assets/vendor/markmap/', document.baseURI).href
    markmapPromise = loadScript(base + 'd3.min.js')
      .then(function () { return loadScript(base + 'markmap-lib.js') })
      .then(function () { return loadScript(base + 'markmap-view.js') })
    return markmapPromise
  }

  function renderMarkmaps() {
    if (!document.querySelector('.markdown code.language-markmap')) return
    ensureMarkmap()
      .then(function () {
        var blocks = document.querySelectorAll('.markdown code.language-markmap')
        Array.prototype.forEach.call(blocks, function (code) {
          var pre = code.closest('pre')
          if (!pre || !pre.parentNode) return

          var holder = document.createElement('div')
          holder.className = 'markmap-holder'
          pre.replaceWith(holder)

          var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          holder.appendChild(svg)

          try {
            var transformer = new window.markmap.Transformer()
            var transformed = transformer.transform(code.textContent)
            window.markmap.Markmap.create(svg, { autoFit: true, duration: 260, paddingX: 12 }, transformed.root)
          } catch (error) {
            holder.textContent = '该导图渲染失败，请检查 Markdown 缩进与层级。'
          }
        })
      })
      .catch(function () {
        /* 资源不可用时保留原始代码块，不影响其余内容 */
      })
  }

  var mermaidPromise = null

  function ensureMermaid(theme) {
    var loading = window.mermaid
      ? Promise.resolve(window.mermaid)
      : (mermaidPromise || (mermaidPromise = loadScript(
          new URL('assets/vendor/mermaid/mermaid.min.js', document.baseURI).href
        ).then(function () { return window.mermaid })))

    return loading.then(function (mermaid) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: theme === 'light' ? 'default' : 'dark',
        themeVariables: { background: 'transparent', fontFamily: 'inherit' },
        flowchart: { useMaxWidth: true },
        sequence: { useMaxWidth: true }
      })
      return mermaid
    })
  }

  function paintMermaid(holder, theme) {
    var source = holder.getAttribute('data-source')
    if (!source) return
    var id = 'mmd-' + Math.random().toString(36).slice(2, 10)
    ensureMermaid(theme)
      .then(function (mermaid) { return mermaid.render(id, decodeURIComponent(source)) })
      .then(function (result) {
        holder.innerHTML = result.svg
        if (result.bindFunctions) result.bindFunctions(holder)
      })
      .catch(function () {
        holder.textContent = '该图表渲染失败，请检查 mermaid 语法。'
      })
  }

  /**
   * 首次进入页面时把 mermaid 代码块替换为图表容器；
   * 切换主题时对已有容器重新着色，不重新解析文档。
   */
  function mountMermaids(theme) {
    var codes = document.querySelectorAll('.markdown code.language-mermaid')
    if (!codes.length) {
      document.querySelectorAll('.markdown .mermaid-holder').forEach(function (holder) {
        paintMermaid(holder, theme)
      })
      return
    }

    ensureMermaid(theme)
      .then(function () {
        Array.prototype.forEach.call(codes, function (code) {
          var pre = code.closest('pre')
          if (!pre || !pre.parentNode) return
          var holder = document.createElement('div')
          holder.className = 'mermaid-holder'
          holder.setAttribute('data-source', encodeURIComponent(code.textContent))
          pre.replaceWith(holder)
          paintMermaid(holder, theme)
        })
      })
      .catch(function () {
        /* 资源不可用时保留原始代码块 */
      })
  }

  function snippetOf(text, terms) {
    var lower = text.toLowerCase()
    var at = -1
    terms.forEach(function (term) {
      var found = lower.indexOf(term)
      if (found >= 0 && (at < 0 || found < at)) at = found
    })
    if (at < 0) at = 0

    var start = Math.max(0, at - 24)
    var safe = escapeHtml(text.slice(start, start + 80))
    terms.forEach(function (term) {
      if (!term) return
      var pattern = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi')
      safe = safe.replace(pattern, '<mark>$1</mark>')
    })
    return (start > 0 ? '…' : '') + safe
  }

  Vue.createApp({
    data: function () {
      return {
        manifest: null,
        loading: true,
        error: '',
        slug: '',
        html: '',
        toc: [],
        query: '',
        searchOpen: false,
        sidebarOpen: false,
        theme: 'dark'
      }
    },
    computed: {
      groups: function () {
        return this.manifest ? this.manifest.groups : []
      },
      documents: function () {
        return this.manifest ? this.manifest.documents : []
      },
      isHome: function () {
        return !this.slug
      },
      activeDir: function () {
        return this.slug.split('/')[0] || ''
      },
      results: function () {
        var query = this.query.trim().toLowerCase()
        if (!query) return []
        var terms = query.split(/\s+/).filter(Boolean)
        return this.documents
          .map(function (doc) {
            var title = doc.title.toLowerCase()
            var body = doc.plain.toLowerCase()
            var score = 0
            terms.forEach(function (term) {
              if (title.indexOf(term) >= 0) score += 10
              var hits = body.split(term).length - 1
              score += Math.min(hits, 5)
            })
            if (!score) return null
            return { slug: doc.slug, title: doc.title, snippet: snippetOf(doc.plain, terms), score: score }
          })
          .filter(Boolean)
          .sort(function (a, b) { return b.score - a.score })
          .slice(0, 8)
      },
      pager: function () {
        var slug = this.slug
        if (!slug) return {}
        for (var i = 0; i < this.groups.length; i += 1) {
          var items = this.groups[i].items
          for (var j = 0; j < items.length; j += 1) {
            if (items[j].slug === slug) {
              return { prev: items[j - 1] || null, next: items[j + 1] || null }
            }
          }
        }
        return {}
      }
    },
    mounted: function () {
      this.applyTheme(localStorage.getItem(THEME_KEY) || 'dark')
      window.addEventListener('hashchange', this.route)
      document.addEventListener('click', this.closeSearch)
      this.load()
    },
    methods: {
      load: function () {
        var self = this
        self.loading = true
        self.error = ''
        fetch('./manifest.json', { cache: 'no-cache' })
          .then(function (response) {
            if (!response.ok) throw new Error('索引读取失败，状态码 ' + response.status)
            return response.json()
          })
          .then(function (manifest) {
            self.manifest = manifest
            self.route()
          })
          .catch(function (error) {
            self.error = error.message
          })
          .finally(function () {
            self.loading = false
          })
      },
      route: function () {
        var slug = currentSlug()
        this.slug = slug
        this.sidebarOpen = false
        window.scrollTo(0, 0)

        if (!slug) {
          this.html = ''
          this.toc = []
          document.title = '另一个代码构成的世界'
          return
        }

        var doc = this.documents.filter(function (item) { return item.slug === slug })[0]
        if (!doc) {
          this.html = '<p>条目不存在，请从左侧目录选择。</p>'
          this.toc = []
          return
        }

        var rendered = renderMarkdown(doc.markdown, doc.path)
        this.html = rendered.html
        this.toc = rendered.toc
        document.title = doc.title + ' · 另一个代码构成的世界'

        var theme = this.theme
        this.$nextTick(function () {
          renderMarkmaps()
          mountMermaids(theme)
        })
      },
      scrollTo: function (id) {
        var target = document.getElementById(id)
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
      toggleTheme: function () {
        var next = this.theme === 'dark' ? 'light' : 'dark'
        this.applyTheme(next)
        mountMermaids(next)
      },
      applyTheme: function (theme) {
        this.theme = theme
        document.documentElement.classList.toggle('dark', theme === 'dark')
        localStorage.setItem(THEME_KEY, theme)
      },
      closeSearch: function (event) {
        if (!event.target.closest('.search')) this.searchOpen = false
      }
    }
  }).mount('#app')
})()
