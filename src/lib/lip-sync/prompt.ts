/**
 * What a clip made from a piece of voiceover is told about it. The driving
 * audio moves the lips by itself; the prompt only says that someone speaks
 * it, so the model gives the speech to a face and keeps the mouth still where
 * the piece is silent.
 */

export const LIP_SYNC_LINE =
  "Speech: the person speaking is voiced by the given audio. Their lips and jaw move exactly in time with it, word for word, from the first frame; wherever the audio is silent their mouth is closed and still.";

/** A clip's prompt with the lip-sync line as its last paragraph (once). */
export function withLipSyncLine(prompt: string): string {
  const paragraphs = prompt.split("\n\n").filter((paragraph) => paragraph !== LIP_SYNC_LINE);
  return [...paragraphs.filter((paragraph) => paragraph.trim()), LIP_SYNC_LINE].join("\n\n");
}
