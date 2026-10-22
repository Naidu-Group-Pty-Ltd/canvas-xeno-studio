import { memo, useEffect, useRef } from "react";
import { musicPieces, pieceCuts, piecesSounding } from "@/lib/edit/pieces";
import { audioFades, audioPlayLength, type TimelineAudio } from "@/lib/edit/timeline";

/** A slip from the edit's clock past this is put right with a seek; a smaller one by playing a touch faster or slower. */
const SEEK_DRIFT = 0.25;
const DRIFT_DEADBAND = 0.015;
const NUDGE_GAIN = 0.6;
const MAX_NUDGE = 0.06;

/**
 * Music edited on its bars, in the preview, played as the render plays it:
 * its pieces in order, each join crossfaded (src/lib/edit/pieces). Two
 * players take the pieces in turn, so the next piece is already waiting at
 * its first moment when the join comes, and the two cross at the join rather
 * than one jumping (which would stall for a moment). The level, its fades
 * and its dip under the voice are as for any music.
 */
export const PiecesAudioLayer = memo(function PiecesAudioLayer({
  item,
  url,
  time,
  playing,
  total,
  voiceRanges,
  channel,
  level,
}: {
  item: TimelineAudio;
  url: string | undefined;
  time: number;
  playing: boolean;
  total: number;
  voiceRanges: [number, number][];
  /** The gain of the mixer channel the item plays on. */
  channel: number;
  /** The preview's share of full volume, times the edit's opening or closing fade. */
  level: number;
}) {
  const first = useRef<HTMLAudioElement>(null);
  const second = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const players = [first.current, second.current];
    const pieces = musicPieces(item);
    if (!pieces || !players[0] || !players[1]) return;
    const length = audioPlayLength(item, total);
    const elapsed = time - item.start;
    const silent = () => players.forEach((player) => player && !player.paused && player.pause());
    if (elapsed < 0 || elapsed >= length || item.volume * channel === 0) {
      silent();
      return;
    }
    // The item's own level: its volume, its fades, and its dip while the voice speaks.
    const { fadeIn, fadeOut } = audioFades(item, total);
    let gain = item.volume * channel;
    if (fadeIn > 0 && elapsed < fadeIn) gain *= elapsed / fadeIn;
    if (fadeOut > 0 && elapsed > length - fadeOut)
      gain *= Math.max(0, (length - elapsed) / fadeOut);
    if (item.duck && voiceRanges.some(([from, to]) => time >= from - 0.25 && time <= to + 0.45))
      gain *= item.duckLevel;

    const sounding = piecesSounding(pieces, elapsed);
    const cuts = pieceCuts(pieces);
    const current = sounding.at(-1)?.index ?? 0;
    players.forEach((player, slot) => {
      if (!player) return;
      const heard = sounding.find((piece) => piece.index % 2 === slot);
      if (!heard) {
        // Waiting: set at the first moment of the next piece it takes, ready for that join.
        if (!player.paused) player.pause();
        const next = cuts[current + 1];
        if (
          next &&
          (current + 1) % 2 === slot &&
          player.readyState >= 1 &&
          Math.abs(player.currentTime - next.from) > 0.03
        )
          player.currentTime = next.from;
        return;
      }
      player.volume = Math.max(0, Math.min(1, gain * heard.gain * level));
      if (!playing) {
        if (player.playbackRate !== 1) player.playbackRate = 1;
        if (!player.paused) player.pause();
        if (player.readyState >= 1 && Math.abs(player.currentTime - heard.source) > 0.03)
          player.currentTime = heard.source;
        return;
      }
      follow(player, heard.source);
      if (player.paused) void player.play().catch(() => undefined);
    });
  }, [item, time, playing, total, voiceRanges, channel, level]);

  useEffect(() => {
    const players = [first.current, second.current];
    return () => players.forEach((player) => player?.pause());
  }, []);

  if (!url) return null;
  return (
    <>
      <audio ref={first} src={url} preload="auto" />
      <audio ref={second} src={url} preload="auto" />
    </>
  );
});

/** Keeps a playing player on the edit's clock, as the preview keeps every track (see PreviewPlayer). */
function follow(player: HTMLAudioElement, expected: number) {
  if (player.readyState < 1) return;
  const drift = player.currentTime - expected;
  if (Math.abs(drift) > SEEK_DRIFT) {
    player.currentTime = expected;
    if (player.playbackRate !== 1) player.playbackRate = 1;
    return;
  }
  const nudge =
    Math.abs(drift) <= DRIFT_DEADBAND
      ? 0
      : Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, -drift * NUDGE_GAIN));
  const rate = 1 + nudge;
  if (Math.abs(player.playbackRate - rate) > 0.0005) player.playbackRate = rate;
}
