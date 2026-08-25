const EXPORT_WIDTH = 1920
const EXPORT_HEIGHT = 1080 // 16:9
const WEBP_QUALITY = 0.85

let siteDirHandle = null
let photosDirHandle = null
let store = { categories: [], photos: [] }

let currentImage = null // the loaded <img> element with the source photo
let currentFile = null
let crop = { scale: 1, baseScale: 1, offsetX: 0, offsetY: 0, zoomFactor: 1 }
let dragging = false
let dragStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 }
let editingId = null // set while editing an existing saved entry
let libraryObjectUrls = [] // tracked so we can revoke on re-render

let locationMap = null
let locationMarker = null
let currentLocation = null // { lat, lng } or null

const DEFAULT_MAP_CENTER = [50.77, -0.79] // Selsey/Chichester area — where most shots are taken
const DEFAULT_MAP_ZOOM = 11

const el = (id) => document.getElementById(id)

function showToast(message, isError = false) {
  const toast = el('toast')
  toast.textContent = message
  toast.classList.toggle('error', isError)
  toast.hidden = false
  clearTimeout(showToast._t)
  showToast._t = setTimeout(() => (toast.hidden = true), 3200)
}

// ---------- Connect to site folder ----------

el('connect-btn').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    showToast('Your browser doesn\u2019t support this. Use Chrome or Edge.', true)
    return
  }
  try {
    siteDirHandle = await window.showDirectoryPicker()
    photosDirHandle = await siteDirHandle.getDirectoryHandle('photos', { create: true })
    await loadStore()
    el('connect-screen').hidden = true
    el('main-screen').hidden = false
    const status = el('connection-status')
    status.textContent = `Connected: ${siteDirHandle.name}`
    status.classList.add('connected')
    renderCategoryOptions()
    renderLibrary()
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err)
      showToast('Could not connect to that folder.', true)
    }
  }
})

async function loadStore() {
  try {
    const fileHandle = await siteDirHandle.getFileHandle('photos.json')
    const file = await fileHandle.getFile()
    const text = await file.text()
    store = JSON.parse(text)
    if (!Array.isArray(store.categories)) store.categories = []
    if (!Array.isArray(store.photos)) store.photos = []
  } catch {
    store = { categories: [], photos: [] }
  }
}

