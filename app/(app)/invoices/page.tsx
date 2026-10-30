import {requireOwner} from '@/lib/session';
import {Top} from '@/components/ui';
import InvoiceTracker from '@/components/InvoiceTracker';
export const dynamic='force-dynamic';
export default async function InvoicesPage(){
 const {sb}=await requireOwner();
 const [{data:rows,error:queueError},{data:events}]=await Promise.all([
  sb.rpc('owner_invoice_queue'),
  sb.from('job_invoice_events').select('*,job_invoices(invoice_number,version)').order('performed_at',{ascending:false}).limit(100)
 ]);
 if(queueError)throw new Error('Could not load invoice preparation records.');
 const userIds=[...new Set((events||[]).map((e:any)=>e.performed_by).filter(Boolean))];
 const {data:people}=userIds.length?await sb.from('profiles').select('id,full_name').in('id',userIds):{data:[] as any[]};
 const names=Object.fromEntries((people||[]).map((p:any)=>[p.id,p.full_name]));
 const history=(events||[]).map((e:any)=>({...e,profiles:{full_name:names[e.performed_by]||'Owner'}}));
 return <div className="page-invoices"><Top title="Invoices" sub="Prepare invoice figures, record invoice numbers and track manual sending."/><InvoiceTracker rows={rows||[]} events={history}/></div>;
}
