import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

/** Whether a drag carries files from the device (not text or a link dragged within the page). */
function carriesFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Drop zones on the page now. While there are any, a file dropped beside them is ignored. */
let zones = 0;
function ignoreStrayDrop(event: globalThis.DragEvent) {
  if (!carriesFiles(event)) return;
  // Dropped outside every zone, the browser would open the file in place of
  // the studio (and lose unsaved work): it is ignored instead.
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
}

/**
 * Lets an area take files dragged from the desktop: spread `dropProps` on it
 * and show something while `dragging`. Files dropped on it go to `onFiles`;
 * an area inside another takes its files itself. Does nothing while
 * `disabled`.
 */
export function useFileDrop(options: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const { onFiles, disabled = false } = options;
  const [dragging, setDragging] = useState(false);
  // dragenter and dragleave fire for every element inside the area, so they're counted.
  const depth = useRef(0);
  const latest = useRef(onFiles);
  useEffect(() => {
    latest.current = onFiles;
  });

  useEffect(() => {
    zones += 1;
    if (zones === 1) {
      window.addEventListener("dragover", ignoreStrayDrop);
      window.addEventListener("drop", ignoreStrayDrop);
    }
    // A drag that ends anywhere (dropped elsewhere, cancelled, taken by an
    // area inside this one) leaves this area as it was.
    const reset = () => {
      depth.current = 0;
      setDragging(false);
    };
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragend", reset, true);
    return () => {
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset, true);
      zones -= 1;
      if (zones === 0) {
        window.removeEventListener("dragover", ignoreStrayDrop);
        window.removeEventListener("drop", ignoreStrayDrop);
      }
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      depth.current = 0;
      setDragging(false);
    }
  }, [disabled]);

  const onDragEnter = useCallback(
    (event: DragEvent) => {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      // An area inside another shows itself alone.
      event.stopPropagation();
      depth.current += 1;
      setDragging(true);
    },
    [disabled],
  );
  const onDragOver = useCallback(
    (event: DragEvent) => {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );
  const onDragLeave = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);
  const onDrop = useCallback(
    (event: DragEvent) => {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length) latest.current(files);
    },
    [disabled],
  );

  return { dragging, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
