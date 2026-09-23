# Antaganden

Format: se CLAUDE.md, punkt 4. Nyaste längst ned inom varje avsnitt.

## Blockerare

Inga just nu.

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
