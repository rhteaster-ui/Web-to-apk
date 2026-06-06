import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = 'https://freewebtoapk.com'
const DOWNLOAD_PAGE = `${BASE}/generator/download-apk`

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
  return {
    appName: input.appName || 'WebApp',
    websiteUrl: input.websiteUrl,
    appVersion: input.appVersion || '1.0.0',

    iconOption: 'generate',
    iconData: null,
    iconText: input.iconText || String(input.appName || 'W').slice(0, 2).toUpperCase(),
    iconBgColor: input.iconBgColor || '#6366F1',
    iconShape: 'rounded',

    enableSplash: true,
    splashBgColor: '#0A0F1C',
    splashTextColor: '#FFFFFF',
    splashLogoPosition: 'center',
    splashLogoData: null,

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
  const timeout = Number(process.env.BUILD_TIMEOUT || 240000)
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
        '--disable-features=IsolateOrigins,site-per-process',
        '--font-render-hinting=none'
      ]
    })

    const context = await browser.newContext({
      viewport: { width: 1365, height: 768 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    })

    const page = await context.newPage()
    page.setDefaultTimeout(timeout)
    page.setDefaultNavigationTimeout(timeout)

    await page.exposeFunction('__buildProgress', ({ message, percent }) => {
      onProgress(message, percent)
    })

    page.on('console', msg => {
      const text = msg.text()
      if (/Failed|Error|corrupt|not found/i.test(text)) {
        console.log('[builder]', text)
      }
    })

    onProgress('Opening builder runtime...', 10)
    await page.goto(DOWNLOAD_PAGE, { waitUntil: 'domcontentloaded', timeout })

    await page.evaluate((cfg) => {
      sessionStorage.setItem('freewebtoapk_wizard', JSON.stringify(cfg))
    }, config)

    onProgress('Loading secure builder...', 15)
    await page.reload({ waitUntil: 'networkidle', timeout })

    await page.waitForFunction(() => {
      return window.SecureAPKBuilder && typeof window.SecureAPKBuilder.init === 'function'
    }, { timeout })

    const result = await page.evaluate(async ({ cfg, buildAab }) => {
      const builder = window.SecureAPKBuilder

      const notify = (message, percent) => {
        try {
          window.__buildProgress({ message, percent })
        } catch {}
      }

      const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      const makeIconBlob = async (config) => {
        const canvas = document.createElement('canvas')
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
        ctx.font = 'bold 190px Inter, Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((config.iconText || config.appName || 'W').slice(0, 3).toUpperCase(), 256, 270)

        return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      }

      notify('Initializing builder...', 18)
      await builder.init()

      const iconBlob = await makeIconBlob(cfg)

      notify('Building APK...', 22)
      const apkResult = await builder.buildAPK(
        cfg,
        iconBlob,
        (message, percent) => notify(message, Math.min(95, 22 + Math.round(percent * 0.72))),
        false
      )
      const apkBlob = apkResult.blob || apkResult
      const apkBase64 = await blobToBase64(apkBlob)

      let aabBase64 = null
      if (buildAab) {
        notify('Building AAB...', 72)
        const aabResult = await builder.buildAAB(
          cfg,
          iconBlob,
          (message, percent) => notify(message, Math.min(98, 72 + Math.round(percent * 0.25)))
        )
        const aabBlob = aabResult.blob || aabResult
        aabBase64 = await blobToBase64(aabBlob)
      }

      notify('Finalizing file...', 98)

      return {
        apk: {
          base64: apkBase64,
          size: apkBlob.size
        },
        aab: aabBase64 ? {
          base64: aabBase64,
          size: Math.ceil((aabBase64.length * 3) / 4)
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
      apk: {
        path: input.apkPath,
        size: apkStat.size
      },
      aab: null
    }

    if (result.aab?.base64 && input.aabPath) {
      fs.writeFileSync(input.aabPath, Buffer.from(result.aab.base64, 'base64'))
      const aabStat = fs.statSync(input.aabPath)
      output.aab = {
        path: input.aabPath,
        size: aabStat.size
      }
    }

    onProgress('Complete', 100)
    return output
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
