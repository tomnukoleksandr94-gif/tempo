import { chromium } from 'playwright'
const URL = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })

async function run(width, height, tag) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  // dark home
  await page.screenshot({ path: `qa/theme-${tag}-dark-home.jpg`, type: 'jpeg', quality: 80, fullPage: false })

  // switch to light theme via Profile
  const vis = await page.getByText('Профиль').locator(':visible').count()
  console.log(tag, 'visible Профиль:', vis)
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 120))
  console.log(tag, 'body:', JSON.stringify(txt))
  const dom = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')].filter(e => e.textContent?.trim() === 'Профиль')
    return spans.map(e => {
      const r = e.getBoundingClientRect()
      const st = getComputedStyle(e)
      return { rect: [r.x, r.y, r.width, r.height].map(Math.round), display: st.display, vis: st.visibility, op: st.opacity, offsetParent: e.offsetParent ? String(e.offsetParent.tagName) : null }
    })
  })
  console.log(tag, 'dom spans:', JSON.stringify(dom))
  // click nav items via DOM (Playwright actionability is flaky with the fixed tab bar)
  const domClick = (text) => page.evaluate((t) => {
    const btns = [...document.querySelectorAll('button')]
    const el = btns.find(b => b.textContent?.trim().includes(t) && b.getBoundingClientRect().height > 0)
    if (el) { el.click(); return true }
    return false
  }, text)
  const clicked = await domClick('Профиль')
  if (!clicked) { console.log(tag, 'nav click failed'); throw new Error('nav not found') }
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const el = btns.find(b => b.textContent?.trim() === 'Светлая')
    if (el) el.click()
  })
  await page.waitForTimeout(500)
  await domClick('Главная')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `qa/theme-${tag}-light-home.jpg`, type: 'jpeg', quality: 80 })

  // light profile + account section
  await domClick('Профиль')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `qa/theme-${tag}-light-profile.jpg`, type: 'jpeg', quality: 80, fullPage: false })

  // pricing sheet (light)
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height > 0)
    const el = els.find(b => b.textContent?.includes('Free'))
    if (el) el.click()
  })
  await page.waitForTimeout(800)
  // scroll the actual scrollable container inside the sheet to the bottom
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')]
    const scroller = els.filter(e => e.scrollHeight > e.clientHeight + 40).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `qa/theme-${tag}-light-pricing.jpg`, type: 'jpeg', quality: 80 })
  await ctx.close()
}

await run(390, 844, 'm')
await run(1280, 800, 'd')
await browser.close()
console.log('done')
