import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = 'https://freewebtoapk.com'
const BUILDER_SCRIPT = `${BASE}/js/secure-apk-builder.min.js?v=202605181813`

function packageFromName(name = 'WebApp') {
  const clean = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20)
  return `com.webapp.${clean || 'myapp'}`
}

function validPackageName(packageName, appName) {
  const value = String(packageName || '').trim().toLowerCase()
  if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value)) return value
  return packageFromName(appName)
}

function baseConfig(input) {
  const iconData = input.iconData || null
  const splashLogoData = input.splashLogoData || iconData || null

  return {
    appName: input.appName || 'WebApp',
    websiteUrl: input.websiteUrl,
    appVersion: input.appVersion || '1.0.0',

    iconOption: iconData ? 'upload' : 'generate',
    iconData,
    iconText: input.iconText || String(input.appName || 'W').slice(0, 2).toUpperCase(),
    iconBgColor: input.iconBgColor || '#6366F1',
    iconShape: 'rounded',

    enableSplash: input.enableSplash !== false,
    splashBgColor: input.splashBgColor || '#0A0F1C',
    splashTextColor: input.splashTextColor || '#FFFFFF',
    splashLogoPosition: input.splashLogoPosition || 'center',
    splashLogoData,

    screenMode: input.screenMode || 'fullscreen',
    orientation: input.orientation || 'auto',
    externalLinks: input.externalLinks || 'internal',
    enableDownloads: input.enableDownloads !== false,
    enablePullRefresh: input.enablePullRefresh !== false,
    exitConfirmation: input.exitConfirmation !== false,

    packageName: validPackageName(input.packageName, input.appName),
    developerWebsite: input.websiteUrl,

    enableAdmob: false,
    admobPublisherId: '',
    admobBannerId: '',
    adPlacement: 'bottom',

    enablePush: false,
    onesignalAppId: '',
    googleServicesJson: null,

    permCamera: input.permCamera === true,
    permMicrophone: input.permMicrophone === true,
    permLocation: input.permLocation === true,
    permStorage: input.permStorage === true,
    permContacts: false,
    permPhone: false,
    permBluetooth: false,
    permNfc: false,

    enableSideMenu: true,
    sideMenuColor: '#6366F1',
    appBarColor: '#6366F1',

    aboutUs: '',
    contactEmail: '',
    contactPhone: '',
    enableShareApp: true,
    enableRateApp: true,

    youtubeLink: '',
    telegramLink: '',
    instagramLink: '',
    twitterLink: '',

    enableLiveChat: false,
    chatWidgetCode: '',
    chatButtonLabel: 'Live Chat',

    enablePinLock: false,
    pinCode: '',

    privacyPolicyType: 'auto',
    privacyPolicyUrl: '',
    outputFormat: 'apk',
    currentStep: 5,
    lastUpdated: Date.now()
  }
}

