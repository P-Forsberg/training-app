import { normalizeExerciseName } from './exerciseParser';

export interface SearchableExercise {
  id: string;
  canonicalName: string;
  aliases: string[];
}

/**
 * Ranks exercises for a search box: exact name/alias, then names starting
 * with the query, then a word starting with it, then any substring.
 */
export function searchExercises<T extends SearchableExercise>(query: string, exercises: T[], limit = 20): T[] {
  const q = normalizeExerciseName(query);
  if (!q) return [];
  const scored: { e: T; score: number; name: string }[] = [];
  for (const e of exercises) {
    let best = Infinity;
    for (const n of [e.canonicalName, ...e.aliases]) {
      const name = normalizeExerciseName(n);
      let s = Infinity;
      if (name === q) s = 0;
      else if (name.startsWith(q)) s = 1;
      else if (name.split(/[\s/-]+/).some((w) => w.startsWith(q))) s = 2;
      else if (name.includes(q)) s = 3;
      // Aliases rank just below the canonical name at the same level.
      if (n !== e.canonicalName) s += 0.5;
      best = Math.min(best, s);
    }
    if (best < Infinity) scored.push({ e, score: best, name: e.canonicalName });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'sv'))
    .slice(0, limit)
    .map((x) => x.e);
}
