import { describe, expect, it } from 'vitest';
import { searchExercises } from './exerciseSearch';

const catalog = [
  { id: 'dbrow', canonicalName: 'Dumbbell Row', aliases: ['Hantelrodd', 'DB Row', 'One-Arm Row'] },
  { id: 'bbrow', canonicalName: 'Barbell Row', aliases: ['Skivstångsrodd', 'Bent-Over Row'] },
  { id: 'cable', canonicalName: 'Seated Cable Row', aliases: ['Sittande rodd'] },
  { id: 'land', canonicalName: 'Landmine Row', aliases: [] },
  { id: 'squat', canonicalName: 'Back Squat', aliases: ['Knäböj'] },
];

describe('searchExercises', () => {
  it('finds by name and alias, ignoring case and diacritics', () => {
    expect(searchExercises('landmine', catalog).map((e) => e.id)).toEqual(['land']);
    expect(searchExercises('KNABOJ', catalog).map((e) => e.id)).toEqual(['squat']);
    expect(searchExercises('hantel', catalog).map((e) => e.id)).toEqual(['dbrow']);
  });

  it('ranks exact, then prefix, then word prefix, then substring', () => {
    // All match on a word starting with "row": same level, alphabetical.
    expect(searchExercises('row', catalog).map((e) => e.id)).toEqual(['bbrow', 'dbrow', 'land', 'cable']);
    // A name starting with the query beats a word inside the name.
    expect(searchExercises('seated', catalog).map((e) => e.id)).toEqual(['cable']);
    expect(searchExercises('land', catalog)[0]!.id).toBe('land');
    expect(searchExercises('barbell row', catalog)[0]!.id).toBe('bbrow');
  });

  it('empty query returns nothing; no match returns nothing', () => {
    expect(searchExercises('', catalog)).toEqual([]);
    expect(searchExercises('zzz', catalog)).toEqual([]);
  });

  it('limits the result', () => {
    expect(searchExercises('r', catalog, 2)).toHaveLength(2);
  });
});
