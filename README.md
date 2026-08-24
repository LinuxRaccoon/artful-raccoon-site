# The Artful Raccoon Photography — Site + Builder

Two parts, kept deliberately separate:

- **`site/`** — the public gallery website. Static HTML/CSS/JS, no build step,
  no backend. This is what you deploy to Netlify/Cloudflare Pages.
- **`builder/`** — a local-only tool you run on your own machine to add
  photos. It writes directly into `site/photos/` and `site/photos.json` on
  disk. It is never deployed anywhere.

## Adding photos (the builder)

The builder uses the File System Access API to write straight to your disk,
which only works in Chromium-based browsers (Chrome, Edge — not Firefox or
Safari), and only when served over `http://localhost`, not opened directly
as a `file://` page.

**Run it:**
```bash
cd builder
python3 -m http.server 8000
```
Then open `http://localhost:8000` in Chrome.

(Any local static server works — `npx serve`, `php -S localhost:8000`, etc.
Python's built-in one is just the least to install.)

**Using it:**
1. Click **Connect site folder** and select the `site/` folder (the one
   containing `photos.json` and `photos/`).
2. Choose a photo. EXIF (aperture, shutter speed, ISO, focal length) is read
   automatically from the file — edit any field if it's missing or wrong.
3. Drag inside the preview to reposition, use the zoom slider to adjust —
   this sets the 16:9 crop.
4. Fill in title, description, and pick (or add) a gallery.
5. Optionally tick **Use as homepage hero image** — only one photo can be
   the hero; ticking this on a new one replaces the previous hero.
6. **Save to gallery** — writes a compressed `.webp` into `site/photos/` and
   updates `site/photos.json`. No upload step; it's already in place.

Adding a new gallery category (via the "+ Add new gallery" option in the
dropdown) makes it available immediately for that save, and it'll appear as
a new tab on the site the next time it's deployed.

## Deploying the site

`site/` is a plain static site — no build command needed. Point Netlify or
Cloudflare Pages at the `site/` folder directly (publish directory = `site`,
no build command), or drag-and-drop the `site/` folder if using manual
deploy.

Whenever you add photos locally with the builder, redeploy (push to git, or
re-drag the folder) to publish them.

## Replacing the sample photos

`site/photos.json` ships with three placeholder entries so you can see the
layout immediately. Remove those entries (and the matching files in
`site/photos/`) once you've added your own — or just keep adding real ones
and delete the samples via a quick edit to `photos.json`.

## Project structure

```
site/
  index.html          the public gallery page
  photos.json          all photo + category data
  photos/               processed .webp images
  assets/
    style.css
    main.js

builder/
  index.html            the local builder tool
  builder.css
  builder.js
  vendor/exifr.js        bundled EXIF-reading library (works offline)
```
