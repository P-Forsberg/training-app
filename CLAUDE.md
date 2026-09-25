# CLAUDE.md

Projektkontext för Claude Code. Läs den här filen innan du ändrar något i repot.

## Vad det här är

En offline-first PWA för träningsplanering och loggning, på svenska. Användaren importerar ett träningsprogram (Excel, bild eller AI-genererat), ser veckans och dagens pass, loggar löpning och styrka, och kan fråga en AI-assistent om justeringar. Backend är Supabase.

Den första användaren tränar mot ett 100 miles-ultralopp och kombinerar löpning med ett konjugat-styrkeprogram, men **appen är inte byggd för den planen**. Allt som är specifikt för ett program kommer från importerad data.

Fullständig produktspec (datamodell i detalj, importformat, AI-verktyg, vyer, skor, design): `docs/SPEC.md`. Den här filen har företräde vid konflikt om arbetssätt och regler.

## Arbetssätt

**1. Plan först.** Innan någon kod skrivs: presentera datamodell, Zod-scheman, RLS-policies, en kort arkitekturskiss och ordningen du tänker bygga i. Vänta på mitt godkännande.

**2. Fråga allt på en gång, direkt efter att planen godkänts.** Ställ då en samlad omgång frågor: vad du är osäker på i planen, och allt du behöver från mig för att sedan kunna köra hela vägen själv. Till exempel Supabase-projekt och nycklar, AI-nyckel för Edge Function, exempel på importfiler, val av tema som standard, domän och deploy, samt vilka beslut jag vill äga själv. Ställ frågorna i en numrerad lista med ditt eget förslag för varje punkt, så att jag kan svara "kör på ditt förslag" där det inte spelar roll. Det här är det enda planerade stoppet: efter mina svar ska du kunna arbeta självständigt.

**3. Bygg sedan hela flödet.** Stanna inte efter varje delsteg för att fråga om småsaker. Är du osäker på något som inte blockerar: välj det rimligaste alternativet, skriv ned det i `ASSUMPTIONS.md` och fortsätt. Bygg färdigt hela kedjan, från import till loggning till synk, så att det går att använda på riktigt.

**4. ASSUMPTIONS.md.** Ligger i repots rot. En rad per antagande:

```
## 2026-09-24 · Import
Antagande: veckor utan datum i en importerad fil numreras 1..N från valt startdatum.
Varför: filen saknade datumkolumn och granskningsvyn behövde något att visa.
Så ändras det: importAdapter.assignDates(), en rad.
Status: öppen
```

Blockerande frågor, alltså sådant där du inte kan fortsätta alls, läggs överst under rubriken "Blockerare" och tas upp i rapporten. Allt annat fortsätter du förbi.

**5. Rapportera per byggsteg.** Efter varje steg i leveransordningen: vad som är klart, vilka antaganden som tillkommit, vad som återstår. Kort, inte en uppsats.

**6. Håll den här filen levande.** Ändras arkitektur, mappstruktur, kommandon eller någon av reglerna nedan: uppdatera CLAUDE.md i samma ändring. En CLAUDE.md som glidit isär från koden är värre än ingen alls.

Hitta aldrig på nycklar, kontouppgifter eller testdata som ser ut som riktig data. Saknas en uppgift: stubba, skriv ett antagande och gå vidare.

## Kommandon

```bash
pnpm dev              # utvecklingsserver
pnpm build            # produktionsbygge
pnpm test             # Vitest, alla enhetstester
pnpm test:watch       # under utveckling
pnpm test:e2e         # Playwright
pnpm lint             # ESLint + tsc --noEmit
pnpm db:migrate       # Supabase-migreringar lokalt
pnpm db:types         # genererar TypeScript-typer från schemat
pnpm db:reset         # nollställer lokal databas och kör seeds
pnpm db:test          # pgTAP-tester för RLS, ägarkontroller och LWW (supabase/tests)
pnpm db:push          # pushar migreringar till det länkade Supabase-projektet
pnpm gen:exercises    # genererar övningskatalogen (klient + migrering) från scripts/exercise-catalog.source.json
```

Lokal Supabase kräver Docker: `pnpm db:start` första gången. Edge Function driftsätts med `npx supabase functions deploy ai --use-api`; AI-nyckeln sätts av ägaren med `npx supabase secrets set ANTHROPIC_API_KEY=...`, aldrig i repot.

