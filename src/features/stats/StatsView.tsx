import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { href } from '@/app/router';
import { useExercises, useOverview, useShoes } from '@/data/repository';
import { shoeProgress } from '@/domain/shoeMileage';
import { Block, Button, EmptyState, ProgressBar, Select } from '@/ui/components';
import { formatDate, formatKm } from '@/ui/format';
import { PageHeader } from '@/ui/PageHeader';
import { e1rmByExercise, kmPerSurface, kmPerWeek, partsPerWeek, sessionsPerMonth } from './aggregate';

// Chart styling uses theme variables only. Two-series charts pair the accent with
// a neutral (planned), so identity never depends on telling two hues apart.
const AXIS = { stroke: 'var(--muted)', fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = { stroke: 'var(--line)', vertical: false } as const;
const TOOLTIP = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--fg)', fontSize: 13 },
  labelStyle: { color: 'var(--muted)' },
  cursor: { fill: 'var(--line)', opacity: 0.4 },
} as const;
const km = (v: unknown) => `${formatKm(Number(v))} km`;

function ChartBlock({ title, children, table }: { title: string; children: React.ReactNode; table: React.ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Block className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Visa diagram' : 'Visa tabell'}
        </Button>
      </div>
      {showTable ? <div className="max-h-72 overflow-auto text-sm">{table}</div> : children}
    </Block>
  );
}

