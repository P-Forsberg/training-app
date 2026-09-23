# Plan

Status: **godkänd** (2026-09-23). Bygger på `docs/SPEC.md` och reglerna i `CLAUDE.md`. Avvikelser från specen är markerade med **Ändring**.

## 1. Arkitektur

```
┌──────────────────────────── Klient (PWA) ────────────────────────────┐
│                                                                      │
│  features/*  (week, day, calendar, stats, shoes, ai, settings)       │
│      │  läser via TanStack Query-hooks, skriver via commands         │
│      ▼                                                               │
│  data/repository.ts  ── interface: queries + commands                │
│      │                                                               │
│      ├── queries ──► data/local (Dexie)  ◄── alltid källan för UI    │
│      │                                                               │
│      └── commands ─► data/sync/commands.ts                           │
│                        1. validera (Zod)                             │
│                        2. skriv rad(er) i Dexie, sätt updated_at     │
│                        3. lägg op i outbox (samma Dexie-transaktion) │
│                        4. invalidera queries                         │
│                                                                      │
│  data/sync/engine.ts   push outbox → pull ändringar → markera klart   │
│      │  triggas av: online-event, app-fokus, var 60:e s, efter commit│
│      ▼                                                               │
│  data/remote (supabase-js, bara här)                                 │
│                                                                      │
│  domain/*   rena funktioner: exerciseParser, deriveWeekFlags,        │
│             e1RM, shoeMileage, weekSummary, proposalDiff             │
│  import/*   adapter → CanonicalProgram → granskningsvy → command     │
└──────────────────────────────────────────────────────────────────────┘
                 │ HTTPS (anon key + användarens JWT)
┌────────────────▼──────────── Supabase ───────────────────────────────┐
│  Postgres + RLS på alla tabeller                                     │
│  Auth: magic link, Apple, Google                                     │
│  Edge Function /ai: håller AI-nyckeln, tool calling, token-kvot,     │
│                     skriver proposals (aldrig planned_*)             │
└──────────────────────────────────────────────────────────────────────┘
```

Principer:

- UI läser alltid från Dexie. Supabase är synkmål, inte läskälla. Det gör offline till standardläget, inte ett specialfall.
- ID:n skapas i klienten (`crypto.randomUUID()`) så att rader kan skapas och refereras offline.
- Allt som rör planen (import, AI-förslag som godkänns, ångra, förskjut program) är commands som skriver till `mutations`. Loggning är egna commands som bara rör `logged_*` och `shoes`.
- `domain/` importerar ingenting från `data/`, `features/` eller React.

## 2. Datamodell

Gemensamt för **alla** tabeller:

```sql
id              uuid primary key default gen_random_uuid(),
owner           uuid not null references auth.users on delete cascade,  -- utom exercises (nullable)
created_at      timestamptz not null default now(),
updated_at      timestamptz not null default now(),   -- satt av klienten, LWW-nyckel
server_updated_at timestamptz not null default now(), -- satt av servern, pull-cursor
deleted_at      timestamptz
```

**Ändring: `owner` på varje tabell**, även barntabeller (`program_weeks`, `planned_sessions`, `planned_items`, `logged_runs`, `logged_sets`). Specen hade det bara på topptabellerna. Skäl: CLAUDE.md kräver det, RLS blir en enkel jämförelse utan joins, och synken kan hämta "allt jag äger sedan X" per tabell. En trigger kontrollerar att barnets `owner` är samma som förälderns.

**Ändring: två tidsstämplar.** `updated_at` sätts av klienten när användaren ändrar något och används för last-write-wins. `server_updated_at` sätts alltid av en trigger till `now()` och används som cursor när klienten hämtar ändringar. Med bara `updated_at` missar pull rader som redigerats offline med en äldre klocka.

Tabeller, med skillnader mot specen:

| Tabell | Innehåll | Ändring mot spec |
|---|---|---|
| `profiles` | som specen | `user_id` är PK och fungerar som `owner` |
| `programs` | som specen + `is_active bool` | `is_active`: vilket program veckovyn visar |
| `program_weeks` | som specen | `owner` |
| `program_notes` | `program_id, section, key, value, sort` | **Ny.** "Läs först" och "Nyckelpass" behöver en plats och ska vara sökbara |
| `planned_sessions` | som specen | `owner`; `program_week_id` nullable (program med luckor) |
| `planned_items` | som specen | `owner`, `program_id` (för RLS); `reps_max int` för intervall (1–3RM, 8–12); `duration_sec` även per set (3×20 s) |
| `exercises` | som specen + `movement_pattern text` | `movement_pattern` (squat, hinge, push, pull, lunge, core, carry, other) behövs för regeln "undvik samma rörelsemönster som i går" |
| `logged_sessions` | som specen + `moved_from date` | se "flyttade pass" nedan |
| `logged_runs` | som specen | `owner` |
| `logged_sets` | som specen + `planned_item_id uuid`, `duration_sec int` | kopplingen gör planerat-bredvid-faktiskt och spökvärden möjliga; tidsbaserade set loggas i sekunder |
| `shoes` | som specen | skapas före `logged_runs` i migreringen |
| `proposals` | som specen | `diff` valideras mot `ProposalDiff`-schemat |
| `mutations` | som specen + `batch_id uuid` | ett godkänt förslag eller en import kan röra många rader; ångra tar hela batchen |
| `program_shares` | som specen | `owner` = programägaren; `unique (program_id, shared_with)` |
| `import_profiles` | `name, adapter, mapping jsonb` | **Ny.** Specen kräver sparade kolumnmappningar för xlsx-generic |
| `ai_usage` | `month date, input_tokens, output_tokens, requests` | **Ny.** Specen kräver tokenloggning och månadsgräns. Skrivs bara av Edge Function |

