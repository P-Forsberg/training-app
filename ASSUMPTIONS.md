# Antaganden

Format: se CLAUDE.md, punkt 4. Nyaste längst ned inom varje avsnitt.

## Blockerare

Inga just nu.

## 2026-09-23 · Supabase
Blockerare (bara för molnet): `supabase db push` utan lösenord avbryts med "permission denied to alter role cli_login_postgres". Projektet hade dessutom fyra gamla migreringar från 2025-11 och en kvarglömd trigger `on_auth_user_created` med funktionerna `handle_new_user` och `update_updated_at_column`.
Så löstes det: lösenordet sattes via `SUPABASE_DB_PASSWORD`, den gamla historiken markerades som `reverted`, och triggern och funktionerna togs bort för hand. Alla fyra migreringar ligger nu i molnet och anonym åtkomst nekas.
Status: löst 2026-09-24

## Antaganden

## 2026-09-23 · Verktyg
Antagande: TypeScript låses till 6.0.x i stället för 7.x.
Varför: typescript-eslint 8.70 stöder bara TypeScript < 6.1.
Så ändras det: höj `typescript` i package.json när typescript-eslint stöder 7.
Status: öppen

## 2026-09-23 · Verktyg
Antagande: pnpm-skripten `build` och `lint` kör `tsc --noEmit` mot en enda tsconfig i stället för projektreferenser (`tsc -b`).
Varför: enklare, och det finns bara ett kompileringsmål.
Så ändras det: dela upp tsconfig.json och byt till `tsc -b`.
Status: öppen

## 2026-09-23 · Delning
Antagande: rollen `editor` i `program_shares` ger bara läsrätt i v1, precis som `viewer`.
Varför: skrivning från flera användare på samma plan kräver konfliktlösning mellan användare.
Så ändras det: lägg till update-policies med `can_edit_program()` på programtabellerna.
Status: öppen

## 2026-09-23 · Schema
Antagande: `logged_runs` har ett eget `id` som primärnyckel och `logged_session_id unique`, i stället för att `logged_session_id` är primärnyckel som i specen.
Varför: alla tabeller får samma form, så att synk och outbox kan hantera dem generiskt. Relationen är fortfarande 1:1.
Så ändras det: migrering som byter primärnyckel.
Status: öppen

## 2026-09-23 · Schema
Antagande: `planned_sessions.day_of_week` följer ISO (1 = måndag … 7 = söndag), och en check-constraint håller kolumnen i fas med `date`.
Varför: specen angav bara `int`, och ISO stämmer med att veckan börjar på måndag.
Så ändras det: constrainten i core_schema-migreringen.
Status: öppen

## 2026-09-23 · Övningar
Antagande: den globala övningskatalogen har deterministiska UUID:n och finns både som migrering och inbakad i klienten.
Varför: en import ska kunna matcha övningar offline, innan första synken.
Så ändras det: redigera `scripts/exercise-catalog.source.json` och kör `pnpm gen:exercises`.
Status: öppen

## 2026-09-23 · Delning
Antagande: den som fått ett program delat med sig kan läsa ägarens egna övningar (inte bara de globala).
Varför: annars saknar delade pass namn på egna övningar.
Så ändras det: policyn `exercises_select` och `shares_with_me()`.
Status: öppen

## 2026-09-23 · Skor
Antagande: standardgränsen för skor med underlag "mixed" är 700 km, mitt emellan väg (800) och trail (600).
Varför: specen anger bara väg och trail.
Så ändras det: `DEFAULT_RETIRE_KM` i `domain/shoeMileage.ts`.
Status: öppen

## 2026-09-23 · Skor
Antagande: varningen för fel sko gäller löppass på minst 15 km på underlaget "technical" i skor märkta "road".
Varför: specen säger "långt pass" utan siffra.
Så ändras det: `LONG_TECHNICAL_RUN_KM` i `domain/shoeMileage.ts`.
Status: öppen

## 2026-09-23 · Data
Antagande: radtyperna genereras från Postgres (`pnpm db:types`) och används direkt i Dexie, med kolumner som har check-constraints avsmalnade till unions i `data/rows.ts`. Zod används vid systemgränserna (import, kommandon, AI-förslag, backup) i stället för ett handskrivet schema per tabell.
Varför: ett enda sanningsläge för radformen; synken behöver ingen fältmappning.
Så ändras det: lägg till Zod-scheman per tabell i `data/` och validera pull-rader mot dem.
Status: öppen

