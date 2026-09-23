import { useState } from 'react';
import { callAi } from '@/data/remote/ai';
import { todayIso } from '@/domain/dates';
import type { CanonicalProgramInput } from '@/import/canonical';
import { Block } from '@/ui/components';
import { fromAiProgram } from './pendingImport';

const MAX_SIDE = 2000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Downscales photos so a phone picture stays a few hundred kB. */
async function prepareImage(file: File): Promise<{ mediaType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85));
  return { mediaType: 'image/jpeg', data: await toBase64(blob) };
}

/**
 * Photo, screenshot or PDF of a program → the AI reads it out → same review
 * view as a file import. The image itself is never stored, only the structured result.
 */
export function ImageImport({ onProgram }: { onProgram: (p: CanonicalProgramInput) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]) => {
    setError(null);
    if (files.length > 10) return setError('Välj högst 10 bilder eller sidor åt gången.');
    setBusy(true);
    try {
      const images = [];
      for (const f of files) {
        if (f.type === 'application/pdf') {
          if (f.size > MAX_PDF_BYTES) return setError('PDF-filen är större än 10 MB. Dela upp den eller ta skärmdumpar.');
          images.push({ mediaType: 'application/pdf', data: await toBase64(f) });
        } else if (f.type.startsWith('image/')) {
          images.push(await prepareImage(f));
        }
      }
      if (!images.length) return setError('Välj bilder (JPG, PNG) eller en PDF.');
      const { data, error: err } = await callAi<{ program: Record<string, unknown> }>({ action: 'parseImages', images, startHint: todayIso() });
      if (err || !data) return setError(err ?? 'Inget program kunde läsas ut.');
      onProgram(fromAiProgram(data.program, 'image'));
    } catch {
      setError('Bilden gick inte att läsa. Prova en skärmdump eller ett foto i JPG eller PNG.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block className="p-4">
      <h2 className="text-[15px] font-semibold">Bild eller PDF</h2>
      <p className="mt-1 text-sm text-muted">
        Fotografera ett program, ta en skärmdump eller välj en PDF. Assistenten läser ut passen och du granskar allt innan det sparas. Bilden sparas inte. Kräver inloggning och nät.
      </p>
      <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-sm font-semibold text-muted hover:border-accent hover:text-accent">
        {busy ? 'Läser programmet…' : 'Välj bilder'}
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void onFiles(files);
          }}
        />
      </label>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Block>
  );
}
