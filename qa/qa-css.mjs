import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
const r = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => typeof d.className === 'string' && /p-4/.test(d.className) && d.className.includes('glass'))
  if (!el) return { err: 'no el' }
  const cs = getComputedStyle(el)
  return { cls: el.className.slice(0, 60), pt: cs.paddingTop, pl: cs.paddingLeft }
})
console.log('LOCAL:', JSON.stringify(r))
await browser.close()
