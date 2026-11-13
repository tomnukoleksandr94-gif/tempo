import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + String(e)))
const ok = (n) => console.log('PASS:', n)
const fail = (n, x = '') => console.log('FAIL:', n, x)

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[placeholder*="Записать"]', { timeout: 10000 })

// ---- 1. Profile: 5 languages available ----
await page.locator('text=Профиль').last().click()
await page.waitForTimeout(400)
const body1 = await page.evaluate(() => document.body.innerText)
ok('profile open: ' + (body1.includes('Язык') ? 'has language row' : 'NO lang row'))
// open language pills
const langRow = page.locator('text=Язык').first()
await langRow.click()
await page.waitForTimeout(300)
const body2 = await page.evaluate(() => document.body.innerText)
const has5 = ['Рус', 'Укр', 'Eng', 'De', 'Fr'].every(l => body2.includes(l))
has5 ? ok('5 language pills') : fail('5 language pills', JSON.stringify(body2.slice(0, 400)))

// ---- 2. switch to Ukrainian ----
await page.locator('text=Укр').first().click()
await page.waitForTimeout(400)
const body3 = await page.evaluate(() => document.body.innerText)
body3.includes('Мова') && body3.includes('Валюта') && body3.includes('Головна') ? ok('UI switched to Ukrainian (incl. nav)') : fail('UI switched to Ukrainian', JSON.stringify(body3.slice(0, 300)))
await page.screenshot({ path: 'qa/shot-uk.jpg', type: 'jpeg', quality: 80 })

// switch to German and back to Russian (quick sanity)
await page.locator('text=De').first().click()
await page.waitForTimeout(300)
const body4 = await page.evaluate(() => document.body.innerText)
body4.includes('Startseite') || body4.includes('Profil') ? ok('German works') : fail('German works')
await page.locator('text=Рус').first().click()
await page.waitForTimeout(300)

// ---- 3. effects toggle ----
const hasNoEffects = await page.evaluate(() => document.querySelector('.no-effects') !== null)
!hasNoEffects ? ok('effects on by default (no .no-effects class)') : fail('effects on by default')
// find the Animations row and click the toggle
const animRow = page.locator('text=Анимации').first()
if (await animRow.count()) {
  await page.locator('text=Анимации').locator('xpath=..').locator('button').click()
  await page.waitForTimeout(300)
  const off = await page.evaluate(() => document.querySelector('.no-effects') !== null)
  off ? ok('effects toggle adds .no-effects') : fail('effects toggle')
  await page.screenshot({ path: 'qa/shot-noeffects.jpg', type: 'jpeg', quality: 80 })
  // toggle back on
  await page.locator('button:has-text("Выкл")').last().click()
  await page.waitForTimeout(200)
  const on = await page.evaluate(() => document.querySelector('.no-effects') === null)
  on ? ok('effects toggle back on') : fail('effects toggle back on')
} else {
  fail('animations row found')
}

// ---- 4. billing: Profile -> subscription card -> pricing sheet ----
await page.locator('button:has-text("Free")').first().click()
await page.waitForTimeout(600)
const bill = await page.evaluate(() => document.body.innerText)
bill.includes('Plus') && bill.includes('Pro') ? ok('billing pricing with plans') : fail('billing pricing with plans')
const hasCard = /Банковск|Bank|Karte|carte/i.test(bill)
console.log('card option (hidden until LiqPay configured):', !hasCard ? 'PASS' : 'FAIL — should be hidden')
const hasStars = /Stars/i.test(bill)
console.log('stars option present:', hasStars ? 'PASS' : 'FAIL')
await page.screenshot({ path: 'qa/shot-billing.jpg', type: 'jpeg', quality: 80 })

// ---- 5. PWA assets served ----
for (const path of ['/manifest.webmanifest', '/img/icon-192.png', '/img/start.jpg']) {
  const r = await page.request.get(URL + path)
  r.ok() ? ok('asset ' + path) : fail('asset ' + path, String(r.status()))
}

// ---- 6. support page ----
await page.locator('text=Профиль').last().click()
await page.waitForTimeout(300)
await page.locator('text=Поддержка').first().click()
await page.waitForTimeout(600)
const sup = await page.evaluate(() => document.body.innerText)
sup.includes('Напишите') || sup.includes('поддержк') ? ok('support page opens') : fail('support page opens', JSON.stringify(sup.slice(0, 200)))
await page.screenshot({ path: 'qa/shot-support.jpg', type: 'jpeg', quality: 80 })
await page.locator('text=Профиль').last().click()
await page.waitForTimeout(300)

console.log('ERRORS:', JSON.stringify(errors))
await browser.close()