Kör `pnpm lint && pnpm test` innan du säger att något är klart.

## Stack

React 18 + TypeScript + Vite, PWA via vite-plugin-pwa. Tailwind 4 + egna shadcn-liknande komponenter i `ui/components.tsx`. Zustand, Zod. Dexie (IndexedDB) som lokal databas och utkö; UI läser med `useLiveQuery`. Supabase (Postgres, Auth, Edge Functions). SheetJS för xlsx, Recharts för grafer, date-fns med måndag som veckostart. AI: `claude-sonnet-5` via Edge Function.

## Mappstruktur

```
src/
  domain/         rena funktioner, inga beroenden utåt (parser, deriveWeekFlags, e1RM, skomil, status)
  data/
    repository.ts läsfrågor och hooks som UI alltid går via (läser bara Dexie)
    rows.ts       radtyper från Postgres, avsmalnade enum-kolumner
    commands/     skrivkommandon: program, logging, undo, backup
    local/        Dexie-databasen
    remote/       Supabase: klient, auth, upsert/pull, rpc, ai-anrop (enda stället som får importera supabase-js)
    sync/         commit (enda skrivvägen), utkö, synkmotor, adoption vid inloggning
  import/
    adapters/     xlsxKullamannen, xlsxGeneric (bild och AI går via Edge Function och features/import)
    canonical.ts  Zod-schema för Program-JSON
    canonicalToRows.ts  granskat program → rader
  features/       week/, day/, calendar/, stats/, shoes/, ai/, settings/, import/
  ui/             delade komponenter, format, teman (themes.css)
  app/            App-skal och hash-router
supabase/
  migrations/     numrerade SQL-filer
  tests/database/ pgTAP-tester (RLS, ägarkontroller, LWW)
  functions/ai/   Edge Function som håller AI-nyckeln (prompt.ts = träningsreglerna för AI)
scripts/          generatorer (övningskatalog, app-ikoner)
tests/e2e/        Playwright
docs/
  SPEC.md         produktspecen
  PLAN.md         godkänd plan: datamodell, scheman, RLS, arkitektur, byggordning
```

## Regler som inte får brytas

**Planerat och loggat är två separata lager.** Loggning skriver aldrig i `planned_sessions` eller `planned_items`. Flyttas ett pass skapas status `moved` plus nytt datum, det ursprungliga planerade datumet står kvar. Det planerade värdet ska alltid gå att se bredvid det faktiska.

**Inga träningsregler i koden.** Saker som "fredag är vilodag" eller "måndagen efter back-to-back är löpvila" härleds ur programdata i `domain/deriveWeekFlags.ts`. Hittar du en `if (dayOfWeek === 5)` någonstans är det en bugg.

**AI ändrar aldrig planen direkt.** Alla ändringsförslag skapar en rad i `proposals` och renderas som en diff som användaren godkänner. Accepterade förslag skriver till `mutations` och ska gå att ångra i ett steg.

**Parsern får aldrig kasta.** Kan en övningsrad inte tolkas sparas den som `raw_text` med `parse_confidence < 1`.

**Inga hemligheter i klienten.** AI-nyckeln lever bara i Edge Function. Supabase anon key är publik som avsett, men RLS måste vara påslaget på varje tabell.

**Allt skrivs lokalt först.** Skrivningar går genom kommandona i `data/commands` och `commit()` i `data/sync`, aldrig direkt mot Supabase från en komponent. Kommandon som läser och sedan skriver lindas i `serial()`.

**Ingen rad utan `owner`.** Nya tabeller får `owner uuid` och explicita RLS-policies per operation. Aldrig `using (true)`. Enda undantaget är `private.allowed_emails`, som inte nås via API:t.

**Appen är stängd.** Med backend konfigurerad visas bara inloggningen tills någon loggat in. Nya konton kräver att e-postadressen står i `private.allowed_emails`, som fylls i via SQL-editorn och aldrig i en migrering. Personuppgifter hör inte hemma i repot.

## Datamodell i korthet

`programs` → `program_weeks` → `planned_sessions` → `planned_items`
`logged_sessions` → `logged_runs` (1:1, refererar `shoes`) och `logged_sets` (1:n)
`exercises` (globala när `owner is null`, annars användarens egna)
`proposals`, `mutations`, `program_shares`, `profiles`, `shoes`

Allt har `id`, `created_at`, `updated_at`, `deleted_at` (mjuk radering). Synk är last-write-wins per rad via `updated_at`, men loggrader slås aldrig ihop.

