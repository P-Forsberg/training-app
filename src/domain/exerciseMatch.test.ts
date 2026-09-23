import { describe, expect, it } from 'vitest';
import { buildExerciseIndex, matchExercise } from './exerciseMatch';

const index = buildExerciseIndex([
  { id: 'dl', canonicalName: 'Trap Bar Deadlift', aliases: ['Hex Bar Deadlift'] },
  { id: 'dips', canonicalName: 'Dips', aliases: [] },
  { id: 'squat', canonicalName: 'Back Squat', aliases: ['Knäböj'] },
  { id: 'pu', canonicalName: 'Pull-Ups', aliases: ['Chin-Ups'] },
  { id: 'fp', canonicalName: 'Face Pull', aliases: [] },
]);

describe('matchExercise', () => {
  it('matches canonical names and aliases exactly, ignoring case and diacritics', () => {
    expect(matchExercise('trap bar deadlift', index)).toEqual({ exercise: expect.objectContaining({ id: 'dl' }), exact: true });
    expect(matchExercise('KNABOJ', index)?.exercise.id).toBe('squat');
  });

  it('ignores parenthetical notes', () => {
    expect(matchExercise('Trap Bar Deadlift (låga handtag)', index)).toMatchObject({ exercise: { id: 'dl' }, exact: false });
  });

  it('tries each side of a slash', () => {
    expect(matchExercise('Weighted Dips / Dips', index)?.exercise.id).toBe('dips');
  });

  it('singular and plural', () => {
    expect(matchExercise('Face Pulls', index)?.exercise.id).toBe('fp');
    expect(matchExercise('Chin-Up', index)?.exercise.id).toBe('pu');
  });

  it('unknown names return undefined', () => {
    expect(matchExercise('JM Press', index)).toBeUndefined();
  });
});
