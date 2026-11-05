/* GPHNR: opens a PDF on this device and hands it to the
   page-turning engine. Version v0.2.0.
   The PDF is read in the browser only. Nothing is uploaded anywhere. */
import * as pdfjsLib from "./vendor/pdfjs-6.4.299/pdf.min.mjs";

const V = "./vendor/pdfjs-6.4.299/";
pdfjsLib.GlobalWorkerOptions.workerSrc = V + "pdf.worker.min.mjs";

const drop = document.getElementById("drop");
const zone = document.getElementById("dropzone");
const input = document.getElementById("file");
const status = document.getElementById("status");
const btnOpen = document.getElementById("btnOpen");
let current = null;

function say(t) { status.textContent = t || ""; }

/* ---------- page rendering ---------- */
function makeBook(task, pdf, name, aspect, fingerprint, title) {
  const urls = new Map();       // page -> Promise<url> at reading size
  const jobs = [];              // pending render jobs
  let focus = 1, running = false, closed = false;
  const made = [];              // object urls to free on close

  function readHeight() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const h = Math.max(window.innerHeight, window.innerWidth / aspect / 2) * dpr * 1.15;
    return Math.round(Math.min(2200, Math.max(1100, h)));
  }

  async function renderPage(n, height) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: height / base.height });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    page.cleanup();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    canvas.width = canvas.height = 0;
    const url = URL.createObjectURL(blob);
    made.push(url);
    return url;
  }

  function pump() {
    if (running || closed || !jobs.length) return;
    jobs.sort((a, b) => Math.abs(a.n - focus) - Math.abs(b.n - focus));
    const job = jobs.shift();
    running = true;
    renderPage(job.n, job.h).then(job.ok, job.fail).finally(() => { running = false; pump(); });
  }

  function load(n) {
    if (urls.has(n)) return urls.get(n);
    const p = new Promise((ok, fail) => { jobs.push({ n, h: readHeight(), ok, fail }); });
    urls.set(n, p);
    pump();
    return p;
  }

  let zoomed = null;
  function loadZoom(n) {
    if (zoomed && zoomed.n === n) return zoomed.p;
    const p = renderPage(n, 2400);
    zoomed = { n, p };
    return p;
  }

  return {
    id: fingerprint || name,
    title,
    pageCount: pdf.numPages,
    aspect,
    closePage: "close-page-v0.2.0.jpg",
    load, loadZoom,
    focus(n) { focus = n; },
    destroy() { closed = true; made.forEach((u) => URL.revokeObjectURL(u)); task.destroy(); }
  };
}

/* ---------- opening a file ---------- */
async function openFile(file) {
  if (!file) return;
  /* GPHNR reads GPHN books only: the file name must say gphn somewhere,
     and the file itself must be a PDF inside. */
  if (!/gphn/i.test(file.name)) {
    say("GPHNR reads GPHN books. That file's name has no gphn in it."); return;
  }
  say("Opening " + file.name + " ...");
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(data[0], data[1], data[2], data[3], data[4]) !== "%PDF-") {
      say("That file is not a GPHN book."); return;
    }
    const task = pdfjsLib.getDocument({
      data,
      wasmUrl: V + "wasm/",
      iccUrl: V + "iccs/",
      cMapUrl: V + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: V + "standard_fonts/",
      enableXfa: false
    });
    const pdf = await task.promise;
    const first = await pdf.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    let title = file.name.replace(/(\.gphn)?(\.pdf)?$/i, "");
    try {
      const meta = await pdf.getMetadata();
      const t = meta && meta.info && meta.info.Title;
      if (t && String(t).trim()) title = String(t).trim();
    } catch (e) { /* no metadata */ }
    const fp = pdf.fingerprints && pdf.fingerprints[0];
    if (current) current.destroy();
    current = makeBook(task, pdf, file.name, vp.width / vp.height, fp, title);
    drop.classList.add("hidden");
    say("");
    window.GPHNR.open(current);
  } catch (e) {
    console.error(e);
    say(e && e.name === "PasswordException"
      ? "This PDF needs a password, which the reader does not support yet."
      : "Sorry, that PDF could not be opened.");
  }
}

zone.addEventListener("click", () => input.click());
zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
input.addEventListener("change", () => { openFile(input.files[0]); input.value = ""; });
["dragenter", "dragover"].forEach((t) => window.addEventListener(t, (e) => {
  e.preventDefault(); zone.classList.add("over");
}));
["dragleave", "drop"].forEach((t) => window.addEventListener(t, (e) => {
  e.preventDefault(); zone.classList.remove("over");
}));
window.addEventListener("drop", (e) => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) openFile(f);
});
btnOpen.addEventListener("click", () => {
  window.GPHNR.close();
  drop.classList.remove("hidden");
});

/* offline support once served from the web */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(() => { /* offline mode unavailable */ });
}

window.GPHNRApp = { openFile };
