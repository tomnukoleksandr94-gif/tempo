/**
 * QA: main flows on a fresh build (local preview). Handles the onboarding
 * dialog (skips it), then walks all tabs and reports console/page errors.
 *
 * Run: node qa/qa-main.mjs [URL]   (default http://127.0.0.1:4173)
 */
import { chromium } from 'playwright'

const URL = process.argv[2] || 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

let failed = 0
const ok = (name) => console.log('  PASS', name)
const fail = (name, detail = '') => { failed++; console.log('  FAIL', name, detail) }

// --- load ---
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

// --- skip onboarding if shown ---
const closeBtn = page.locator('[role="dialog"] button:has(svg.lucide-x), [role="dialog"] button:has-text("✕")')
if (await page.locator('[role="dialog"]').count()) {
  await (await closeBtn.first()).click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(400)
  ok('onboarding shown and closed')
} else {
  ok('onboarding not shown (returning user)')
}

// --- main capture input present ---
const input = page.locator('input[placeholder*="Записать"], input[placeholder*="Record"], textarea')
if (await input.count()) ok('capture input present')
else fail('capture input present')

// --- walk tabs ---
const tabs = ['Главная', 'Финансы', 'План', 'Профиль']
for (const t of tabs) {
  try {
    await page.getByText(t, { exact: true }).last().click({ timeout: 5000 })
    await page.waitForTimeout(900)
    const visible = await page.getByText(t, { exact: true }).last().isVisible()
    if (visible) ok(`tab ${t}`)
    else fail(`tab ${t}`, 'not visible after click')
  } catch (e) {
    fail(`tab ${t}`, String(e).slice(0, 120))
  }
}

// --- AI tab (via bottom bar 'AI') ---
try {
  await page.getByText('AI', { exact: true }).last().click({ timeout: 5000 })
  await page.waitForTimeout(900)
  ok('tab AI')
} catch (e) {
  fail('tab AI', String(e).slice(0, 120))
}
try {
  await page.getByText('Оплата', { exact: true }).last().click({ timeout: 5000 })
  await page.waitForTimeout(900)
  ok('tab Оплата')
} catch (e) {
  fail('tab Оплата', String(e).slice(0, 120))
}

// --- Ctrl+K search ---
await page.keyboard.press('Control+k')
await page.waitForTimeout(600)
const searchVisible = await page.locator('[role="dialog"], input[placeholder*="Поиск"], input[placeholder*="Search"]').count()
if (searchVisible) ok('global search opens (Ctrl+K)')
else fail('global search opens (Ctrl+K)')

await page.keyboard.press('Escape')

// --- screenshots for visual check ---
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await page.screenshot({ path: 'qa/shot-main.png' })

const realErrors = errors.filter(e => !/favicon|net::ERR|Failed to load resource|CloudStorage is not supported/.test(e))
console.log('---')
console.log('JS errors:', realErrors.length ? realErrors.join(' | ') : 'none')
console.log('RESULT:', failed === 0 && realErrors.length === 0 ? 'ALL PASS' : `${failed} failures, ${realErrors.length} JS errors`)
await browser.close()
