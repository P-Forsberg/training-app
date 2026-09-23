// AI Edge Function. Holds the Anthropic key (secret ANTHROPIC_API_KEY), checks
// the user's JWT, enforces a monthly quota, runs tool calls and stores plan
// changes as rows in `proposals`. It never writes to planned_* tables.
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { SYSTEM_PROMPT } from './prompt.ts';
import { SUBMIT_PROGRAM_TOOL, TOOLS } from './tools.ts';

const MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 6;
/** Monthly limits per user. Change here; see ASSUMPTIONS.md. */
const MONTHLY_REQUESTS = 200;
const MONTHLY_TOKENS = 2_000_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Json = Record<string, unknown>;
type Row = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const nowIso = () => new Date().toISOString();
const isoDow = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const mondayOf = (date: string) => addDays(date, -(isoDow(date) - 1));

interface Ctx {
  user: { id: string };
  db: SupabaseClient;
  activeProgramId: string | null;
  prompt: string;
  proposals: Row[];
  program: Json | null;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function base(owner: string): Row {
  const ts = nowIso();
  return { id: crypto.randomUUID(), owner, created_at: ts, updated_at: ts, deleted_at: null };
}

interface ItemInput {
  rawText: string;
  kind: 'distance' | 'duration' | 'exercise';
  exerciseName?: string;
  sets?: number;
  reps?: number;
  repsMax?: number;
  repScheme?: string;
  load?: number;
  loadUnit?: string;
  perSide?: boolean;
  distanceKm?: number;
  durationSec?: number;
  parseConfidence?: number;
}

function itemRow(owner: string, programId: string, sessionId: string, item: ItemInput, sort: number): Row {
  return {
    ...base(owner),
    program_id: programId,
    planned_session_id: sessionId,
    sort,
    kind: item.kind,
    exercise_id: null, // resolved on the client against the exercise catalog when accepted
    raw_text: String(item.rawText ?? '').slice(0, 500),
    sets: item.sets ?? null,
    reps: item.reps ?? null,
    reps_max: item.repsMax ?? null,
    rep_scheme: item.repScheme ?? null,
    load: item.load ?? null,
    load_unit: item.loadUnit ?? null,
    per_side: item.perSide ?? false,
    distance_km: item.distanceKm ?? null,
    duration_sec: item.durationSec ?? null,
    parse_confidence: 1,
  };
}

interface Op {
  entity: string;
  entityId: string;
  op: 'insert' | 'update' | 'delete';
  before: Row | null;
  after: Row | null;
}

const insertOp = (entity: string, row: Row): Op => ({ entity, entityId: row.id as string, op: 'insert', before: null, after: row });
const updateOp = (entity: string, before: Row, patch: Row): Op => ({ entity, entityId: before.id as string, op: 'update', before, after: { ...before, ...patch } });
const deleteOp = (entity: string, before: Row): Op => ({ entity, entityId: before.id as string, op: 'delete', before, after: { ...before, deleted_at: nowIso() } });

async function saveProposal(ctx: Ctx, programId: string | null, rationale: string, ops: Op[]): Promise<string> {
  if (!ops.length) return 'Förslaget innehöll inga ändringar och sparades inte.';
  const { data, error } = await ctx.db
    .from('proposals')
    .insert({ owner: ctx.user.id, program_id: programId, prompt: ctx.prompt.slice(0, 2000), rationale, diff: { ops }, status: 'pending' })
    .select()
    .single();
  if (error) return `Förslaget kunde inte sparas: ${error.message}`;
  ctx.proposals.push(data);
  return `Förslaget är sparat (${ops.length} ändringar) och visas för användaren för godkännande.`;
}

async function sessionWithItems(ctx: Ctx, sessionId: string) {
  const { data: session } = await ctx.db.from('planned_sessions').select('*').eq('id', sessionId).is('deleted_at', null).maybeSingle();
  if (!session) return null;
  const { data: items } = await ctx.db.from('planned_items').select('*').eq('planned_session_id', sessionId).is('deleted_at', null);
  return { session: session as Row, items: (items ?? []) as Row[] };
}

function replaceItemsOps(ctx: Ctx, programId: string, sessionId: string, oldItems: Row[], items: ItemInput[]): Op[] {
  return [
    ...oldItems.map((i) => deleteOp('planned_items', i)),
    ...items.map((it, n) => insertOp('planned_items', itemRow(ctx.user.id, programId, sessionId, it, n))),
  ];
}

async function weekIdFor(ctx: Ctx, programId: string, date: string): Promise<string | null> {
  const { data } = await ctx.db
    .from('program_weeks')
    .select('id')
    .eq('program_id', programId)
    .eq('start_date', mondayOf(date))
    .is('deleted_at', null)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

async function getContext(ctx: Ctx, input: Json): Promise<unknown> {
  const { from, to } = input;
  if (!isDate(from) || !isDate(to) || to < from) return { error: 'Ange from och to som ÅÅÅÅ-MM-DD, med to efter from.' };
  if (Date.parse(to) - Date.parse(from) > 120 * 86_400_000) return { error: 'Intervallet får vara högst 120 dagar.' };
  let planned: Row[] = [];
  if (ctx.activeProgramId) {
    const { data } = await ctx.db
      .from('planned_sessions')
      .select('id, date, type, title, notes, planned_items(raw_text, kind, distance_km, deleted_at)')
      .eq('program_id', ctx.activeProgramId)
      .gte('date', from)
      .lte('date', to)
      .is('deleted_at', null)
      .order('date');
    planned = (data ?? []) as Row[];
  }
  const { data: logged } = await ctx.db
    .from('logged_sessions')
    .select('date, type, status, feel, rpe, comment, planned_session_id, logged_runs(distance_km, duration_sec, surface), logged_sets(set_no, weight_kg, reps, rpe, skipped)')
    .gte('date', from)
    .lte('date', to)
    .is('deleted_at', null)
    .order('date');
  return {
    planned: planned.map((p) => ({
      ...p,
      planned_items: ((p.planned_items as Row[]) ?? []).filter((i) => !i.deleted_at).map((i) => i.raw_text),
    })),
    logged: logged ?? [],
  };
}

async function proposeSessionEdit(ctx: Ctx, input: Json): Promise<string> {
  const found = await sessionWithItems(ctx, String(input.sessionId ?? ''));
  if (!found) return 'Passet finns inte. Använd ett sessionId från kontexten.';
  const patch = (input.patch ?? {}) as Json;
  const sessionPatch: Row = {};
  if (patch.date !== undefined) {
    if (!isDate(patch.date)) return 'date måste vara ÅÅÅÅ-MM-DD.';
    sessionPatch.date = patch.date;
    sessionPatch.day_of_week = isoDow(patch.date);
    sessionPatch.program_week_id = await weekIdFor(ctx, found.session.program_id as string, patch.date);
  }
  for (const k of ['title', 'notes', 'type'] as const) if (patch[k] !== undefined) sessionPatch[k] = patch[k];
  const ops: Op[] = [];
  if (Object.keys(sessionPatch).length) ops.push(updateOp('planned_sessions', found.session, sessionPatch));
  if (Array.isArray(patch.items)) {
    ops.push(...replaceItemsOps(ctx, found.session.program_id as string, found.session.id as string, found.items, patch.items as ItemInput[]));
  }
  return saveProposal(ctx, found.session.program_id as string, String(input.rationale ?? ''), ops);
}

async function proposeWeekEdit(ctx: Ctx, input: Json): Promise<string> {
  if (!ctx.activeProgramId) return 'Användaren har inget aktivt program.';
  const programId = ctx.activeProgramId;
  const { data: week } = await ctx.db
    .from('program_weeks')
    .select('*')
    .eq('program_id', programId)
    .eq('week_no', Number(input.weekNo))
    .is('deleted_at', null)
    .maybeSingle();
  if (!week) return `Vecka ${String(input.weekNo)} finns inte i programmet.`;
  const ops: Op[] = [];
  if (typeof input.focusText === 'string') ops.push(updateOp('program_weeks', week, { focus_text: input.focusText }));
  for (const s of (input.sessions ?? []) as Json[]) {
    if (s.sessionId) {
      const found = await sessionWithItems(ctx, String(s.sessionId));
      if (!found) continue;
      if (s.remove) {
        ops.push(deleteOp('planned_sessions', found.session), ...found.items.map((i) => deleteOp('planned_items', i)));
        continue;
      }
      const patch: Row = {};
      if (isDate(s.date)) Object.assign(patch, { date: s.date, day_of_week: isoDow(s.date) });
      for (const k of ['title', 'type'] as const) if (s[k] !== undefined) patch[k] = s[k];
      if (Object.keys(patch).length) ops.push(updateOp('planned_sessions', found.session, patch));
      if (Array.isArray(s.items)) ops.push(...replaceItemsOps(ctx, programId, found.session.id as string, found.items, s.items as ItemInput[]));
    } else {
      if (!isDate(s.date) || !Array.isArray(s.items)) continue;
      const session: Row = {
        ...base(ctx.user.id),
        program_id: programId,
        program_week_id: week.id,
        date: s.date,
        day_of_week: isoDow(s.date),
        type: s.type ?? 'other',
        title: s.title ?? null,
        sort: 10,
        notes: null,
      };
      ops.push(insertOp('planned_sessions', session), ...(s.items as ItemInput[]).map((it, n) => insertOp('planned_items', itemRow(ctx.user.id, programId, session.id as string, it, n))));
    }
  }
  return saveProposal(ctx, programId, String(input.rationale ?? ''), ops);
}

async function proposeProgramShift(ctx: Ctx, input: Json): Promise<string> {
  const weeks = Number(input.weeks);
  if (!ctx.activeProgramId) return 'Användaren har inget aktivt program.';
  if (!Number.isInteger(weeks) || weeks === 0 || Math.abs(weeks) > 52) return 'weeks måste vara ett heltal mellan -52 och 52, inte 0.';
  const days = weeks * 7;
  const [{ data: program }, { data: pw }, { data: sessions }] = await Promise.all([
    ctx.db.from('programs').select('*').eq('id', ctx.activeProgramId).single(),
    ctx.db.from('program_weeks').select('*').eq('program_id', ctx.activeProgramId).is('deleted_at', null),
    ctx.db.from('planned_sessions').select('*').eq('program_id', ctx.activeProgramId).is('deleted_at', null),
  ]);
  if (!program) return 'Programmet finns inte.';
  const ops: Op[] = [
    updateOp('programs', program, { start_date: addDays(program.start_date, days) }),
    ...((pw ?? []) as Row[]).map((w) => {
      const meta = (w.meta ?? {}) as { dayNotes?: Record<string, string> };
      const dayNotes = meta.dayNotes ? Object.fromEntries(Object.entries(meta.dayNotes).map(([d, v]) => [addDays(d, days), v])) : undefined;
      return updateOp('program_weeks', w, { start_date: addDays(w.start_date as string, days), ...(dayNotes ? { meta: { ...meta, dayNotes } } : {}) });
    }),
    ...((sessions ?? []) as Row[]).map((s) => updateOp('planned_sessions', s, { date: addDays(s.date as string, days) })),
  ];
  return saveProposal(ctx, ctx.activeProgramId, String(input.rationale ?? ''), ops);
}

async function generateSession(ctx: Ctx, input: Json): Promise<string> {
  if (!isDate(input.date)) return 'date måste vara ÅÅÅÅ-MM-DD.';
  const items = (input.items ?? []) as ItemInput[];
  if (!items.length) return 'Passet behöver minst en rad.';
  const ops: Op[] = [];
  let programId = ctx.activeProgramId;
  if (!programId) {
    // Users without a program get a container program for their own sessions.
    const program: Row = {
      ...base(ctx.user.id),
      name: 'Egna pass',
      discipline: null,
      start_date: mondayOf(input.date),
      race_date: null,
      weeks: 0,
      source: 'ai',
      source_meta: {},
      schema_version: 1,
      is_template: false,
      is_active: true,
    };
    ops.push(insertOp('programs', program));
    programId = program.id as string;
  }
  const session: Row = {
    ...base(ctx.user.id),
    program_id: programId,
    program_week_id: ctx.activeProgramId ? await weekIdFor(ctx, programId, input.date) : null,
    date: input.date,
    day_of_week: isoDow(input.date),
    type: input.type ?? 'strength',
    title: input.title ?? null,
    sort: 10,
    notes: null,
  };
  ops.push(insertOp('planned_sessions', session), ...items.map((it, n) => insertOp('planned_items', itemRow(ctx.user.id, programId!, session.id as string, it, n))));
  return saveProposal(ctx, programId, String(input.rationale ?? ''), ops);
}

function generateProgram(ctx: Ctx, input: Json): string {
  if (!isDate(input.startDate) || !Array.isArray(input.weeks) || !input.weeks.length) return 'Programmet behöver startDate och minst en vecka.';
  ctx.program = { ...input, source: 'ai' };
  return 'Programmet är skickat till användarens granskningsvy. Sammanfatta det kort.';
}

async function suggestLoad(ctx: Ctx, input: Json): Promise<unknown> {
  const name = String(input.exerciseName ?? '').trim();
  if (!name) return { error: 'Ange exerciseName.' };
  const { data: exercises } = await ctx.db.from('exercises').select('id, canonical_name, aliases').is('deleted_at', null);
  const needle = name.toLowerCase();
  const ids = ((exercises ?? []) as Row[])
    .filter((e) => [e.canonical_name, ...((e.aliases as string[]) ?? [])].some((n) => String(n).toLowerCase() === needle || String(n).toLowerCase().includes(needle)))
    .map((e) => e.id as string);
  if (!ids.length) return { message: 'Övningen finns inte i katalogen och har ingen logg.' };
  const { data: sets } = await ctx.db
    .from('logged_sets')
    .select('weight_kg, reps, rpe, set_no, skipped, is_warmup, logged_sessions!inner(date, deleted_at)')
    .in('exercise_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(40);
  const recent = ((sets ?? []) as Row[])
    .filter((s) => !s.skipped && !s.is_warmup && s.weight_kg && s.reps)
    .map((s) => {
      const w = Number(s.weight_kg);
      const r = Number(s.reps);
      return { date: (s.logged_sessions as Row).date, weightKg: w, reps: r, rpe: s.rpe, e1rm: r === 1 ? w : Math.round(w * (1 + r / 30) * 10) / 10 };
    });
  return { recent, bestE1rm: recent.reduce((m, s) => Math.max(m, s.e1rm), 0) || null };
}

async function runTool(ctx: Ctx, name: string, input: Json): Promise<unknown> {
  switch (name) {
    case 'getContext':
      return getContext(ctx, input);
    case 'proposeSessionEdit':
      return proposeSessionEdit(ctx, input);
    case 'proposeWeekEdit':
      return proposeWeekEdit(ctx, input);
    case 'proposeProgramShift':
      return proposeProgramShift(ctx, input);
    case 'generateSession':
      return generateSession(ctx, input);
    case 'generateProgram':
      return generateProgram(ctx, input);
    case 'suggestLoad':
      return suggestLoad(ctx, input);
    default:
      return `Okänt verktyg: ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

function monthStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function quotaExceeded(admin: SupabaseClient, owner: string): Promise<boolean> {
  const { data } = await admin.from('ai_usage').select('requests, input_tokens, output_tokens').eq('owner', owner).eq('month', monthStart()).maybeSingle();
  if (!data) return false;
  return data.requests >= MONTHLY_REQUESTS || Number(data.input_tokens) + Number(data.output_tokens) >= MONTHLY_TOKENS;
}

async function recordUsage(admin: SupabaseClient, owner: string, input: number, output: number): Promise<void> {
  const month = monthStart();
  const { data } = await admin.from('ai_usage').select('*').eq('owner', owner).eq('month', month).maybeSingle();
  const ts = nowIso();
  if (data) {
    await admin
      .from('ai_usage')
      .update({ requests: data.requests + 1, input_tokens: Number(data.input_tokens) + input, output_tokens: Number(data.output_tokens) + output, updated_at: ts })
      .eq('id', data.id);
  } else {
    await admin.from('ai_usage').insert({ owner, month, requests: 1, input_tokens: input, output_tokens: output, updated_at: ts });
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

async function chat(anthropic: Anthropic, ctx: Ctx, history: ChatTurn[], context: unknown, question: string) {
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-12).map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
    {
      role: 'user',
      content: [
        { type: 'text', text: `Kontext (JSON):\n${JSON.stringify(context)}` },
        { type: 'text', text: question },
      ],
    },
  ];
  let usageIn = 0;
  let usageOut = 0;
  let text = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      })
      .finalMessage();
    usageIn += response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
    usageOut += response.usage.output_tokens;

    if (response.stop_reason === 'refusal') {
      text = 'Det kan jag inte hjälpa till med. Formulera frågan om träningen på ett annat sätt.';
      break;
    }
    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) break;

    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      try {
        const out = await runTool(ctx, use.name, (use.input ?? {}) as Json);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Fel: ${e instanceof Error ? e.message : String(e)}`, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { text, usageIn, usageOut };
}

interface ImageInput {
  mediaType: string;
  data: string;
}

async function parseImages(anthropic: Anthropic, ctx: Ctx, images: ImageInput[], hint: string) {
  const blocks: Anthropic.ContentBlockParam[] = images.map((img) =>
    img.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.data } }
      : { type: 'image', source: { type: 'base64', media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: img.data } },
  );
  const response = await anthropic.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      tools: [SUBMIT_PROGRAM_TOOL],
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: [
            ...blocks,
            {
              type: 'text',
              text:
                `Läs ut träningsprogrammet ur ${images.length > 1 ? 'sidorna ovan och slå ihop dem till ett program' : 'bilden ovan'} och lämna över det med verktyget submitProgram. ` +
                'Skriv varje övning som "Namn – schema". Hitta inte på pass som inte står i underlaget. Saknas datum: börja på närmaste måndag efter ' +
                `${hint || 'dagens datum'} och numrera veckorna 1..N. Sätt parseConfidence under 1 på rader du är osäker på.`,
            },
          ],
        },
      ],
    })
    .finalMessage();
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submitProgram');
  return {
    program: use ? { ...(use.input as Json), source: 'image' } : null,
    refused: response.stop_reason === 'refusal',
    usageIn: response.usage.input_tokens,
    usageOut: response.usage.output_tokens,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Använd POST.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Logga in för att använda AI-assistenten.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ error: 'Inloggningen har gått ut. Logga in igen.' }, 401);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'AI-assistenten är inte aktiverad än. Nyckeln saknas på servern.' }, 503);
  if (await quotaExceeded(admin, auth.user.id)) {
    return json({ error: `Månadens AI-kvot är slut (${MONTHLY_REQUESTS} frågor). Den fylls på den 1:a nästa månad.` }, 429);
  }

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig förfrågan.' }, 400);
  }

  const anthropic = new Anthropic({ apiKey });
  const ctx: Ctx = {
    user: { id: auth.user.id },
    db,
    activeProgramId: typeof body.activeProgramId === 'string' ? body.activeProgramId : null,
    prompt: String(body.question ?? ''),
    proposals: [],
    program: null,
  };

  try {
    if (body.action === 'chat') {
      const question = String(body.question ?? '').trim().slice(0, 4000);
      if (!question) return json({ error: 'Skriv en fråga.' }, 400);
      const r = await chat(anthropic, ctx, (body.history ?? []) as ChatTurn[], body.context ?? {}, question);
      await recordUsage(admin, auth.user.id, r.usageIn, r.usageOut);
      return json({ text: r.text, proposals: ctx.proposals, program: ctx.program });
    }
    if (body.action === 'parseImages') {
      const images = (body.images ?? []) as ImageInput[];
      if (!images.length || images.length > 10) return json({ error: 'Skicka mellan 1 och 10 bilder.' }, 400);
      const r = await parseImages(anthropic, ctx, images, String(body.startHint ?? ''));
      await recordUsage(admin, auth.user.id, r.usageIn, r.usageOut);
      if (r.refused || !r.program) return json({ error: 'Inget program kunde läsas ut. Ta en skarpare bild där hela tabellen syns.' }, 422);
      return json({ program: r.program });
    }
    return json({ error: 'Okänd åtgärd.' }, 400);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'AI-tjänsten är överbelastad just nu. Försök igen om en minut.' }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: `AI-tjänsten svarade med fel ${e.status}. Försök igen.` }, 502);
    return json({ error: 'Något gick fel i AI-funktionen. Försök igen.' }, 500);
  }
});
