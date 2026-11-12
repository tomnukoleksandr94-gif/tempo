import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const reqLog = []
const errors = []
page.on('response', r => { if (r.url().includes('generativelanguage')) reqLog.push(r.request().method() + ' ' + r.url().split('/models/')[1] + ' -> ' + r.status()) })
page.on('requestfailed', r => reqLog.push('FAILED ' + (r.url().split('/models/')[1] || r.url()) + ' ' + (r.failure()?.errorText || '')))
page.on('pageerror', e => errors.push('pageerror: ' + String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[placeholder*="Записать"]', { timeout: 10000 })

// 1) AI capture flow
await page.locator('input[placeholder*="Записать"]').fill('Потратил 18 евро на обед, курица с рисом, завтра встреча в 15:00')
await page.keyboard.press('Enter')

// wait for confirmation sheet (AI call + validation)
let sheet = false
try {
  await page.waitForSelector('text=Подтверждение', { timeout: 45000 })
  sheet = true
} catch { /* keep going */ }
console.log('SHEET_APPEARED:', sheet)
console.log('REQ_LOG:', JSON.stringify(reqLog))

// capture whatever the page shows after the AI call
await page.waitForTimeout(1500)
const bodyAfter = await page.evaluate(() => document.body.innerText)
console.log('---BODY AFTER AI---')
console.log(bodyAfter.slice(0, 1600))

if (sheet) {
  const body = await page.evaluate(() => document.body.innerText)
  console.log('---SHEET BODY---')
  console.log(body.slice(0, 1500))
  await page.screenshot({ path: 'qa/shot-sheet.jpg', type: 'jpeg', quality: 80 })
}

console.log('ERRORS:', JSON.stringify(errors))
await browser.close()
