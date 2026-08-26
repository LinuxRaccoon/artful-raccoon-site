const state = {
  data: { categories: [], photos: [] },
  activeCategory: null,
}

const lightboxState = {
  photos: [],
  index: 0,
}

const zoom = {
  scale: 1,
  x: 0,
  y: 0,
  minScale: 1,
  maxScale: 4,
}

let panPointers = new Map() // active pointerId -> {x, y}, for drag-pan and pinch
let panStart = null // { x, y, zoomX, zoomY } at drag start
let pinchStartDist = null
let pinchStartScale = null

let lightboxMap = null
let lightboxMarker = null
let currentLightboxLocation = null // { lat, lng } for the map click handler to read

const heroState = {
  photos: [],
  index: 0,
  timer: null,
}
const HERO_ROTATE_MS = 6000

function formatExif(exif) {
  if (!exif) return ''
  const parts = []
  if (exif.aperture) parts.push(`f/${exif.aperture}`)
  if (exif.shutter) parts.push(exif.shutter)
  if (exif.iso) parts.push(`ISO ${exif.iso}`)
  if (exif.focalLength) parts.push(`${exif.focalLength}mm`)
  return parts.join(' · ')
}

function photosForCategory(categoryId) {
  return state.data.photos
    .filter((p) => p.category === categoryId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function renderHero() {
  const hero = document.getElementById('hero')
  const featured = state.data.photos.filter((p) => p.featured)
  heroState.photos = featured.length ? featured : state.data.photos.slice(0, 1)
  heroState.index = 0
  stopHeroAutoRotate()

  if (heroState.photos.length === 0) {
    hero.style.display = 'none'
    hero.innerHTML = ''
    return
  }

  hero.style.display = ''

  const slidesHtml = heroState.photos
    .map(
      (p, i) => `
      <div class="hero-slide${i === 0 ? ' active' : ''}" data-index="${i}">
        <img class="hero-img" src="photos/${p.filename}" alt="${escapeHtml(p.title || '')}">
        <div class="hero-caption">
          <h1>${escapeHtml(p.title || 'Untitled')}</h1>
          <div class="hero-exif">${formatExif(p.exif)}</div>
        </div>
      </div>`
    )
    .join('')

  const controlsHtml =
    heroState.photos.length > 1
      ? `
      <button class="hero-nav hero-prev" aria-label="Previous featured photo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <button class="hero-nav hero-next" aria-label="Next featured photo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
      <div class="hero-dots">
        ${heroState.photos
          .map((_, i) => `<button class="hero-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Go to featured photo ${i + 1}"></button>`)
          .join('')}
      </div>`
      : ''

  hero.innerHTML = `<div class="hero-slides">${slidesHtml}</div>${controlsHtml}`

  if (heroState.photos.length > 1) {
    hero.querySelector('.hero-prev').addEventListener('click', () => advanceHero(-1, true))
    hero.querySelector('.hero-next').addEventListener('click', () => advanceHero(1, true))
    hero.querySelectorAll('.hero-dot').forEach((dot) => {
      dot.addEventListener('click', () => goToHeroSlide(Number(dot.dataset.index)))
    })
    hero.addEventListener('mouseenter', stopHeroAutoRotate)
    hero.addEventListener('mouseleave', startHeroAutoRotate)
    startHeroAutoRotate()
  }
}

function showHeroSlide() {
  const hero = document.getElementById('hero')
  hero.querySelectorAll('.hero-slide').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.index) === heroState.index)
  })
  hero.querySelectorAll('.hero-dot').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.index) === heroState.index)
  })
}

function goToHeroSlide(index) {
  heroState.index = index
  showHeroSlide()
  restartHeroAutoRotate()
}

function advanceHero(direction, isManual) {
  const count = heroState.photos.length
  heroState.index = (heroState.index + direction + count) % count
  showHeroSlide()
  if (isManual) restartHeroAutoRotate()
}

function startHeroAutoRotate() {
  if (heroState.photos.length <= 1) return
  stopHeroAutoRotate()
  heroState.timer = setInterval(() => advanceHero(1, false), HERO_ROTATE_MS)
}

function stopHeroAutoRotate() {
  if (heroState.timer !== null) {
    clearInterval(heroState.timer)
    heroState.timer = null
  }
}

function restartHeroAutoRotate() {
  stopHeroAutoRotate()
  startHeroAutoRotate()
}

function selectCategory(categoryId) {
  state.activeCategory = categoryId
  renderTabs()
  renderTagline()
  renderGrid()
}

