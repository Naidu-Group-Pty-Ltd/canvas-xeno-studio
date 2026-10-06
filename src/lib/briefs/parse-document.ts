/**
 * Reads a marketing brief in the browser: text plus the images it contains.
 *
 * PDF (text, embedded images, page snapshots), Word .docx (text, tables,
 * images with alt text), PowerPoint .pptx (slide text, speaker notes, images)
 * and plain text / Markdown. Parsing runs client-side so large documents never
 * pass through the server runtime; heavy libraries load only when needed.
 */

export type BriefFileKind = "pdf" | "docx" | "pptx" | "text";
export type BriefImageSource = "embedded" | "page";

export interface ExtractedImage {
  key: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  source: BriefImageSource;
  page: number | null;
  caption: string | null;
  /** Suggested pre-selection in the import dialog. */
  recommended: boolean;
}

export interface ParsedBrief {
  kind: BriefFileKind;
  title: string | null;
  text: string;
  pageCount: number | null;
  images: ExtractedImage[];
  warnings: string[];
}

export const BRIEF_ACCEPT = [
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".md",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
].join(",");

export const MAX_BRIEF_BYTES = 80 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
const MAX_IMAGES = 40;
const MIN_SIDE = 140;
const MAX_SIDE = 2048;

export function briefKind(file: File): BriefFileKind | "legacy" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pptx")) return "pptx";
  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    file.type.startsWith("text/")
  )
    return "text";
  if (/\.(doc|ppt|pages|key|rtf|odt)$/.test(name)) return "legacy";
  return null;
}

export function isBriefFile(file: File): boolean {
  const kind = briefKind(file);
  return kind !== null && kind !== "legacy";
}

export async function parseBriefDocument(
  file: File,
  onProgress?: (message: string) => void,
): Promise<ParsedBrief> {
  if (file.size > MAX_BRIEF_BYTES) throw new Error("That document is larger than 80 MB.");
  const kind = briefKind(file);
  if (kind === "legacy")
    throw new Error(
      "This is an older Office or Apple format. Save it as .docx, .pptx or PDF and import that instead.",
    );
  if (!kind) throw new Error("Import a PDF, Word (.docx), PowerPoint (.pptx) or text file.");

  let parsed: ParsedBrief;
  if (kind === "pdf") parsed = await parsePdf(file, onProgress);
  else if (kind === "docx") parsed = await parseDocx(file, onProgress);
  else if (kind === "pptx") parsed = await parsePptx(file, onProgress);
  else
    parsed = {
      kind,
      title: null,
      text: await file.text(),
      pageCount: null,
      images: [],
      warnings: [],
    };

  parsed.text = tidyText(parsed.text);
  if (parsed.text.length > MAX_TEXT_CHARS) {
    parsed.text = parsed.text.slice(0, MAX_TEXT_CHARS);
    parsed.warnings.push("Only the first 200,000 characters of text were kept.");
  }
  if (!parsed.title) parsed.title = firstLine(parsed.text) ?? file.name.replace(/\.[^.]+$/, "");
  return parsed;
}

function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstLine(text: string): string | null {
  const line = text
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => entry.length >= 3);
  return line ? line.slice(0, 120) : null;
}

/* ------------------------------------------------------------------ */
/* Image helpers                                                       */
/* ------------------------------------------------------------------ */

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Downscales very large images and encodes them as PNG (small, keeps transparency) or JPEG. */
async function encodeCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<{ blob: Blob; mimeType: string; width: number; height: number } | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const small = canvas.width * canvas.height <= 1200 * 1200;
  if (!small) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const mimeType = small ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, mimeType, small ? undefined : 0.9);
  return blob ? { blob, mimeType, width: canvas.width, height: canvas.height } : null;
}

function worthKeeping(width: number, height: number): boolean {
  if (width < MIN_SIDE || height < MIN_SIDE) return false;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return ratio <= 6; // thin rules, bars and separators are not useful references
}

const DIRECT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const DECODABLE = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);

