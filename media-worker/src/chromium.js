import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskError } from "./net.js";

/**
 * Chromium, driven over its DevTools protocol through a pipe: the browser
 * compositions are drawn in (see ./composition.js). Node's built-ins only, as
 * the rest of the worker: the protocol is JSON messages ended by a NUL byte on
 * the browser's file descriptors 3 (commands in) and 4 (answers and events out).
 *
 * The browser never reaches the network. Every request a page makes is
 * answered by the worker (the page and the files the task brought), and
 * anything else is refused; its host lookups go nowhere besides.
 */

/** Where Chromium is: CHROMIUM_PATH, the system's (the image installs Debian's), or Playwright's. */
export function findChromium(env = process.env) {
  const candidates = [
    env["CHROMIUM_PATH"],
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);
  for (const path of candidates) if (existsSync(path)) return path;
  const browsers = env["PLAYWRIGHT_BROWSERS_PATH"];
  if (browsers && existsSync(browsers)) {
    const builds = readdirSync(browsers)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const build of builds) {
      const path = join(browsers, build, "chrome-linux", "chrome");
      if (existsSync(path)) return path;
    }
  }
  return null;
}

export const chromiumPath = findChromium();
export const chromiumAvailable = chromiumPath !== null;

/**
 * Flags for drawing a frame exactly: images decoded before a frame is drawn
 * (never filled in a frame later), every compositor stage run before a frame
 * is captured (a busy machine can't capture a tile still unpainted), colours
 * in sRGB, and nothing from outside. With a GPU, WebGL runs on it; without,
 * in software (SwiftShader), which is slow for heavy WebGL (see
 * docs/compositions.md for how Reel 1's globe was made to draw quickly there).
 */
export function chromiumFlags({ gpu = false, profile }) {
  return [
    "--headless=new",
    "--remote-debugging-pipe",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-default-apps",
    "--mute-audio",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--disable-checker-imaging",
    "--run-all-compositor-stages-before-draw",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--host-resolver-rules=MAP * ~NOTFOUND",
    // The worker runs unprivileged in its container, where Chromium's own sandbox can't start.
    "--no-sandbox",
    "--disable-dev-shm-usage",
    ...(gpu
      ? ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=vulkan"]
      : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    "about:blank",
  ];
}

/** A DevTools protocol session over the browser's pipe. */
class Protocol {
  constructor(child) {
    this.child = child;
    this.writer = child.stdio[3];
    this.next = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    let buffer = "";
    child.stdio[4].on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let end;
      while ((end = buffer.indexOf("\0")) !== -1) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          continue;
        }
        if (message.id !== undefined && this.pending.has(message.id)) {
          const { resolve, reject, method } = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) reject(new TaskError("COMPOSITION_FAILED", `The browser refused ${method}: ${message.error.message}`));
          else resolve(message.result ?? {});
        } else if (message.method) {
          for (const listener of this.listeners) listener(message);
        }
      }
    });
    const gone = () => {
      if (this.closed) return;
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new TaskError("COMPOSITION_FAILED", "The browser stopped while drawing"));
      this.pending.clear();
    };
    child.on("exit", gone);
    child.stdio[4].on("close", gone);
  }

  send(method, params = {}, sessionId = undefined, timeoutMs = 60_000) {
    if (this.closed) return Promise.reject(new TaskError("COMPOSITION_FAILED", "The browser has stopped"));
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new TaskError("COMPOSITION_FAILED", `The browser didn't answer ${method} in time`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.writer.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  }

  /** Calls `listener(message)` for every event; returns a function that stops it. */
  listen(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The next event `method` (in `sessionId`) for which `test` holds. */
  waitFor(method, sessionId, timeoutMs = 60_000, test = () => true) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop();
        reject(new TaskError("COMPOSITION_FAILED", `The page didn't finish loading (${method})`));
      }, timeoutMs);
      const stop = this.listen((message) => {
        if (message.method !== method || (sessionId && message.sessionId !== sessionId)) return;
        if (!test(message.params ?? {})) return;
        clearTimeout(timer);
        stop();
        resolve(message.params ?? {});
      });
    });
  }
}

