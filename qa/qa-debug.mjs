import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

const bodies = []
page.on('response', async r => {
  if (r.url().includes('generativelanguage')) {
    try { bodies.push(r.url().split('/models/')[1] + '\n' + (await r.text()).slice(0, 6000)) } catch {}
  }
})

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[placeholder*="Записать"]', { timeout: 10000 })
await page.locator('input[placeholder*="Записать"]').fill('Потратил 18 евро на обед, курица с рисом, завтра встреча в 15:00')
await page.keyboard.press('Enter')
await page.waitForTimeout(20000)
console.log(bodies.join('\n\n=====\n\n'))
await browser.close()
