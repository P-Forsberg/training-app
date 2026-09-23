import type { SheetData } from '../cells';

/**
 * Synthetic workbook with the Veckoplan/Styrka layout. All values are invented
 * and obviously fake ("Testfas", round numbers). Never put real user data here.
 * Dates are Excel serials, as SheetJS delivers them: 46286 = 2026-09-21 (Monday).
 */
export const SYNTH_FIRST_MONDAY_SERIAL = 46286;

const planHeader = [
  'Vecka', 'Måndag', 'Fas', 'Veckor kvar', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön',
  'Summa', 'Löppass', 'Styrkepass', 'Styrkeläge', 'Fokus',
];
const strengthHeader = [
  'Vecka', 'Datum', 'Cykel', 'Programvecka', 'Läge underkropp', 'Måndagsinstruktion',
  'Måndag – ME Lower', 'Onsdag – ME Upper', 'Fredag – DE Combo', 'Kommentar',
];

export function syntheticKullamannen(weeks = 4): SheetData {
  const plan: unknown[][] = [planHeader];
  const strength: unknown[][] = [strengthHeader];
  for (let w = 1; w <= weeks; w++) {
    const serial = SYNTH_FIRST_MONDAY_SERIAL + (w - 1) * 7;
    const backToBack = w % 2 === 0;
    const km = [5, 6, 0, 6, 0, 10, backToBack ? 8 : 0];
    plan.push([
      w, serial, 'Testfas', weeks - w, ...km, km.reduce((a, b) => a + b, 0),
      km.filter(Boolean).length, 3, 'Full', `Testfokus vecka ${w}`,
    ]);
    strength.push([
      w, serial, 'Testcykel', w, 'Normal', `Testinstruktion vecka ${w}`,
      'Box Squat – 1–3RM\nLeg Curl – 4×12\nCopenhagen Plank – 3×20 s/sida',
      'Overhead Press – toppset 3 reps @RPE 8\nPull-Ups – 4×AMRAP',
      w === weeks ? '-' : 'Speed Bench – 8×3 @70%\nTrap Bar Deadlift – 3×3 @80%\nOkänd testövning – 3×10',
      '',
    ]);
  }
  return {
    'Läs först': [['Testnyckel', 'Testvärde'], ['Annan nyckel', 'Annat värde']],
    Veckoplan: plan,
    Styrka: strength,
    Nyckelpass: [['Långpass', 'Testbeskrivning']],
  };
}