/** Starts a browser. `close()` always stops it and removes its profile. */
export async function launchChromium({ gpu = false } = {}) {
  if (!chromiumPath) throw new TaskError("COMPOSITION_FAILED", "This media service has no browser to draw compositions with");
  const profile = await mkdtemp(join(tmpdir(), "xeno-chromium-"));
  const child = spawn(chromiumPath, chromiumFlags({ gpu, profile }), {
    stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });
  const protocol = new Protocol(child);
  const closed = new Promise((resolve) => child.on("exit", resolve));
  const close = async () => {
    if (!protocol.closed) await protocol.send("Browser.close", {}, undefined, 5000).catch(() => {});
    const killed = setTimeout(() => child.kill("SIGKILL"), 5000);
    await closed;
    clearTimeout(killed);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  try {
    const version = await protocol.send("Browser.getVersion", {}, undefined, 30_000);
    return { protocol, version: version.product ?? null, close };
  } catch (error) {
    await close();
    throw new TaskError(
      "COMPOSITION_FAILED",
      `The browser couldn't start${stderr ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`,
    );
  }
}

/**
 * The applier the worker installs in each page: it sets elements' style
 * properties and text from a drawing's changes, and waits for any image it
 * points elsewhere to decode, so a drawing never shows one half loaded.
 */
const APPLIER = `(() => {
  const found = new Map();
  window.__xenoApply = async (selectors, updates) => {
    const decoding = [];
    for (const [s, index, props] of updates) {
      const key = s + "\\u0000" + index;
      let element = found.get(key);
      if (element === undefined) {
        const selector = selectors[s];
        element = index < 0 ? document.querySelector(selector) : document.querySelectorAll(selector)[index];
        if (!element) throw new Error("Nothing on the page matches " + selector + (index < 0 ? "" : " [" + index + "]"));
        found.set(key, element);
      }
      for (const [name, value] of Object.entries(props)) {
        if (name === "$text") element.textContent = value;
        else if (name === "$src") {
          if (element.getAttribute("src") !== value) {
            element.setAttribute("src", value);
            if (element.decode) decoding.push(element.decode().catch(() => null));
          }
        } else element.style.setProperty(name, value);
      }
    }
    await Promise.all(decoding);
    return true;
  };
  return true;
})()`;

/** Waits for the page's fonts and every image it shows (backgrounds included) to be decoded. */
const SETTLE = `(async () => {
  await document.fonts.ready;
  const urls = new Set();
  for (const element of document.querySelectorAll("*")) {
    const background = getComputedStyle(element).backgroundImage;
    for (const match of background.matchAll(/url\\("([^"]+)"\\)/g)) urls.add(match[1]);
  }
  for (const image of document.images) urls.add(image.src);
  await Promise.all([...urls].map((url) => { const image = new Image(); image.src = url; return image.decode().catch(() => null); }));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return document.fonts.size;
})()`;

/**
 * Opens a page `width` x `height` CSS pixels, drawn at `scale` times that,
 * whose every request is answered by `serve(url)` ({ body, type } or null to
 * refuse). Returns what a drawing needs: apply changes, capture a PNG.
 */
export async function openPage(browser, { width, height, scale, origin, serve, timeoutMs = 120_000 }) {
  const { protocol } = browser;
  const { targetId } = await protocol.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await protocol.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}, timeout) => protocol.send(method, params, sessionId, timeout);
  const stopServing = protocol.listen((message) => {
    if (message.method !== "Fetch.requestPaused" || message.sessionId !== sessionId) return;
    const { requestId, request } = message.params;
    let answer = null;
    try {
      answer = request.url.startsWith(origin) ? serve(request.url.slice(origin.length)) : null;
    } catch {
      answer = null;
    }
    if (!answer) {
      send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }).catch(() => {});
      return;
    }
    send("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: answer.type },
        { name: "Cache-Control", value: "max-age=86400" },
      ],
      body: answer.body.toString("base64"),
    }).catch(() => {});
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  const loaded = protocol.waitFor("Page.loadEventFired", sessionId, timeoutMs);
  const navigation = await send("Page.navigate", { url: `${origin}/` });
  if (navigation.errorText) throw new TaskError("COMPOSITION_FAILED", `The composition's page couldn't load: ${navigation.errorText}`);
  await loaded;
  const evaluate = async (expression, timeout) => {
    const { result, exceptionDetails } = await send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      timeout,
    );
    if (exceptionDetails)
      throw new TaskError(
        "COMPOSITION_FAILED",
        `The composition's page failed: ${exceptionDetails.exception?.description?.split("\n")[0] ?? exceptionDetails.text}`,
      );
    return result?.value;
  };
  await evaluate(SETTLE, timeoutMs);
  await evaluate(APPLIER);
  // A drawing's changes go to the applier as arguments (JSON values), never as code.
  const { result: global } = await send("Runtime.evaluate", { expression: "window" });
  return {
    async apply(selectors, updates) {
      if (!updates.length) return;
      const { exceptionDetails } = await send("Runtime.callFunctionOn", {
        objectId: global.objectId,
        functionDeclaration: "function (selectors, updates) { return window.__xenoApply(selectors, updates); }",
        arguments: [{ value: selectors }, { value: updates }],
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails)
        throw new TaskError(
          "COMPOSITION_FAILED",
          `A drawing couldn't be applied: ${exceptionDetails.exception?.description?.split("\n")[0] ?? exceptionDetails.text}`,
        );
    },
    async capture() {
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        optimizeForSpeed: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      });
      return Buffer.from(data, "base64");
    },
    async close() {
      stopServing();
      await protocol.send("Target.closeTarget", { targetId }).catch(() => {});
    },
  };
}
