/**
 * An SVG logo drawn as a PNG in the browser: the render lays pictures over
 * video, and it reads PNGs, not SVGs. The SVG is read as text and drawn from
 * a local copy, so the canvas stays readable whatever server it came from.
 */

/** The size an SVG asks to be drawn at, from its width and height or its view box. */
function intrinsicSize(svg: string): { width: number; height: number } | null {
  const tag = /<svg[^>]*>/i.exec(svg)?.[0] ?? "";
  const width = Number(/\swidth=["']?([\d.]+)(px)?["'\s>]/i.exec(tag)?.[1]);
  const height = Number(/\sheight=["']?([\d.]+)(px)?["'\s>]/i.exec(tag)?.[1]);
  if (width > 0 && height > 0) return { width, height };
  const box = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  return box ? { width: Number(box[1]), height: Number(box[2]) } : null;
}

/** Draws an SVG (at `url`) as a PNG whose longer side is `longSide` pixels. */
export async function rasterizeSvg(
  url: string,
  longSide = 1200,
): Promise<{ blob: Blob; width: number; height: number }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The logo couldn't be read");
  const svg = await response.text();
  const size = intrinsicSize(svg) ?? { width: 1024, height: 1024 };
  const scale = longSide / Math.max(size.width, size.height);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  // Drawn at the size wanted: an SVG without its own size would otherwise draw at 300×150.
  const sized = svg.replace(/<svg([^>]*)>/i, (match, attributes: string) => {
    const kept = attributes.replace(/\s(width|height)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<svg${kept} width="${width}" height="${height}">`;
  });
  const local = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = local;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The logo couldn't be drawn");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The logo couldn't be drawn");
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(local);
  }
}
