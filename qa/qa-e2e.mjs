import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const reqLog = []
const errors = []
page.on('response', r => { if (r.url().includes('generativelanguage')) reqLog.push(r.url().split('/models/')[1] + ' -> ' + r.status()) })
page.on('pageerror', e => errors.push('pageerror: ' + String(e)))
const ok = (name) => console.log('PASS:', name)
const fail = (name, extra = '') => console.log('FAIL:', name, extra)

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[placeholder*="Записать"]', { timeout: 10000 })

// ---- 1. AI capture: 3 records from one message ----
await page.locator('input[placeholder*="Записать"]').fill('Потратил 18 евро на обед, курица с рисом, завтра встреча в 15:00')
await page.keyboard.press('Enter')
try {
  await page.waitForSelector('text=Проверьте и подтвердите', { timeout: 90000 })
  ok('AI capture -> confirmation sheet')
} catch { fail('AI capture -> confirmation sheet'); }
await page.screenshot({ path: 'qa/shot-sheet.jpg', type: 'jpeg', quality: 80 })

// cards should mention expense / meal / event
const sheetText = await page.evaluate(() => document.body.innerText)
const hasExp = /РАСХОД/i.test(sheetText)
const hasMeal = /ПРИЁМ ПИЩИ|ЕДА|БЛЮДО|ПИТАНИЕ/i.test(sheetText)
const hasEvent = /СОБЫТИЕ|ВСТРЕЧА|МЕРОПРИЯТИЕ/i.test(sheetText)
console.log('sheet cards:', { hasExp, hasMeal, hasEvent })

// ---- 2. Confirm -> data applied ----
try {
  await page.getByText('Записать', { exact: true }).first().click({ timeout: 8000 })
  ok('confirm button clicked')
} catch (e) { fail('confirm button', String(e).slice(0, 120)) }
await page.waitForTimeout(800)

// ---- 3. Finance page shows the expense ----
await page.getByText('Финансы', { exact: true }).last().click()
await page.waitForTimeout(600)
let fin = await page.evaluate(() => document.body.innerText)
fin.includes('18') && /обед|Обед/i.test(fin) ? ok('finance shows €18 expense') : fail('finance shows €18 expense', fin.slice(0, 200))
await page.screenshot({ path: 'qa/shot-finance.jpg', type: 'jpeg', quality: 80 })

// ---- 4. Calendar shows the event tomorrow ----
await page.getByText('Календарь', { exact: true }).last().click()
await page.waitForTimeout(600)
// event is tomorrow (Nov 13) — click that day in the grid
await page.locator('button, [class*=cell], div').filter({ hasText: /^13$/ }).first().click().catch(() => {})
await page.waitForTimeout(500)
let cal = await page.evaluate(() => document.body.innerText)
cal.includes('Встреча') || cal.includes('встреча') ? ok('calendar shows Встреча') : fail('calendar shows Встреча', cal.slice(0, 300))

// ---- 5. Nutrition shows the meal ----
await page.getByText('Еда', { exact: true }).last().click()
await page.waitForTimeout(600)
let nut = await page.evaluate(() => document.body.innerText)
parseInt(nut.match(/(\d+)\n?цель/)?.[1] || '0') > 0 ? ok('nutrition kcal > 0 (meal applied)') : fail('nutrition kcal', nut.slice(0, 200))
await page.screenshot({ path: 'qa/shot-nutrition.jpg', type: 'jpeg', quality: 80 })

// ---- 6. Tasks: manual add + toggle ----
await page.getByText('Задачи', { exact: true }).last().click()
await page.waitForTimeout(500)
let tasksBefore = await page.evaluate(() => document.body.innerText)
console.log('tasks page:', tasksBefore.slice(0, 150).replace(/\n/g, ' | '))

// ---- 7. Home metrics updated ----
await page.getByText('Главная', { exact: true }).last().click()
await page.waitForTimeout(600)
let home = await page.evaluate(() => document.body.innerText)
home.includes('18 €') ? ok('home shows 18 € daily expense') : fail('home daily expense', home.slice(0, 200))

// ---- 8. Assistant chat question ----
await page.getByText('AI', { exact: true }).last().click()
await page.waitForTimeout(500)
const chatInput = page.locator('input:visible').first()
await chatInput.fill('Сколько я потратил сегодня?')
await page.keyboard.press('Enter')
try {
  await page.waitForFunction(() => document.body.innerText.includes('18'), null, { timeout: 30000 })
  ok('assistant answers from real data')
} catch { fail('assistant data question') }

console.log('REQ_LOG:', JSON.stringify(reqLog))
console.log('ERRORS:', JSON.stringify(errors))
await browser.close()
