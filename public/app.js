const form = document.getElementById('buildForm')
const submitBtn = document.getElementById('submitBtn')
const statusText = document.getElementById('statusText')
const progressBar = document.getElementById('progressBar')
const progressMessage = document.getElementById('progressMessage')
const downloadBox = document.getElementById('downloadBox')
const previewName = document.getElementById('previewName')
const previewUrl = document.getElementById('previewUrl')
const previewIcon = document.getElementById('previewIcon')
const phoneScreen = document.getElementById('phoneScreen')

const appName = document.getElementById('appName')
const websiteUrl = document.getElementById('websiteUrl')
const iconText = document.getElementById('iconText')
const iconFile = document.getElementById('iconFile')
const splashFile = document.getElementById('splashFile')
const iconPreview = document.getElementById('iconPreview')
const splashPreview = document.getElementById('splashPreview')
const iconBgColor = document.getElementById('iconBgColor')
const splashBgColor = document.getElementById('splashBgColor')

let iconData = null
let splashLogoData = null

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

function fileToDataUrl(file, maxSize = 2.2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null)
    if (file.size > maxSize) return reject(new Error('Ukuran gambar max sekitar 2MB. Kompres dulu biar build stabil.'))
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'))
    reader.readAsDataURL(file)
  })
}

function updatePreview() {
  const name = appName.value.trim() || 'Rxyz App'
  const url = websiteUrl.value.trim() || 'https://example.com'
  const text = iconText.value.trim() || name.slice(0, 2).toUpperCase()
  const color = iconBgColor.value || '#6366F1'
  const splash = splashBgColor.value || '#0A0F1C'

  previewName.textContent = name
  previewUrl.textContent = url
  previewIcon.textContent = iconData ? '' : text.slice(0, 3).toUpperCase()
  previewIcon.style.background = iconData ? `center/cover url(${iconData})` : `linear-gradient(135deg, ${color}, #111827)`
  phoneScreen.style.background = `radial-gradient(circle at 50% 0, ${color}55, transparent 40%), linear-gradient(180deg, ${splash}, #050816)`
}

for (const el of [appName, websiteUrl, iconText, iconBgColor, splashBgColor]) {
  el.addEventListener('input', updatePreview)
}

iconFile.addEventListener('change', async () => {
  try {
    iconData = await fileToDataUrl(iconFile.files[0])
    iconPreview.src = iconData || ''
    iconPreview.style.display = iconData ? 'block' : 'none'
    updatePreview()
  } catch (err) {
    alert(err.message)
    iconFile.value = ''
  }
})

splashFile.addEventListener('change', async () => {
  try {
    splashLogoData = await fileToDataUrl(splashFile.files[0])
    splashPreview.src = splashLogoData || ''
    splashPreview.style.display = splashLogoData ? 'block' : 'none'
  } catch (err) {
    alert(err.message)
    splashFile.value = ''
  }
})

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
    iconBgColor: document.getElementById('iconBgColor').value,
    iconData,
    enableSplash: document.getElementById('enableSplash').checked,
    splashBgColor: document.getElementById('splashBgColor').value,
    splashTextColor: '#FFFFFF',
    splashLogoPosition: 'center',
    splashLogoData,
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

    if (!res.ok || !json.status) throw new Error(json.message || 'Gagal membuat job')

    setProgress(json.job.progress, json.job.message, json.job.status)
    startEvents(json.job)
  } catch (err) {
    setProgress(100, err.message, 'Failed')
    submitBtn.disabled = false
    submitBtn.querySelector('span').textContent = 'Coba Lagi'
  }
})
