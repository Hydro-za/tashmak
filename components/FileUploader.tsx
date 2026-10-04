'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { registerFile } from '@/lib/actions';
import { toast } from './ToastHost';

const KINDS: [string, string][] = [['artwork', 'Customer artwork'], ['logo', 'Logo'], ['design', 'Design file'], ['print_ready', 'Print-ready PDF'], ['dtf_artwork', 'DTF artwork'], ['reference', 'Reference image'], ['garment_ref', 'Garment reference'], ['production', 'Production file'], ['photo', 'Job photo'], ['other', 'Other']];
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff', 'application/pdf', 'application/postscript', 'application/illustrator', 'image/vnd.adobe.photoshop', 'application/zip', 'application/x-zip-compressed', 'text/plain'];
export default function FileUploader({ jobId, items, kinds }: { jobId: string; items: { id: string; name: string }[]; kinds?: string[] }) {
  const [kind, setKind] = useState(kinds?.[0] || 'artwork'); const [item, setItem] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const router = useRouter();
  const list = KINDS.filter(k => !kinds || kinds.includes(k[0]));
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); if (!files.length || busy) return; setBusy(true); const sb = createClient(); let okc = 0;
    for (const f of files) {
      setMsg('Uploading ' + f.name + '…');
      if (f.size > 25 * 1024 * 1024) { toast(f.name + ' is larger than 25 MB', 'bad'); continue; }
      if (f.type && !OK_TYPES.includes(f.type)) { toast(f.name + ': this file type is not allowed', 'bad'); continue; }
      const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
      const path = `jobs/${jobId}/${crypto.randomUUID()}-${safe}`;
      const up = await sb.storage.from('job-files').upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (up.error) { toast('Upload failed: ' + up.error.message, 'bad'); continue; }
      const r = await registerFile(jobId, item || null, kind, path, f.name, f.type, f.size);
      if (!r.ok) { toast(r.error || 'Could not record the file', 'bad'); continue; }
      okc++;
    }
    setBusy(false); setMsg(''); e.target.value = '';
    if (okc) { toast(okc + ' file' + (okc > 1 ? 's' : '') + ' uploaded'); router.refresh(); }
  }
  return (
    <div className="grid g3" style={{ alignItems: 'end' }}>
      <div className="field"><label>File type</label><select value={kind} onChange={e => setKind(e.target.value)}>{list.map(k => <option key={k[0]} value={k[0]}>{k[1]}</option>)}</select></div>
      <div className="field"><label>For item (optional)</label><select value={item} onChange={e => setItem(e.target.value)}><option value="">Whole job</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
      <div className="field"><label>{busy ? msg : 'Choose files'}</label><input type="file" multiple onChange={onFiles} disabled={busy} /></div>
    </div>
  );
}
