/**
 * A production's token sheet, drawn in the browser as Reel 1's
 * aurixa-reel-tokens.png was drawn (scripts/aurixa-reel-1/reel_preview.cjs):
 * the colour roles as swatches, the type in its own faces, a window and a
 * card in the brand's corners, shadows, glass and blur, and its motion curves
 * with their durations, each labelled with its value, and the commits read.
 * Not a frame of anything: a check that every role draws as the code
 * declares it. Browser only (a canvas and the page's loaded fonts).
 */
import { parseCssColour } from "@/lib/brand/colour";
import {
  MOTION_NEEDS,
  MOTION_ROLE_KEYS,
  PRODUCTION_ROLES,
  type BrandProduction,
  type ColourRole,
  type ProductionKit,
  type ProductionRoleKey,
  type TypeRole,
} from "@/lib/brand/production";
import { formatDuration } from "@/lib/brand/motion";

const WIDTH = 1600;
const HEIGHT = 1000;

type Context = CanvasRenderingContext2D & { letterSpacing?: string };

function colourOf(production: BrandProduction, key: ProductionRoleKey): ColourRole | null {
  const role = production.roles[key];
  return role?.kind === "colour" ? role : null;
}

function typeOf(production: BrandProduction, key: ProductionRoleKey): TypeRole | null {
  const role = production.roles[key];
  return role?.kind === "type" ? role : null;
}

/** A colour as a canvas takes it, whatever CSS syntax the code wrote it in. */
function rgba(hex: string, alpha = 1): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

const paint = (role: ColourRole | null, fallback: string) =>
  role ? rgba(role.hex, role.alpha) : fallback;

/** A length in pixels: px as is, rem and em as 16px. */
function pixels(value: string, fallback: number): number {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/.exec(value.trim());
  if (!match) return fallback;
  return Number(match[1]) * (match[2] === "rem" || match[2] === "em" ? 16 : 1);
}

/** Tracking in pixels at a type size: em follows the size, rem and px don't. */
function trackingPx(value: string, size: number): number {
  const em = /^(-?(?:\d+\.?\d*|\.\d+))em$/.exec(value.trim());
  return em ? Number(em[1]) * size : pixels(value, 0);
}

interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  colour: string;
}