async function saveStore() {
  const fileHandle = await siteDirHandle.getFileHandle('photos.json', { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(store, null, 2))
  await writable.close()
}

// ---------- Category dropdown ----------

function renderCategoryOptions() {
  const select = el('field-category')
  select.innerHTML =
    store.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('') +
    `<option value="__new__">+ Add new gallery&hellip;</option>`
}

el('field-category').addEventListener('change', (e) => {
  el('new-category-row').hidden = e.target.value !== '__new__'
})

el('add-category-btn').addEventListener('click', () => {
  const label = el('new-category-label').value.trim()
  if (!label) return
  const id = slugify(label)
  if (store.categories.some((c) => c.id === id)) {
    showToast('That gallery already exists.', true)
    return
  }
  store.categories.push({ id, label })
  renderCategoryOptions()
  el('field-category').value = id
  el('new-category-row').hidden = true
  el('new-category-label').value = ''
  showToast(`Added gallery "${label}" — will be saved with your next photo.`)
})

// ---------- Location map ----------

function initLocationMap() {
  if (locationMap) return
  locationMap = L.map('location-map', { zoomControl: true }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(locationMap)

  locationMap.on('click', (e) => {
    setLocation(e.latlng.lat, e.latlng.lng)
  })
}

function setLocation(lat, lng) {
  currentLocation = { lat, lng }
  if (locationMarker) {
    locationMarker.setLatLng([lat, lng])
  } else {
    locationMarker = L.marker([lat, lng]).addTo(locationMap)
  }
  updateLocationDisplay()
}

function clearLocation() {
  currentLocation = null
  if (locationMarker) {
    locationMap.removeLayer(locationMarker)
    locationMarker = null
  }
  updateLocationDisplay()
}

function updateLocationDisplay() {
  const valueEl = el('location-value')
  const clearBtn = el('clear-location-btn')
  if (currentLocation) {
    valueEl.textContent = `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`
    clearBtn.hidden = false
  } else {
    valueEl.textContent = 'Not tagged'
    clearBtn.hidden = true
  }
}

el('clear-location-btn').addEventListener('click', clearLocation)

// Leaflet needs a visible container with real dimensions to size itself correctly.
// The map div is inside the form, which starts hidden, so (re-)init/resize whenever
// the form becomes visible. Pass a callback to run anything (like setView) after
// the size recalculation so it isn't overridden by a mis-sized initial render.
function refreshLocationMap(afterResize) {
  initLocationMap()
  setTimeout(() => {
    locationMap.invalidateSize()
    if (afterResize) afterResize()
  }, 0)
}

// ---------- File selection + EXIF ----------

el('file-drop').addEventListener('click', () => el('file-input').click())
el('file-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0]
  if (file) handleFile(file)
})

async function handleFile(file) {
  currentFile = file
  el('file-drop-label').textContent = file.name

  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    currentImage = img
    setupCropViewport(img)
    URL.revokeObjectURL(url)
  }
  img.src = url

  // EXIF
  try {
    const tags = await exifr.parse(file, ['FNumber', 'ExposureTime', 'ISO', 'FocalLength'])
    el('exif-aperture').value = tags?.FNumber ? tags.FNumber.toString() : ''
    el('exif-shutter').value = tags?.ExposureTime ? formatShutter(tags.ExposureTime) : ''
    el('exif-iso').value = tags?.ISO ? tags.ISO.toString() : ''
    el('exif-focal').value = tags?.FocalLength ? Math.round(tags.FocalLength).toString() : ''
  } catch {
    // No EXIF found — leave fields blank for manual entry
  }

  el('photo-form').hidden = false
  clearLocation()
  refreshLocationMap()
}


function formatShutter(seconds) {
  if (seconds >= 1) return `${seconds}s`
  const denom = Math.round(1 / seconds)
  return `1/${denom}s`
}

// ---------- Pan/zoom crop ----------

function setupCropViewport(img) {
  const viewport = el('crop-viewport')
  const cropImg = el('crop-img')
  viewport.hidden = false
  el('crop-controls').hidden = false

  cropImg.src = img.src
  const rect = viewport.getBoundingClientRect()
  crop.baseScale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
  crop.zoomFactor = 1
  crop.scale = crop.baseScale
  crop.offsetX = (rect.width - img.naturalWidth * crop.scale) / 2
  crop.offsetY = (rect.height - img.naturalHeight * crop.scale) / 2
  applyCropTransform()

  el('zoom-slider').value = '1'
}

function applyCropTransform() {
  const cropImg = el('crop-img')
  cropImg.style.width = `${currentImage.naturalWidth * crop.scale}px`
  cropImg.style.height = `${currentImage.naturalHeight * crop.scale}px`
  cropImg.style.transform = `translate(${crop.offsetX}px, ${crop.offsetY}px)`
}

function clampOffsets() {
  const viewport = el('crop-viewport')
  const rect = viewport.getBoundingClientRect()
  const dispW = currentImage.naturalWidth * crop.scale
  const dispH = currentImage.naturalHeight * crop.scale
  crop.offsetX = Math.min(0, Math.max(rect.width - dispW, crop.offsetX))
  crop.offsetY = Math.min(0, Math.max(rect.height - dispH, crop.offsetY))
}

el('zoom-slider').addEventListener('input', (e) => {
  if (!currentImage) return
  crop.zoomFactor = Number(e.target.value)
  const oldScale = crop.scale
  crop.scale = crop.baseScale * crop.zoomFactor
  // keep viewport center fixed while zooming
  const viewport = el('crop-viewport')
  const rect = viewport.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  crop.offsetX = cx - ((cx - crop.offsetX) / oldScale) * crop.scale
  crop.offsetY = cy - ((cy - crop.offsetY) / oldScale) * crop.scale
  clampOffsets()
  applyCropTransform()
})

