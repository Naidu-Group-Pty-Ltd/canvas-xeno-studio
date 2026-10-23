import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Scene } from "@/lib/compositions/compile";
import type { ElementProps, StateUpdate } from "@/lib/compositions/state";
import { cn } from "@/lib/utils";

/** A page with nothing on it, shown while there is no scene. */
const EMPTY_PAGE = "<!doctype html><html><body style='margin:0;background:#000'></body></html>";

/**
 * A composition drawn live in the browser at time `time`: its page in a frame
 * of its own (no scripts run in it), set by its state function the way the
 * media service sets the page it draws, so what plays here is what is drawn.
 * Motion blur and the 2x drawing are the media service's: the final drawing
 * is smoother than this.
 */
export function CompositionPreview({
  scene,
  width,
  height,
  time,
  className,
  label = "Motion graphic preview",
}: {
  scene: Scene | null;
  /** The frame the composition is drawn at, in pixels. */
  width: number;
  height: number;
  /** Seconds into the composition. */
  time: number;
  className?: string;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [page, setPage] = useState<Document | null>(null);
  // What the page has been set to so far, and the elements found for each change.
  const applied = useRef<{ last: Map<string, ElementProps>; found: Map<string, Element | null> }>({
    last: new Map(),
    found: new Map(),
  });
  const html = scene?.document ?? EMPTY_PAGE;

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setScale(Math.min(rect.width / width, rect.height / height) || 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);

  // A new page loads afresh: nothing has been set on it yet.
  useEffect(() => {
    setPage(null);
    applied.current = { last: new Map(), found: new Map() };
  }, [html]);

  useEffect(() => {
    if (!scene || !page) return;
    let updates: StateUpdate[];
    try {
      updates = scene.scene.state(Math.max(0, time)).diff(applied.current.last);
    } catch {
      return;
    }
    apply(page, applied.current.found, updates);
  }, [scene, page, time]);

  return (
    <div
      ref={box}
      className={cn("relative flex items-center justify-center overflow-hidden", className)}
    >
      <div
        className="relative overflow-hidden"
        style={{ width: Math.floor(width * scale), height: Math.floor(height * scale) }}
      >
        <iframe
          title={label}
          srcDoc={html}
          sandbox="allow-same-origin"
          tabIndex={-1}
          aria-hidden
          onLoad={(event) => setPage(event.currentTarget.contentDocument)}
          className="pointer-events-none absolute left-0 top-0 border-0"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        />
      </div>
    </div>
  );
}

/** Sets a drawing's changes on the page, as the media service's page does. */
function apply(page: Document, found: Map<string, Element | null>, updates: StateUpdate[]) {
  for (const [selector, index, props] of updates) {
    const key = `${selector}\u0000${index ?? -1}`;
    let element = found.get(key);
    if (element === undefined) {
      try {
        element =
          index === null
            ? page.querySelector(selector)
            : (page.querySelectorAll(selector)[index] ?? null);
      } catch {
        element = null;
      }
      found.set(key, element);
    }
    if (!element) continue;
    for (const [name, value] of Object.entries(props)) {
      if (name === "$text") element.textContent = value;
      else if (name === "$src") {
        if (element.getAttribute("src") !== value) element.setAttribute("src", value);
      } else (element as HTMLElement).style.setProperty(name, value);
    }
  }
}
