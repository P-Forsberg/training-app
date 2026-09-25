import { addDaysIso } from './dates';
import type { IsoDate } from './types';

/**
 * What kind of run a planned run is (easy, tempo, …). Nothing is assumed from
 * weekdays: the intent is read from the program's own text (week focus, day
 * notes) or from a title the user set. Unknown stays unknown.
 */

export type RunIntent = 'easy' | 'tempo' | 'interval' | 'fartlek' | 'hills' | 'progressive' | 'long';

export interface IntentInfo {
  intent: RunIntent;
  /** Workout detail from the text, e.g. "3x6 min". */
  detail?: string;
  /** title: set by the user · text: read from the program · default: see OTHER_RUNS_EASY */
  source: 'title' | 'text' | 'default';
}

export const INTENT_LABEL: Record<RunIntent, string> = {
  easy: 'Lugnt',
  tempo: 'Tempo',
  interval: 'Intervall',
  fartlek: 'Fartlek',
  hills: 'Backe',
  progressive: 'Progressivt',
  long: 'Långpass',
};

export const QUALITY: ReadonlySet<RunIntent> = new Set(['tempo', 'interval', 'fartlek', 'hills', 'progressive']);

/**
 * When the week's text names quality sessions on specific days, the remaining
 * runs that week are shown as easy. This is an interpretation of how such
 * plans are written; switch it off here if a plan uses a different convention.
 */
export const OTHER_RUNS_EASY = true;

const L = String.raw`(?<!\p{L})`;
const R = String.raw`(?!\p{L})`;
const word = (alts: string) => new RegExp(`${L}(?:${alts})${R}`, 'giu');

const KEYWORDS: [RunIntent, RegExp][] = [
  ['tempo', word('tempo|tempopass|tröskel|tröskelpass')],
  ['interval', word('intervall|intervaller|intervallpass')],
  ['fartlek', word('fartlek|fartpass|fartpasset')],
  ['hills', word('backe|backar|backintervall|backintervaller|backlöpning')],
  ['progressive', word('progressivt|progressiv|progressivpass')],
  ['long', word('långpass|långpasset')],
  ['easy', word('lugnt|lugn|lugna|återhämtning|återhämtningspass')],
];

const WEEKDAYS: [number, RegExp][] = [
  [0, word('mån|måndag')],
  [1, word('tis|tisdag')],
  [2, word('ons|onsdag')],
  [3, word('tor|tors|torsdag')],
  [4, word('fre|fredag')],
  [5, word('lör|lördag')],
  [6, word('sön|söndag')],
];

const MEASURE = /\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:min|sek|s|km|m)\b|\d+(?:[.,]\d+)?\s*(?:km|min)\b/iu;

interface Hit {
  intent: RunIntent;
  at: number;
}

function matches<T>(sentence: string, table: [T, RegExp][]): { value: T; at: number }[] {
  const out: { value: T; at: number }[] = [];
  for (const [value, re] of table) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence))) out.push({ value, at: m.index });
  }
  return out;
}

function sentences(text: string): string[] {
  return text
    .split(/[.;!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Title written by the "Passtyp" menu (or by hand) → intent. */
export function intentFromTitle(title: string | null | undefined): RunIntent | undefined {
  if (!title) return undefined;
  const t = title.trim().toLowerCase();
  return (Object.keys(INTENT_LABEL) as RunIntent[]).find((k) => INTENT_LABEL[k].toLowerCase() === t);
}

export interface RunRef {
  id: string;
  date: IsoDate;
  title: string | null;
}

export function deriveRunIntents(input: {
  monday: IsoDate;
  weekTexts: (string | null | undefined)[];
  dayNotes: Record<IsoDate, string>;
  runs: RunRef[];
}): Map<string, IntentInfo> {
  const byDate = new Map<IsoDate, IntentInfo>();
  let weekEasy = false;
  let namedQuality = false;

  const put = (date: IsoDate, info: IntentInfo) => {
    const prev = byDate.get(date);
    // A named quality session beats an easy mention on the same day.
    if (!prev || (prev.intent === 'easy' && info.intent !== 'easy')) byDate.set(date, info);
  };

  const read = (text: string, defaultDate?: IsoDate) => {
    for (const s of sentences(text)) {
      const kws: Hit[] = matches(s, KEYWORDS).map((m) => ({ intent: m.value, at: m.at }));
      if (!kws.length) continue;
      const days = matches(s, WEEKDAYS);
      const measure = MEASURE.exec(s)?.[0];
      for (const kw of kws) {
        const detail = kw.intent !== 'easy' && measure ? measure : undefined;
        let date = defaultDate;
        if (days.length) {
          // Pair the keyword with the nearest weekday in the same sentence.
          const nearest = days.reduce((a, b) => (Math.abs(b.at - kw.at) < Math.abs(a.at - kw.at) ? b : a));
          date = addDaysIso(input.monday, nearest.value);
        }
        if (date) {
          put(date, { intent: kw.intent, ...(detail ? { detail } : {}), source: 'text' });
          if (QUALITY.has(kw.intent)) namedQuality = true;
        } else if (kw.intent === 'easy' && !kws.some((k) => k.intent !== 'easy')) {
          weekEasy = true;
        }
      }
    }
  };

  for (const t of input.weekTexts) if (t) read(t);
  for (const [date, note] of Object.entries(input.dayNotes)) read(note, date);

  const out = new Map<string, IntentInfo>();
  for (const r of input.runs) {
    const fromTitle = intentFromTitle(r.title);
    if (fromTitle) {
      out.set(r.id, { intent: fromTitle, source: 'title' });
      continue;
    }
    const fromText = byDate.get(r.date);
    if (fromText) out.set(r.id, fromText);
    else if (weekEasy) out.set(r.id, { intent: 'easy', source: 'text' });
    else if (OTHER_RUNS_EASY && namedQuality) out.set(r.id, { intent: 'easy', source: 'default' });
  }
  return out;
}
