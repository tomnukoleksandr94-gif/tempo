import { chromium } from 'playwright'
const b = await chromium.launch()
const page = await b.newPage()
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const reg = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/')))
await page.context().setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const offlineOk = await page.evaluate(() => !!document.getElementById('root')?.children.length)
const offlineApi = await page.evaluate(async () => {
  try { const r = await fetch('/api/health'); return `status ${r.status}` } catch (e) { return 'network blocked (expected offline)' }
})
console.log(JSON.stringify({ swRegistered: reg, shellOffline: offlineOk, apiOffline: offlineApi }))
await b.close()
