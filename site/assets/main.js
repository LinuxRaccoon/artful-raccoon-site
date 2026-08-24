const state = {
  data: { categories: [], photos: [] },
  activeCategory: null,
}

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
  const featured =
    state.data.photos.find((p) => p.featured) || state.data.photos[0]

  if (!featured) {
    hero.style.display = 'none'
    return
  }

  hero.style.display = ''
  hero.innerHTML = `
    <img class="hero-img" src="photos/${featured.filename}" alt="${escapeHtml(featured.title || '')}">
    <div class="hero-caption">
      <h1>${escapeHtml(featured.title || 'Untitled')}</h1>
      <div class="hero-exif">${formatExif(featured.exif)}</div>
    </div>
  `
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
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.category
      renderTabs()
      renderGrid()
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
  const lightbox = document.getElementById('lightbox')
  document.getElementById('lightbox-img').src = `photos/${photo.filename}`
  document.getElementById('lightbox-img').alt = photo.title || ''
  document.getElementById('lightbox-title').textContent = photo.title || 'Untitled'
  document.getElementById('lightbox-desc').textContent = photo.description || ''
  document.getElementById('lightbox-exif').textContent = formatExif(photo.exif)
  lightbox.hidden = false
  document.body.style.overflow = 'hidden'
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox')
  lightbox.hidden = true
  document.body.style.overflow = ''
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
  renderGrid()

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox)
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox()
  })
}

init()
