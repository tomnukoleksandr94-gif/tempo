import { chromium } from 'playwright'
const b = await chromium.launch()
const page = await b.newPage()
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const res = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const ctrl = !!navigator.serviceWorker.controller
  const r = await fetch('/manifest.webmanifest')
  return { registered: !!reg, active: reg?.active?.state ?? null, controlled: ctrl, manifestOk: r.ok }
})
console.log(JSON.stringify(res))
await b.close()
