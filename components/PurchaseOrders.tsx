'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {createPurchaseOrder,setPurchaseOrderStatus,receivePurchaseOrder} from '@/lib/actions';
import {toast} from '@/components/ToastHost';

type Stock={id:string;name:string;unit:string;quantity:number;supplier?:string|null};
type Line={id:string;stock_item_id:string;item_name:string;unit:string;quantity_ordered:number;quantity_received:number;unit_cost:number;line_total:number};
type Order={id:string;number:string;supplier:string;status:string;expected_date:string|null;notes:string|null;total:number;created_at:string;items:Line[]};
const money=(n:number)=>'R '+Number(n||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});
const qty=(n:number)=>Number(n||0).toLocaleString('en-ZA',{maximumFractionDigits:3});
export default function PurchaseOrders({orders,stock}:{orders:Order[];stock:Stock[]}){
 const router=useRouter();
 const [creating,setCreating]=useState(false),[busy,setBusy]=useState(false);
 const [supplier,setSupplier]=useState(''),[expected,setExpected]=useState(''),[notes,setNotes]=useState('');
 const [lines,setLines]=useState([{stockItemId:'',quantity:'',unitCost:'0'}]);
 const [receiving,setReceiving]=useState<string|null>(null);
 const [received,setReceived]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState('all');
 const filtered=orders.filter(o=>filter==='all'||o.status===filter);
 const addLine=()=>setLines(v=>[...v,{stockItemId:'',quantity:'',unitCost:'0'}]);
 async function create(){
  setBusy(true);
  try{const r=await createPurchaseOrder({supplier,expectedDate:expected,notes,items:lines.map(l=>({stockItemId:l.stockItemId,quantity:Number(l.quantity),unitCost:Number(l.unitCost)}))});
   if(!r.ok){toast(r.error||'Could not create purchase order','bad');return;}
   toast('Purchase order created');setCreating(false);setSupplier('');setExpected('');setNotes('');setLines([{stockItemId:'',quantity:'',unitCost:'0'}]);router.refresh();
  }finally{setBusy(false);}
 }
 async function status(id:string,s:'ordered'|'cancelled'){setBusy(true);try{const r=await setPurchaseOrderStatus(id,s);if(!r.ok){toast(r.error||'Could not update order','bad');return;}toast(s==='ordered'?'Purchase order marked as ordered':'Purchase order cancelled');router.refresh();}finally{setBusy(false);}}
 async function receive(o:Order){const payload=o.items.map(i=>({itemId:i.id,quantity:Number(received[i.id]||0)})).filter(x=>x.quantity>0);if(!payload.length){toast('Enter at least one quantity received','bad');return;}setBusy(true);try{const r=await receivePurchaseOrder(o.id,payload);if(!r.ok){toast(r.error||'Could not receive stock','bad');return;}toast('Delivery recorded and stock updated');setReceiving(null);setReceived({});router.refresh();}finally{setBusy(false);}}
 return <div className="card" style={{padding:20}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><p className="muted" style={{margin:0}}>Order materials from suppliers and receive deliveries into stock.</p><button className="btn primary" onClick={()=>setCreating(v=>!v)}>{creating?'Close':'＋ New purchase order'}</button></div>
  {creating&&<section className="card" style={{marginTop:18,padding:16,background:'var(--surface-2)'}}><h3>New purchase order</h3><div className="grid2"><label className="field">Supplier<input value={supplier} onChange={e=>setSupplier(e.target.value)} maxLength={160} placeholder="Supplier name"/></label><label className="field">Expected delivery<input type="date" value={expected} onChange={e=>setExpected(e.target.value)}/></label></div>
   <div style={{display:'grid',gap:10,marginTop:12}}>{lines.map((l,i)=><div key={i} className="grid2" style={{alignItems:'end'}}><label className="field">Material<select value={l.stockItemId} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,stockItemId:e.target.value}:x))}><option value="">Choose material</option>{stock.map(s=><option value={s.id} key={s.id}>{s.name} ({s.unit})</option>)}</select></label><div className="grid2"><label className="field">Quantity<input type="number" min="0.001" step="0.001" value={l.quantity} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))}/></label><label className="field">Unit cost (R)<input type="number" min="0" step="0.01" value={l.unitCost} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,unitCost:e.target.value}:x))}/></label></div></div>)}</div>
   <button className="btn sm" style={{marginTop:12}} onClick={addLine}>＋ Add another material</button><label className="field" style={{marginTop:12}}>Notes<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional delivery or order notes"/></label>
   <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}><button className="btn" disabled={busy} onClick={()=>setCreating(false)}>Cancel</button><button className="btn primary" disabled={busy||!supplier.trim()||!lines.length||lines.some(l=>!l.stockItemId||!(Number(l.quantity)>0)||Number(l.unitCost)<0)} onClick={create}>{busy?'Saving…':'Create draft'}</button></div>
  </section>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'18px 0'}}>{[['all','All'],['draft','Draft'],['ordered','Ordered'],['part_received','Part received'],['received','Received'],['cancelled','Cancelled']].map(([v,l])=><button key={v} className={'btn sm '+(filter===v?'primary':'')} onClick={()=>setFilter(v)}>{l}</button>)}</div>
  {!filtered.length?<div className="empty"><b>No purchase orders here yet</b><p className="muted">Create a purchase order when you need to buy production materials.</p></div>:<div style={{display:'grid',gap:12}}>{filtered.map(o=><article key={o.id} className="card" style={{padding:16}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><b>{o.number}</b><div style={{fontSize:17,fontWeight:650,marginTop:3}}>{o.supplier}</div><div className="muted" style={{fontSize:13}}>Created {new Date(o.created_at).toLocaleDateString('en-ZA')}{o.expected_date?' · Expected '+new Date(o.expected_date+'T00:00:00').toLocaleDateString('en-ZA'):''}</div></div><div style={{textAlign:'right'}}><b>{money(o.total)}</b><div className="badge" style={{marginTop:6}}>{o.status.replaceAll('_',' ')}</div></div></div>
   <div style={{overflowX:'auto',marginTop:12}}><table className="tbl"><thead><tr><th>Material</th><th>Ordered</th><th>Received</th><th>Unit cost</th><th>Line total</th></tr></thead><tbody>{o.items.map(i=><tr key={i.id}><td>{i.item_name}</td><td>{qty(i.quantity_ordered)} {i.unit}</td><td>{qty(i.quantity_received)} {i.unit}</td><td>{money(i.unit_cost)}</td><td>{money(i.line_total)}</td></tr>)}</tbody></table></div>
   {o.notes&&<p className="muted" style={{marginTop:8}}>{o.notes}</p>}
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>{o.status==='draft'&&<><button className="btn sm primary" disabled={busy} onClick={()=>status(o.id,'ordered')}>Mark as ordered</button><button className="btn sm danger" disabled={busy} onClick={()=>status(o.id,'cancelled')}>Cancel order</button></>}{['ordered','part_received'].includes(o.status)&&<button className="btn sm primary" onClick={()=>{setReceiving(receiving===o.id?null:o.id);setReceived({});}}>Receive delivery</button>}</div>
   {receiving===o.id&&<div className="card" style={{padding:14,marginTop:12,background:'var(--surface-2)'}}><b>Record delivery quantities</b><p className="muted" style={{fontSize:13}}>Only enter the quantities that arrived in this delivery. Stock updates when you confirm.</p>{o.items.filter(i=>i.quantity_received<i.quantity_ordered).map(i=><label className="field" key={i.id}>{i.item_name} — remaining {qty(i.quantity_ordered-i.quantity_received)} {i.unit}<input type="number" min="0" max={i.quantity_ordered-i.quantity_received} step="0.001" value={received[i.id]||''} onChange={e=>setReceived(v=>({...v,[i.id]:e.target.value}))} placeholder="Quantity received"/></label>)}<div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button className="btn sm" onClick={()=>setReceiving(null)}>Cancel</button><button className="btn sm primary" disabled={busy} onClick={()=>receive(o)}>Confirm receipt</button></div></div>}
  </article>)}</div>}
 </div>;
}