/** An image file stored inside a .docx/.pptx, normalised for use as a reference. */
async function mediaFileToImage(
  bytes: Uint8Array,
  extension: string,
): Promise<{ blob: Blob; mimeType: string; width: number; height: number } | null> {
  const ext = extension.toLowerCase();
  if (!DECODABLE.has(ext)) return null;
  const type = DIRECT_TYPES[ext] ?? (ext === "svg" ? "image/svg+xml" : "image/bmp");
  const blob = new Blob([bytes as BlobPart], { type });
  try {
    if (ext === "svg") {
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const width = image.naturalWidth || 1024;
        const height = image.naturalHeight || 1024;
        if (!worthKeeping(width, height)) return null;
        return encodeCanvas(image, width, height);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const bitmap = await createImageBitmap(blob);
    try {
      if (!worthKeeping(bitmap.width, bitmap.height)) return null;
      // Keep original bytes when the provider accepts them and they are not oversized.
      if (
        DIRECT_TYPES[ext] &&
        Math.max(bitmap.width, bitmap.height) <= MAX_SIDE &&
        blob.size <= 12 * 1024 * 1024
      ) {
        return { blob, mimeType: type, width: bitmap.width, height: bitmap.height };
      }
      return encodeCanvas(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

interface PdfImageObject {
  width: number;
  height: number;
  bitmap?: ImageBitmap;
  data?: Uint8ClampedArray | Uint8Array;
  kind?: number;
}

interface PdfObjectStore {
  has(id: string): boolean;
  get(id: string, callback?: (value: unknown) => void): unknown;
}

function pdfObject(store: PdfObjectStore, id: string): Promise<PdfImageObject | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    const done = (value: unknown) => {
      clearTimeout(timer);
      resolve((value as PdfImageObject) ?? null);
    };
    try {
      if (store.has(id)) done(store.get(id));
      else store.get(id, done);
    } catch {
      done(null);
    }
  });
}

/** Converts pdf.js decoded image data (bitmap or raw pixels) to a canvas. */
function pdfImageToCanvas(image: PdfImageObject): HTMLCanvasElement | null {
  const { width, height } = image;
  if (!width || !height || width * height > 40_000_000) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (image.bitmap) {
    ctx.drawImage(image.bitmap, 0, 0);
    return canvas;
  }
  const data = image.data;
  if (!data) return null;
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (image.kind === 3) {
    rgba.set(data.subarray(0, rgba.length));
  } else if (image.kind === 2) {
    for (let pixel = 0, src = 0; pixel < width * height; pixel += 1, src += 3) {
      const dest = pixel * 4;
      rgba[dest] = data[src]!;
      rgba[dest + 1] = data[src + 1]!;
      rgba[dest + 2] = data[src + 2]!;
      rgba[dest + 3] = 255;
    }
  } else if (image.kind === 1) {
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
        const dest = (y * width + x) * 4;
        const value = bit ? 255 : 0;
        rgba[dest] = value;
        rgba[dest + 1] = value;
        rgba[dest + 2] = value;
        rgba[dest + 3] = 255;
      }
    }
  } else {
    return null;
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

/**
 * pdf.js is browser-only: the build-time SSR constant keeps it out of the server
 * bundle entirely. The legacy build carries polyfills for the newest JavaScript
 * built-ins the modern build assumes, so parsing works in browsers a release or
 * two behind as well.
 */
const loadPdfjs = import.meta.env.SSR
  ? () => Promise.reject<never>(new Error("Documents are read in the browser"))
  : () =>
      Promise.all([
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
      ]);

async function parsePdf(file: File, onProgress?: (message: string) => void): Promise<ParsedBrief> {
  onProgress?.("Opening PDF…");
  const [pdfjs, worker] = await loadPdfjs();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document_ = await loadingTask.promise;
  const warnings: string[] = [];
  const pageCount = document_.numPages;
  const textPages = Math.min(pageCount, 80);
  const imagePages = Math.min(pageCount, 40);
  const snapshotPages = Math.min(pageCount, 12);
  if (pageCount > textPages)
    warnings.push(`Only the first ${textPages} of ${pageCount} pages were read.`);

  let text = "";
  const embedded: ExtractedImage[] = [];
  const snapshots: ExtractedImage[] = [];
  const seen = new Set<string>();
  const pageTextLength = new Map<number, number>();
  let title: string | null = null;

  try {
    const metadata = await document_.getMetadata();
    const info = (metadata?.info ?? {}) as Record<string, unknown>;
    if (typeof info["Title"] === "string" && info["Title"].trim().length > 2)
      title = info["Title"].trim();
  } catch {
    // Metadata is optional.
  }

  for (let number = 1; number <= textPages; number += 1) {
    onProgress?.(`Reading page ${number} of ${textPages}…`);
    const page = await document_.getPage(number);
    const content = await page.getTextContent();
    let pageText = "";
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== "string") continue;
      pageText += item.str + (item.hasEOL ? "\n" : "");
    }
    pageTextLength.set(number, pageText.trim().length);
    text += `${number > 1 ? "\n\n" : ""}--- Page ${number} ---\n${pageText}`;

    if (number <= imagePages && embedded.length < MAX_IMAGES) {
      const operators = await page.getOperatorList();
      for (
        let index = 0;
        index < operators.fnArray.length && embedded.length < MAX_IMAGES;
        index += 1
      ) {
        const fn = operators.fnArray[index];
        const args = operators.argsArray[index] as unknown[];
        let image: PdfImageObject | null = null;
        let key = "";
        if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat) {
          const id = String(args?.[0] ?? "");
          if (!id) continue;
          key = id.startsWith("g_") ? id : `${number}:${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          image = await pdfObject(
            (id.startsWith("g_") ? page.commonObjs : page.objs) as unknown as PdfObjectStore,
            id,
          );
        } else if (fn === pdfjs.OPS.paintInlineImageXObject) {
          image = (args?.[0] as PdfImageObject) ?? null;
          key = `${number}:inline:${index}`;
        }
        if (!image || !worthKeeping(image.width, image.height)) continue;
        const canvas = pdfImageToCanvas(image);
        if (!canvas) continue;
        const encoded = await encodeCanvas(canvas, canvas.width, canvas.height);
        if (!encoded) continue;
        embedded.push({
          key,
          ...encoded,
          source: "embedded",
          page: number,
          caption: null,
          recommended: true,
        });
      }
    }

    if (number <= snapshotPages) {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, 1280 / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      try {
        await page.render({ canvas, viewport }).promise;
        const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
        if (blob)
          snapshots.push({
            key: `page:${number}`,
            blob,
            mimeType: "image/jpeg",
            width: canvas.width,
            height: canvas.height,
            source: "page",
            page: number,
            caption: `Page ${number}`,
            recommended: false,
          });
      } catch {
        // A page that cannot render simply has no snapshot.
      }
    }
    page.cleanup();
  }
  await loadingTask.destroy();

  // Snapshots matter most for visual pages (mood boards, layouts) and image-less PDFs.
  let picked = 0;
  for (const snapshot of snapshots) {
    const visual = (pageTextLength.get(snapshot.page ?? 0) ?? 0) < 300;
    if ((embedded.length === 0 || visual) && picked < 6) {
      snapshot.recommended = true;
      picked += 1;
    }
  }
  if (embedded.length >= MAX_IMAGES)
    warnings.push(`Only the first ${MAX_IMAGES} images were extracted.`);

  return { kind: "pdf", title, text, pageCount, images: [...embedded, ...snapshots], warnings };
}

/* ------------------------------------------------------------------ */
/* Office Open XML (.docx / .pptx)                                     */
/* ------------------------------------------------------------------ */

const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  dc: "http://purl.org/dc/elements/1.1/",
};

const loadFflate = import.meta.env.SSR
  ? () => Promise.reject<never>(new Error("Documents are read in the browser"))
  : () => import("fflate");

async function unzipFile(file: File): Promise<Record<string, Uint8Array>> {
  const { unzip } = await loadFflate();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) =>
    unzip(bytes, (error, data) =>
      error ? reject(new Error("The document could not be opened.")) : resolve(data),
    ),
  );
}

async function xml(files: Record<string, Uint8Array>, path: string): Promise<Document | null> {
  const entry = files[path];
  if (!entry) return null;
  const { strFromU8 } = await loadFflate();
  const doc = new DOMParser().parseFromString(strFromU8(entry), "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
}

/** Relationship id → resolved archive path, for one part's .rels file. */
async function relationships(
  files: Record<string, Uint8Array>,
  partPath: string,
): Promise<Map<string, { target: string; type: string }>> {
  const slash = partPath.lastIndexOf("/");
  const dir = partPath.slice(0, slash);
  const relsPath = `${dir}/_rels/${partPath.slice(slash + 1)}.rels`;
  const doc = await xml(files, relsPath);
  const map = new Map<string, { target: string; type: string }>();
  if (!doc) return map;
  for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (!id || !target || rel.getAttribute("TargetMode") === "External") continue;
    map.set(id, { target: resolvePath(dir, target), type: rel.getAttribute("Type") ?? "" });
  }
  return map;
}

function resolvePath(dir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = dir.split("/").filter(Boolean);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment && segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

async function documentTitle(files: Record<string, Uint8Array>): Promise<string | null> {
  const core = await xml(files, "docProps/core.xml");
  const title = core?.getElementsByTagNameNS(NS.dc, "title")[0]?.textContent?.trim();
  return title && title.length > 2 ? title : null;
}

interface ImageRef {
  path: string;
  caption: string | null;
  page: number | null;
}

/** Alt text that is just a file name ("image1.png") says nothing about the picture. */
function usefulCaption(value: string | null | undefined): string | null {
  const caption = value?.trim();
  if (!caption || /^[\w\s.-]+\.(png|jpe?g|gif|webp|bmp|tiff?|emf|wmf|svg)$/i.test(caption))
    return null;
  return caption.slice(0, 200);
}

async function collectImages(
  files: Record<string, Uint8Array>,
  refs: ImageRef[],
  warnings: string[],
  onProgress?: (message: string) => void,
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const ref of refs) {
    if (images.length >= MAX_IMAGES) break;
    if (seen.has(ref.path)) continue;
    seen.add(ref.path);
    const bytes = files[ref.path];
    if (!bytes) continue;
    onProgress?.(`Extracting image ${images.length + 1}…`);
    const extension = ref.path.split(".").pop() ?? "";
    const normalized = await mediaFileToImage(bytes, extension);
    if (!normalized) {
      if (!DECODABLE.has(extension.toLowerCase())) skipped += 1;
      continue;
    }
    images.push({
      key: ref.path,
      ...normalized,
      source: "embedded",
      page: ref.page,
      caption: ref.caption,
      recommended: true,
    });
  }
  if (skipped)
    warnings.push(
      `${skipped} image${skipped === 1 ? " was" : "s were"} in a format browsers cannot read (such as EMF or TIFF) and was skipped.`,
    );
  return images;
}

function nearest(element: Element, localNames: string[]): Element | null {
  let current: Element | null = element.parentElement;
  while (current) {
    if (localNames.includes(current.localName)) return current;
    current = current.parentElement;
  }
  return null;
}

/* ---------------- Word ---------------- */

async function parseDocx(file: File, onProgress?: (message: string) => void): Promise<ParsedBrief> {
  onProgress?.("Opening Word document…");
  const files = await unzipFile(file);
  const doc = await xml(files, "word/document.xml");
  if (!doc) throw new Error("This Word document could not be read.");
  const rels = await relationships(files, "word/document.xml");
  const warnings: string[] = [];
  const imageRefs: ImageRef[] = [];
  const lines: string[] = [];
  let headingTitle: string | null = null;

  const paragraphText = (paragraph: Element): string => {
    let out = "";
    const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_ELEMENT);
    for (
      let node = walker.nextNode() as Element | null;
      node;
      node = walker.nextNode() as Element | null
    ) {
      if (node.namespaceURI === NS.w && node.localName === "t") out += node.textContent ?? "";
      else if (node.namespaceURI === NS.w && node.localName === "tab") out += "\t";
      else if (node.namespaceURI === NS.w && (node.localName === "br" || node.localName === "cr"))
        out += "\n";
      else if (node.namespaceURI === NS.a && node.localName === "blip") {
        const target = rels.get(node.getAttributeNS(NS.r, "embed") ?? "")?.target;
        if (target) {
          const container = nearest(node, ["inline", "anchor"]);
          const docPr = container?.getElementsByTagNameNS(NS.wp, "docPr")[0];
          const caption = docPr?.getAttribute("descr") || docPr?.getAttribute("title") || null;
          imageRefs.push({ path: target, caption: usefulCaption(caption), page: null });
        }
      }
    }
    return out;
  };

  const visit = (element: Element) => {
    for (const child of Array.from(element.children)) {
      if (child.namespaceURI !== NS.w) continue;
      if (child.localName === "p") {
        const value = paragraphText(child).trim();
        if (!value) continue;
        const style =
          child.getElementsByTagNameNS(NS.w, "pStyle")[0]?.getAttributeNS(NS.w, "val") ??
          child.getElementsByTagNameNS(NS.w, "pStyle")[0]?.getAttribute("w:val") ??
          "";
        const level = /heading\s*(\d)/i.exec(style)?.[1];
        if (/^title$/i.test(style) || level) {
          lines.push(`${"#".repeat(Math.min(3, Number(level ?? 1)))} ${value}`);
          if (!headingTitle) headingTitle = value;
        } else if (child.getElementsByTagNameNS(NS.w, "numPr").length || /list/i.test(style)) {
          lines.push(`• ${value}`);
        } else {
          lines.push(value);
        }
      } else if (child.localName === "tbl") {
        for (const row of Array.from(child.getElementsByTagNameNS(NS.w, "tr"))) {
          const cells = Array.from(row.getElementsByTagNameNS(NS.w, "tc")).map((cell) =>
            Array.from(cell.getElementsByTagNameNS(NS.w, "p"))
              .map((paragraph) => paragraphText(paragraph).trim())
              .filter(Boolean)
              .join(" "),
          );
          if (cells.some(Boolean)) lines.push(cells.join(" | "));
        }
        lines.push("");
      } else if (child.localName === "sdt") {
        const content = child.getElementsByTagNameNS(NS.w, "sdtContent")[0];
        if (content) visit(content);
      }
    }
  };

  onProgress?.("Reading text…");
  const body = doc.getElementsByTagNameNS(NS.w, "body")[0];
  if (body) visit(body);

  // Images that are in the package but not placed inline (rare) still count.
  for (const path of Object.keys(files)) {
    if (path.startsWith("word/media/") && !imageRefs.some((ref) => ref.path === path))
      imageRefs.push({ path, caption: null, page: null });
  }

  const images = await collectImages(files, imageRefs, warnings, onProgress);
  return {
    kind: "docx",
    title: (await documentTitle(files)) ?? headingTitle,
    text: lines.join("\n"),
    pageCount: null,
    images,
    warnings,
  };
}

/* ---------------- PowerPoint ---------------- */

async function parsePptx(file: File, onProgress?: (message: string) => void): Promise<ParsedBrief> {
  onProgress?.("Opening presentation…");
  const files = await unzipFile(file);
  const slidePaths = Object.keys(files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (!slidePaths.length) throw new Error("This presentation has no readable slides.");

  const warnings: string[] = [];
  const imageRefs: ImageRef[] = [];
  const sections: string[] = [];
  let firstTitle: string | null = null;

  for (const [index, path] of slidePaths.entries()) {
    const number = index + 1;
    onProgress?.(`Reading slide ${number} of ${slidePaths.length}…`);
    const slide = await xml(files, path);
    if (!slide) continue;
    const rels = await relationships(files, path);

    const paragraphs = Array.from(slide.getElementsByTagNameNS(NS.a, "p"))
      .map((paragraph) =>
        Array.from(paragraph.getElementsByTagNameNS(NS.a, "t"))
          .map((node) => node.textContent ?? "")
          .join("")
          .trim(),
      )
      .filter(Boolean);
    if (!firstTitle && paragraphs[0]) firstTitle = paragraphs[0];

    let notes = "";
    for (const rel of rels.values()) {
      if (!rel.type.endsWith("/notesSlide")) continue;
      const notesDoc = await xml(files, rel.target);
      notes = Array.from(notesDoc?.getElementsByTagNameNS(NS.a, "p") ?? [])
        .map((paragraph) =>
          Array.from(paragraph.getElementsByTagNameNS(NS.a, "t"))
            .map((node) => node.textContent ?? "")
            .join("")
            .trim(),
        )
        .filter((line) => line && !/^\d+$/.test(line))
        .join("\n");
    }

    sections.push(
      [`--- Slide ${number} ---`, ...paragraphs, notes ? `Speaker notes:\n${notes}` : ""]
        .filter(Boolean)
        .join("\n"),
    );

    for (const blip of Array.from(slide.getElementsByTagNameNS(NS.a, "blip"))) {
      const target = rels.get(blip.getAttributeNS(NS.r, "embed") ?? "")?.target;
      if (!target) continue;
      const picture = nearest(blip, ["pic"]);
      const props = picture?.getElementsByTagNameNS(NS.p, "cNvPr")[0];
      const caption = props?.getAttribute("descr") || props?.getAttribute("title") || null;
      imageRefs.push({ path: target, caption: usefulCaption(caption), page: number });
    }
  }

  const images = await collectImages(files, imageRefs, warnings, onProgress);
  return {
    kind: "pptx",
    title: (await documentTitle(files)) ?? firstTitle,
    text: sections.join("\n\n"),
    pageCount: slidePaths.length,
    images,
    warnings,
  };
}
