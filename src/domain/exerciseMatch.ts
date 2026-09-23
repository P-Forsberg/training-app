import { normalizeExerciseName } from './exerciseParser';

export interface MatchableExercise {
  id: string;
  canonicalName: string;
  aliases: string[];
}

/** Builds a lookup from normalized name/alias to exercise. */
export function buildExerciseIndex<T extends MatchableExercise>(exercises: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const e of exercises) {
    for (const n of [e.canonicalName, ...e.aliases]) {
      const key = normalizeExerciseName(n);
      if (key && !index.has(key)) index.set(key, e);
    }
  }
  return index;
}

/** Name variants tried in order: exact, without parentheses, each side of "/", singular/plural. */
function candidates(name: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const n = normalizeExerciseName(s);
    if (n && !out.includes(n)) out.push(n);
  };
  push(name);
  const noParens = name.replace(/\([^)]*\)/g, ' ');
  push(noParens);
  for (const part of noParens.split('/')) push(part);
  for (const c of [...out]) {
    if (c.endsWith('s')) push(c.slice(0, -1));
    else push(c + 's');
  }
  return out;
}

/** Returns the matching exercise, or undefined. `exact` is false for fuzzy variants. */
export function matchExercise<T extends MatchableExercise>(
  name: string,
  index: Map<string, T>,
): { exercise: T; exact: boolean } | undefined {
  const cs = candidates(name);
  for (let i = 0; i < cs.length; i++) {
    const hit = index.get(cs[i]!);
    if (hit) return { exercise: hit, exact: i === 0 };
  }
  return undefined;
}
