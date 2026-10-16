/**
 * Image alignment for joins between clips: how a frame's picture has to be
 * moved to sit exactly on another frame of the same moment.
 *
 * A clip generated from the frame another clip ends on re-renders that frame,
 * and the re-render is rarely in register: video models resize their start
 * image to their own working size, so the new clip's first frame is the same
 * picture stretched by a few percent from a corner, and a little lighter or
 * darker. Here that is measured as an affine map (scale on each axis, shear,
 * shift) plus a gain and offset on brightness, fitted by Gauss-Newton on grey
 * frames, coarse to fine, with robust weights so that what really moved
 * between the two frames doesn't pull the fit.
 *
 * Coordinates are continuous, with (0, 0) at a frame's top-left corner and
 * pixel i's centre at i + 0.5. A map is about the frame's centre: a point p
 * of the reference frame shows what the moving frame shows at
 *   c + M (p - c) + t,   M = [[1 + a, b], [c, 1 + d]],   t = (tx, ty).
 * Pure: no I/O, so it is unit-testable.
 */

/** A frame's plane as floats, downscaled by a whole factor (each pixel the mean of a factor x factor block). */
export function downscale(plane, width, height, factor) {
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Float32Array(w * h);
  const area = factor * factor;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let total = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const row = (y * factor + dy) * width + x * factor;
        for (let dx = 0; dx < factor; dx += 1) total += plane[row + dx];
      }
      out[y * w + x] = total / area;
    }
  }
  return { data: out, width: w, height: h };
}

/** Half size, each pixel the mean of a 2 x 2 block. */
function halve(image) {
  return downscale(image.data, image.width, image.height, 2);
}

/** Central differences along x and y (one-sided at the edges). */
function gradients(image) {
  const { data, width: w, height: h } = image;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const left = x > 0 ? data[i - 1] : data[i];
      const right = x < w - 1 ? data[i + 1] : data[i];
      const up = y > 0 ? data[i - w] : data[i];
      const down = y < h - 1 ? data[i + w] : data[i];
      gx[i] = (right - left) / (x > 0 && x < w - 1 ? 2 : 1);
      gy[i] = (down - up) / (y > 0 && y < h - 1 ? 2 : 1);
    }
  }
  return { gx, gy };
}

/** Bilinear sample at a continuous point (pixel centres at i + 0.5); NaN outside the frame. */
function sample(data, w, h, px, py) {
  const x = px - 0.5;
  const y = py - 0.5;
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return Number.NaN;
  const x0 = Math.min(w - 2, Math.floor(x));
  const y0 = Math.min(h - 2, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * w + x0;
  return (
    data[i] * (1 - fx) * (1 - fy) +
    data[i + 1] * fx * (1 - fy) +
    data[i + w] * (1 - fx) * fy +
    data[i + w + 1] * fx * fy
  );
}

/** Where point (px, py) of the reference frame samples the moving frame, under map `p`. */
export function mapPoint(p, width, height, px, py) {
  const cx = width / 2;
  const cy = height / 2;
  const X = px - cx;
  const Y = py - cy;
  return [cx + (1 + p.a) * X + p.b * Y + p.tx, cy + p.c * X + (1 + p.d) * Y + p.ty];
}

/** Correlation of two frames' pictures (1 is the same), over the points `map` keeps inside `mov`. */
export function alignedLikeness(ref, mov, map = IDENTITY, step = 1) {
  const { width: w, height: h } = ref;
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const [sx, sy] = mapPoint(map, w, h, x + 0.5, y + 0.5);
      const b = sample(mov.data, mov.width, mov.height, sx, sy);
      if (Number.isNaN(b)) continue;
      const a = ref.data[y * w + x];
      n += 1;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }
  if (n < 16) return 0;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  if (va < 1e-6 || vb < 1e-6) return 0;
  return (sab - (sa * sb) / n) / Math.sqrt(va * vb);
}

export const IDENTITY = Object.freeze({ a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 });

/** Solves the symmetric system H x = g (8 x 8), with a little damping so a flat frame can't blow it up. */
function solve(H, g, size) {
  const A = Array.from({ length: size }, (_, row) => {
    const line = new Float64Array(size + 1);
    for (let col = 0; col < size; col += 1) line[col] = H[row * size + col];
    line[row] += 1e-9 * (1 + Math.abs(H[row * size + row]));
    line[size] = g[row];
    return line;
  });
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    if (Math.abs(A[pivot][col]) < 1e-12) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let row = col + 1; row < size; row += 1) {
      const factor = A[row][col] / A[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= size; k += 1) A[row][k] -= factor * A[col][k];
    }
  }
  const x = new Float64Array(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    let total = A[row][size];
    for (let k = row + 1; k < size; k += 1) total -= A[row][k] * x[k];
    x[row] = total / A[row][row];
  }
  return x;
}

/**
 * One level's Gauss-Newton refinement of map `p` (and the brightness gain and
 * offset) so that `mov` under the map matches `ref`. Residuals are Huber
 * weighted at about 1.5 sigma of the previous pass's residuals.
 */