function renderTabs() {
  const nav = document.getElementById('gallery-nav')
  nav.innerHTML = state.data.categories
    .map((cat) => {
      const count = photosForCategory(cat.id).length
      const active = cat.id === state.activeCategory ? ' active' : ''
      return `<button class="gallery-tab${active}" data-category="${cat.id}">${escapeHtml(cat.label)}<span class="count">${count}</span></button>`
    })
    .join('')

  nav.querySelectorAll('.gallery-tab').forEach((btn) => {
    btn.addEventListener('click', () => selectCategory(btn.dataset.category))
  })
}

function renderTagline() {
  const tagline = document.getElementById('site-tagline')
  tagline.innerHTML = state.data.categories
    .map((cat, i) => {
      const active = cat.id === state.activeCategory ? ' active' : ''
      const sep = i > 0 ? '<span class="sep">&middot;</span>' : ''
      return `${sep}<a href="#gallery-nav" class="${active}" data-category="${cat.id}">${escapeHtml(cat.label)}</a>`
    })
    .join('')

  tagline.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      selectCategory(link.dataset.category)
      document.getElementById('gallery-nav').scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

function renderGrid() {
  const section = document.getElementById('gallery-section')
  const photos = photosForCategory(state.activeCategory)

  section.className = `gallery-section ${state.activeCategory || ''}`

  if (photos.length === 0) {
    section.innerHTML = `<div class="empty-state">No photos in this gallery yet.</div>`
    return
  }

  section.innerHTML = `<div class="gallery-grid">${photos
    .map(
      (p, i) => `
      <figure class="photo-card" data-index="${i}" data-category="${p.category}">
        <div class="thumb-wrap">
          <img src="photos/${p.filename}" alt="${escapeHtml(p.title || '')}" loading="lazy">
        </div>
        <figcaption>
          <p class="caption-title">${escapeHtml(p.title || 'Untitled')}</p>
          <p class="caption-exif">${formatExif(p.exif)}</p>
        </figcaption>
      </figure>`
    )
    .join('')}</div>`

  section.querySelectorAll('.photo-card').forEach((card) => {
    card.addEventListener('click', () => {
      const photos = photosForCategory(state.activeCategory)
      openLightbox(photos[Number(card.dataset.index)])
    })
  })
}

function openLightbox(photo) {
  lightboxState.photos = photosForCategory(state.activeCategory)
  lightboxState.index = lightboxState.photos.findIndex((p) => p.id === photo.id)
  if (lightboxState.index === -1) lightboxState.index = 0

  const lightbox = document.getElementById('lightbox')
  showLightboxPhoto()
  lightbox.hidden = false
  document.body.style.overflow = 'hidden'
}

function showLightboxPhoto() {
  const photo = lightboxState.photos[lightboxState.index]
  if (!photo) return

  resetZoom()

  document.getElementById('lightbox-img').src = `photos/${photo.filename}`
  document.getElementById('lightbox-img').alt = photo.title || ''
  document.getElementById('lightbox-title').textContent = photo.title || 'Untitled'
  document.getElementById('lightbox-desc').textContent = photo.description || ''
  document.getElementById('lightbox-exif').textContent = formatExif(photo.exif)
  showLightboxMap(photo.location)

  document.getElementById('lightbox-prev').disabled = lightboxState.index <= 0
  document.getElementById('lightbox-next').disabled = lightboxState.index >= lightboxState.photos.length - 1
}

// A small, static (non-interactive) map — just a "roughly here" pin. Zoom/drag
// are disabled so it doesn't compete with the lightbox's own pinch-zoom and
// drag-to-pan gestures on the main photo.
function showLightboxMap(location) {
  const mapEl = document.getElementById('lightbox-map')

  if (!location) {
    mapEl.hidden = true
    currentLightboxLocation = null
    return
  }

  mapEl.hidden = false
  currentLightboxLocation = location

  if (!lightboxMap) {
    lightboxMap = L.map('lightbox-map', {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(lightboxMap)

    lightboxMap.on('click', () => {
      if (!currentLightboxLocation) return
      const { lat, lng } = currentLightboxLocation
      window.open(`https://www.google.com/maps?q=${lat},${lng}&t=k`, '_blank', 'noopener')
    })
  }

  lightboxMap.setView([location.lat, location.lng], 11)
  if (lightboxMarker) {
    lightboxMarker.setLatLng([location.lat, location.lng])
  } else {
    lightboxMarker = L.marker([location.lat, location.lng]).addTo(lightboxMap)
  }

  // The map box may have just gone from hidden to visible, so Leaflet needs
  // to recalculate its container size before the view above will render right.
  setTimeout(() => lightboxMap && lightboxMap.invalidateSize(), 0)
}

function showPrevPhoto() {
  if (lightboxState.index > 0) {
    lightboxState.index -= 1
    showLightboxPhoto()
  }
}

function showNextPhoto() {
  if (lightboxState.index < lightboxState.photos.length - 1) {
    lightboxState.index += 1
    showLightboxPhoto()
  }
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox')
  lightbox.hidden = true
  document.body.style.overflow = ''
  if (document.fullscreenElement) document.exitFullscreen()
}

function toggleFullscreen() {
  const lightbox = document.getElementById('lightbox')
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else if (lightbox.requestFullscreen) {
    lightbox.requestFullscreen()
  }
}

// ---------- Zoom & pan ----------

function applyZoomTransform() {
  const img = document.getElementById('lightbox-img')
  img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`
  const wrap = document.getElementById('lightbox-img-wrap')
  wrap.classList.toggle('zoomed', zoom.scale > 1.001)
}

function clampPan() {
  const wrap = document.getElementById('lightbox-img-wrap')
  const rect = wrap.getBoundingClientRect()
  const maxX = (rect.width * (zoom.scale - 1)) / 2
  const maxY = (rect.height * (zoom.scale - 1)) / 2
  zoom.x = Math.min(maxX, Math.max(-maxX, zoom.x))
  zoom.y = Math.min(maxY, Math.max(-maxY, zoom.y))
}

function resetZoom() {
  zoom.scale = 1
  zoom.x = 0
  zoom.y = 0
  applyZoomTransform()
}

function zoomAt(clientX, clientY, newScale) {
  const wrap = document.getElementById('lightbox-img-wrap')
  const rect = wrap.getBoundingClientRect()
  const cx = clientX - rect.left - rect.width / 2
  const cy = clientY - rect.top - rect.height / 2

  newScale = Math.min(zoom.maxScale, Math.max(zoom.minScale, newScale))
  const ratio = newScale / zoom.scale

  zoom.x = cx - (cx - zoom.x) * ratio
  zoom.y = cy - (cy - zoom.y) * ratio
  zoom.scale = newScale

  if (zoom.scale <= 1.001) {
    zoom.scale = 1
    zoom.x = 0
    zoom.y = 0
  } else {
    clampPan()
  }
  applyZoomTransform()
}

function setupZoomAndPan() {
  const wrap = document.getElementById('lightbox-img-wrap')

  wrap.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.0025
    zoomAt(e.clientX, e.clientY, zoom.scale * (1 + delta))
  }, { passive: false })

  wrap.addEventListener('dblclick', (e) => {
    if (zoom.scale > 1.001) {
      resetZoom()
    } else {
      zoomAt(e.clientX, e.clientY, 2.2)
    }
  })

  wrap.addEventListener('pointerdown', (e) => {
    wrap.setPointerCapture(e.pointerId)
    panPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (panPointers.size === 2) {
      const pts = [...panPointers.values()]
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      pinchStartScale = zoom.scale
    } else if (panPointers.size === 1 && zoom.scale > 1.001) {
      panStart = { x: e.clientX, y: e.clientY, zoomX: zoom.x, zoomY: zoom.y }
      wrap.classList.add('panning')
    }
  })

  wrap.addEventListener('pointermove', (e) => {
    if (!panPointers.has(e.pointerId)) return
    panPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (panPointers.size === 2 && pinchStartDist) {
      const pts = [...panPointers.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2
      const newScale = pinchStartScale * (dist / pinchStartDist)
      zoomAt(midX, midY, newScale)
    } else if (panStart && zoom.scale > 1.001) {
      zoom.x = panStart.zoomX + (e.clientX - panStart.x)
      zoom.y = panStart.zoomY + (e.clientY - panStart.y)
      clampPan()
      applyZoomTransform()
    }
  })

  function endPointer(e) {
    panPointers.delete(e.pointerId)
    wrap.classList.remove('panning')
    if (panPointers.size < 2) {
      pinchStartDist = null
      pinchStartScale = null
    }
    if (panPointers.size === 0) {
      panStart = null
    }
  }
  wrap.addEventListener('pointerup', endPointer)
  wrap.addEventListener('pointercancel', endPointer)
  wrap.addEventListener('pointerleave', (e) => {
    if (panPointers.size <= 1) endPointer(e)
  })
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

async function init() {
  const res = await fetch('photos.json')
  state.data = await res.json()
  state.activeCategory = state.data.categories[0]?.id || null

  renderHero()
  renderTabs()
  renderTagline()
  renderGrid()

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox)
  document.getElementById('lightbox-fullscreen').addEventListener('click', toggleFullscreen)
  document.getElementById('lightbox-prev').addEventListener('click', showPrevPhoto)
  document.getElementById('lightbox-next').addEventListener('click', showNextPhoto)
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox()
  })
  document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox')
    if (lightbox.hidden) return
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft') showPrevPhoto()
    if (e.key === 'ArrowRight') showNextPhoto()
  })
  setupZoomAndPan()
}

init()
