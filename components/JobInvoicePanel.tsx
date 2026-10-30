'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {saveJobInvoice,markJobInvoiceSent} from '@/lib/actions';
import {toast} from './ToastHost';
const money=(n:any)=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(n||0));
export default function JobInvoicePanel({snapshot,invoice,events=[]}:{snapshot:any;invoice:any;events:any[]}){
 const [open,setOpen]=useState(false);const [number,setNumber]=useState(invoice?.invoice_number||'');
 const [verified,setVerified]=useState(invoice?.verified_total==null?'':String(Number(invoice.verified_total).toFixed(2)));
 const [busy,setBusy]=useState(false);const router=useRouter();
 if(!snapshot)return <div className="card"><h2>Ready for invoice</h2><p className="muted">This job has no valid linked quote. Correct the linked quote before preparing the invoice.</p></div>;
 async function save(){if(!number.trim()){toast('Enter the invoice number','bad');return;}const total=Number(verified);if(!Number.isFinite(total)||total<0){toast('Enter a valid verified total','bad');return;}setBusy(true);const r=await saveJobInvoice(snapshot.job_id,number.trim(),total);setBusy(false);if(r.ok){toast('Invoice preparation saved');router.refresh();}else toast(r.error||'Could not prepare invoice','bad');}
 async function sent(){if(!invoice?.id)return;if(!window.confirm('Confirm invoice '+invoice.invoice_number+' has been sent? This only records your confirmation. It does not send the invoice or enter it into Sage.'))return;setBusy(true);const r=await markJobInvoiceSent(invoice.id);setBusy(false);if(r.ok){toast('Invoice marked as sent');router.refresh();}else toast(r.error||'Could not mark invoice sent','bad');}
 const ready=invoice?.status==='ready_for_invoice';const sentAlready=invoice?.status==='invoice_sent';
 return <section className="card job-invoice-panel"><div className="job-invoice-head"><div><h2>Accounting preparation</h2><p className="muted">Use these figures for manual entry into Sage.</p></div><button className="btn primary" onClick={()=>setOpen(!open)}>{open?'Hide accounting details':sentAlready?'View invoice details':'Ready for invoice'}</button></div>
 {sentAlready&&<div className="alert ok">Invoice {invoice.invoice_number} was marked sent on {new Date(invoice.sent_at).toLocaleString('en-ZA')}.</div>}
 {open&&<><div className="job-invoice-grid">{[['Customer',snapshot.customer_name],['Job',snapshot.job_number+' · '+(snapshot.job_title||'Printing job')],['Quote',snapshot.quote_number||'—'],['Sales amount',money(snapshot.sales_amount)],['VAT treatment',snapshot.vat_treatment],['VAT amount',money(snapshot.vat_amount)],['Materials cost',money(snapshot.materials_cost)],['Labour cost',money(snapshot.labour_cost)],['Invoice total',money(snapshot.invoice_total)]].map(([k,v])=><div className="metric" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>
 {snapshot.items_valid&&snapshot.invoice_total!=null?<div className="grid g2" style={{marginTop:14}}><div className="field"><label>Invoice number *</label><input value={number} maxLength={80} onChange={e=>setNumber(e.target.value)} placeholder="Enter invoice number from Sage"/></div><div className="field"><label>Verified invoice total (R) *</label><input inputMode="decimal" value={verified} onChange={e=>setVerified(e.target.value)}/></div></div>:<div className="alert warn">The saved quote calculations need review before this invoice can be marked ready.</div>}
 <p className="muted" style={{fontSize:12,marginTop:8}}>The verified total must match the saved quote total. This does not create an invoice in Sage or send it.</p>
 <div className="pillrow" style={{marginTop:12}}>{!sentAlready&&<button className="btn primary" disabled={busy||!snapshot.items_valid} onClick={save}>{busy?'Saving…':ready?'Save correction':'Confirm ready for invoice'}</button>}{ready&&<button className="btn" disabled={busy} onClick={sent}>Mark invoice sent</button>}</div>
 {events.length>0&&<details style={{marginTop:14}}><summary>Invoice history ({events.length})</summary>{events.map((e:any)=><div className="linkrow" key={e.id}><span>{e.event_type.replaceAll('_',' ')}</span><span className="muted">{new Date(e.performed_at).toLocaleString('en-ZA')}</span></div>)}</details>}
 </>}</section>;
}
