import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto('https://tempo-life-os.pplx.app', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[placeholder*="Записать"]', { timeout: 15000 })
await page.locator('input[placeholder*="Записать"]').fill('Потратил 5 евро на кофе')
await page.keyboard.press('Enter')
try {
  await page.waitForSelector('text=Проверьте и подтвердите', { timeout: 60000 })
  console.log('PROD AI FLOW: PASS')
} catch { console.log('PROD AI FLOW: FAIL') }
console.log('errors:', JSON.stringify(errors))
await browser.close()
