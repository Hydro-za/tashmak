import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { loadCalcConfig } from '@/lib/catalogue';
import { loadQuote } from '@/lib/quotes';
import QuoteBuilder from '@/components/QuoteBuilder';
import { Top } from '@/components/ui';

export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: { id: string } }) {
  const { sb, user, profile } = await requireOwner();
  const q = await loadQuote(sb, params.id); if (!q) notFound();
  const isEdit = 'edit' === 'edit';
  if (isEdit && !['draft', 'sent'].includes(q.status)) return <><Top title={'Quote ' + q.number} /><div className="alert warn">Accepted, declined or converted quotes are locked so the price history stays trustworthy. Use <b>Duplicate quote</b> to make a changed copy. <Link href={'/quotes/' + q.id}>Back to quote</Link></div></>;
  const cfg = await loadCalcConfig(sb);
  const { data: customers } = await sb.from('customers').select('id,name,company').is('archived_at', null).order('name');
  const quote = { ...q, customerName: q.customers?.name };
  return (<>
    <Top title={isEdit ? 'Edit ' + q.number : 'Duplicate ' + q.number} sub={isEdit ? undefined : 'A new quote is created. Prices are recalculated with current pricing — review everything before saving.'} />
    <QuoteBuilder init={{ ...cfg, userId: user.id, userName: profile.full_name, mode: isEdit ? 'edit' : 'dup', start: 'editor', quote }} customers={customers || []} customerId={q.customer_id} backHref={'/quotes/' + q.id} />
  </>);
}
