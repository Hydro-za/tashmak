'use client';
import { createClient } from '@/lib/supabase/client';
import { TABLE_FOR_KIND } from '@/lib/catalogue';
import EmbedFrame from './EmbedFrame';

export default function PricingFrame({ init }: { init: any }) {
  return <EmbedFrame src="/pricing.html" title="Products and pricing" getInit={() => init} minHeight={700}
    onMessage={async (type, p, reply) => {
      if (type !== 'persist') return;
      const sb = createClient(); let error: any = null;
      try {
        if (p.op === 'set') { const t = TABLE_FOR_KIND[p.kind]; if (!t) throw new Error('Unknown record type'); ({ error } = await sb.from(t).upsert({ id: p.id, name: p.data.name, data: p.data }, { onConflict: 'id' })); }
        else if (p.op === 'del') { const t = TABLE_FOR_KIND[p.kind]; if (!t) throw new Error('Unknown record type'); ({ error } = await sb.from(t).delete().eq('id', p.id)); }
        else if (p.op === 'settings') ({ error } = await sb.from('pricing_settings').update({ data: p.data }).eq('id', 1));
      } catch (e: any) { error = e; }
      const msg = error ? (/row-level security|permission/i.test(error.message || '') ? 'You do not have permission to change pricing.' : /duplicate key/i.test(error.message || '') ? 'Another record already has that name.' : 'Not saved: ' + (error.message || 'unknown error')) : undefined;
      reply('ack', { rid: p.rid, ok: !error, error: msg });
    }} />;
}
