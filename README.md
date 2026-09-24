# Träning

Offline-first PWA för träningsplanering och loggning, på svenska. Importera ett program (Excel, bild eller AI), se veckan och dagen, logga löpning och styrka, räkna skor och fråga en AI-assistent om justeringar. Backend: Supabase.

- Produktspec: [docs/SPEC.md](docs/SPEC.md)
- Plan och datamodell: [docs/PLAN.md](docs/PLAN.md)
- Regler för den som ändrar koden: [CLAUDE.md](CLAUDE.md)
- Öppna antaganden: [ASSUMPTIONS.md](ASSUMPTIONS.md)

## Kom igång

```bash
pnpm install
cp .env.example .env.local   # fyll i VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY, eller lämna tomt för enbart lokalt läge
pnpm dev
```

Utan Supabase-uppgifter körs appen enbart lokalt, utan inloggning. Med Supabase är appen stängd: bara konton vars e-post står i `private.allowed_emails` kan skapas och logga in.

## Supabase

```bash
pnpm db:start        # lokal Supabase i Docker
pnpm db:reset        # kör migreringar och seeds lokalt
pnpm db:test         # RLS-tester
pnpm db:push         # migreringar till molnprojektet (frågar efter databaslösenordet)
npx supabase functions deploy ai --use-api
npx supabase secrets set ANTHROPIC_API_KEY=...   # kör själv, klistra aldrig in nyckeln någon annanstans
```

## Driftsättning

`vercel.json` finns. Koppla repot i Vercel, sätt `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` som miljövariabler och lägg till domänen under Authentication → URL Configuration i Supabase, så att inloggningslänkarna fungerar.