export async function buildWebToApk(input) {
  const onProgress = typeof input.onProgress === 'function' ? input.onProgress : () => {}
  const timeout = Number(process.env.BUILD_TIMEOUT || 300000)
  const config = baseConfig(input)

  let browser
  onProgress('Launching Chromium...', 5)

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process,BlockInsecurePrivateNetworkRequests',
        '--font-render-hinting=none'
      ]
    })

    const context = await browser.newContext({
      viewport: { width: 1365, height: 768 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      bypassCSP: true,
      javaScriptEnabled: true
    })

    const page = await context.newPage()
    page.setDefaultTimeout(timeout)
    page.setDefaultNavigationTimeout(timeout)

    await page.exposeFunction('__buildProgress', ({ message, percent }) => {
      onProgress(message, percent)
    })

    page.on('console', msg => {
      const text = msg.text()
      if (/Failed|Error|corrupt|not found|Template/i.test(text)) console.log('[builder]', text)
    })

    onProgress('Creating isolated FreeWebToApk runtime...', 10)

    // Serve an isolated HTML document on the FreeWebToApk origin.
    // Avoid loading the public wizard or an SVG/image document before injecting the builder runtime.
    const runtimeUrl = `${BASE}/__isolated-apk-builder-runtime.html`

    await page.route(runtimeUrl, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Isolated APK Builder Runtime</title>
</head>
<body>
  <canvas id="iconCanvas" width="512" height="512"></canvas>
</body>
</html>`
      })
    })

    await page.goto(runtimeUrl, {
      waitUntil: 'domcontentloaded',
      timeout
    })

    onProgress('Loading secure APK builder...', 15)
    await page.addScriptTag({ url: BUILDER_SCRIPT })

    await page.waitForFunction(() => {
      return window.SecureAPKBuilder && typeof window.SecureAPKBuilder.init === 'function'
    }, { timeout })

    const result = await page.evaluate(async ({ cfg, buildAab }) => {
      const builder = window.SecureAPKBuilder

      const notify = (message, percent) => {
        try { window.__buildProgress({ message, percent }) } catch {}
      }

      const dataUrlToBlob = async (dataUrl) => {
        if (!dataUrl) return null
        const res = await fetch(dataUrl)
        return await res.blob()
      }

      const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      const generateIconBlob = async (config) => {
        const canvas = document.getElementById('iconCanvas') || document.createElement('canvas')
        canvas.width = 512
        canvas.height = 512
        const ctx = canvas.getContext('2d')

        const grd = ctx.createLinearGradient(0, 0, 512, 512)
        grd.addColorStop(0, config.iconBgColor || '#6366F1')
        grd.addColorStop(1, '#111827')
        ctx.fillStyle = grd

        const radius = 92
        ctx.beginPath()
        ctx.moveTo(radius, 0)
        ctx.lineTo(512 - radius, 0)
        ctx.quadraticCurveTo(512, 0, 512, radius)
        ctx.lineTo(512, 512 - radius)
        ctx.quadraticCurveTo(512, 512, 512 - radius, 512)
        ctx.lineTo(radius, 512)
        ctx.quadraticCurveTo(0, 512, 0, 512 - radius)
        ctx.lineTo(0, radius)
        ctx.quadraticCurveTo(0, 0, radius, 0)
        ctx.fill()

        ctx.fillStyle = 'rgba(255,255,255,.16)'
        ctx.beginPath()
        ctx.arc(396, 112, 130, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 190px Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((config.iconText || config.appName || 'W').slice(0, 3).toUpperCase(), 256, 270)

        return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      }

      notify('Initializing builder...', 18)
      await builder.init()

      let iconBlob = null
      if (cfg.iconData) iconBlob = await dataUrlToBlob(cfg.iconData)
      if (!iconBlob) iconBlob = await generateIconBlob(cfg)

      notify('Building APK...', 22)
      const apkResult = await builder.buildAPK(
        cfg,
        iconBlob,
        (message, percent) => notify(message, Math.min(95, 22 + Math.round((percent || 0) * 0.72))),
        false
      )

      const apkBlob = apkResult.blob || apkResult
      const apkBase64 = await blobToBase64(apkBlob)

      let aabBase64 = null
      let aabSize = null

      if (buildAab) {
        notify('Building AAB...', 72)
        const aabResult = await builder.buildAAB(
          cfg,
          iconBlob,
          (message, percent) => notify(message, Math.min(98, 72 + Math.round((percent || 0) * 0.25)))
        )
        const aabBlob = aabResult.blob || aabResult
        aabBase64 = await blobToBase64(aabBlob)
        aabSize = aabBlob.size
      }

      notify('Finalizing file...', 98)

      return {
        apk: {
          base64: apkBase64,
          size: apkBlob.size
        },
        aab: aabBase64 ? {
          base64: aabBase64,
          size: aabSize
        } : null
      }
    }, {
      cfg: config,
      buildAab: input.buildAab === true
    })

    if (!result?.apk?.base64) throw new Error('Builder tidak mengembalikan APK')

    fs.writeFileSync(input.apkPath, Buffer.from(result.apk.base64, 'base64'))
    const apkStat = fs.statSync(input.apkPath)

    const output = {
      apk: { path: input.apkPath, size: apkStat.size },
      aab: null
    }

    if (result.aab?.base64 && input.aabPath) {
      fs.writeFileSync(input.aabPath, Buffer.from(result.aab.base64, 'base64'))
      const aabStat = fs.statSync(input.aabPath)
      output.aab = { path: input.aabPath, size: aabStat.size }
    }

    onProgress('Complete', 100)
    return output
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
