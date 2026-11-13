/** QA: screenshots of the redesigned Assistant + promo pricing. */
import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const errors = []
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[placeholder*="Записать"]', { timeout: 10000 })

// --- Assistant: new controls ---
await page.getByText('AI', { exact: true }).last().click()
await page.waitForTimeout(800)
await page.screenshot({ path: 'qa/shot-assistant.png' })

// controls present?
const body = await page.evaluate(() => document.body.innerText)
console.log('mode toggle:', /Чат|Действия/.test(body) ? 'OK' : 'MISSING')
console.log('tiers:', /Быстрая|Баланс|Умная/.test(body) ? 'OK' : 'MISSING')
console.log('style btn:', /Стиль/.test(body) ? 'OK' : 'MISSING')
console.log('usage chip:', /0\/10|\/10/.test(body) ? 'OK' : 'MISSING')

// --- chat mode streaming ---
await page.locator('input[placeholder*="Записать"]').fill('Привет! Что ты умеешь?')
await page.keyboard.press('Enter')
try {
  await page.waitForSelector('text=Стоп', { timeout: 15000 })
  console.log('streaming with stop button: OK')
} catch { console.log('streaming with stop button: MISSING') }
await page.waitForTimeout(2500)
await page.screenshot({ path: 'qa/shot-assistant-stream.png' })
const chatText = await page.evaluate(() => document.body.innerText)
console.log('reply arrived:', chatText.includes('Tempo') || chatText.length > 300 ? 'OK' : 'UNCLEAR')

// prefs panel
await page.getByText('Стиль', { exact: true }).first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: 'qa/shot-assistant-prefs.png' })
const prefs = await page.evaluate(() => document.body.innerText)
console.log('prefs panel:', /Глубина|Длина|Тон|Формат/.test(prefs) ? 'OK' : 'MISSING')

// clear chat with confirmation
await page.locator('button[aria-label="Очистить чат"]').click()
await page.waitForTimeout(300)
const conf = await page.evaluate(() => document.body.innerText)
console.log('clear confirm:', /удалить всю историю/i.test(conf) ? 'OK' : 'MISSING')

// --- Billing: promo pricing ---
await page.getByText('Оплата', { exact: true }).last().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'qa/shot-billing.png' })
const bill = await page.evaluate(() => document.body.innerText)
console.log('promo banner:', /TEMPO3/.test(bill) ? 'OK' : 'MISSING')
console.log('discounted price 1.99:', bill.includes('1.99') ? 'OK' : 'MISSING')
console.log('struck old price 4.99:', bill.includes('4.99') ? 'OK' : 'MISSING')

console.log('ERRORS:', errors.length ? errors : 'none')
await browser.close()