Vy: `shoe_mileage` (`security_invoker = true` så att RLS gäller) = `start_km + sum(logged_runs.distance_km)` där passet inte är mjukraderat. Klienten räknar samma sak lokalt i `domain/shoeMileage`.

**Flyttade pass.** `planned_sessions.date` ändras aldrig av loggning. Flytt skapar en `logged_session` med `planned_session_id`, `status = 'moved'`, `date = nytt datum` och `moved_from = planerat datum`. När passet sedan görs sätts `status = 'done'` och `moved_from` står kvar. Kalendern visar passet på det nya datumet och ett spår på det gamla.

**Missade pass lagras inte.** "Missad" härleds: planerat datum har passerat och det finns ingen `logged_session`. Då kan statusen inte bli inaktuell.

Index enligt specen, plus `(owner, server_updated_at)` på varje tabell för pull.

## 3. RLS

Mönster för en tabell som bara ägaren når:

```sql
alter table planned_items enable row level security;

create policy planned_items_select on planned_items for select
  using (owner = auth.uid() or can_read_program(program_id));
create policy planned_items_insert on planned_items for insert
  with check (owner = auth.uid());
create policy planned_items_update on planned_items for update
  using (owner = auth.uid()) with check (owner = auth.uid());
-- ingen delete-policy: radering sker mjukt via update av deleted_at
```

- **Ingen `delete`-policy någonstans.** Mjuk radering går via update, och utan policy nekar RLS hårda raderingar.
- **Delning:** `can_read_program(pid uuid)` är en `security definer`-funktion med `set search_path = ''`. Den returnerar true om användaren äger programmet eller har en icke-raderad rad i `program_shares`. Tabellerna under ett program (`program_weeks`, `planned_sessions`, `planned_items`, `program_notes`) får `program_id` denormaliserat så att policyn slipper slå upp det via en hjälpfunktion. `planned_items` får alltså också `program_id`.
- **Editor-roll:** i v1 ger `editor` samma rättigheter som `viewer` (bara läsning), och det skrivs in i ASSUMPTIONS.md. Skrivning från fler användare på samma plan kräver konfliktlösning över användare och passar bättre i ett senare steg.
- **`exercises`:** select om `owner is null or owner = auth.uid()`. Insert och update bara om `owner = auth.uid()`. Globala rader kommer från seeds.
- **`ai_usage`:** bara select för ägaren. Skrivning sker med service role i Edge Function.
- **`proposals`:** select och update (status) för ägaren. Insert sker från Edge Function med användarens JWT, så RLS gäller även där.
- **LWW i databasen:** en `before update`-trigger ignorerar uppdateringen (returnerar `old`) om `new.updated_at < old.updated_at`. Då kan en gammal offline-ändring aldrig skriva över en nyare, oavsett i vilken ordning klienterna synkar.
- Ett pgTAP-test, eller ett SQL-skript i CI, går igenom `pg_tables` och fallerar om någon tabell i `public` saknar RLS.

## 4. Zod-scheman

Bor i `src/import/canonical.ts` (program) och `src/data/schemas.ts` (entiteter). Entitetsschemana skrivs för hand och stäms av mot `pnpm db:types` i ett typtest, så att de inte kan glida isär.

