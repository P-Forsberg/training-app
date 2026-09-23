# Byggprompt: träningsapp med Supabase

Källa: artifact "Byggprompt: träningsapp med Supabase" (https://claude.ai/artifact/4oJXGaRxAaY8zzpQJUcuKd), överförd till repot 2026-09-23. Det här är produktspecen. CLAUDE.md har företräde vid konflikt om arbetssätt och regler.

---

Bygg en offline-first PWA för träningsplanering och loggning, på svenska, mobil först, med Supabase som backend. Appen ska klara flera användare, flera program per användare, import av befintliga planer, loggning av löpning och styrka, skoräkning och en AI-assistent som både justerar program och skriver ihop enskilda pass.

## 1. Kontext

Den första användaren tränar mot ett 100 miles-ultralopp (Kullamannen, fredag 29 oktober 2027, start kl 18) och kombinerar 5 löppass i veckan med ett konjugat-styrkeprogram på måndag, onsdag och fredag. Hans plan finns i en Excel-fil på 58 veckor. Appen ska dock inte vara byggd för just den planen: allt som är specifikt för den ska komma från importerad data, inte från kod. Andra användare ska kunna importera en helt annan plan, eller be AI:n skriva en ny, eller bara logga enstaka pass utan program alls.

## 2. Stack

Frontend: React 18 + TypeScript + Vite, PWA via vite-plugin-pwa (installbar, service worker). Tailwind + shadcn/ui. TanStack Query. Zustand för UI-state. Zod för validering vid alla systemgränser (filimport, AI-svar, API-svar). Dexie (IndexedDB) som lokal cache och offlinekö. SheetJS för xlsx. Recharts för grafer. date-fns med måndag som veckostart. Vitest + Testing Library + Playwright för ett e2e-flöde.

Backend: Supabase (Postgres, Auth, Storage, Edge Functions). Auth via magic link plus Apple/Google. Row Level Security på allt. AI-anrop går genom en Edge Function så att API-nyckeln aldrig ligger i klienten.

Arkitektur: allt dataåtkomst bakom ett repository-interface med två implementationer, en lokal (Dexie) och en fjärr (Supabase). UI pratar bara med repositoryt.

## 3. Datamodell (Postgres)

Alla tabeller har `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()` (trigger) och `deleted_at timestamptz` för mjuk radering.

```sql
-- Användare och profiler
profiles           user_id uuid references auth.users primary key, display_name text,
                   locale text default 'sv', units text default 'metric',
                   theme text default 'night', race_date date, goal text

-- Program
programs           owner uuid references auth.users, name text, discipline text,
                   start_date date, race_date date, weeks int,
                   source text check (source in ('xlsx','image','ai','manual')),
                   source_meta jsonb, schema_version int default 1, is_template bool default false

program_weeks      program_id uuid references programs on delete cascade,
                   week_no int, start_date date, phase text, focus_text text,
                   meta jsonb  -- fritt: styrkeläge, cykel, programvecka, dagsinstruktion
                   unique (program_id, week_no)

planned_sessions   program_id uuid, program_week_id uuid, date date, day_of_week int,
                   type text check (type in ('run','strength','other','rest')),
                   title text, sort int, notes text

planned_items      planned_session_id uuid references planned_sessions on delete cascade,
                   sort int, kind text check (kind in ('distance','duration','exercise')),
                   exercise_id uuid, raw_text text,
                   sets int, reps int, rep_scheme text check (rep_scheme in
                     ('fixed','range','amrap','rm','time')),
                   load numeric, load_unit text check (load_unit in
                     ('kg','percent','rpe','bodyweight','band')),
                   per_side bool default false, distance_km numeric, duration_sec int,
                   parse_confidence numeric default 1

-- Övningskatalog: globala rader (owner is null) + användarens egna
exercises          owner uuid, canonical_name text, aliases text[],
                   category text, is_barbell bool, notes text

-- Loggning
logged_sessions    owner uuid, planned_session_id uuid, date date, type text,
                   status text check (status in ('done','partial','skipped','moved')),
                   feel int check (feel between 1 and 5), rpe numeric, comment text

logged_runs        logged_session_id uuid primary key references logged_sessions on delete cascade,
                   distance_km numeric, duration_sec int,
                   surface text check (surface in ('road','gravel','trail','technical','treadmill')),
                   elevation_m int, is_night bool default false, shoe_id uuid references shoes

logged_sets        logged_session_id uuid references logged_sessions on delete cascade,
                   exercise_id uuid, set_no int, weight_kg numeric, reps int,
                   rpe numeric, is_warmup bool default false, skipped bool default false

-- Skor
shoes              owner uuid, name text, brand text, model text,
                   surface_type text check (surface_type in ('road','trail','mixed')),
                   start_km numeric default 0, retire_km numeric default 800,
                   purchased_on date, retired_on date
-- vy: shoe_mileage = start_km + sum(logged_runs.distance_km) per sko

-- AI-förslag
proposals          owner uuid, program_id uuid, prompt text, rationale text,
                   diff jsonb, status text check (status in
                     ('pending','accepted','rejected','undone')), applied_at timestamptz

mutations          owner uuid, entity text, entity_id uuid, before jsonb, after jsonb,
                   proposal_id uuid  -- driver ångra

-- Delning (sambo, coach)
program_shares     program_id uuid, shared_with uuid references auth.users,
                   role text check (role in ('viewer','editor'))
```

RLS: varje tabell tillåter läsning och skrivning där `owner = auth.uid()`, plus läsning av program där en rad finns i `program_shares` för `auth.uid()`. Övningskatalogen är läsbar för alla när `owner is null`. Skriv policies explicit per operation, inga `using (true)`.

Index: `planned_sessions(program_id, date)`, `logged_sessions(owner, date)`, `logged_sets(logged_session_id)`, `logged_runs(shoe_id)`, `program_weeks(program_id, week_no)`.

Grundregel: **planerat och loggat är två separata lager.** Loggning skriver aldrig i `planned_*`. Flyttar användaren ett pass skapas status `moved` plus nytt datum, det ursprungliga planerade datumet står kvar.

## 4. Offline och synk

Dexie speglar tabellerna ovan. Alla skrivningar går genom ett command-lager som skriver lokalt först, lägger operationen i en utkö och synkar när nätet finns. Konfliktlösning: last-write-wins per rad via `updated_at`, men logg-rader slås aldrig ihop, de är alltid användarens egna. Visa synkstatus diskret i inställningarna, inte i varje vy. Appen ska fungera helt utan nät, förutom AI-anropen.

## 5. Import

Definiera ett kanoniskt Program-JSON (Zod, versionerat). Varje källa är en adapter: `parse(input) => CanonicalProgram`. Alla adaptrar går genom samma granskningsvy innan något sparas.

**Adapter 1, xlsx-generic.** Användaren mappar kolumner i ett UI och mappningen sparas som en profil för nästa gång.

**Adapter 2, xlsx-kullamannen.** Autodetekteras om flikarna "Veckoplan" och "Styrka" finns.

- Veckoplan, rad 2–59: A veckonummer, B veckans måndagsdatum, C fas, D veckor kvar, E–K planerad distans mån–sön (0 = vila), L summa, M antal löppass, N antal styrkepass, O styrkeläge, P veckans fokustext.
- Styrka, rad 2–59 (samma radordning): A veckonummer, B datum, C cykel, D programvecka, E läge underkropp, F måndagsinstruktion, G måndag ME Lower, H onsdag ME Upper, I fredag DE Combo, J kommentar. G–I innehåller 1–5 övningar separerade med radbrytning. "-" betyder inget pass den dagen.
- Flikarna "Läs först" och "Nyckelpass" är nyckel/värde i kolumn A och B, importeras som programanteckningar och blir en sökbar infosida.

**Adapter 3, bild och PDF.** Användaren fotograferar ett program (skärmdump, PDF, foto av whiteboard). Bilden skickas till en multimodal modell via Edge Function tillsammans med det kanoniska schemat, och svaret valideras med Zod. Flera sidor slås ihop till ett program. Fält modellen är osäker på får `parse_confidence < 1` och lyfts överst i granskningsvyn. Bilden sparas inte, bara den strukturerade datan.

**Adapter 4, ai-generated.** Se avsnitt 8.

## 6. Övningsparser (egen modul, väl testad)

Ska klara dessa format, med både tankstreck och bindestreck som separator och både × och x:

```
Box Squat – 1–3RM                 Speed Bench – 8×3 @70%
Leg Curl – 4×12                   Trap Bar Deadlift – 3×3 @80%
Pull-Ups – 4×AMRAP                Bulgarian Split Squat – 3×10/ben
Copenhagen Plank – 3×20 s/sida    Step-down – 3×8/ben
Overhead Press – toppset 3 reps @RPE 8
Rörlighet – 10 min                -
```

Ut: namn, sets, reps eller repSchema, load och loadUnit, perSide, tidsbaserade set. Matcha namnet mot övningskatalogen via alias och normalisering (gemener, ta bort diakriter, trimma). Okänt namn skapar en ny övning med `parse_confidence < 1`. Parsern får aldrig kasta: kan en rad inte tolkas sparas den som `raw_text`. Skriv enhetstester för alla exempel ovan plus trasig indata.

## 7. Härledda regler

Hårdkoda inga träningsregler. Lägg dem i en ren modul, `deriveWeekFlags(week, sessions)`, som både UI och AI läser:

- en vecka med planerad distans både lördag och söndag är en back-to-back-helg
- en dag utan planerat innehåll är vila
- veckans totala planerade distans, antal löppass, antal styrkepass
- om nästa veckas måndag saknar löpning: markera som "vila efter back-to-back"

Då fungerar appen lika bra för ett program med en helt annan veckostruktur.

## 8. AI-assistent

Alla anrop går genom en Edge Function (`/ai`) som håller nyckeln, loggar tokenförbrukning per användare och sätter en rimlig månadsgräns. Använd tool calling, inte fritextsvar som tolkas.

Kontext som alltid skickas: användarens mål och loppdatum, aktivt program, innevarande vecka, i går, i dag och i morgon som fulla sessionsobjekt, de senaste 28 dagarnas loggar i komprimerad form, veckosummor de senaste 4 veckorna, senaste RPE och känsla, skornas mil, samt eventuella skadeanteckningar.

Verktyg:

```
getContext(range)
proposeSessionEdit(sessionId, patch)
proposeWeekEdit(weekNo, patch)
proposeProgramShift(weeks)
generateSession(input)
generateProgram(input)
suggestLoad(exerciseId)
```

Allt som ändrar planen skapar en rad i `proposals` och renderas som ett diff-kort: vad som ändras, varför, och knapparna Godkänn och Avvisa. Ingenting skrivs till `planned_*` utan godkännande. Varje accepterat förslag skriver till `mutations` och kan ångras i ett steg. Assistenten får aldrig skriva om planen tyst.

**generateSession** är kärnan för fristående användning. Input är fritext ("45 minuter, bara hantlar, axeln är öm") plus datum. Verktyget hämtar automatiskt gårdagens och morgondagens pass och följer dessa regler:

- undvik samma primära rörelsemönster som i går om det loggades med RPE ≥ 8
- lämna morgondagens pass intakt: är i morgon ett långpass eller ett tungt benpass ska dagens pass inte tömma benen
- respektera angiven tid, utrustning och smärta
- returnera strukturerad JSON enligt samma schema som `planned_items`, validerad med Zod

**generateProgram** tar mål, pass per vecka, tillgängliga dagar, utrustning, erfarenhet och antal veckor, och producerar kanoniskt Program-JSON genom exakt samma valideringssteg som en filimport.

## 9. Vyer

**Veckovy (start).** Veckans planerade km stort, loggat bredvid, progressstapel, fas, veckor kvar, styrkeläge och veckans fokustext. Sju dagsrader med planerat, eventuellt styrkepass och status. Pilar och svep mellan veckor.

**Dagsvy.** En dag är en stapel av block, inte ett formulär. Överst dagens instruktion som ett eget notisfält (till exempel måndagsinstruktionen eller veckans fokus). Sedan blocken: uppvärmning, löppass, styrkepass, anteckning. Varje block har eget klart-läge och kan fällas ihop till en sammanfattning ("Löppass 12 km · klart").

**Löpblock.** Distansfältet är förifyllt med det planerade värdet och går att ändra direkt. Tid, underlag, skor, känsla 1–5, natt ja/nej, fritext.

**Styrkeblock.** En rad per övning, namn till vänster och schema till höger ("4×12", "1–3RM", "8×3 @70%"). Tryck fäller ut ett rutnät med en rad per set: vikt, reps, RPE. Föregående loggning visas som grå spökplaceholder. Knappar för extra set och för att hoppa över en övning.

**Kalender.** Månadsvis över hela programmet, prick för löppass och styrkepass, färg per fas och status.

**Statistik.** Faktiska km per vecka mot planerat, fördelning per underlag, e1RM per övning över tid (Epley), pass per månad, och skorna.

**Program- och infovy.** Flikar: Program, Pass, Statistik, Info. Info visar de importerade nyckel/värde-texterna.

**Inställningar.** Profiler, program, loppdatum, förskjut hela programmet N veckor, export och import av JSON-backup, tema, delning med en annan användare.

## 10. Skor

Varje löppass kan kopplas till ett par skor. Skovyn visar mil per par mot en bytesgräns, med en stapel och texten "Byt snart" vid 85 procent och "Dags att byta" när gränsen nås. Standardgräns 800 km för vägskor och 600 km för trailskor, ändringsbart per par. Nya skor läggs till direkt i löppasset med namn, redan gångna km och bytesgräns. Varna mjukt om ett långt pass på teknisk stig loggas i ett par märkta som vägskor. Visa en diskret notis i veckovyn när ett par passerar 85 procent.

## 11. Design

Tre teman, alla definierade som CSS-variabler, användaren väljer i inställningarna och appen kan följa systemets läge:

```
Natt     bakgrund #0d1211  yta #151d1b  linje #26322f  text #e8efec  accent #f0b429
Dagsljus bakgrund #eef1ec  yta #ffffff  linje #d7ddd4  text #18231d  accent #0d6d8c
Loggbok  bakgrund #f7f7f5  yta #ffffff  linje #dcdcd8  text #1b1b1a  accent #4b3bd1
```

Typografi: en familj (Archivo eller liknande), tabellsiffror så att kolumner med vikter och distanser linjerar. Distanser och vikter är sidans största text, metadata är liten och dämpad.

Status: planerad (neutral), klar (accent), delvis (halv accent), hoppad (grå), missad (röd kant utan fyllning). Faser färgkodas konsekvent i kalender och veckovy.

Beteende: allt sparas direkt, ingen spara-knapp. Svep byter dag och vecka. Långtryck på ett pass ger flytta, duplicera, hoppa över. AI-knappen ligger fast nere till höger och öppnar en panel som glider upp över halva skärmen med dagens kontext inläst. Haptisk respons när ett pass markeras klart. Motion bara som svar på handling, inga dekorativa animationer.

Text i gränssnittet: plain verbs, meningsform, inga versaler som etiketter. Knappen som heter "Klart" ger status "Klart". Tomma vyer är en uppmaning att göra något, felmeddelanden säger vad som gick fel och hur man fixar det.

Ta inspiration av strukturen i coachverktyg som Fitr, men använd inte deras logotyp, färger, ikoner eller texter. Egna ikoner (Lucide).

## 12. Icke-funktionella krav

Fungerar offline förutom AI. Ingen dataförlust vid stängd flik. Migreringar med versionsnummer i både Dexie och Supabase från dag ett. Tillgänglighet: touchytor minst 44 px, kontrast AA, synlig tangentbordsfokus, `prefers-reduced-motion` respekteras. Inga hemligheter i klienten. Ingen tredjepartsanalys.

## 13. Leverans

Börja med att visa datamodell, Zod-scheman, RLS-policies och en kort arkitekturskiss, och vänta på mitt godkännande innan du skriver kod. Bygg sedan i den här ordningen:

1. Supabase-schema, RLS och migreringar
2. Övningsparser med tester
3. Import (xlsx-kullamannen först, sedan generic) och granskningsvy
4. Vecko-, dags- och loggvyer mot lokal Dexie
5. Synk mot Supabase och auth
6. Kalender, statistik och skor
7. AI-lagret med proposal-flödet och Edge Function
8. Bildimport, profiler, delning, export och PWA

Commita i små steg. Skriv tester för parsern, `deriveWeekFlags`, proposal-diffen, synkkön och skoberäkningen, samt ett e2e-flöde: importera fil, öppna dagen, logga ett pass, se att veckosumman uppdateras.
