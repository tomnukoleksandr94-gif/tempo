import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))

await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const sidebar = await page.evaluate(() => !!document.querySelector('aside, nav'))
const canScrollX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
console.log('sidebar present:', sidebar, '| horizontal scroll:', canScrollX)
await page.screenshot({ path: 'qa/shot-desktop-home.jpg', type: 'jpeg', quality: 80 })
await page.getByText('Финансы', { exact: true }).first().click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'qa/shot-desktop-finance.jpg', type: 'jpeg', quality: 80 })
console.log('errors:', JSON.stringify(errors))
await browser.close()
