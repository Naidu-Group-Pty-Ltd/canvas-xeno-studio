/**
 * Brand formulas: proven structures for content, each a run of timed beats
 * (what every moment must do, show and say) with the rules it keeps, the
 * guardrails that keep it honest, and the sources it rests on. The library
 * is in ./formula-library; here a brand's DNA (./dna) ranks it, beats are
 * timed to a length, and a formula is written out for the AI that plans,
 * scripts and prompts (the Director, long videos, the Supercomputer and the
 * studio API).
 *
 * Shared by the server, the browser and tests.
 */
import {
  BRAND_TYPE_INFO,
  CHANNEL_LABELS,
  FACE_LABELS,
  GOAL_INFO,
  type BrandDna,
  type BrandType,
  type Channel,
  type Face,
  type Goal,
  type Market,
} from "./dna";
import { CHANNEL_GUIDES, FORMULAS, GUARDRAILS, SOURCES, UNIVERSAL_RULES } from "./formula-library";

export type Shape = "9:16" | "1:1" | "4:5" | "16:9";

export interface FormulaSource {
  title: string;
  publisher: string;
  url: string;
  /** The year it was published, when the page says. */
  year: number | null;
  /**
   * How far it was checked: "opened" (the page itself was read) or
   * "search" (its text was read from the publisher's page through web
   * search, the page not yet opened).
   */
  checked: "opened" | "search";
  /** What it is relied on for, or a caveat. */
  note?: string | undefined;
}

export interface FormulaBeat {
  key: string;
  label: string;
  /** Its part of the running time at the formula's ideal length. */
  share: number;
  /** What the beat must do. */
  job: string;
  /** What's on screen. */
  show: string;
  /** What's said or written: voice-over, dialogue, on-screen text. */
  say: string;
  /** A hook or a call to action: it keeps about its length when the piece is longer or shorter. */
  edge?: boolean | undefined;
  /** Only in pieces at least this many seconds long; shorter ones go without it. */
  from?: number | undefined;
}

export interface BrandFormula {
  id: string;
  name: string;
  /** Where it comes from, in a few words. */
  origin: string;
  summary: string;
  /** Brand-building (fame and memory over time), activation (action now), or both (after Binet & Field). */
  purpose: "brand" | "activation" | "both";
  goals: Goal[];
  /** How well it suits each kind of brand: 3 made for it, 2 works well, 1 can work. */
  fit: Partial<Record<BrandType, 1 | 2 | 3>>;
  /** The markets it suits (empty: both). */
  markets: Exclude<Market, "both">[];
  channels: Channel[];
  /** Who must be in it, any of these (empty: no one needed). */
  faces: Face[];
  seconds: { min: number; ideal: number; max: number };
  shapes: Shape[];
  beats: FormulaBeat[];
  rules: string[];
  avoid: string[];
  /** Keys of the guardrails it carries (see GUARDRAILS). */
  guardrails: string[];
  /** Why it works, briefly. */
  why: string;
  /**
   * How strong the evidence for it is: "A" a measured result for the format,
   * "B" official platform guidance or research behind it, "C" an
   * established convention without a measured result.
   */
  grade: "A" | "B" | "C";
  /** Keys of the sources it rests on (see SOURCES). */
  sources: string[];
}

/** A rule every formula keeps, with what it rests on. */
export interface HouseRule {
  rule: string;
  sources: string[];
}

/** What a platform asks of content, from its own guidance. */
export interface ChannelGuide {
  shape: Shape;
  seconds: { min: number; ideal: number; max: number };
  rules: string[];
  sources: string[];
}

export interface Guardrail {
  rule: string;
  /** What it rests on (empty: the studio's own policy). */
  sources: string[];
}

export { CHANNEL_GUIDES, FORMULAS, GUARDRAILS, SOURCES, UNIVERSAL_RULES };

const byId = new Map(FORMULAS.map((formula) => [formula.id, formula]));

export function formulaById(id: string | null | undefined): BrandFormula | null {
  return id ? (byId.get(id) ?? null) : null;
}

