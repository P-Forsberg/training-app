/** Shoe mileage and replacement status. Pure functions. */

export type ShoeSurface = 'road' | 'trail' | 'mixed';
export type RunSurface = 'road' | 'gravel' | 'trail' | 'technical' | 'treadmill';
export type ShoeStatus = 'ok' | 'soon' | 'replace';

/** Share of the limit at which "Byt snart" is shown. */
export const SHOE_WARN_RATIO = 0.85;

export const DEFAULT_RETIRE_KM: Record<ShoeSurface, number> = {
  road: 800,
  trail: 600,
  mixed: 700,
};

/** A run of at least this distance on technical trail in road shoes gets a soft warning. */
export const LONG_TECHNICAL_RUN_KM = 15;

export interface ShoeLike {
  id: string;
  startKm: number;
  retireKm: number;
  surfaceType: ShoeSurface;
}

export interface RunLike {
  shoeId?: string | null;
  distanceKm?: number | null;
  deleted?: boolean;
}

export function shoeMileage(shoe: Pick<ShoeLike, 'id' | 'startKm'>, runs: RunLike[]): number {
  const logged = runs
    .filter((r) => !r.deleted && r.shoeId === shoe.id)
    .reduce((sum, r) => sum + Math.max(0, r.distanceKm ?? 0), 0);
  return Math.round((Math.max(0, shoe.startKm) + logged) * 10) / 10;
}

export function shoeStatus(km: number, retireKm: number): ShoeStatus {
  if (retireKm <= 0) return 'ok';
  if (km >= retireKm) return 'replace';
  if (km >= retireKm * SHOE_WARN_RATIO) return 'soon';
  return 'ok';
}

export function shoeProgress(km: number, retireKm: number): number {
  if (retireKm <= 0) return 0;
  return Math.min(1, km / retireKm);
}

/** True when a long technical-trail run is logged in shoes marked as road shoes. */
export function isSurfaceMismatch(shoe: Pick<ShoeLike, 'surfaceType'>, surface: RunSurface | null | undefined, distanceKm: number | null | undefined): boolean {
  return shoe.surfaceType === 'road' && surface === 'technical' && (distanceKm ?? 0) >= LONG_TECHNICAL_RUN_KM;
}
