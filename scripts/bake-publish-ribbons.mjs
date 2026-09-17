#!/usr/bin/env node
/**
 * Headless bake: load each published map against the matching GLB in Meridian
 * Studio and write version-3 JSON with on-skin ribbon samples.
 *
 * Usage:
 *   node scripts/bake-publish-ribbons.mjs --studio-url http://127.0.0.1:5173 \
 *     --male /path/male.json --female /path/female.json \
 *     --out-male /path/male.json --out-female /path/female.json
 */
import { accessSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  return process.argv[index + 1] || fallback
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
  ]
  return candidates.find((path) => {
    try {
      accessSync(path)
      return true
    } catch {
      return false
    }
  })
}

async function waitForStudio(browser, studioUrl, timeoutMs = 180000) {
  const page = await browser.newPage()
  page.setDefaultTimeout(timeoutMs)
  page.setDefaultNavigationTimeout(timeoutMs)
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[studio console]', msg.text())
  })
  page.on('pageerror', (error) => console.error('[studio pageerror]', error.message))
  await page.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  await page.waitForFunction(() => Boolean(window.__studio?.bakeFromJson), { timeout: timeoutMs })
  return page
}

async function bakeOne(page, jsonText) {
  return page.evaluate(async (text) => {
    const result = await window.__studio.bakeFromJson(text)
    return {
      body: result.body,
      routes: result.routes,
      ribbons: result.ribbons,
      samples: result.samples,
      json: JSON.stringify(result.payload),
    }
  }, jsonText)
}

async function main() {
  const studioUrl = arg('studio-url', 'http://127.0.0.1:5173/')
  const jobs = [
    { label: 'male', input: arg('male'), output: arg('out-male') },
    { label: 'female', input: arg('female'), output: arg('out-female') },
  ].filter((job) => job.input && job.output)

  if (!jobs.length) {
    throw new Error('pass --male/--out-male and/or --female/--out-female')
  }

  let puppeteer
  try {
    puppeteer = require('puppeteer-core')
  } catch {
    throw new Error('install puppeteer-core to bake publish maps')
  }

  const executablePath = chromePath()
  if (!executablePath) throw new Error('google-chrome not found')

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    protocolTimeout: 15 * 60 * 1000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--window-size=1280,900',
    ],
  })

  try {
    const page = await waitForStudio(browser, studioUrl, 180000)
    page.setDefaultTimeout(15 * 60 * 1000)
    for (const job of jobs) {
      console.log(`baking ${job.label} from ${job.input}`)
      const source = await readFile(job.input, 'utf8')
      const baked = await bakeOne(page, source)
      if (baked.body !== job.label) {
        throw new Error(`${job.label} bake produced body=${baked.body}`)
      }
      await writeFile(job.output, `${baked.json}\n`)
      console.log(JSON.stringify({
        body: baked.body,
        routes: baked.routes,
        ribbons: baked.ribbons,
        samples: baked.samples,
        bytes: Buffer.byteLength(baked.json),
        out: job.output,
      }))
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