/** A CSS box-shadow's layers, as a canvas can draw them (an inset one is left out). */
function shadowLayers(value: string): ShadowLayer[] {
  const layers: ShadowLayer[] = [];
  for (const layer of value.split(/,(?![^(]*\))/)) {
    if (/\binset\b/i.test(layer)) continue;
    const colourText =
      /(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(layer)?.[0] ??
      "rgba(0, 0, 0, 0.5)";
    const parsed = parseCssColour(colourText);
    const lengths = layer
      .replace(colourText, " ")
      .trim()
      .split(/\s+/)
      .map((part) => pixels(part, Number.NaN))
      .filter((length) => Number.isFinite(length));
    if (lengths.length < 2) continue;
    layers.push({
      x: lengths[0]!,
      y: lengths[1]!,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      colour: parsed ? rgba(parsed.hex, parsed.alpha) : "rgba(0, 0, 0, 0.5)",
    });
  }
  return layers;
}

function roundedRect(ctx: Context, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  font: string,
  colour: string,
  options: { spacing?: number; max?: number; align?: CanvasTextAlign } = {},
) {
  ctx.font = font;
  ctx.fillStyle = colour;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${options.spacing ?? 0}px`;
  let shown = value;
  if (options.max) {
    while (shown.length > 1 && ctx.measureText(shown).width > options.max)
      shown = `${shown.slice(0, -2)}…`;
  }
  ctx.fillText(shown, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

/** Words wrapped to a width, drawn line by line. */
function paragraph(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  font: string,
  colour: string,
) {
  ctx.font = font;
  let line = "";
  let at = y;
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      text(ctx, line, x, at, font, colour);
      line = word;
      at += lineHeight;
    } else line = next;
  }
  if (line) text(ctx, line, x, at, font, colour);
}

function stackOf(role: TypeRole | null, fallback: string) {
  return role ? role.stack : fallback;
}

function fontOf(role: TypeRole | null, size: number, fallback: string, weight?: number) {
  const style = role?.italic ? "italic " : "";
  return `${style}${role?.weight ?? weight ?? 400} ${size}px ${stackOf(role, fallback)}`;
}

/** Waits for the faces the sheet sets its type in (those the page has loaded, or can). */
async function loadFaces(production: BrandProduction) {
  if (typeof document === "undefined" || !document.fonts) return;
  const loads = PRODUCTION_ROLES.flatMap((spec) => {
    const role = typeOf(production, spec.key);
    return role ? [document.fonts.load(fontOf(role, 24, "sans-serif")).catch(() => [])] : [];
  });
  await Promise.all(loads);
}

/**
 * Draws the token sheet for a kit's production roles and gives it as a PNG.
 * Roles a production hasn't filled are drawn in the studio's own neutrals,
 * and named as missing.
 */
export async function drawTokenSheet(kit: ProductionKit): Promise<Blob> {
  const { production } = kit;
  await loadFaces(production);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d") as Context | null;
  if (!ctx) throw new Error("This browser can't draw the token sheet");

  const ground = paint(colourOf(production, "ground"), "#0b1020");
  const ink = paint(colourOf(production, "ink"), "#ffffff");
  const muted = paint(colourOf(production, "ink-muted"), "rgba(255, 255, 255, 0.65)");
  const signature = paint(
    colourOf(production, "signature") ?? colourOf(production, "accent"),
    "#c89b3c",
  );
  const line = paint(colourOf(production, "line"), "rgba(255, 255, 255, 0.12)");
  const display = typeOf(production, "display");
  const body = typeOf(production, "body");
  const mono = typeOf(production, "mono") ?? typeOf(production, "eyebrow");
  const monoFont = (size: number, weight = 400) =>
    fontOf(mono, size, "ui-monospace, monospace", weight);
  const bodyFont = (size: number) => fontOf(body, size, "Inter, system-ui, sans-serif");

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // The head: the eyebrow on its hairline, the title in the display face, what the sheet is.
  ctx.fillStyle = signature;
  ctx.fillRect(72, 70, 45, 1);
  text(
    ctx,
    `${kit.name} · production roles${production.read.length ? " · read from code" : ""}`.toUpperCase(),
    129,
    75,
    monoFont(13, 700),
    signature,
    { spacing: 3.6, max: 1300 },
  );
  text(
    ctx,
    production.read.length ? "Every value is the code's own" : `${kit.name}'s production roles`,
    72,
    150,
    fontOf(display, 52, "Georgia, serif", 500),
    ink,
    { max: 760 },
  );
  const filled = PRODUCTION_ROLES.filter((spec) => production.roles[spec.key]).length;
  paragraph(
    ctx,
    filled
      ? `${filled} of ${PRODUCTION_ROLES.length} roles, each ${production.read.length ? "with the repository, file and line it is declared on, read by Xeno Studio's code scanner" : "set in Xeno Studio"}. Every colour, typeface, corner, shadow, blur and curve below is one of them.`
      : "No roles yet: import the brand's code on the Brand page to propose them, or set them by hand. Until then the sheet is drawn in the studio's own neutrals.",
    72,
    196,
    640,
    27,
    bodyFont(17),
    muted,
  );

  // The swatches, by role.
  const colours = PRODUCTION_ROLES.filter((spec) => spec.kind === "colour");
  colours.forEach((spec, index) => {
    const x = 72 + (index % 4) * 176;
    const y = 300 + Math.floor(index / 4) * 64;
    const role = colourOf(production, spec.key);
    roundedRect(ctx, x, y, 44, 44, 10);
    if (role) {
      ctx.fillStyle = rgba(role.hex, role.alpha);
      ctx.fill();
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    if (!role) ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, spec.key.toUpperCase(), x + 54, y + 18, monoFont(11, 700), role ? ink : muted, {
      spacing: 1.3,
      max: 116,
    });
    text(ctx, role ? role.value : "not set", x + 54, y + 36, monoFont(11), muted, { max: 116 });
  });

  // The type, each role in its own face.
  const samples: [ProductionRoleKey, string, number][] = [
    ["display", kit.name, 34],
    ["display-italic", "A phrase set apart", 30],
    ["body", "Interface and body text, end to end.", 20],
    ["mono", "REF-014 · 0123456789", 16],
    ["eyebrow", "Eyebrow · label", 14],
  ];
  samples.forEach(([key, sample, size], index) => {
    const y = 548 + index * 64;
    ctx.fillStyle = line;
    ctx.fillRect(72, y - 34, 700, 1);
    text(ctx, key.toUpperCase(), 72, y, monoFont(11, 700), muted, { spacing: 1.3 });
    const role = typeOf(production, key);
    if (!role) {
      text(ctx, "not set", 240, y, monoFont(13), muted);
      return;
    }
    const shown = role.uppercase ? sample.toUpperCase() : sample;
    text(
      ctx,
      shown,
      240,
      y,
      fontOf(role, size, "sans-serif", key === "display" ? 700 : 400),
      key === "eyebrow" ? signature : ink,
      {
        spacing: role.letterSpacing ? trackingPx(role.letterSpacing, size) : 0,
        max: 360,
      },
    );
    text(ctx, role.family, 772, y, monoFont(11), muted, { align: "right", max: 160 });
  });

  // A window in the brand's glass, corners and shadow, a card lifted inside it.
  const stage = { x: 880, y: 120, w: 600, h: 380 };
  const radius = (key: ProductionRoleKey, fallback: number) => {
    const role = production.roles[key];
    return role?.kind === "radius" ? pixels(role.value, fallback) : fallback;
  };
  const shadow = (key: ProductionRoleKey) => {
    const role = production.roles[key];
    return role?.kind === "shadow" ? shadowLayers(role.value) : [];
  };
  const glass = colourOf(production, "glass") ?? colourOf(production, "surface");
  const windowRadius = radius("radius-window", 20);
  for (const layer of shadow("shadow-window")) {
    ctx.save();
    ctx.shadowOffsetX = layer.x;
    ctx.shadowOffsetY = layer.y;
    ctx.shadowBlur = layer.blur;
    ctx.shadowColor = layer.colour;
    roundedRect(
      ctx,
      stage.x - layer.spread,
      stage.y - layer.spread,
      stage.w + 2 * layer.spread,
      stage.h + 2 * layer.spread,
      windowRadius,
    );
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.restore();
  }
  roundedRect(ctx, stage.x, stage.y, stage.w, stage.h, windowRadius);
  ctx.fillStyle = paint(glass, "rgba(255, 255, 255, 0.06)");
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.stroke();
  ctx.fillStyle = line;
  ctx.fillRect(stage.x, stage.y + 44, stage.w, 1);
  for (let dot = 0; dot < 3; dot += 1) {
    ctx.beginPath();
    ctx.arc(stage.x + 26 + dot * 18, stage.y + 22, 5, 0, Math.PI * 2);
    ctx.fillStyle = muted;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const card = { x: stage.x + 44, y: stage.y + 92, w: 320, h: 150 };
  const cardRadius = radius("radius-card", 12);
  for (const layer of shadow("shadow-lift")) {
    ctx.save();
    ctx.shadowOffsetX = layer.x;
    ctx.shadowOffsetY = layer.y;
    ctx.shadowBlur = layer.blur;
    ctx.shadowColor = layer.colour;
    roundedRect(ctx, card.x, card.y, card.w, card.h, cardRadius);
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.restore();
  }
  roundedRect(ctx, card.x, card.y, card.w, card.h, cardRadius);
  ctx.fillStyle = paint(
    colourOf(production, "raised") ?? colourOf(production, "surface"),
    "#151b2e",
  );
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.stroke();
  ctx.fillStyle = signature;
  ctx.fillRect(card.x + 22, card.y + 34, 40, 1);
  text(ctx, "RECORD", card.x + 72, card.y + 38, monoFont(10, 700), signature, { spacing: 2.8 });
  text(ctx, kit.name, card.x + 22, card.y + 84, fontOf(display, 28, "Georgia, serif", 700), ink, {
    max: card.w - 44,
  });
  text(ctx, "Ready for the client", card.x + 22, card.y + 114, bodyFont(14), muted);
  // The accent, as something to press, with the selection's ring around it.
  const accent = colourOf(production, "accent");
  const selection = colourOf(production, "selection");
  const button = { x: card.x + 22, y: stage.y + stage.h - 86, w: 150, h: 40 };
  roundedRect(ctx, button.x, button.y, button.w, button.h, Math.min(cardRadius, 12));
  ctx.fillStyle = paint(accent, signature);
  ctx.fill();
  text(ctx, "Start", button.x + button.w / 2, button.y + 26, bodyFont(15), ground, {
    align: "center",
  });
  if (selection) {
    roundedRect(
      ctx,
      button.x - 4,
      button.y - 4,
      button.w + 8,
      button.h + 8,
      Math.min(cardRadius, 12) + 4,
    );
    ctx.strokeStyle = rgba(selection.hex, selection.alpha);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // The blur, drawn: a dot of the signature under each blur role.
  (["blur-glass", "blur-backdrop"] as const).forEach((key, index) => {
    const role = production.roles[key];
    const x = stage.x + 430 + index * 90;
    const y = stage.y + 150;
    ctx.save();
    if (role?.kind === "blur" && "filter" in ctx) ctx.filter = `blur(${pixels(role.value, 0)}px)`;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = signature;
    ctx.fill();
    ctx.restore();
    text(ctx, key.replace("blur-", ""), x, y + 64, monoFont(11), muted, { align: "center" });
    text(ctx, role?.kind === "blur" ? role.value : "not set", x, y + 80, monoFont(11), muted, {
      align: "center",
    });
  });
  text(
    ctx,
    "glass · line · corners · shadows · raised card · accent · selection",
    stage.x,
    stage.y + stage.h + 34,
    monoFont(11),
    muted,
    { max: stage.w },
  );

  // Motion: each curve, and how long it takes.
  MOTION_ROLE_KEYS.forEach((key, index) => {
    const role = production.roles[key];
    const box = { x: stage.x + index * 124, y: 640, w: 96, h: 96 };
    ctx.strokeStyle = line;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    if (role?.kind === "motion" && role.ease) {
      const [x1, y1, x2, y2] = role.ease;
      ctx.beginPath();
      ctx.moveTo(box.x, box.y + box.h);
      ctx.bezierCurveTo(
        box.x + x1 * box.w,
        box.y + box.h - y1 * box.h,
        box.x + x2 * box.w,
        box.y + box.h - y2 * box.h,
        box.x + box.w,
        box.y,
      );
      ctx.strokeStyle = signature;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    text(ctx, key.toUpperCase(), box.x, box.y + box.h + 22, monoFont(11, 700), ink, {
      spacing: 1.3,
    });
    text(
      ctx,
      role?.kind === "motion"
        ? role.durationMs !== null
          ? formatDuration(role.durationMs)
          : MOTION_NEEDS[key].includes("duration")
            ? "no duration yet"
            : "the beat's length"
        : "not set",
      box.x,
      box.y + box.h + 40,
      monoFont(11),
      muted,
      { max: 118 },
    );
  });
  text(ctx, "MOTION", stage.x, 616, monoFont(11, 700), muted, { spacing: 1.3 });

  // The foot: the commits read.
  text(
    ctx,
    production.read.length
      ? `Read by Xeno Studio's code scanner from ${production.read.map((read) => `${read.repo.split("/")[1] ?? read.repo}${read.sha ? ` @ ${read.sha.slice(0, 12)}` : ""}`).join(" · ")}`
      : "Set in Xeno Studio",
    72,
    956,
    monoFont(12),
    muted,
    { max: 1240 },
  );
  text(ctx, "production stylesheet", WIDTH - 72, 956, monoFont(12), muted, { align: "right" });

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The token sheet couldn't be drawn"))),
      "image/png",
    ),
  );
}
