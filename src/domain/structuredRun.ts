/**
 * Quality sessions written as "Typ: huvuddel. N km uppvärmning, M km nedjogg".
 * Anything else (easy, progressive, steady runs) is one continuous run and
 * returns null. Never throws.
 */

export interface StructuredRun {
  /** The label before the colon, as written: "Intervaller", "Backar", "Tempo". */
  type: string;
  /** The main set as written, without the trailing period. */
  main: string;
  warmupKm: number;
  cooldownKm: number;
  /** Number of work bouts ("6×2 min" → 6). */
  reps?: number;
  /** Minutes per work bout ("6×2 min" → 2). */
  workMin?: number;
  /** Minutes of recovery ("2 min trav" / "2 min vila"). */
  restMin?: number;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const SHAPE = new RegExp(String.raw`^([A-Za-zÅÄÖåäö ]+):\s*(.+?)\.\s*${NUM}\s*km uppvärmning,\s*${NUM}\s*km nedjogg`);
const REPS = /(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*min/;
const REST = /(\d+(?:[.,]\d+)?)\s*min\s*(?:trav|vila)/;
const MAX_LEN = 1000;

const num = (s: string) => Number(s.replace(',', '.'));

export function parseStructuredRun(text: string | null | undefined): StructuredRun | null {
  try {
    if (typeof text !== 'string') return null;
    const t = text.trim();
    if (!t || t.length > MAX_LEN) return null;
    const m = SHAPE.exec(t);
    if (!m) return null;
    const type = m[1]!.trim();
    const main = m[2]!.trim();
    if (!type || !main) return null;
    const out: StructuredRun = { type, main, warmupKm: num(m[3]!), cooldownKm: num(m[4]!) };
    const reps = REPS.exec(main);
    if (reps) {
      out.reps = Number(reps[1]);
      out.workMin = num(reps[2]!);
    }
    // Recovery is only read after the work bouts, so "6×2 min" is never taken as rest.
    const afterReps = reps ? main.slice(reps.index + reps[0].length) : main;
    const rest = REST.exec(afterReps);
    if (rest) out.restMin = num(rest[1]!);
    return out;
  } catch {
    return null;
  }
}

/** Short description of the main set for the row label: "6×2 min / 2 min". */
export function mainSummary(s: StructuredRun): string {
  if (s.reps && s.workMin) return `${s.reps}×${s.workMin} min${s.restMin ? ` / ${s.restMin} min` : ''}`;
  return s.main;
}
