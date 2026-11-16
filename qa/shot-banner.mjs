import { chromium } from 'playwright'
const browser = await chromium.launch()
// 1) fresh visitor: banner visible on Home
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
if (await page.locator('[role="dialog"]').count()) {
  await page.locator('[role="dialog"] button:has(svg.lucide-x)').first().click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(400)
}
const bannerVisible = await page.getByText('Установите Tempo').isVisible()
await page.screenshot({ path: 'qa/shot-banner.png' })
console.log('1) banner visible (fresh):', bannerVisible)
// 2) dismiss X → hidden this session, still hidden after tab change
await page.locator('button[aria-label="Скрыть"]').first().click()
await page.waitForTimeout(300)
const afterDismiss = await page.getByText('Установите Tempo').isVisible()
console.log('2) after X hidden:', !afterDismiss)
// 3) settings toggle off → hidden
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
if (await page.locator('[role="dialog"]').count()) {
  await page.locator('[role="dialog"] button:has(svg.lucide-x)').first().click().catch(() => page.keyboard.press('Escape'))
}
await page.getByText('Профиль', { exact: true }).last().click({ timeout: 5000 })
await page.waitForTimeout(700)
const row = page.getByText('Предлагать установить приложение')
await row.scrollIntoViewIfNeeded()
await page.screenshot({ path: 'qa/shot-banner-setting.png' })
const settingVisible = await row.isVisible()
// click off
await page.locator('div:has(> span:text("Предлагать установить приложение")) button').last().click()
await page.waitForTimeout(400)
await page.getByText('Главная', { exact: true }).last().click({ timeout: 5000 })
await page.waitForTimeout(800)
const bannerOff = await page.getByText('Установите Tempo').isVisible()
console.log('3) setting row visible:', settingVisible, '| banner after off:', bannerOff)
// 4) installed device: emulate standalone via display-mode override
await ctx.close()
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU', colorScheme: 'dark' })
const p2 = await ctx2.newPage()
await p2.emulateMedia({ media: null, colorScheme: 'dark' })
// cannot emulate display-mode directly; use localStorage flag instead
await p2.addInitScript(() => { try { localStorage.setItem('tempo-pwa-installed', '1') } catch {} })
await p2.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
await p2.waitForTimeout(1500)
if (await p2.locator('[role="dialog"]').count()) {
  await p2.locator('[role="dialog"] button:has(svg.lucide-x)').first().click().catch(() => p2.keyboard.press('Escape'))
}
const installedNoBanner = !(await p2.getByText('Установите Tempo').isVisible().catch(() => false))
console.log('4) banner hidden on installed device:', installedNoBanner)
await browser.close()
