import type { LoadUnit, ParsedItem } from './types';

/**
 * Parses planned exercise lines such as "Speed Bench – 8×3 @70%".
 *
 * Contract: never throws. A line that cannot be fully understood is returned
 * with its raw text and parseConfidence < 1, so nothing from an import is lost.
 * Returns null only for "no session" markers ("-") and empty lines.
 */

const MAX_LINE = 1000;
const MAX_NAME = 120;

const CONFIDENCE = {
  full: 1,
  badLoad: 0.7,
  nameOnly: 0.5,
  badScheme: 0.3,
  nothing: 0,
} as const;

export function normalizeExerciseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a multi-line spreadsheet cell into items. "-" and blanks yield []. */
export function parseExerciseCell(cell: unknown): ParsedItem[] {
  if (cell == null) return [];
  return String(cell)
    .split(/\r?\n|\r/)
    .map(parseExerciseLine)
    .filter((i): i is ParsedItem => i !== null);
}

export function parseExerciseLine(input: string): ParsedItem | null {
  try {
    return parseUnsafe(input);
  } catch {
    // Defensive: the parser must never throw, whatever the input.
    const rawText = safeString(input).slice(0, MAX_LINE);
    return rawText ? base(rawText, { parseConfidence: CONFIDENCE.nothing }) : null;
  }
}

