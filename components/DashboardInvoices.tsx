'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {markJobInvoiceSent} from '@/lib/actions';
import {toast} from './ToastHost';
const money=(n:any)=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(n||0));
export default function DashboardInvoices({rows}:{rows:any[]}){
 const router=useRouter();const [busy,setBusy]=useState(false);const ready=rows.filter(r=>r.status==='ready_for_invoice');
 async function sent(r:any){if(!window.confirm('Confirm invoice '+r.invoice_number+' has been sent? This only records your confirmation; it does not send the invoice.'))return;setBusy(true);const x=await markJobInvoiceSent(r.current_invoice_id);setBusy(false);if(x.ok){toast('Invoice marked as sent');router.refresh();}else toast(x.error||'Could not update invoice','bad');}
 return <div className="card"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><h2>Invoices to Send <span className="muted" style={{fontWeight:400}}>({ready.length})</span></h2><Link href="/invoices" className="btn sm">Manage invoices</Link></div>
 {ready.length?<div className="tblwrap"><table className="tbl"><thead><tr><th>Customer / job</th><th>Invoice no.</th><th className="r">Total</th><th>Prepared</th><th></th></tr></thead><tbody>{ready.slice(0,8).map((r:any)=><tr key={r.current_invoice_id}><td><b>{r.customer_name}</b><div className="muted">{r.job_number} · {r.job_title||r.quote_number}</div></td><td>{r.invoice_number}</td><td className="r">{money(r.invoice_total)}</td><td>{r.prepared_at?new Date(r.prepared_at).toLocaleDateString('en-ZA'):'—'}</td><td><button className="btn sm primary" disabled={busy} onClick={()=>sent(r)}>Mark sent</button></td></tr>)}</tbody></table></div>:<p className="muted">No invoices waiting to be sent.</p>}
 </div>;
}