function refine(ref, mov, start, { iterations, margin, step }) {
  const { width: w, height: h, data: refData } = ref;
  const { gx, gy } = gradients(mov);
  const p = { ...start.map };
  let gain = start.gain;
  let bias = start.bias;
  let scale = start.scale;
  const cx = w / 2;
  const cy = h / 2;
  const H = new Float64Array(64);
  const g = new Float64Array(8);
  const J = new Float64Array(8);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    H.fill(0);
    g.fill(0);
    // Residuals (0-255) counted in quarter-level bins, for their median.
    const bins = new Uint32Array(1024);
    let counted = 0;
    for (let y = margin; y < h - margin; y += step) {
      for (let x = margin; x < w - margin; x += step) {
        const X = x + 0.5 - cx;
        const Y = y + 0.5 - cy;
        const sx = cx + (1 + p.a) * X + p.b * Y + p.tx;
        const sy = cy + p.c * X + (1 + p.d) * Y + p.ty;
        const value = sample(mov.data, mov.width, mov.height, sx, sy);
        if (Number.isNaN(value)) continue;
        const ix = gain * sample(gx, mov.width, mov.height, sx, sy);
        const iy = gain * sample(gy, mov.width, mov.height, sx, sy);
        const r = refData[y * w + x] - (gain * value + bias);
        bins[Math.min(1023, Math.floor(Math.abs(r) * 4))] += 1;
        counted += 1;
        const k = scale;
        const weight = Math.abs(r) <= k ? 1 : k / Math.abs(r);
        J[0] = ix * X;
        J[1] = ix * Y;
        J[2] = iy * X;
        J[3] = iy * Y;
        J[4] = ix;
        J[5] = iy;
        J[6] = value;
        J[7] = 1;
        for (let row = 0; row < 8; row += 1) {
          const wj = weight * J[row];
          g[row] += wj * r;
          for (let col = row; col < 8; col += 1) H[row * 8 + col] += wj * J[col];
        }
      }
    }
    if (counted < 64) break;
    for (let row = 0; row < 8; row += 1) for (let col = 0; col < row; col += 1) H[row * 8 + col] = H[col * 8 + row];
    const delta = solve(H, g, 8);
    if (!delta) break;
    p.a += delta[0];
    p.b += delta[1];
    p.c += delta[2];
    p.d += delta[3];
    p.tx += delta[4];
    p.ty += delta[5];
    gain += delta[6];
    bias += delta[7];
    // The next pass's Huber threshold: 1.5 sigma, from the median absolute residual.
    let below = 0;
    let bin = 0;
    while (bin < 1023 && below + bins[bin] <= counted / 2) below += bins[bin++];
    const median = (bin + 0.5) / 4;
    scale = Math.max(1, 1.5 * 1.4826 * median);
    const shift = Math.max(Math.abs(delta[4]), Math.abs(delta[5]));
    const linear = Math.max(Math.abs(delta[0]), Math.abs(delta[1]), Math.abs(delta[2]), Math.abs(delta[3]));
    if (shift < 0.005 && linear < 2e-6) break;
  }
  return { map: p, gain, bias, scale };
}

/**
 * The map that puts `mov` on `ref` (two grey frames of the same size, as
 * { data, width, height }), with the brightness gain and offset, and how alike
 * the two are before and after. Coarse to fine over a pyramid; translations are
 * in `ref`'s pixels.
 */
export function alignFrames(ref, mov, { levels = 4, iterations = 40, step = 1 } = {}) {
  if (ref.width !== mov.width || ref.height !== mov.height) throw new Error("Frames to align must be the same size");
  const refs = [ref];
  const movs = [mov];
  while (refs.length < levels && refs[refs.length - 1].width >= 48 && refs[refs.length - 1].height >= 48) {
    refs.push(halve(refs[refs.length - 1]));
    movs.push(halve(movs[movs.length - 1]));
  }
  let state = { map: { ...IDENTITY }, gain: 1, bias: 0, scale: 12 };
  for (let level = refs.length - 1; level >= 0; level -= 1) {
    if (level < refs.length - 1) {
      state = { ...state, map: { ...state.map, tx: state.map.tx * 2, ty: state.map.ty * 2 } };
    }
    const r = refs[level];
    const margin = Math.max(2, Math.round(Math.min(r.width, r.height) * 0.03));
    state = refine(r, movs[level], state, { iterations, margin, step: level === 0 ? step : 1 });
  }
  return {
    map: state.map,
    gain: state.gain,
    bias: state.bias,
    before: alignedLikeness(ref, mov, IDENTITY, 2),
    after: alignedLikeness(ref, mov, state.map, 2),
  };
}

/**
 * Fine detail in a grey frame: the mean squared response of a 3 x 3
 * Laplacian, over the inner frame. Sharper pictures score higher; it is
 * compared between two frames of one picture, never read on its own.
 */
export function detailLevel(plane, width, height, margin = 4) {
  let total = 0;
  let count = 0;
  for (let y = Math.max(1, margin); y < height - Math.max(1, margin); y += 1) {
    for (let x = Math.max(1, margin); x < width - Math.max(1, margin); x += 1) {
      const i = y * width + x;
      const lap = plane[i - 1] + plane[i + 1] + plane[i - width] + plane[i + width] - 4 * plane[i];
      total += lap * lap;
      count += 1;
    }
  }
  return count ? total / count : 0;
}
