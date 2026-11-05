# GPHNR

The free page-turning reader for GPHN graphic novels.
Version: v0.2.0 (see `VERSION`).

## What changed since v0.1.0

- Renamed from "Paid in Ink Reader" to GPHNR, and its files to
  gphnr-*-v0.2.0.
- Reads GPHN books only: the file name must contain "gphn" (for example
  `marshals-witness-issue01-order1042.gphn`), and the file must be a PDF
  inside. Anything else is refused with a message.
- The file picker no longer filters by type, because phones grey out
  files with an extension they do not know.
- v0.1.0 was built and tested in Claude's workspace only; it was never
  published.

## What it is

Open the page, drop in a GPHN book you bought, and read it as a graphic
novel: two-page spreads with a page-turn on wide screens, one page at a
time on phones, double-click or double-tap to zoom, arrow keys, swipe and
full screen. It remembers your page for each book. Every book ends on the
same close page: Fin's mark on black.

The book never leaves the device. It is read in the browser and nothing
is uploaded. After the first visit the reader works offline, and phones
can add it to the home screen.

## Files

| File | What it is |
|---|---|
| index.html | the page |
| gphnr-reader-v0.2.0.js | page-turning engine; knows nothing about PDFs |
| gphnr-app-v0.2.0.js | opens a GPHN book with PDF.js and feeds the engine |
| gphnr-v0.2.0.css | styles |
| close-page-v0.2.0.jpg | the close page appended to every book |
| sw.js, manifest.webmanifest | offline support and home-screen install |
| icons/ | app icons, cut from the close page |
| vendor/pdfjs-6.4.299/ | Mozilla PDF.js 6.4.299 (legacy build), Apache-2.0, unmodified |

`index.html`, `sw.js` and `manifest.webmanifest` keep fixed names because
browsers look for them by name; their version is inside them. The other
files carry the version in their names, which also makes browsers fetch
the new files after an update.

## Hosting

GitHub Pages from `main`, root folder. Static files only; no build step.
A custom domain can be added later in Settings, Pages.

## Releasing a new version

1. Bump `VERSION`, rename the versioned files, and update every reference
   in index.html, sw.js and manifest.webmanifest (the service worker cache
   name carries the version, so old caches are cleared).
2. Prepend a "What changed since" block here.
3. Merge to `main`; Pages publishes it.

## Tested (v0.2.0)

Chromium in Claude's workspace, served over http://localhost:
- Issue One of The Marshal's Witness (36 pages, 52 MB): cover in under a
  second, flips, zoom, close page, page memory, reopen, offline reload
  after the first visit, phone size with touch. No script errors.
- A file without gphn in its name is refused; a non-PDF named .gphn is
  refused.

Not yet tested on Firefox, Safari, or a real phone.

## Third-party notice

PDF.js is Copyright Mozilla Foundation, licensed under the Apache
License 2.0; see vendor/pdfjs-6.4.299/LICENSE. The wasm/ folder carries
the licences of its own components (OpenJPEG, JBIG2, QCMS).