Strukturerade löppass: dagens kvalitetspass står som text i `planned_sessions.notes` (från t.ex. kolumnen "Onsdag – kvalitetspass"). `domain/structuredRun.ts` tolkar formen "Typ: huvuddel. N km uppvärmning, M km nedjogg". Loggade delar sparas var för sig på `logged_runs` (`warmup_km`, `main_km`, `cooldown_km`, `intervals_done`). `distance_km` följer summan av delarna tills användaren skriver totalen själv (`distance_manual = true`), se `domain/runParts.ts`.

Importen av Veckoplan läser kolumner via rubrikraden (`import/planHeader.ts`), aldrig via fasta index. En kolumn med rubriken "Veckodag – något" kopplas till den veckodagen.

UI läser lokal data med `useDbQuery` (`data/live.ts`), inte `useLiveQuery`. Den senare tappar ändringsspårningen i webbläsaren så fort en fråga väntar på ett promise som inte kommer från Dexie, och då slutar vyn uppdateras utan felmeddelande.

## Övningsformat

Parsern i `domain/exerciseParser.ts` ska klara dessa, med både tankstreck och bindestreck, och både × och x:

```
Box Squat – 1–3RM                  Speed Bench – 8×3 @70%
Leg Curl – 4×12                    Trap Bar Deadlift – 3×3 @80%
Pull-Ups – 4×AMRAP                 Bulgarian Split Squat – 3×10/ben
Copenhagen Plank – 3×20 s/sida     Step-down – 3×8/ben
Overhead Press – toppset 3 reps @RPE 8
Speed Squat – 6×2 @70–75%          Weighted Dips / CGBP – 3RM
Rörlighet – 10 min                 -  (betyder inget pass)
```

Lägger du till ett format: lägg till testfallet först i `exerciseParser.test.ts`.

## Språk och ton

Gränssnittet är på svenska. Kod, variabelnamn, kommentarer och commits på engelska. Domänord behåller sin form: `backToBack`, `deload`, `taper`, `microcycle`, men fält som speglar användarens data kan vara svenska om de kommer från importen.

Knappar säger vad som händer: "Klart", inte "Spara". Samma ord genom hela flödet, så att knappen "Klart" ger status "Klart". Felmeddelanden säger vad som gick fel och hur man fixar det, utan ursäkter.

## Design

Tre teman som CSS-variabler i `ui/themes.css`: Natt (#0d1211 / accent #f0b429), Dagsljus (#eef1ec / accent #0d6d8c), Loggbok (#f7f7f5 / accent #4b3bd1). Använd alltid variablerna, aldrig hex direkt i en komponent.

En dag är en stapel av block, inte ett formulär. Distanser och vikter är sidans största text, med tabellsiffror så att kolumner linjerar. Motion bara som svar på en handling. Touchytor minst 44 px, kontrast AA, `prefers-reduced-motion` respekteras.

## Tester

Krav på testtäckning där det gör skillnad, inte överallt:
- `domain/exerciseParser` – alla format ovan plus trasig indata
- `domain/deriveWeekFlags` – back-to-back, vilodagar, veckosummor
- `data/sync` – utkö, offline, konflikt
- `features/ai/proposalDiff` – att en accepterad diff går att ångra
- `domain/shoeMileage` – startsträcka plus loggade pass, bytesgräns
- e2e: importera fil → öppna dag → logga pass → veckosumman uppdateras

## Vanliga fallgropar

Tidszoner: datum lagras som `date`, inte `timestamptz`. Använd `format(d, 'yyyy-MM-dd')` lokalt, aldrig `toISOString()` på ett lokalt datum.

Veckostart är måndag överallt, även i kalendervyn och i `date-fns`-konfigurationen.

Ett program kan ha luckor. Anta aldrig att vecka N+1 finns eller att varje dag har ett pass.

Import får aldrig skriva till databasen innan användaren godkänt granskningsvyn.

## Innan du är klar

Kör `pnpm lint && pnpm test`. Ändrade du schemat: lägg till en migrering och kör `pnpm db:types`. Ändrade du något i `domain/`: kontrollera att testerna för den modulen täcker ändringen. Tillkom nya antaganden: se till att de står i `ASSUMPTIONS.md`. Ändrade du arkitektur, kommandon eller regler: uppdatera CLAUDE.md i samma ändring.
