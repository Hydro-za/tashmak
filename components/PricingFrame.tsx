'use client';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { TABLE_FOR_KIND } from '@/lib/catalogue';
import EmbedFrame from './EmbedFrame';

export default function PricingFrame({ init }: { init: any }) {
  const router = useRouter();
  return <EmbedFrame src="/pricing.html" title="Products and pricing" getInit={() => init} minHeight={700}
    onMessage={async (type, p, reply) => {
      if (type !== 'persist') return;
      const sb = createClient(); let error: any = null;
      try {
        if (p.op === 'set') { const t = TABLE_FOR_KIND[p.kind]; if (!t) throw new Error('Unknown record type'); ({ error } = await sb.from(t).upsert({ id: p.id, name: p.data.name, data: p.data }, { onConflict: 'id' })); if (!error && p.kind === 'materials') { const unit = ({ sheet: 'sheets', sqm: 'm²', metre: 'm', kg: 'kg', unit: 'units' } as Record<string,string>)[p.data.costBasis] || 'units'; const synced = await sb.rpc('stock_ensure_material', { p_material_id: p.id, p_name: p.data.name, p_unit: unit, p_supplier: p.data.supplier || null, p_notes: p.data.notes || null, p_active: p.data.active !== false }); error = synced.error; if (!error) router.refresh(); } }
        else if (p.op === 'del') {
          const t = TABLE_FOR_KIND[p.kind]; if (!t) throw new Error('Unknown record type');
          if (p.kind === 'materials') {
            // Keep the linked stock item and movement history; disabling removes it from calculator choices.
            const loaded = await sb.from('materials').select('data').eq('id', p.id).single();
            if (loaded.error) throw loaded.error;
            const data = { ...(loaded.data?.data || {}), active: false };
            ({ error } = await sb.from('materials').update({ data }).eq('id', p.id));
            if (!error) {
              const unit = ({ sheet: 'sheets', sqm: 'm²', metre: 'm', kg: 'kg', unit: 'units' } as Record<string,string>)[data.costBasis] || 'units';
              const synced = await sb.rpc('stock_ensure_material', { p_material_id: p.id, p_name: data.name, p_unit: unit, p_supplier: data.supplier || null, p_notes: data.notes || null, p_active: false });
              error = synced.error;
              if (!error) router.refresh();
            }
          } else ({ error } = await sb.from(t).delete().eq('id', p.id));
        }
        else if (p.op === 'settings') ({ error } = await sb.from('pricing_settings').update({ data: p.data }).eq('id', 1));
      } catch (e: any) { error = e; }
      const msg = error ? (/row-level security|permission/i.test(error.message || '') ? 'You do not have permission to change pricing.' : /duplicate key/i.test(error.message || '') ? 'Another record already has that name.' : 'Not saved: ' + (error.message || 'unknown error')) : undefined;
      reply('ack', { rid: p.rid, ok: !error, error: msg });
    }} />;
}