```ts
// src/import/canonical.ts
export const ParsedItem = z.object({
  kind: z.enum(['distance', 'duration', 'exercise']),
  rawText: z.string(),
  exerciseName: z.string().optional(),
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  repsMax: z.number().int().positive().optional(),
  repScheme: z.enum(['fixed', 'range', 'amrap', 'rm', 'time']).optional(),
  load: z.number().optional(),
  loadUnit: z.enum(['kg', 'percent', 'rpe', 'bodyweight', 'band']).optional(),
  perSide: z.boolean().default(false),
  distanceKm: z.number().nonnegative().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  parseConfidence: z.number().min(0).max(1),
});

export const CanonicalSession = z.object({
  date: IsoDate,                        // 'yyyy-MM-dd', aldrig timestamp
  type: z.enum(['run', 'strength', 'other', 'rest']),
  title: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(ParsedItem),
});

export const CanonicalWeek = z.object({
  weekNo: z.number().int().positive(),
  startDate: IsoDate,                   // alltid en måndag, kontrolleras med refine
  phase: z.string().optional(),
  focusText: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).default({}),
  sessions: z.array(CanonicalSession),
});

export const CanonicalProgram = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  discipline: z.string().optional(),
  startDate: IsoDate,
  raceDate: IsoDate.optional(),
  source: z.enum(['xlsx', 'image', 'ai', 'manual']),
  sourceMeta: z.record(z.string(), z.unknown()).default({}),
  notes: z.array(z.object({ section: z.string(), key: z.string(), value: z.string() })),
  weeks: z.array(CanonicalWeek),        // luckor tillåtna, weekNo behöver inte vara 1..N
  warnings: z.array(z.object({ path: z.string(), message: z.string() })).default([]),
});
```

Samma `CanonicalProgram` används av alla fyra adaptrarna och av `generateProgram`. Import är en ren funktion `canonicalToRows(program, owner) → rows`, som testas separat från UI.

Övriga scheman:

- `ProposalDiff`: `{ ops: Array<{ entity, entityId, op: 'insert' | 'update' | 'delete', before, after }> }`. Samma form som en batch i `mutations`, så att godkännande och ångra går genom samma kodväg.
- Ett schema per AI-verktyg för input och output. Edge Function och klienten importerar samma fil, som ligger i `src/shared/ai-tools.ts` och kopieras in i funktionen när den byggs.
- `OutboxOp`: `{ id, table, rowId, op: 'upsert', payload, attempts, lastError }`. Eftersom radering är mjuk är allt en upsert.

## 5. Synk

- **Push:** outboxen töms i FIFO-ordning, en batchad upsert per tabell och föräldrar före barn. Nätverksfel ger backoff och nytt försök. Ett valideringsfel från servern (4xx) flyttar op:en till `dead_letter` och visas i inställningarna. Kön blockeras aldrig.
- **Pull:** för varje tabell hämtas `server_updated_at > cursor`, raderna skrivs till Dexie med LWW på `updated_at`, och cursorn flyttas fram.
- **Loggrader slås aldrig ihop:** de har klientgenererade id:n, så två enheter skapar två rader och aldrig en konflikt. LWW gäller bara när samma rad (samma id) har redigerats på två ställen, och då vinner hela raden. Fält från olika versioner blandas aldrig.
- **Ingen dataförlust vid stängd flik:** command-skrivningen och outbox-raden ligger i samma Dexie-transaktion, och Dexie committar innan UI:t uppdateras.
- **Dexie-versioner:** varje Supabase-migrering som ändrar form får en motsvarande `db.version(n)` med upgrade-funktion.

## 6. Byggordning

Specens ordning, plus ett steg 0 för grundstrukturen. Efter varje steg kommer en kort rapport enligt CLAUDE.md.

| # | Steg | Klart när |
|---|---|---|
| 0 | Grundstruktur: Vite, TS strict, Tailwind, shadcn, ESLint, Vitest, Playwright, pnpm-skript, `themes.css`, `ASSUMPTIONS.md` | `pnpm lint && pnpm test && pnpm build` går igenom |
| 1 | Supabase: migreringar, triggers (updated_at, LWW, owner-kontroll), RLS, seeds för globala övningar, RLS-täckningstest | `pnpm db:reset` och `pnpm db:types` fungerar, RLS-testet går igenom |
| 2 | `exerciseParser` med tester först, `deriveWeekFlags`, `weekSummary`, `e1RM`, `shoeMileage` | alla domain-tester gröna |
| 3 | `canonical.ts`, adaptrarna xlsx-kullamannen och xlsx-generic, granskningsvy, `canonicalToRows` | en importerad fil syns i granskningsvyn och sparas först efter "Importera" |
| 4 | Dexie-schema, repository, commands, outbox (ingen push än), vecko- och dagsvy, löp- och styrkeblock | hela loggflödet fungerar offline |
| 5 | Auth, synkmotorn, remote-implementation, synkstatus i inställningarna | två webbläsare synkar och synktesterna är gröna |
| 6 | Kalender, statistik (Recharts), skor med varningar | |
| 7 | Edge Function `/ai`, verktyg, `proposals`, diff-kort, godkänn och ångra, token-kvot | ångra-testet för proposalDiff grönt |
| 8 | Bild- och PDF-import, profiler, delning, JSON-export och import, PWA-manifest och service worker, e2e-flödet | e2e grönt, appen går att installera |

Steg 0–4 kräver ingenting från dig utom en exempelfil för steg 3. Stubbar och `ASSUMPTIONS.md` räcker. Steg 5 kräver ett Supabase-projekt, och steg 7 en AI-nyckel.
