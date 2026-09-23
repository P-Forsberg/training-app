import { describe, expect, it } from 'vitest';
import { normalizeExerciseName, parseExerciseCell, parseExerciseLine } from './exerciseParser';

describe('parseExerciseLine – documented formats', () => {
  it('Box Squat – 1–3RM', () => {
    expect(parseExerciseLine('Box Squat – 1–3RM')).toMatchObject({
      kind: 'exercise',
      exerciseName: 'Box Squat',
      repScheme: 'rm',
      reps: 1,
      repsMax: 3,
      parseConfidence: 1,
    });
  });

  it('Speed Bench – 8×3 @70%', () => {
    expect(parseExerciseLine('Speed Bench – 8×3 @70%')).toMatchObject({
      exerciseName: 'Speed Bench',
      sets: 8,
      reps: 3,
      repScheme: 'fixed',
      load: 70,
      loadUnit: 'percent',
      parseConfidence: 1,
    });
  });

  it('Leg Curl – 4×12', () => {
    expect(parseExerciseLine('Leg Curl – 4×12')).toMatchObject({
      exerciseName: 'Leg Curl',
      sets: 4,
      reps: 12,
      repScheme: 'fixed',
      perSide: false,
    });
  });

  it('Trap Bar Deadlift – 3×3 @80%', () => {
    expect(parseExerciseLine('Trap Bar Deadlift – 3×3 @80%')).toMatchObject({
      exerciseName: 'Trap Bar Deadlift',
      sets: 3,
      reps: 3,
      load: 80,
      loadUnit: 'percent',
    });
  });

  it('Pull-Ups – 4×AMRAP keeps the hyphen in the name', () => {
    const r = parseExerciseLine('Pull-Ups – 4×AMRAP');
    expect(r).toMatchObject({ exerciseName: 'Pull-Ups', sets: 4, repScheme: 'amrap', parseConfidence: 1 });
    expect(r?.reps).toBeUndefined();
  });

  it('Bulgarian Split Squat – 3×10/ben', () => {
    expect(parseExerciseLine('Bulgarian Split Squat – 3×10/ben')).toMatchObject({
      exerciseName: 'Bulgarian Split Squat',
      sets: 3,
      reps: 10,
      perSide: true,
    });
  });

  it('Copenhagen Plank – 3×20 s/sida', () => {
    expect(parseExerciseLine('Copenhagen Plank – 3×20 s/sida')).toMatchObject({
      exerciseName: 'Copenhagen Plank',
      sets: 3,
      repScheme: 'time',
      durationSec: 20,
      perSide: true,
      parseConfidence: 1,
    });
  });

  it('Step-down – 3×8/ben', () => {
    expect(parseExerciseLine('Step-down – 3×8/ben')).toMatchObject({
      exerciseName: 'Step-down',
      sets: 3,
      reps: 8,
      perSide: true,
    });
  });

  it('Overhead Press – toppset 3 reps @RPE 8', () => {
    expect(parseExerciseLine('Overhead Press – toppset 3 reps @RPE 8')).toMatchObject({
      exerciseName: 'Overhead Press',
      sets: 1,
      reps: 3,
      repScheme: 'fixed',
      load: 8,
      loadUnit: 'rpe',
      parseConfidence: 1,
    });
  });

  it('Rörlighet – 10 min is a duration item', () => {
    expect(parseExerciseLine('Rörlighet – 10 min')).toMatchObject({
      kind: 'duration',
      exerciseName: 'Rörlighet',
      durationSec: 600,
      parseConfidence: 1,
    });
  });

  it('"-" means no session', () => {
    expect(parseExerciseLine('-')).toBeNull();
    expect(parseExerciseLine(' – ')).toBeNull();
    expect(parseExerciseLine('')).toBeNull();
  });
});

