import { useEffect, useState } from 'react';
import { usePendingImport } from './pendingImport';
import { navigate } from '@/app/router';
import { importProgram, saveImportProfile } from '@/data/commands/program';
import * as generic from '@/import/adapters/xlsxGeneric';
import * as kullamannen from '@/import/adapters/xlsxKullamannen';
import type { CanonicalProgramInput } from '@/import/canonical';
import type { SheetData } from '@/import/cells';
import { readWorkbook } from '@/import/readWorkbook';
import { Block, Button } from '@/ui/components';
import { PageHeader } from '@/ui/PageHeader';
import { ImageImport } from './ImageImport';
import { MappingForm } from './MappingForm';
import { ReviewView } from './ReviewView';

type Stage =
  | { name: 'pick' }
  | { name: 'map'; data: SheetData; fileName: string; mapping: generic.GenericMapping }
  | { name: 'review'; program: CanonicalProgramInput; back: Stage; mapping?: generic.GenericMapping };

export function ImportView() {
  const pending = usePendingImport();
  const [stage, setStage] = useState<Stage>(() =>
    pending.program ? { name: 'review', program: pending.program, back: { name: 'pick' } } : { name: 'pick' },
  );
  useEffect(() => {
    if (pending.program) pending.set(null);
  }, [pending]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const data = await readWorkbook(await file.arrayBuffer());
      if (kullamannen.detect(data)) {
        setStage({ name: 'review', program: kullamannen.parse(data, file.name), back: { name: 'pick' } });
        return;
      }
      const mapping = generic.suggestMapping(data);
      if (!mapping) {
        setError('Filen innehåller inga rader. Välj en fil med minst en rad data.');
        return;
      }
      setStage({ name: 'map', data, fileName: file.name, mapping });
    } catch {
      setError('Filen gick inte att läsa. Spara den som .xlsx eller .csv och försök igen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Importera program" subtitle="Inget sparas förrän du har granskat och godkänt." />
      {stage.name === 'pick' && (
        <div className="flex flex-col gap-3">
          <Block className="p-4">
            <h2 className="text-[15px] font-semibold">Excel eller CSV</h2>
            <p className="mt-1 text-sm text-muted">
              Filer med flikarna Veckoplan och Styrka känns igen automatiskt. Andra filer kopplar du själv: du väljer vilken kolumn som är vad.
            </p>
            <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg">
              {busy ? 'Läser filen…' : 'Välj fil'}
              <input
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                className="sr-only"
                data-testid="import-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </Block>
          <ImageImport onProgram={(program) => setStage({ name: 'review', program, back: { name: 'pick' } })} />
        </div>
      )}

      {stage.name === 'map' && (
        <MappingForm
          data={stage.data}
          initial={stage.mapping}
          onCancel={() => setStage({ name: 'pick' })}
          onDone={(mapping) =>
            setStage({ name: 'review', program: generic.parse(stage.data, mapping, stage.fileName), back: { ...stage, mapping }, mapping })
          }
        />
      )}

      {stage.name === 'review' && (
        <ReviewView
          program={stage.program}
          onBack={() => setStage(stage.back)}
          onImport={async (program, profileName) => {
            const { programId } = await importProgram(program);
            if (stage.mapping && profileName) await saveImportProfile(profileName, generic.ADAPTER_ID, stage.mapping);
            navigate({ name: 'week' });
            return programId;
          }}
        />
      )}
      {stage.name !== 'pick' && (
        <Button variant="ghost" className="mt-2" onClick={() => setStage({ name: 'pick' })}>
          Börja om med en annan fil
        </Button>
      )}
    </>
  );
}
