import { chromium } from 'playwright'
const URL = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
// seed an event tomorrow BEFORE the app boots (addInitScript)
await page.addInitScript(() => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  localStorage.setItem('tempo-data-v1', JSON.stringify({
    state: { version: 1, settings: { locale: 'ru' }, events: [{ id: 'test-ev-1', title: 'Встреча QA', date: tomorrow, time: '15:00', createdAt: Date.now() }], transactions: [], tasks: [], meals: [], foods: [], budgets: {}, aiUsage: { date: '', count: 0 }, insight: null, chat: [], captures: [], planningTab: 'calendar' },
    version: 2
  }))
})
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
console.log('page errors:', JSON.stringify(errors))
console.log('body head:', (await page.evaluate(() => document.body.innerText)).slice(0, 150).replace(/\n/g, ' | '))
await page.getByText('План', { exact: true }).last().click()
await page.waitForTimeout(500)
await page.getByText('Календарь', { exact: true }).last().click()
await page.waitForTimeout(500)
// the calendar grid highlights days with events
const marks = await page.locator('button, [class*=cell], div').filter({ hasText: /^14$/ }).count()
console.log('day-14 cells:', marks)
// inspect the calendar page structure for day cells
const cells = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, [class*=cell], [class*=day]')].slice(0, 60)
  return els.map(e => e.className + ' :: ' + (e.textContent || '').trim().slice(0, 12)).filter(x => /14|cell|day/i.test(x)).slice(0, 20)
})
console.log('cells:', JSON.stringify(cells, null, 1))
await page.screenshot({ path: 'qa/shot-calendar.jpg', type: 'jpeg', quality: 80 })
const txt = await page.evaluate(() => document.body.innerText)
console.log('Встреча QA on page:', txt.includes('Встреча QA'))
// click day 14 if present
const cell = page.locator('button').filter({ hasText: /^14$/ }).first()
if (await cell.count()) { await cell.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(500) }
const txt2 = await page.evaluate(() => document.body.innerText)
console.log('after day click, Встреча QA:', txt2.includes('Встреча QA'))
await browser.close()
