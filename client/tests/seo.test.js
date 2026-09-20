import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testsDir = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.resolve(testsDir, '..')
const canonical = 'https://battle-of-bands-game.netlify.app/'

async function read(relativePath) {
  return readFile(path.join(clientDir, relativePath), 'utf8')
}

test('index.html exposes the public alpha search metadata', async () => {
  const html = await read('index.html')

  assert.match(html, /<title>Battle of Bands — Tournois musicaux entre artistes<\/title>/)
  assert.match(html, /name="description"/)
  assert.match(html, /name="robots" content="index,follow"/)
  assert.match(html, new RegExp(`rel="canonical" href="${canonical.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')}"`))
})

test('robots.txt allows crawling and points to the sitemap', async () => {
  const robots = await read('public/robots.txt')

  assert.match(robots, /User-agent: \*/)
  assert.match(robots, /Allow: \//)
  assert.match(robots, /Sitemap: https:\/\/battle-of-bands-game\.netlify\.app\/sitemap\.xml/)
})

test('sitemap.xml publishes only the canonical alpha root', async () => {
  const sitemap = await read('public/sitemap.xml')

  assert.match(sitemap, /<urlset/)
  assert.match(sitemap, /<loc>https:\/\/battle-of-bands-game\.netlify\.app\/<\/loc>/)
  assert.equal((sitemap.match(/<loc>/g) || []).length, 1)
})
