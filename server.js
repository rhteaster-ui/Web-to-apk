import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildWebToApk } from './src/builder.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const OUTPUT_DIR = path.join(__dirname, 'output')
const MAX_QUEUE = Number(process.env.MAX_QUEUE || 4)

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

app.use(express.json({ limit: '14mb' }))
app.use(express.urlencoded({ extended: true, limit: '14mb' }))
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '2h'
}))

const jobs = new Map()
const queue = []
const clients = new Map()
let active = false

function id() {
  return crypto.randomBytes(10).toString('hex')
}

function safeSlug(input = 'webapp') {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'webapp'
}

function validateUrl(raw) {
  if (!raw) throw new Error('Website URL wajib diisi')
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL harus http/https')
  return parsed.href
}

function sendEvent(jobId, event, data) {
  const group = clients.get(jobId)
  if (!group) return
  for (const res of group) {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
}

function publicJob(job) {
  if (!job) return null
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    input: job.input,
    output: job.output,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }
}

function updateJob(jobId, patch) {
  const current = jobs.get(jobId)
  if (!current) return null
  const next = { ...current, ...patch, updatedAt: Date.now() }
  jobs.set(jobId, next)
  sendEvent(jobId, 'update', publicJob(next))
  return next
}

function enqueue(job) {
  if (queue.length >= MAX_QUEUE) throw new Error('Queue sedang penuh, coba lagi beberapa menit.')
  queue.push(job.id)
  updateJob(job.id, {
    status: 'queued',
    progress: 3,
    message: `Masuk antrean #${queue.length}`
  })
  processQueue()
}

async function processQueue() {
  if (active) return
  const jobId = queue.shift()
  if (!jobId) return

  const job = jobs.get(jobId)
  if (!job) {
    processQueue()
    return
  }

  active = true
  updateJob(jobId, {
    status: 'running',
    progress: 7,
    message: 'Menyiapkan isolated builder runtime...'
  })

  try {
    const baseName = `${safeSlug(job.input.appName)}-${job.id}`
    const apkPath = path.join(OUTPUT_DIR, `${baseName}.apk`)
    const aabPath = path.join(OUTPUT_DIR, `${baseName}.aab`)

    const result = await buildWebToApk({
      ...job.input,
      apkPath,
      aabPath,
      onProgress: (message, percent) => {
        const p = Math.max(7, Math.min(98, Math.round(percent || 0)))
        updateJob(jobId, {
          status: 'running',
          progress: p,
          message: message || 'Processing...'
        })
      }
    })

    const output = {
      apk: result.apk ? {
        ready: true,
        size: result.apk.size,
        filename: path.basename(apkPath),
        downloadUrl: `/api/download/${jobId}/apk`
      } : null,
      aab: result.aab ? {
        ready: true,
        size: result.aab.size,
        filename: path.basename(aabPath),
        downloadUrl: `/api/download/${jobId}/aab`
      } : null
    }

    updateJob(jobId, {
      status: 'done',
      progress: 100,
      message: 'APK siap di-download.',
      output,
      paths: { apkPath, aabPath }
    })
    sendEvent(jobId, 'done', publicJob(jobs.get(jobId)))
  } catch (err) {
    updateJob(jobId, {
      status: 'failed',
      progress: 100,
      message: 'Build gagal.',
      error: err.message || String(err)
    })
    sendEvent(jobId, 'failed', publicJob(jobs.get(jobId)))
  } finally {
    active = false
    processQueue()
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'webtoapk-railway-builder-v2', uptime: process.uptime() })
})

app.post('/api/build', (req, res) => {
  try {
    const body = req.body || {}
    const websiteUrl = validateUrl(body.websiteUrl || body.url)
    const appName = String(body.appName || body.name || 'WebApp').trim().slice(0, 30)
    if (!appName) throw new Error('App name wajib diisi.')

    const jobId = id()
    const now = Date.now()

    const job = {
      id: jobId,
      status: 'created',
      progress: 0,
      message: 'Job dibuat.',
      error: null,
      output: null,
      paths: null,
      input: {
        websiteUrl,
        appName,
        appVersion: String(body.appVersion || body.version || '1.0.0').trim() || '1.0.0',
        packageName: String(body.packageName || '').trim(),
        buildAab: body.buildAab === true,

        screenMode: body.screenMode || 'fullscreen',
        orientation: body.orientation || 'auto',
        externalLinks: body.externalLinks || 'internal',

        iconOption: body.iconData ? 'upload' : 'generate',
        iconData: typeof body.iconData === 'string' && body.iconData.startsWith('data:image/') ? body.iconData : null,
        iconText: String(body.iconText || appName.slice(0, 2)).slice(0, 3).toUpperCase(),
        iconBgColor: body.iconBgColor || '#6366F1',

        enableSplash: body.enableSplash !== false,
        splashBgColor: body.splashBgColor || '#0A0F1C',
        splashTextColor: body.splashTextColor || '#FFFFFF',
        splashLogoPosition: body.splashLogoPosition || 'center',
        splashLogoData: typeof body.splashLogoData === 'string' && body.splashLogoData.startsWith('data:image/')
          ? body.splashLogoData
          : (typeof body.iconData === 'string' && body.iconData.startsWith('data:image/') ? body.iconData : null),

        enablePullRefresh: body.enablePullRefresh !== false,
        enableDownloads: body.enableDownloads !== false,
        exitConfirmation: body.exitConfirmation !== false,

        permCamera: body.permCamera === true,
        permMicrophone: body.permMicrophone === true,
        permLocation: body.permLocation === true,
        permStorage: body.permStorage === true
      },
      createdAt: now,
      updatedAt: now
    }

    jobs.set(jobId, job)
    enqueue(job)

    res.status(202).json({
      status: true,
      job: publicJob(jobs.get(jobId)),
      eventsUrl: `/api/jobs/${jobId}/events`
    })
  } catch (err) {
    res.status(400).json({ status: false, message: err.message || String(err) })
  }
})

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ status: false, message: 'Job tidak ditemukan' })
  res.json({ status: true, job: publicJob(job) })
})

app.get('/api/jobs/:id/events', (req, res) => {
  const jobId = req.params.id
  const job = jobs.get(jobId)
  if (!job) return res.status(404).end()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  if (!clients.has(jobId)) clients.set(jobId, new Set())
  clients.get(jobId).add(res)

  res.write(`event: update\n`)
  res.write(`data: ${JSON.stringify(publicJob(job))}\n\n`)

  req.on('close', () => {
    const group = clients.get(jobId)
    if (!group) return
    group.delete(res)
    if (group.size === 0) clients.delete(jobId)
  })
})

app.get('/api/download/:id/:type', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job || job.status !== 'done') return res.status(404).json({ status: false, message: 'File belum siap atau job tidak ditemukan' })

  const type = req.params.type === 'aab' ? 'aab' : 'apk'
  const filePath = type === 'aab' ? job.paths?.aabPath : job.paths?.apkPath
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ status: false, message: 'File tidak ditemukan' })

  res.download(filePath)
})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

setInterval(() => {
  const now = Date.now()
  const maxAge = 1000 * 60 * 60
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.updatedAt > maxAge) {
      for (const file of [job.paths?.apkPath, job.paths?.aabPath]) {
        if (file && fs.existsSync(file)) fs.rmSync(file, { force: true })
      }
      jobs.delete(jobId)
    }
  }
}, 1000 * 60 * 10)

app.listen(PORT, HOST, () => {
  console.log(`WebToAPK Builder v2 running on http://${HOST}:${PORT}`)
})
