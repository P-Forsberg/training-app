import type { RunSurface, ShoeSurface } from '@/domain/shoeMileage';
import type { ItemKind, LoadUnit, LoggedStatus, RepScheme, SessionType } from '@/domain/types';
import type { ThemeSetting } from '@/ui/theme';
import type { Database } from './remote/database.types';

/**
 * Row types are generated from the Postgres schema (pnpm db:types) and used
 * in the local Dexie store too, so sync needs no field mapping. Columns with a
 * check constraint are generated as `string`; they are narrowed here to the
 * same unions the constraints allow.
 */
export type TableName = keyof Database['public']['Tables'];
type DbRow<T extends TableName> = Database['public']['Tables'][T]['Row'];
type Override<T, U> = Omit<T, keyof U> & U;

interface Narrowed {
  profiles: Override<DbRow<'profiles'>, { theme: ThemeSetting }>;
  programs: Override<DbRow<'programs'>, { source: 'xlsx' | 'image' | 'ai' | 'manual' }>;
  planned_sessions: Override<DbRow<'planned_sessions'>, { type: SessionType }>;
  planned_items: Override<
    DbRow<'planned_items'>,
    { kind: ItemKind; rep_scheme: RepScheme | null; load_unit: LoadUnit | null }
  >;
  shoes: Override<DbRow<'shoes'>, { surface_type: ShoeSurface }>;
  logged_sessions: Override<DbRow<'logged_sessions'>, { type: SessionType; status: LoggedStatus }>;
  logged_runs: Override<DbRow<'logged_runs'>, { surface: RunSurface | null }>;
  proposals: Override<DbRow<'proposals'>, { status: 'pending' | 'accepted' | 'rejected' | 'undone' }>;
  program_shares: Override<DbRow<'program_shares'>, { role: 'viewer' | 'editor' }>;
}

export type Row<T extends TableName> = T extends keyof Narrowed ? Narrowed[T] : DbRow<T>;

/** Tables that are synced, in parent-before-child order (push order). */
export const SYNCED_TABLES = [
  'profiles',
  'exercises',
  'programs',
  'program_weeks',
  'program_notes',
  'planned_sessions',
  'planned_items',
  'shoes',
  'logged_sessions',
  'logged_runs',
  'logged_sets',
  'proposals',
  'mutations',
  'program_shares',
  'import_profiles',
  'ai_usage',
] as const satisfies readonly TableName[];
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Tables the client may write. ai_usage is server-only. */
export type WritableTable = Exclude<SyncedTable, 'ai_usage'>;

/** Tables that belong to the planned layer. Logging commands never write these. */
export const PLANNED_TABLES = ['programs', 'program_weeks', 'program_notes', 'planned_sessions', 'planned_items'] as const;

export type ProfileRow = Row<'profiles'>;
export type ExerciseRow = Row<'exercises'>;
export type ProgramRow = Row<'programs'>;
export type ProgramWeekRow = Row<'program_weeks'>;
export type ProgramNoteRow = Row<'program_notes'>;
export type PlannedSessionRow = Row<'planned_sessions'>;
export type PlannedItemRow = Row<'planned_items'>;
export type ShoeRow = Row<'shoes'>;
export type LoggedSessionRow = Row<'logged_sessions'>;
export type LoggedRunRow = Row<'logged_runs'>;
export type LoggedSetRow = Row<'logged_sets'>;
export type ProposalRow = Row<'proposals'>;
export type MutationRow = Row<'mutations'>;
export type ProgramShareRow = Row<'program_shares'>;
export type ImportProfileRow = Row<'import_profiles'>;
