import type Anthropic from 'npm:@anthropic-ai/sdk@0';

const item = {
  type: 'object',
  description: 'En rad i ett pass. rawText är raden som användaren ser, till exempel "Goblet Squat – 3×10".',
  properties: {
    rawText: { type: 'string' },
    kind: { type: 'string', enum: ['distance', 'duration', 'exercise'] },
    exerciseName: { type: 'string' },
    sets: { type: 'integer', minimum: 1 },
    reps: { type: 'integer', minimum: 1 },
    repsMax: { type: 'integer', minimum: 1 },
    repScheme: { type: 'string', enum: ['fixed', 'range', 'amrap', 'rm', 'time'] },
    load: { type: 'number' },
    loadUnit: { type: 'string', enum: ['kg', 'percent', 'rpe', 'bodyweight', 'band'] },
    perSide: { type: 'boolean' },
    distanceKm: { type: 'number', minimum: 0 },
    durationSec: { type: 'integer', minimum: 0 },
    parseConfidence: { type: 'number', minimum: 0, maximum: 1, description: 'Bara vid bildimport: hur säker tolkningen är.' },
  },
  required: ['rawText', 'kind'],
} as const;

const sessionType = { type: 'string', enum: ['run', 'strength', 'other', 'rest'] } as const;
const date = { type: 'string', description: 'Datum som ÅÅÅÅ-MM-DD.' } as const;
const rationale = { type: 'string', description: 'Kort motivering som visas för användaren.' } as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'getContext',
    description: 'Hämtar planerade och loggade pass för ett datumintervall (högst 120 dagar).',
    input_schema: { type: 'object', properties: { from: date, to: date }, required: ['from', 'to'] },
  },
  {
    name: 'proposeSessionEdit',
    description:
      'Föreslår en ändring av ett planerat pass. Skapar ett förslag som användaren godkänner. Utelämna fält som inte ändras. items ersätter hela passets innehåll.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        rationale,
        patch: {
          type: 'object',
          properties: { date, title: { type: 'string' }, notes: { type: 'string' }, type: sessionType, items: { type: 'array', items: item } },
        },
      },
      required: ['sessionId', 'rationale', 'patch'],
    },
  },
  {
    name: 'proposeWeekEdit',
    description:
      'Föreslår ändringar i en hel programvecka. Varje post i sessions ändrar ett befintligt pass (sessionId), tar bort det (remove: true) eller lägger till ett nytt (utan sessionId).',
    input_schema: {
      type: 'object',
      properties: {
        weekNo: { type: 'integer' },
        rationale,
        focusText: { type: 'string' },
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              remove: { type: 'boolean' },
              date,
              type: sessionType,
              title: { type: 'string' },
              items: { type: 'array', items: item },
            },
          },
        },
      },
      required: ['weekNo', 'rationale', 'sessions'],
    },
  },
  {
    name: 'proposeProgramShift',
    description: 'Föreslår att hela programmet flyttas ett antal veckor framåt (positivt) eller bakåt (negativt).',
    input_schema: { type: 'object', properties: { weeks: { type: 'integer' }, rationale }, required: ['weeks', 'rationale'] },
  },
  {
    name: 'generateSession',
    description: 'Skriver ihop ett enskilt pass för ett datum. Blir ett förslag som användaren godkänner.',
    input_schema: {
      type: 'object',
      properties: { date, rationale, type: sessionType, title: { type: 'string' }, items: { type: 'array', items: item, minItems: 1 } },
      required: ['date', 'rationale', 'type', 'title', 'items'],
    },
  },
  {
    name: 'generateProgram',
    description:
      'Skriver ett helt program. Resultatet granskas av användaren i samma vy som en filimport innan något sparas. Varje vecka börjar på en måndag.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        startDate: date,
        raceDate: date,
        discipline: { type: 'string' },
        weeks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weekNo: { type: 'integer', minimum: 1 },
              startDate: date,
              phase: { type: 'string' },
              focusText: { type: 'string' },
              sessions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { date, type: sessionType, title: { type: 'string' }, items: { type: 'array', items: item } },
                  required: ['date', 'type', 'items'],
                },
              },
            },
            required: ['weekNo', 'startDate', 'sessions'],
          },
        },
      },
      required: ['name', 'startDate', 'weeks'],
    },
  },
  {
    name: 'suggestLoad',
    description: 'Hämtar användarens senaste set och beräknat 1RM för en övning, som underlag för ett viktförslag.',
    input_schema: { type: 'object', properties: { exerciseName: { type: 'string' } }, required: ['exerciseName'] },
  },
];

/** Tool used only for image/PDF import: the model must return the program through it. */
export const SUBMIT_PROGRAM_TOOL: Anthropic.Tool = {
  ...TOOLS.find((t) => t.name === 'generateProgram')!,
  name: 'submitProgram',
  description:
    'Lämnar över programmet som lästs ut ur bilderna. Sätt parseConfidence (0–1) på varje rad; under 1 när du är osäker på texten eller tolkningen.',
};