function safeString(input: unknown): string {
  if (input == null) return '';
  // eslint-disable-next-line no-control-regex
  return String(input).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function base(rawText: string, rest: Partial<ParsedItem>): ParsedItem {
  return { kind: 'exercise', rawText, perSide: false, parseConfidence: CONFIDENCE.full, ...rest };
}

function parseUnsafe(input: string): ParsedItem | null {
  const rawText = safeString(input).slice(0, MAX_LINE);
  if (!rawText || /^[-–—]$/.test(rawText)) return null;

  const { name, scheme } = splitNameAndScheme(rawText);
  const exerciseName = name ? name.slice(0, MAX_NAME) : undefined;
  const nameConfidence = name && name.length <= MAX_NAME ? CONFIDENCE.full : CONFIDENCE.nameOnly;

  if (!scheme) {
    return base(rawText, {
      exerciseName,
      parseConfidence: exerciseName ? Math.min(CONFIDENCE.nameOnly, nameConfidence) : CONFIDENCE.nothing,
    });
  }

  const parsed = parseScheme(scheme);
  if (!parsed) {
    return base(rawText, {
      exerciseName,
      parseConfidence: exerciseName ? CONFIDENCE.badScheme : CONFIDENCE.nothing,
    });
  }

  const confidence = Math.min(parsed.parseConfidence ?? CONFIDENCE.full, exerciseName ? nameConfidence : CONFIDENCE.nameOnly);
  return base(rawText, { ...parsed, exerciseName, parseConfidence: confidence });
}

/**
 * The separator is a dash surrounded by whitespace (or at the end), or a colon.
 * Dashes inside words ("Pull-Ups", "Step-down") are part of the name.
 */
export function splitNameAndScheme(text: string): { name: string; scheme: string } {
  const sep = /(?:^|\s)[-–—](?=\s|$)|:(?=\s|$)/.exec(text);
  if (!sep) {
    // No separator: the whole line may be a bare scheme ("4×12") or a bare name.
    return { name: text, scheme: '' };
  }
  return {
    name: text.slice(0, sep.index).trim(),
    scheme: text.slice(sep.index + sep[0].length).trim(),
  };
}

type SchemeResult = Omit<Partial<ParsedItem>, 'rawText'>;

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const SECONDS = /^(s|sek|sec|sekunder|seconds?)$/;
const MINUTES = /^(min|minuter|minutes?)$/;

function toNumber(s: string | undefined): number | undefined {
  if (s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function unitToSeconds(value: number, unit: string): number | undefined {
  if (SECONDS.test(unit)) return Math.round(value);
  if (MINUTES.test(unit)) return Math.round(value * 60);
  return undefined;
}

function parseScheme(raw: string): SchemeResult | null {
  let s = raw
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();

  // Load: everything after "@".
  let load: { load?: number; loadUnit?: LoadUnit } = {};
  let loadOk = true;
  const at = s.indexOf('@');
  if (at >= 0) {
    const parsedLoad = parseLoad(s.slice(at + 1).trim());
    if (parsedLoad) load = parsedLoad;
    else loadOk = false;
    s = s.slice(0, at).trim();
  }

  // Per side: "/ben", "/sida", "/side", "/arm", "per ben".
  let perSide = false;
  const side = /\s*(?:\/|per\s+)(ben|sida|side|arm|leg)\b/.exec(s);
  if (side) {
    perSide = true;
    s = (s.slice(0, side.index) + s.slice(side.index + side[0].length)).trim();
  }

  const core = parseCore(s);
  if (!core) return null;
  return {
    ...core,
    ...load,
    perSide,
    parseConfidence: loadOk ? CONFIDENCE.full : CONFIDENCE.badLoad,
  };
}

function parseLoad(s: string): { load?: number; loadUnit: LoadUnit } | null {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^rpe\\s*${NUM}$`).exec(s))) return { load: toNumber(m[1]), loadUnit: 'rpe' };
  // A percent range ("70-75%") keeps the lower bound; the raw text keeps the range.
  if ((m = new RegExp(`^${NUM}(?:\\s*%?\\s*-\\s*${NUM})?\\s*%$`).exec(s))) return { load: toNumber(m[1]), loadUnit: 'percent' };
  if ((m = new RegExp(`^${NUM}\\s*kg$`).exec(s))) return { load: toNumber(m[1]), loadUnit: 'kg' };
  if (/^(bw|kroppsvikt|bodyweight)$/.test(s)) return { loadUnit: 'bodyweight' };
  if (/^(band|gummiband)$/.test(s)) return { loadUnit: 'band' };
  return null;
}

function parseCore(s: string): SchemeResult | null {
  let m: RegExpExecArray | null;

  // "10 min", "30 s" – a single timed block.
  if ((m = new RegExp(`^${NUM}\\s*(km|${SECONDS.source.slice(1, -1)}|${MINUTES.source.slice(1, -1)})$`).exec(s))) {
    const value = toNumber(m[1])!;
    const unit = m[2]!;
    if (unit === 'km') return value > 0 ? { kind: 'distance', distanceKm: value } : null;
    const sec = unitToSeconds(value, unit);
    return sec != null && sec > 0 ? { kind: 'duration', durationSec: sec } : null;
  }

  // "1RM", "1-3RM"
  if ((m = /^(\d+)(?:\s*-\s*(\d+))?\s*rm$/.exec(s))) {
    const reps = toNumber(m[1])!;
    const repsMax = toNumber(m[2]);
    if (reps < 1 || (repsMax != null && repsMax < reps)) return null;
    return { kind: 'exercise', repScheme: 'rm', reps, ...(repsMax != null ? { repsMax } : {}) };
  }

  // "toppset 3 reps", "top set 3"
  if ((m = /^(?:toppset|top set|topset)\s+(\d+)(?:\s*(?:reps?|rep))?$/.exec(s))) {
    const reps = toNumber(m[1])!;
    return reps > 0 ? { kind: 'exercise', sets: 1, reps, repScheme: 'fixed' } : null;
  }

  // "4x12", "3x8-10", "4xamrap", "3x20 s", "2x5 min"
  if ((m = /^(\d+)\s*x\s*(.+)$/.exec(s))) {
    const sets = toNumber(m[1])!;
    if (sets < 1) return null;
    const rest = m[2]!.trim();

    if (/^(amrap|max)$/.test(rest)) return { kind: 'exercise', sets, repScheme: 'amrap' };

    let r: RegExpExecArray | null;
    if ((r = new RegExp(`^${NUM}\\s*([a-zå]+)$`).exec(rest))) {
      const sec = unitToSeconds(toNumber(r[1])!, r[2]!);
      if (sec != null && sec > 0) return { kind: 'exercise', sets, repScheme: 'time', durationSec: sec };
      if (/^reps?$/.test(r[2]!)) {
        const reps = toNumber(r[1])!;
        return reps > 0 ? { kind: 'exercise', sets, reps, repScheme: 'fixed' } : null;
      }
      return null;
    }
    if ((r = /^(\d+)\s*-\s*(\d+)$/.exec(rest))) {
      const reps = toNumber(r[1])!;
      const repsMax = toNumber(r[2])!;
      if (reps < 1 || repsMax < reps) return null;
      return { kind: 'exercise', sets, reps, repsMax, repScheme: 'range' };
    }
    if ((r = /^(\d+)$/.exec(rest))) {
      const reps = toNumber(r[1])!;
      return reps > 0 ? { kind: 'exercise', sets, reps, repScheme: 'fixed' } : null;
    }
    return null;
  }

  // "3 reps"
  if ((m = /^(\d+)\s*reps?$/.exec(s))) {
    const reps = toNumber(m[1])!;
    return reps > 0 ? { kind: 'exercise', sets: 1, reps, repScheme: 'fixed' } : null;
  }

  return null;
}
