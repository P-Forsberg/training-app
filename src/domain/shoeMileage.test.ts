import { describe, expect, it } from 'vitest';
import { isSurfaceMismatch, shoeMileage, shoeProgress, shoeStatus } from './shoeMileage';

const shoe = { id: 's1', startKm: 120 };

describe('shoeMileage', () => {
  it('adds logged runs to the starting distance', () => {
    expect(shoeMileage(shoe, [{ shoeId: 's1', distanceKm: 10 }, { shoeId: 's1', distanceKm: 5.55 }])).toBe(135.6);
  });

  it('ignores other shoes, deleted runs and missing distances', () => {
    expect(
      shoeMileage(shoe, [
        { shoeId: 's2', distanceKm: 10 },
        { shoeId: 's1', distanceKm: 7, deleted: true },
        { shoeId: 's1', distanceKm: null },
        { shoeId: null, distanceKm: 3 },
      ]),
    ).toBe(120);
  });

  it('a new shoe with no runs is its starting distance', () => {
    expect(shoeMileage({ id: 'x', startKm: 0 }, [])).toBe(0);
  });
});

describe('shoeStatus', () => {
  it('ok below 85 %', () => expect(shoeStatus(679, 800)).toBe('ok'));
  it('soon at 85 %', () => expect(shoeStatus(680, 800)).toBe('soon'));
  it('replace at the limit', () => expect(shoeStatus(800, 800)).toBe('replace'));
  it('replace above the limit', () => expect(shoeStatus(950, 600)).toBe('replace'));
  it('no limit means ok', () => expect(shoeStatus(5000, 0)).toBe('ok'));
  it('progress is capped at 1', () => expect(shoeProgress(900, 800)).toBe(1));
});

describe('isSurfaceMismatch', () => {
  it('warns for a long technical run in road shoes', () => {
    expect(isSurfaceMismatch({ surfaceType: 'road' }, 'technical', 20)).toBe(true);
  });
  it('not for short runs or trail shoes', () => {
    expect(isSurfaceMismatch({ surfaceType: 'road' }, 'technical', 5)).toBe(false);
    expect(isSurfaceMismatch({ surfaceType: 'trail' }, 'technical', 30)).toBe(false);
  });
});