## 2026-09-23 · Data
Antagande: UI läser med `useLiveQuery` (dexie-react-hooks) i stället för TanStack Query. TanStack Query finns kvar för nätverksanrop.
Varför: Dexie-frågor uppdateras reaktivt när lokala rader ändras, vilket är precis vad en offline-först-vy behöver.
Så ändras det: `data/repository.ts`, hookarna.
Status: öppen

## 2026-09-23 · Synk
Antagande: rader som skapas innan inloggning får en lokal platshållar-ägare och flyttas till kontot vid första inloggningen. Byter man konto på samma enhet rensas den förra användarens lokala data.
Varför: appen ska fungera direkt, utan konto, och ändå synka det som loggats när man loggar in.
Så ändras det: `data/sync/adoptLocalRows.ts`.
Status: öppen

## 2026-09-23 · Loggning
Antagande: anteckningar skrivs per pass (fältet `comment` på loggen) i stället för i ett eget anteckningsblock för hela dagen. Uppvärmning visas bara om den finns som rader i planen.
Varför: datamodellen har ingen dagslogg, och uppvärmning finns inte som egen entitet.
Så ändras det: en tabell för dagsanteckningar, eller ett block i `features/day/DayView.tsx`.
Status: öppen

## 2026-09-23 · Loggning
Antagande: ett styrkepass med schemat "1–3RM" och utan angivet antal set får tre rader i set-rutnätet.
Varför: specen anger inget antal set för RM-försök.
Så ändras det: `plannedSetCount()` i `features/day/StrengthForm.tsx`.
Status: öppen

## 2026-09-23 · Loggning
Antagande: en viktintervall i procent ("@70–75%") sparas med den lägre siffran som `load`; hela texten finns kvar i `raw_text`.
Varför: `planned_items` har bara ett lastfält.
Så ändras det: lägg till `load_max` i schemat och i `parseLoad()`.
Status: öppen

## 2026-09-23 · AI
Antagande: AI-anrop använder `claude-sonnet-5` med adaptivt tänkande, effort `medium` för chatt och `high` för bildimport. Kvoten är 200 anrop och 2 miljoner tokens per användare och månad.
Varför: valt i frågerundan.
Så ändras det: `MODEL`, `MONTHLY_REQUESTS` och `MONTHLY_TOKENS` i `supabase/functions/ai/index.ts`.
Status: öppen

## 2026-09-23 · AI
Antagande: kontexten byggs i klienten från den lokala databasen och skickas med varje fråga. När assistenten skapar förslag läser servern planen från Supabase, så klienten synkar innan frågan skickas.
Varför: kontexten ska spegla det användaren ser, även osynkade loggar, men förslagen måste bygga på serverns rader för att gå att godkänna.
Så ändras det: `features/ai/context.ts` och `chat()` i Edge Function.
Status: öppen

## 2026-09-23 · AI
Antagande: ett förslag som rör rader som ändrats efter att förslaget skapades går inte att godkänna ("Planen har ändrats…"). Användaren får be om ett nytt förslag.
Varför: annars kan ett gammalt förslag skriva över nyare ändringar.
Så ändras det: `applyProposal()` i `features/ai/proposalDiff.ts`.
Status: öppen

## 2026-09-23 · AI
Antagande: `generateSession` utan aktivt program skapar ett program som heter "Egna pass" i samma förslag.
Varför: planerade pass måste höra till ett program.
Så ändras det: `generateSession()` i Edge Function.
Status: öppen

## 2026-09-23 · AI
Antagande: verktygsschemana finns både i Edge Function (JSON Schema) och i klienten (Zod för `ProposalDiff`), i stället för i en delad fil.
Varför: Supabase bundlar bara filer under `supabase/functions`.
Så ändras det: flytta till `supabase/functions/_shared` och importera därifrån i klienten via ett alias.
Status: öppen

## 2026-09-23 · AI
Antagande: att generera ett helt program kan ta längre tid än Edge Functions tidsgräns på gratisnivån (150 s) för mycket långa program.
Varför: långa program ger stora svar.
Så ändras det: dela upp genereringen per block av veckor, eller byt till en plan med längre tidsgräns.
Status: öppen

