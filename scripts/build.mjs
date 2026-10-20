/**
 * 构建脚本：扫描 docs 目录下的 Markdown，生成站点与索引。
 *
 * 输出：
 *   site/index.html     入口页
 *   site/assets/        样式、脚本与运行时库
 *   site/manifest.json  全站索引（分组、标题、小标题、正文纯文本）
 *
 * 仅使用 Node 内置模块，无需安装任何依赖，构建耗时约一秒。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = path.join(root, 'docs')
const siteDir = path.join(root, 'site')

const GROUP_ORDER = ['word', 'item', 'event', 'novel1']
const GROUP_TITLES = { word: '设定词', item: '物品', event: '事件', novel1: '小说' }

function walk(dir, base = '') {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...walk(path.join(dir, entry.name), rel))
    } else if (entry.name.endsWith('.md')) {
      files.push({ rel, abs: path.join(dir, entry.name) })
    }
  }
  return files
}

function titleOf(markdown, fallback) {
  const matched = markdown.match(/^#\s+(.+?)\s*$/m)
  return matched ? matched[1].trim() : fallback
}

function headingsOf(markdown) {
  const headings = []
  const pattern = /^##\s+(.+?)\s*$/gm
  let matched
  while ((matched = pattern.exec(markdown)) !== null) {
    headings.push(matched[1].trim())
  }
  return headings
}

function plainOf(markdown) {
  return markdown
    // markmap 代码块的内容属于正文，保留下来供搜索与摘要使用
    .replace(/```markmap\s*\n([\s\S]*?)```/g, ' $1 ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/[*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const documents = walk(docsDir)
  .filter((file) => file.rel !== 'index.md')
  .map((file) => {
  // 去掉可能存在的 UTF-8 BOM，否则首个标题无法被识别
  const markdown = fs.readFileSync(file.abs, 'utf-8').replace(/^\uFEFF/, '')
  const slug = file.rel.replace(/\.md$/, '').replace(/\/index$/, '')
  const parts = file.rel.split('/')
  const dir = parts.length > 1 ? parts[0] : ''
  return {
    slug,
    path: file.rel,
    dir,
    isIndex: parts[parts.length - 1].toLowerCase() === 'index.md',
    title: titleOf(markdown, path.basename(file.rel, '.md')),
    headings: headingsOf(markdown),
    plain: plainOf(markdown),
    markdown
  }
})

const groupDirs = [...new Set(documents.map((doc) => doc.dir).filter(Boolean))]
groupDirs.sort((a, b) => {
  const indexA = GROUP_ORDER.indexOf(a)
  const indexB = GROUP_ORDER.indexOf(b)
  return (indexA < 0 ? 99 : indexA) - (indexB < 0 ? 99 : indexB)
})

const groups = groupDirs.map((dir) => {
  const indexDoc = documents.find((doc) => doc.dir === dir && doc.isIndex)
  const items = documents
    .filter((doc) => doc.dir === dir && !doc.isIndex)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    .map((doc) => ({ slug: doc.slug, title: doc.title }))
  return {
    dir,
    title: indexDoc ? indexDoc.title : GROUP_TITLES[dir] || dir,
    slug: indexDoc ? indexDoc.slug : dir,
    summary: indexDoc ? indexDoc.plain.slice(0, 60) : '',
    items
  }
})

fs.rmSync(siteDir, { recursive: true, force: true })
fs.mkdirSync(siteDir, { recursive: true })
fs.cpSync(path.join(docsDir, 'assets'), path.join(siteDir, 'assets'), { recursive: true })
fs.cpSync(path.join(docsDir, 'index.html'), path.join(siteDir, 'index.html'))

const manifest = {
  generatedAt: new Date().toISOString(),
  groups,
  documents: documents.map((doc) => ({
    slug: doc.slug,
    path: doc.path,
    title: doc.title,
    dir: doc.dir,
    isIndex: doc.isIndex,
    headings: doc.headings,
    plain: doc.plain,
    markdown: doc.markdown
  }))
}

fs.writeFileSync(path.join(siteDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8')

const size = (fs.statSync(path.join(siteDir, 'manifest.json')).size / 1024).toFixed(1)
console.log(`已生成 ${documents.length} 篇文档，${groups.length} 个分类，索引体积 ${size} KB`)
