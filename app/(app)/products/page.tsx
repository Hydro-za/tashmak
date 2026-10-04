import { requireOwner } from '@/lib/session';
import { loadCalcConfig } from '@/lib/catalogue';
import PricingFrame from '@/components/PricingFrame';
import LoadDemo from '@/components/LoadDemo';
import { Top } from '@/components/ui';

export const dynamic = 'force-dynamic';
export default async function Products() {
  const { sb, user, profile } = await requireOwner();
  const cfg = await loadCalcConfig(sb);
  return (<>
    <Top title="Products & Pricing" sub="Materials, machines, labour, finishing, products, markup, VAT and discount rules used by the calculator" />
    {!cfg.productCount && <div className="alert warn" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><span>Nothing is set up yet.</span><LoadDemo /></div>}
    <PricingFrame init={{ ...cfg, userId: user.id, userName: profile.full_name }} />
  </>);
}
