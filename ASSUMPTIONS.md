# Antaganden

Format: se CLAUDE.md, punkt 4. Nyaste längst ned inom varje avsnitt.

## Blockerare

## 2026-09-23 · Supabase
Blockerare (bara för molnet): `supabase db push` från den här sessionen avbryts med "permission denied to alter role cli_login_postgres". Det lokala arbetet påverkas inte.
Så löses det: kör `pnpm db:push` i en egen terminal och ange databaslösenordet när du blir tillfrågad. Lösenordet ska inte klistras in i chatten.
Status: öppen

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