## 2026-09-24 · Inloggning
Antagande: appen är stängd. Med backend konfigurerad visas bara inloggningsskärmen tills någon loggat in, och databasen stoppar konton för adresser som inte står i `private.allowed_emails`.
Varför: bara du och din sambo ska komma åt appen.
Så ändras det: lägg till en adress med `insert into private.allowed_emails (email) values ('…');` i SQL-editorn. Spärren i klienten sitter i `app/App.tsx`.
Status: öppen

## 2026-09-24 · Inloggning
Antagande: inloggning sker med e-post och lösenord i stället för länk. Länk används bara för att återställa lösenordet.
Varför: en inloggningslänk öppnas i webbläsaren och inte i den installerade appen på iPhone, så sessionen hamnar på fel ställe.
Så ändras det: `data/remote/auth.ts` och `features/auth/LoginView.tsx`.
Status: öppen

## 2026-09-24 · Inloggning
Antagande: tabellen `private.allowed_emails` saknar `owner`, som ett undantag från regeln att varje tabell har en ägare. Den ligger i ett schema som inte nås via API:t och har RLS påslaget utan policies.
Varför: listan gäller hela appen, inte en användare, och bara ägaren av projektet ändrar den via SQL.
Så ändras det: migreringen `20260924000001_allowed_emails.sql`.
Status: öppen

## 2026-09-24 · Inloggning
Antagande: utloggning rensar enhetens lokala data. Före utloggningen synkas väntande ändringar, och finns det ändå osynkade ändringar måste användaren bekräfta utloggningen en gång till.
Varför: en delad eller förlorad telefon ska inte behålla någons träningsdata.
Så ändras det: `handleUser()` i `data/sync/engine.ts`.
Status: öppen

## 2026-09-24 · Passtyp
Antagande: ett löppass typ (Lugnt, Tempo, Intervall, Fartlek, Backe, Långpass) läses ur programmets egen text. Det kräver en veckodag och ett nyckelord i samma mening, i veckans fokus eller i dagens instruktion ("Tempo ons: 3x6 min"). Står ett kvalitetspass utan veckodag gissas ingen dag. En typ som användaren satt via "Ändra passtyp" går före texten.
Varför: Excel-filen har bara kilometer per dag, och ingen träningsregel får ligga i koden.
Så ändras det: nyckelorden i `domain/sessionIntent.ts`.
Status: öppen

## 2026-09-24 · Passtyp (tränings­beslut, ditt att äga)
Antagande: när veckans text namnger kvalitetspass på vissa dagar visas veckans övriga löppass som "Lugnt". Etiketten har en förklaring vid hovring ("Tolkat").
Varför: så brukar planer skrivas, och du ville kunna se de lugna passen.
Så ändras det: sätt `OTHER_RUNS_EASY = false` i `domain/sessionIntent.ts`.
Status: öppen

## 2026-09-25 · Import
Antagande: veckodagen för en textkolumn läses ur rubriken ("Onsdag – kvalitetspass" → onsdag). Har kolumnen text en dag som saknar planerad distans skapas ett löppass utan distans, och importen visar en varning.
Varför: ingen veckodag får vara hårdkodad, och texten får inte försvinna.
Så ändras det: `import/planHeader.ts` och delen om textkolumner i `xlsxKullamannen.ts`.
Status: öppen

## 2026-09-25 · Strukturerat pass
Antagande: huvuddelen räknas som klar när alla intervaller är avbockade. Utan antal intervaller (t.ex. "20 min stadigt") räknas den som klar när distansen är ifylld. Uppvärmning och nedvarvning räknas som klara när deras distans är ifylld.
Varför: specen säger "fylld när delen är klar" utan närmare definition.
Så ändras det: `StructuredRunBlock.tsx`, variabeln `mainStatus`.
Status: öppen

## 2026-09-25 · Strukturerat pass
Antagande: ett strukturerat pass som flyttats till en annan dag visas utan delblocket på den nya dagen. Loggningen görs då i det vanliga löpblocket.
Varför: delblocket bygger på det planerade passet på den planerade dagen. Flyttade pass är ovanliga.
Så ändras det: visa `StructuredRunBlock` även i `ExtraBlock` i `DayView.tsx`.
Status: öppen

## 2026-09-25 · Passtyp
Antagande: "Progressivt" är en egen passtyp och räknas som kvalitetspass.
Varför: exemplet "Progressivt 16 km … sista 5 km i maratonfart" är varken lugnt eller tempo.
Så ändras det: `KEYWORDS` och `QUALITY` i `domain/sessionIntent.ts`.
Status: öppen