el('crop-viewport').addEventListener('pointerdown', (e) => {
  if (!currentImage) return
  dragging = true
  el('crop-viewport').classList.add('dragging')
  dragStart = { x: e.clientX, y: e.clientY, offsetX: crop.offsetX, offsetY: crop.offsetY }
  el('crop-viewport').setPointerCapture(e.pointerId)
})

el('crop-viewport').addEventListener('pointermove', (e) => {
  if (!dragging) return
  crop.offsetX = dragStart.offsetX + (e.clientX - dragStart.x)
  crop.offsetY = dragStart.offsetY + (e.clientY - dragStart.y)
  clampOffsets()
  applyCropTransform()
})
;['pointerup', 'pointercancel'].forEach((evt) =>
  el('crop-viewport').addEventListener(evt, () => {
    dragging = false
    el('crop-viewport').classList.remove('dragging')
  })
)

function exportCroppedImage() {
  const viewport = el('crop-viewport')
  const rect = viewport.getBoundingClientRect()
  const srcX = -crop.offsetX / crop.scale
  const srcY = -crop.offsetY / crop.scale
  const srcW = rect.width / crop.scale
  const srcH = rect.height / crop.scale

  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_WIDTH
  canvas.height = EXPORT_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.drawImage(currentImage, srcX, srcY, srcW, srcH, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY))
}

// ---------- Save ----------

