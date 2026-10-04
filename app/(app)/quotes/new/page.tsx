import { requireOwner } from '@/lib/session';
import { loadCalcConfig } from '@/lib/catalogue';
import QuoteBuilder from '@/components/QuoteBuilder';
import LoadDemo from '@/components/LoadDemo';
import { Top } from '@/components/ui';

export const dynamic = 'force-dynamic';
export default async function NewQuote({ searchParams }: { searchParams: { customer?: string } }) {
  const { sb, user, profile } = await requireOwner();
  const cfg = await loadCalcConfig(sb);
  const { data: customers } = await sb.from('customers').select('id,name,company').is('archived_at', null).order('name');
  return (<>
    <Top title="New quote" sub="Uses your existing calculator" />
    {!cfg.productCount ? <div className="card"><h2>No products yet</h2><p>The calculator needs products to price. Load the demo defaults to try it out, or add your own under Products & Pricing.</p><LoadDemo /></div>
      : <QuoteBuilder init={{ ...cfg, userId: user.id, userName: profile.full_name, mode: 'new', start: 'editor' }} customers={customers || []} customerId={searchParams.customer || ''} backHref="/quotes" />}
  </>);
}