export function StatsView() {
  const o = useOverview();
  const exercises = useExercises();
  const shoes = useShoes();
  const weeks = useMemo(() => (o ? kmPerWeek(o) : []), [o]);
  const surfaces = useMemo(() => (o ? kmPerSurface(o) : []), [o]);
  const parts = useMemo(() => (o ? partsPerWeek(o) : []), [o]);
  const months = useMemo(() => (o ? sessionsPerMonth(o) : []), [o]);
  const strength = useMemo(() => (o ? e1rmByExercise(o) : new Map()), [o]);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const selected = exerciseId ?? [...strength.keys()][0] ?? null;

  if (!o) return null;
  const hasAny = weeks.length || months.length;

  return (
    <>
      <PageHeader title="Statistik" subtitle="Planerat mot faktiskt" />
      {!hasAny && <EmptyState title="Ingen statistik än">Logga ditt första pass så dyker siffrorna upp här.</EmptyState>}
      <div className="flex flex-col gap-3">
        {weeks.length > 0 && (
          <ChartBlock
            title="Km per vecka"
            table={
              <table className="w-full tabular-nums">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="font-normal">Vecka</th>
                    <th className="text-right font-normal">Planerat</th>
                    <th className="text-right font-normal">Loggat</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.monday}>
                      <td>{w.label}</td>
                      <td className="text-right">{formatKm(w.planned)}</td>
                      <td className="text-right">{formatKm(w.logged)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <div className="overflow-x-auto">
              <div style={{ width: Math.max(320, weeks.length * 22), height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={weeks} barGap={2} margin={{ left: -20, right: 4, top: 4 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
                    <YAxis {...AXIS} width={44} />
                    <Tooltip {...TOOLTIP} formatter={km} />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
                    <Bar dataKey="planned" name="Planerat" fill="var(--line)" radius={[4, 4, 0, 0]} maxBarSize={10} />
                    <Bar dataKey="logged" name="Loggat" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </ChartBlock>
        )}

        {parts.length > 0 && (
          <ChartBlock
            title="Kvalitetspass per vecka"
            table={
              <table className="w-full tabular-nums">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="font-normal">Vecka</th>
                    <th className="text-right font-normal">Huvuddel</th>
                    <th className="text-right font-normal">Uppv. + nedjogg</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((w) => (
                    <tr key={w.monday}>
                      <td>{w.label}</td>
                      <td className="text-right">{formatKm(w.quality)}</td>
                      <td className="text-right">{formatKm(w.easyParts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={parts} barGap={2} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} width={44} />
                  <Tooltip {...TOOLTIP} formatter={km} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
                  <Bar dataKey="quality" name="Huvuddel" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={12} />
                  <Bar dataKey="easyParts" name="Uppvärmning och nedjogg" fill="var(--line)" radius={[4, 4, 0, 0]} maxBarSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartBlock>
        )}

        {surfaces.length > 0 && (
          <Block className="p-4">
            <h2 className="mb-3 text-[15px] font-semibold">Underlag</h2>
            <ul className="flex flex-col gap-2.5">
              {surfaces.map((s) => (
                <li key={s.surface}>
                  <div className="mb-1 flex text-sm">
                    <span>{s.surface}</span>
                    <span className="ml-auto tabular-nums text-muted">{formatKm(s.km)} km</span>
                  </div>
                  <ProgressBar value={s.km / surfaces[0]!.km} label={`${s.surface}, km`} />
                </li>
              ))}
            </ul>
          </Block>
        )}

        {strength.size > 0 && selected && (
          <ChartBlock
            title="Beräknat 1RM"
            table={
              <table className="w-full tabular-nums">
                <tbody>
                  {(strength.get(selected) ?? []).map((p: { date: string; e1rm: number }) => (
                    <tr key={p.date}>
                      <td>{formatDate(p.date, 'd MMM yyyy')}</td>
                      <td className="text-right">{p.e1rm} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <label htmlFor="e1rm-ex" className="sr-only">
              Övning
            </label>
            <Select id="e1rm-ex" className="mb-2 w-full" value={selected} onChange={(e) => setExerciseId(e.target.value)}>
              {[...strength.keys()].map((id) => (
                <option key={id} value={id}>
                  {exercises?.get(id)?.canonical_name ?? 'Övning'}
                </option>
              ))}
            </Select>
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={strength.get(selected)} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => formatDate(d, 'd/M')} />
                  <YAxis {...AXIS} width={44} domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip {...TOOLTIP} cursor={{ stroke: 'var(--muted)' }} labelFormatter={(d) => formatDate(String(d), 'd MMM yyyy')} formatter={(v) => [`${String(v)} kg`, 'e1RM']} />
                  <Line type="monotone" dataKey="e1rm" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-muted">Epley, bästa set per pass, uppvärmning räknas inte.</p>
          </ChartBlock>
        )}

        {months.length > 0 && (
          <ChartBlock
            title="Pass per månad"
            table={
              <table className="w-full tabular-nums">
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td>{formatDate(`${m.month}-01`, 'LLL yyyy')}</td>
                      <td className="text-right">{m.run} löp</td>
                      <td className="text-right">{m.strength} styrka</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={months} barGap={2} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="month" {...AXIS} tickFormatter={(m: string) => formatDate(`${m}-01`, 'LLL')} />
                  <YAxis {...AXIS} width={44} allowDecimals={false} />
                  <Tooltip {...TOOLTIP} labelFormatter={(m) => formatDate(`${String(m)}-01`, 'LLLL yyyy')} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
                  <Bar dataKey="run" name="Löppass" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="strength" name="Styrkepass" fill="var(--muted)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartBlock>
        )}

        {!!shoes?.length && (
          <Block className="p-4">
            <div className="mb-3 flex items-center">
              <h2 className="text-[15px] font-semibold">Skor</h2>
              <a className="ml-auto text-sm text-accent" href={href({ name: 'shoes' })}>
                Hantera
              </a>
            </div>
            <ul className="flex flex-col gap-2.5">
              {shoes
                .filter((s) => !s.shoe.retired_on)
                .map((s) => (
                  <li key={s.shoe.id}>
                    <div className="mb-1 flex text-sm">
                      <span>{s.shoe.name}</span>
                      <span className="ml-auto tabular-nums text-muted">
                        {formatKm(s.km)} / {formatKm(s.shoe.retire_km)} km
                      </span>
                    </div>
                    <ProgressBar value={shoeProgress(s.km, s.shoe.retire_km)} label={s.shoe.name} />
                  </li>
                ))}
            </ul>
          </Block>
        )}
      </div>
    </>
  );
}