el('photo-form').addEventListener('submit', async (e) => {
  e.preventDefault()

  let categoryId = el('field-category').value
  if (categoryId === '__new__') {
    showToast('Add the new gallery name first.', true)
    return
  }
  if (!categoryId) {
    showToast('Pick a gallery.', true)
    return
  }

  const title = el('field-title').value.trim()
  if (!title) {
    showToast('Give the photo a title.', true)
    return
  }

  const editingEntry = editingId ? store.photos.find((p) => p.id === editingId) : null

  if (!editingEntry && (!currentImage || !currentFile)) {
    showToast('Choose a photo first.', true)
    return
  }

  try {
    const featured = el('field-featured').checked
    const exif = {
      aperture: el('exif-aperture').value.trim(),
      shutter: el('exif-shutter').value.trim(),
      iso: el('exif-iso').value.trim(),
      focalLength: el('exif-focal').value.trim(),
    }
    const description = el('field-description').value.trim()

    if (editingEntry) {
      // Replace the image file only if a new one was chosen; otherwise keep it as-is.
      if (currentImage && currentFile) {
        const blob = await exportCroppedImage()
        const fileHandle = await photosDirHandle.getFileHandle(editingEntry.filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
      }

      if (featured) store.photos.forEach((p) => (p.featured = false))

      editingEntry.category = categoryId
      editingEntry.title = title
      editingEntry.description = description
      editingEntry.featured = featured
      editingEntry.exif = exif
      if (currentLocation) {
        editingEntry.location = currentLocation
      } else {
        delete editingEntry.location
      }

      await saveStore()
      showToast(`Updated "${title}".`)
    } else {
      const blob = await exportCroppedImage()
      const filename = uniqueFilename(title)

      const fileHandle = await photosDirHandle.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()

      if (featured) store.photos.forEach((p) => (p.featured = false))

      const order = store.photos.filter((p) => p.category === categoryId).length

      const newPhoto = {
        id: filename.replace(/\.webp$/, ''),
        category: categoryId,
        filename,
        title,
        description,
        order,
        featured,
        exif,
      }
      if (currentLocation) newPhoto.location = currentLocation

      store.photos.push(newPhoto)

      await saveStore()
      showToast(`Saved "${title}" to ${categoryId}.`)
    }

    renderLibrary()
    resetForm()
  } catch (err) {
    console.error(err)
    showToast('Could not save that photo — see console for details.', true)
  }
})

function resetForm() {
  currentImage = null
  currentFile = null
  editingId = null
  el('file-input').value = ''
  el('file-drop-label').textContent = 'Choose a photo to add'
  el('crop-viewport').hidden = true
  el('crop-controls').hidden = true
  el('photo-form').hidden = true
  el('photo-form').reset()
  el('new-category-row').hidden = true
  el('cancel-edit-btn').hidden = true
  el('save-btn').textContent = 'Save to gallery'
  clearLocation()
}

function startEdit(entry) {
  editingId = entry.id
  currentImage = null
  currentFile = null

  el('field-title').value = entry.title || ''
  el('field-description').value = entry.description || ''
  el('field-category').value = entry.category
  el('field-featured').checked = !!entry.featured
  el('exif-aperture').value = entry.exif?.aperture || ''
  el('exif-shutter').value = entry.exif?.shutter || ''
  el('exif-iso').value = entry.exif?.iso || ''
  el('exif-focal').value = entry.exif?.focalLength || ''

  el('file-drop-label').textContent = `Editing "${entry.title}" — choose a photo here only to replace the image`
  el('crop-viewport').hidden = true
  el('crop-controls').hidden = true
  el('photo-form').hidden = false
  el('new-category-row').hidden = true
  el('cancel-edit-btn').hidden = false
  el('save-btn').textContent = 'Save changes'

  clearLocation()
  refreshLocationMap(() => {
    if (entry.location) {
      setLocation(entry.location.lat, entry.location.lng)
      locationMap.setView([entry.location.lat, entry.location.lng], 13)
    }
  })

  el('photo-form').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

el('cancel-edit-btn').addEventListener('click', resetForm)

async function deletePhoto(id) {
  const entry = store.photos.find((p) => p.id === id)
  if (!entry) return
  const ok = window.confirm(`Delete "${entry.title}"? This removes the image file too.`)
  if (!ok) return

  try {
    await photosDirHandle.removeEntry(entry.filename)
  } catch (err) {
    console.warn('Could not remove image file (it may already be gone):', err)
  }

  store.photos = store.photos.filter((p) => p.id !== id)
  await saveStore()
  showToast(`Deleted "${entry.title}".`)

  if (editingId === id) resetForm()
  renderLibrary()
}

// ---------- Library list ----------

function renderLibrary() {
  el('photo-count').textContent = store.photos.length
  const list = el('photo-list')

  // Revoke previous object URLs before replacing the list
  libraryObjectUrls.forEach((url) => URL.revokeObjectURL(url))
  libraryObjectUrls = []

  list.innerHTML = store.photos
    .map(
      (p) => `
      <li data-id="${p.id}">
        <img data-filename="${escapeHtml(p.filename)}" alt="">
        <div class="item-info">
          <div class="item-title">${escapeHtml(p.title)}</div>
          <div class="item-category">${escapeHtml(p.category)}${p.featured ? ' \u2605' : ''}</div>
          <div class="item-actions">
            <button type="button" class="link-btn edit-btn">Edit</button>
            <button type="button" class="link-btn delete-btn">Delete</button>
          </div>
        </div>
      </li>`
    )
    .join('')

  // Load each thumbnail from the connected folder (not a web URL — the builder
  // page has no server-visible "photos" path of its own).
  list.querySelectorAll('img[data-filename]').forEach(async (img) => {
    try {
      const fileHandle = await photosDirHandle.getFileHandle(img.dataset.filename)
      const file = await fileHandle.getFile()
      const url = URL.createObjectURL(file)
      libraryObjectUrls.push(url)
      img.src = url
    } catch (err) {
      console.warn(`Could not load thumbnail for ${img.dataset.filename}:`, err)
    }
  })

  list.querySelectorAll('li').forEach((li) => {
    const id = li.dataset.id
    li.querySelector('.edit-btn').addEventListener('click', () => {
      const entry = store.photos.find((p) => p.id === id)
      if (entry) startEdit(entry)
    })
    li.querySelector('.delete-btn').addEventListener('click', () => deletePhoto(id))
  })
}

// ---------- Helpers ----------

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function uniqueFilename(title) {
  const base = slugify(title) || 'photo'
  const existing = new Set(store.photos.map((p) => p.filename))
  let filename = `${base}.webp`
  let n = 2
  while (existing.has(filename)) {
    filename = `${base}-${n}.webp`
    n += 1
  }
  return filename
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
