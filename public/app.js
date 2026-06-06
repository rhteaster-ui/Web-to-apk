const form = document.getElementById('buildForm')
const submitBtn = document.getElementById('submitBtn')
const statusText = document.getElementById('statusText')
const progressBar = document.getElementById('progressBar')
const progressMessage = document.getElementById('progressMessage')
const downloadBox = document.getElementById('downloadBox')
const previewName = document.getElementById('previewName')
const previewUrl = document.getElementById('previewUrl')
const previewIcon = document.getElementById('previewIcon')

const appName = document.getElementById('appName')
const websiteUrl = document.getElementById('websiteUrl')
const iconText = document.getElementById('iconText')

function setProgress(p, message, status = 'Running') {
  progressBar.style.width = `${Math.max(0, Math.min(100, p || 0))}%`
  progressMessage.textContent = message || 'Processing...'
  statusText.textContent = status
}

function fmt(bytes = 0) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 2 : 0)} ${units[i]}`
}

function updatePreview() {
  const name = appName.value.trim() || 'Rxyz App'
  const url = websiteUrl.value.trim() || 'https://example.com'
  const text = iconText.value.trim() || name.slice(0, 2).toUpperCase()

  previewName.textContent = name
  previewUrl.textContent = url
  previewIcon.textContent = text.slice(0, 3).toUpperCase()
}

appName.addEventListener('input', updatePreview)
websiteUrl.addEventListener('input', updatePreview)
iconText.addEventListener('input', updatePreview)
updatePreview()

function renderDownloads(output) {
  downloadBox.innerHTML = ''
  downloadBox.classList.remove('hidden')

  if (output?.apk?.ready) {
    const a = document.createElement('a')
    a.href = output.apk.downloadUrl
    a.innerHTML = `<span>Download APK</span><small>${fmt(output.apk.size)}</small>`
    downloadBox.appendChild(a)
  }

  if (output?.aab?.ready) {
    const a = document.createElement('a')
    a.href = output.aab.downloadUrl
    a.innerHTML = `<span>Download AAB</span><small>${fmt(output.aab.size)}</small>`
    downloadBox.appendChild(a)
  }
}

async function startEvents(job) {
  const evt = new EventSource(`/api/jobs/${job.id}/events`)

  evt.addEventListener('update', (e) => {
    const data = JSON.parse(e.data)
    setProgress(data.progress, data.message, data.status)

    if (data.status === 'done') {
      setProgress(100, 'APK berhasil dibuat. Siap download.', 'Done')
      renderDownloads(data.output)
      submitBtn.disabled = false
      submitBtn.querySelector('span').textContent = 'Generate Lagi'
      evt.close()
    }

    if (data.status === 'failed') {
      setProgress(100, data.error || 'Build gagal.', 'Failed')
      submitBtn.disabled = false
      submitBtn.querySelector('span').textContent = 'Coba Lagi'
      evt.close()
    }
  })

  evt.addEventListener('failed', () => evt.close())
  evt.addEventListener('done', () => evt.close())
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  downloadBox.classList.add('hidden')
  downloadBox.innerHTML = ''
  submitBtn.disabled = true
  submitBtn.querySelector('span').textContent = 'Building...'
  setProgress(2, 'Mengirim job ke server...', 'Starting')

  const payload = {
    websiteUrl: document.getElementById('websiteUrl').value.trim(),
    appName: document.getElementById('appName').value.trim(),
    appVersion: document.getElementById('appVersion').value.trim(),
    packageName: document.getElementById('packageName').value.trim(),
    iconText: document.getElementById('iconText').value.trim(),
    buildAab: document.getElementById('buildAab').checked,
    permCamera: document.getElementById('permCamera').checked,
    permStorage: document.getElementById('permStorage').checked
  }

  try {
    const res = await fetch('/api/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const json = await res.json()

    if (!res.ok || !json.status) {
      throw new Error(json.message || 'Gagal membuat job')
    }

    setProgress(json.job.progress, json.job.message, json.job.status)
    startEvents(json.job)
  } catch (err) {
    setProgress(100, err.message, 'Failed')
    submitBtn.disabled = false
    submitBtn.querySelector('span').textContent = 'Coba Lagi'
  }
})