describe('parseExerciseLine – separator and multiplication variants', () => {
  it.each([
    'Leg Curl - 4x12',
    'Leg Curl – 4x12',
    'Leg Curl - 4×12',
    'Leg Curl — 4 × 12',
    'Leg Curl – 4X12',
    'Leg Curl: 4x12',
  ])('%s', (line) => {
    expect(parseExerciseLine(line)).toMatchObject({ exerciseName: 'Leg Curl', sets: 4, reps: 12 });
  });

  it('hyphen range in reps: 3x8-10', () => {
    expect(parseExerciseLine('Rows - 3x8-10')).toMatchObject({
      sets: 3,
      reps: 8,
      repsMax: 10,
      repScheme: 'range',
    });
  });

  it('hyphenated name with hyphen separator: Step-down - 3x8/ben', () => {
    expect(parseExerciseLine('Step-down - 3x8/ben')).toMatchObject({ exerciseName: 'Step-down', sets: 3, reps: 8 });
  });

  it('kg load with decimal comma', () => {
    expect(parseExerciseLine('Hip Thrust – 3×8 @ 102,5 kg')).toMatchObject({ load: 102.5, loadUnit: 'kg' });
  });

  it('seconds variants', () => {
    expect(parseExerciseLine('Plank – 3×45s')).toMatchObject({ durationSec: 45, repScheme: 'time' });
    expect(parseExerciseLine('Plank – 3×45 sek')).toMatchObject({ durationSec: 45, repScheme: 'time' });
  });

  it('per side in English', () => {
    expect(parseExerciseLine('Lunges – 3×10/side')).toMatchObject({ perSide: true });
  });

  it('distance item', () => {
    expect(parseExerciseLine('Uppvärmning – 2 km')).toMatchObject({ kind: 'distance', distanceKm: 2 });
  });

  it('1RM single', () => {
    expect(parseExerciseLine('Deadlift – 1RM')).toMatchObject({ repScheme: 'rm', reps: 1 });
    expect(parseExerciseLine('Deadlift – 1RM')?.repsMax).toBeUndefined();
  });

  it('percent range load keeps the lower bound: Speed Squat – 6×2 @70–75%', () => {
    expect(parseExerciseLine('Speed Squat – 6×2 @70–75%')).toMatchObject({
      sets: 6,
      reps: 2,
      load: 70,
      loadUnit: 'percent',
      parseConfidence: 1,
    });
  });

  it('names with slash and parentheses', () => {
    expect(parseExerciseLine('Weighted Dips / CGBP – 3RM')).toMatchObject({
      exerciseName: 'Weighted Dips / CGBP',
      repScheme: 'rm',
      reps: 3,
    });
    expect(parseExerciseLine('Trap Bar Deadlift (låga handtag) – 4×5')).toMatchObject({
      exerciseName: 'Trap Bar Deadlift (låga handtag)',
      sets: 4,
      reps: 5,
    });
  });

  it('keeps raw text', () => {
    expect(parseExerciseLine('  Leg Curl – 4×12  ')?.rawText).toBe('Leg Curl – 4×12');
  });
});

describe('parseExerciseLine – broken input never throws', () => {
  it.each([
    'Knäböj',
    'Box Squat –',
    '– 4×12',
    '4×',
    '???',
    'Squat – lots of reps maybe',
    'x'.repeat(5000),
    'Bench – 0×0',
    'Bench – 4×12 @',
    '\u0000\u0001',
  ])('%j', (line) => {
    expect(() => parseExerciseLine(line)).not.toThrow();
    const r = parseExerciseLine(line);
    if (r) {
      expect(r.parseConfidence).toBeLessThan(1);
      expect(r.rawText.length).toBeGreaterThan(0);
    }
  });

  it('name without scheme keeps the name at reduced confidence', () => {
    expect(parseExerciseLine('Knäböj')).toMatchObject({
      kind: 'exercise',
      exerciseName: 'Knäböj',
      rawText: 'Knäböj',
      parseConfidence: 0.5,
    });
  });

  it('unparseable scheme keeps name, raw text and low confidence', () => {
    const r = parseExerciseLine('Squat – lots of reps maybe');
    expect(r).toMatchObject({ exerciseName: 'Squat', rawText: 'Squat – lots of reps maybe' });
    expect(r!.parseConfidence).toBeLessThan(1);
  });

  it('non-string input is treated as empty', () => {
    expect(parseExerciseLine(undefined as unknown as string)).toBeNull();
    expect(parseExerciseLine(42 as unknown as string)).toMatchObject({ rawText: '42' });
  });
});

describe('parseExerciseCell', () => {
  it('splits on line breaks and skips empty lines', () => {
    const items = parseExerciseCell('Box Squat – 1–3RM\r\n\nLeg Curl – 4×12\nPull-Ups – 4×AMRAP');
    expect(items.map((i) => i.exerciseName)).toEqual(['Box Squat', 'Leg Curl', 'Pull-Ups']);
  });

  it('"-" cell is an empty session', () => {
    expect(parseExerciseCell('-')).toEqual([]);
    expect(parseExerciseCell(null)).toEqual([]);
  });
});

describe('normalizeExerciseName', () => {
  it('lowercases, strips diacritics, unifies dashes and whitespace', () => {
    expect(normalizeExerciseName('  Knäböj  ')).toBe('knaboj');
    expect(normalizeExerciseName('Pull–Ups')).toBe('pull-ups');
    expect(normalizeExerciseName('Box   Squat')).toBe('box squat');
  });
});
