import { chromium } from 'playwright'
const b = await chromium.launch()
const page = await b.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('https://tempo-ai-life-os.pplx.app', { waitUntil: "domcontentloaded" })
await page.waitForTimeout(3000)
const res = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const c = await caches.open('tempo-shell-v1')
  const keys = (await c.keys()).length
  return { registered: !!reg, active: reg?.active?.state ?? null, controlled: !!navigator.serviceWorker.controller, cachedEntries: keys }
})
// offline shell check on live
await page.context().setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const offlineOk = await page.evaluate(() => !!document.getElementById('root')?.children.length)
console.log(JSON.stringify({ ...res, offlineShell: offlineOk, jsErrors: errs.slice(0, 3) }))
await b.close()