/** The sources behind a formula, its platform's guide and its guardrails, each once. */
export function sourcesOf(formula: BrandFormula, channel: Channel | null = null): FormulaSource[] {
  const keys = [
    ...formula.sources,
    ...(channel ? CHANNEL_GUIDES[channel].sources : []),
    ...formula.guardrails.flatMap((key) => GUARDRAILS[key]?.sources ?? []),
  ];
  return [...new Set(keys)].flatMap((key) => (SOURCES[key] ? [SOURCES[key]!] : []));
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

export interface FormulaAsk {
  /** What this piece is for (else the DNA's goal). */
  goal?: Goal | null;
  /** Where it will run. */
  channel?: Channel | null;
  /** How long it must be. */
  seconds?: number | null;
}

export interface RankedFormula {
  formula: BrandFormula;
  score: number;
  fit: "strong" | "good" | "possible";
  /** Why it suits the brand and the ask. */
  reasons: string[];
  /** What to watch for. */
  cautions: string[];
}

const GRADE_WEIGHT: Record<BrandFormula["grade"], number> = { A: 1, B: 0.5, C: 0 };

/** What a formula's evidence grade means, in a few words. */
export const GRADE_INFO: Record<BrandFormula["grade"], { label: string; hint: string }> = {
  A: { label: "Measured", hint: "A measured result for the format" },
  B: { label: "Guided", hint: "Official platform guidance or research behind it" },
  C: { label: "Convention", hint: "An established convention, not measured" },
};

/**
 * The library ranked for a brand's DNA and what's asked: the kind of brand
 * first, then its market, the goal, the channel, the length, who can front
 * it, the strength of its evidence, and the formulas the brand works with.
 */
export function rankFormulas(
  dna: BrandDna,
  ask: FormulaAsk = {},
  library: BrandFormula[] = FORMULAS,
): RankedFormula[] {
  const goal = ask.goal ?? dna.goal;
  const ranked = library.map((formula) => {
    const reasons: string[] = [];
    const cautions: string[] = [];
    let score = 0;

    const own = dna.type ? (formula.fit[dna.type] ?? 0) : 0;
    const also = Math.max(0, ...dna.alsoTypes.map((type) => formula.fit[type] ?? 0));
    if (dna.type) {
      score += own * 3 + also * 1.5;
      if (own >= 2)
        reasons.push(`${own === 3 ? "Made for" : "Suits"} ${BRAND_TYPE_INFO[dna.type].plural}`);
      else if (also >= 2) {
        const type = dna.alsoTypes.find((entry) => (formula.fit[entry] ?? 0) >= 2)!;
        reasons.push(`Suits ${BRAND_TYPE_INFO[type].plural}`);
      } else if (!own && !also) score -= 4;
    } else score += Math.max(...Object.values(formula.fit).map(Number), 0);

    if (dna.market && dna.market !== "both" && formula.markets.length) {
      if (formula.markets.includes(dna.market)) score += 1;
      else {
        score -= 3;
        cautions.push(`Made for ${formula.markets.join(" and ").toUpperCase()} audiences`);
      }
    }

    if (goal) {
      if (formula.goals.includes(goal)) {
        score += 2;
        reasons.push(`Built for ${GOAL_INFO[goal].label.toLowerCase()}`);
      } else score -= 1.5;
    }

    // Whether the piece asked for (its channel or length) rules it out.
    let offAsk = false;
    if (ask.channel) {
      if (formula.channels.includes(ask.channel)) {
        score += 2;
        reasons.push(`Works on ${CHANNEL_LABELS[ask.channel]}`);
      } else {
        score -= 3;
        offAsk = true;
        cautions.push(`Not usually made for ${CHANNEL_LABELS[ask.channel]}`);
      }
    } else if (dna.channels.some((channel) => formula.channels.includes(channel))) score += 1;

    if (ask.seconds) {
      if (ask.seconds >= formula.seconds.min && ask.seconds <= formula.seconds.max) score += 1;
      else {
        score -= 2;
        offAsk = true;
        cautions.push(`Runs ${formula.seconds.min}–${formula.seconds.max} s`);
      }
    }

    if (formula.faces.length) {
      const fronts = formula.faces.filter((face) => dna.faces.includes(face));
      if (fronts.length) score += 1;
      else if (dna.faces.length) {
        score -= 1.5;
        cautions.push(
          `Needs ${formula.faces.map((face) => FACE_LABELS[face].toLowerCase()).join(" or ")}`,
        );
      }
    }

    // Between formulas that fit as well, the one with stronger evidence first.
    score += GRADE_WEIGHT[formula.grade];

    const pinned = dna.formulas.indexOf(formula.id);
    if (pinned >= 0) reasons.unshift("One of the brand's formulas");
    return { formula, score, reasons, cautions, pinned, offAsk };
  });
  const top = Math.max(0, ...ranked.map((entry) => entry.score));
  // The brand's own formulas first, in its order, unless the piece's channel or length rules one out.
  const place = (entry: (typeof ranked)[number]) =>
    entry.pinned >= 0 && !entry.offAsk ? entry.pinned : Number.MAX_SAFE_INTEGER;
  ranked.sort(
    (a, b) =>
      place(a) - place(b) || b.score - a.score || a.formula.name.localeCompare(b.formula.name),
  );
  return ranked.map(({ pinned: _pinned, offAsk: _offAsk, ...entry }) => ({
    ...entry,
    fit: entry.score >= Math.max(6, top - 2) ? "strong" : entry.score >= 3 ? "good" : "possible",
  }));
}

/** The formulas a brand works with: its own, else the best for its DNA. */
export function formulasForBrand(dna: BrandDna, max = 3): BrandFormula[] {
  const own = dna.formulas.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  if (own.length) return own.slice(0, max);
  if (!dna.type) return [];
  return rankFormulas(dna)
    .filter((entry) => entry.fit !== "possible")
    .slice(0, max)
    .map((entry) => entry.formula);
}

/* ------------------------------------------------------------------ */
/* Timing and writing out                                              */
/* ------------------------------------------------------------------ */

export interface TimedBeat extends FormulaBeat {
  from: number;
  to: number;
}

const half = (value: number) => Math.round(value * 2) / 2;

/**
 * A formula's beats timed to a length (its ideal one by default), in half
 * seconds. Hooks and calls to action keep about the length they have at
 * the ideal (at most a fifth of the piece each) and the beats between them
 * share the rest; a beat only longer pieces have is left out of shorter ones.
 */
export function timedBeats(formula: BrandFormula, seconds?: number | null): TimedBeat[] {
  const total = Math.max(1, seconds ?? formula.seconds.ideal);
  const ideal = formula.seconds.ideal;
  const present = (length: number) => (beat: FormulaBeat) => !beat.from || length >= beat.from;
  const all = formula.beats.filter(present(ideal)).reduce((acc, beat) => acc + beat.share, 0) || 1;
  const beats = formula.beats.filter(present(total));
  const atIdeal = (beat: FormulaBeat) => (beat.share / all) * ideal;
  const edges = beats.filter((beat) => beat.edge);
  const middle = beats.filter((beat) => !beat.edge);
  const edgeLength = (beat: FormulaBeat) => Math.min(atIdeal(beat), total * 0.2);
  const rest = total - edges.reduce((acc, beat) => acc + edgeLength(beat), 0);
  const middleShare = middle.reduce((acc, beat) => acc + beat.share, 0);
  const proportional = !middle.length || rest <= middle.length * 0.5;
  const shareSum = beats.reduce((acc, beat) => acc + beat.share, 0) || 1;
  const lengthOf = (beat: FormulaBeat) =>
    proportional
      ? (beat.share / shareSum) * total
      : beat.edge
        ? edgeLength(beat)
        : (beat.share / middleShare) * rest;
  let at = 0;
  return beats.map((beat, index) => {
    const from = half(at);
    at += lengthOf(beat);
    const to = index === beats.length - 1 ? total : Math.max(from + 0.5, half(at));
    return { ...beat, from, to };
  });
}

/* ------------------------------------------------------------------ */
/* The mix                                                             */
/* ------------------------------------------------------------------ */

/**
 * How a brand's content should be balanced between brand-building and
 * activation, by who it sells to (after Binet & Field's work for the IPA,
 * and for the LinkedIn B2B Institute). A default to lean on, not a quota.
 */
export function contentMix(market: Market | null): {
  brand: number;
  activation: number;
  /** The balance in a few words, for a brief. */
  short: string;
  line: string;
  sources: string[];
} | null {
  if (market === "b2c")
    return {
      brand: 60,
      activation: 40,
      short:
        "about 60% brand-building (emotional, memorable) to 40% activation (offers, action now), after Binet & Field",
      line: "About 60% brand-building to 40% activation, the balance Binet & Field found works best for consumer brands (IPA). Emotional, memorable work builds the brand; rational, offer-led work drives sales now.",
      sources: ["ipa-long-short", "ipa-next-chapter"],
    };
  if (market === "b2b")
    return {
      brand: 50,
      activation: 50,
      short:
        "close to 50:50 brand-building (memory for when buyers enter the market) to activation (demand now), after Binet & Field",
      line: "Close to 50:50 brand-building to activation for business brands (Binet & Field for the LinkedIn B2B Institute; LinkedIn's pages give both 46:54 and 50:50). Most business buyers aren't in the market at any moment, so most content should build memory for later.",
      sources: ["linkedin-b2b-growth", "b2b-institute-5-principles", "ehrenberg-95-5"],
    };
  if (market === "both")
    return {
      brand: 55,
      activation: 45,
      short:
        "about 55:45 brand-building to activation, between the consumer and business balances (Binet & Field)",
      line: "Between the consumer balance (about 60:40 brand-building to activation) and the business one (close to 50:50), after Binet & Field.",
      sources: ["ipa-long-short", "b2b-institute-5-principles"],
    };
  return null;
}

const sentence = (text: string) => text.replace(/[\s.]+$/, "");

/**
 * A formula written out for the AI that plans, scripts and prompts: its
 * beats timed to the length, what the channel asks, its rules, its
 * guardrails and why it works.
 */
export function formulaBlock(
  formula: BrandFormula,
  options: { seconds?: number | null; channel?: Channel | null } = {},
): string {
  const seconds = options.seconds ?? formula.seconds.ideal;
  const channel = options.channel ?? null;
  const guide = channel ? CHANNEL_GUIDES[channel] : null;
  const lines = [
    `FORMULA: ${formula.name} (${formula.id}): ${sentence(formula.summary)}.`,
    `Length: ${seconds} s (it works from ${formula.seconds.min} to ${formula.seconds.max} s). Shape: ${guide?.shape ?? formula.shapes[0] ?? "9:16"}.${channel ? ` For ${CHANNEL_LABELS[channel]}.` : ""}`,
    "Beats, in order (keep their jobs and timing; adapt the words to the brand and brief):",
    ...timedBeats(formula, seconds).map(
      (beat, index) =>
        `${index + 1}. ${beat.label} (${beat.from}–${beat.to} s): ${sentence(beat.job)}. Show: ${sentence(beat.show)}. Say: ${sentence(beat.say)}.`,
    ),
    ...(formula.rules.length ? [`Rules: ${formula.rules.map(sentence).join("; ")}.`] : []),
    ...(channel && guide?.rules.length
      ? [`On ${CHANNEL_LABELS[channel]}: ${guide.rules.map(sentence).join("; ")}.`]
      : []),
    `Always: ${UNIVERSAL_RULES.map((entry) => sentence(entry.rule)).join("; ")}.`,
    ...(formula.avoid.length ? [`Avoid: ${formula.avoid.map(sentence).join("; ")}.`] : []),
    ...(formula.guardrails.length
      ? [
          `Guardrails (never break these): ${formula.guardrails
            .flatMap((key) => (GUARDRAILS[key] ? [sentence(GUARDRAILS[key]!.rule)] : []))
            .join("; ")}.`,
        ]
      : []),
    `Why it works: ${sentence(formula.why)}.`,
  ];
  return lines.join("\n");
}

/** A formula in a line: its name and what it does. */
export function formulaLine(formula: BrandFormula): string {
  return `${formula.name} (${formula.id}): ${sentence(formula.summary)}`;
}
