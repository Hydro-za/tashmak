'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {createStockItem,receiveStock,adjustStock,useStock,deleteDemoStock} from '@/lib/actions';
import ActionButton from '@/components/ActionButton';
import {toast} from '@/components/ToastHost';

type Item={id:string;material_id:string|null;name:string;unit:string;quantity:number;minimum_quantity:number;supplier?:string|null;notes?:string|null};
type Material={id:string;name:string;data:any};
type Movement={id:number;item_name:string;movement_type:string;quantity_change:number;quantity_after:number;note?:string|null;supplier?:string|null;performed_at:string;performed_by_name:string};
const number=(value:number)=>Number(value||0).toLocaleString('en-ZA',{maximumFractionDigits:3});
const movementLabel=(type:string)=>type.replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase());

export default function StockManager({items:initial,movements,materials}:{items:Item[];movements:Movement[];materials:Material[]}){
 const router=useRouter();const items=initial||[];
 const [mode,setMode]=useState<'new'|'receive'|'adjust'|'use'|null>(null);
 const [selected,setSelected]=useState('');const [selectedMaterial,setSelectedMaterial]=useState('');
 const [unit,setUnit]=useState('sheets');const [minimum,setMinimum]=useState('0');
 const [supplier,setSupplier]=useState('');const [quantity,setQuantity]=useState('');const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 const low=items.filter(i=>Number(i.quantity)<=Number(i.minimum_quantity));
 const availableMaterials=materials.filter(m=>!items.some(i=>i.material_id===m.id));
 const unitForMaterial=(id:string)=>{const basis=materials.find(x=>x.id===id)?.data?.costBasis;return basis==='sheet'?'sheets':basis==='sqm'?'m²':basis==='metre'?'m':basis==='kg'?'kg':'units';};
 const start=(next:'new'|'receive'|'adjust'|'use',id='')=>{setSelected(id);setMode(next);if(next==='new'){const first=availableMaterials[0]?.id||'';setSelectedMaterial(first);setUnit(unitForMaterial(first));}setQuantity(next==='adjust'?String(items.find(x=>x.id===id)?.quantity??0):'');setMinimum('0');setNote('');setSupplier('');};
 async function run(fn:()=>Promise<any>){setBusy(true);try{const r=await fn();if(!r.ok){toast(r.error||'Could not save stock change','bad');return;}toast('Stock updated');setMode(null);setQuantity('');setNote('');setSupplier('');router.refresh();}finally{setBusy(false);}}
 async function submit(){if(mode==='new')return run(()=>createStockItem(selectedMaterial,unit,Number(minimum),supplier,note));if(mode==='receive')return run(()=>receiveStock(selected,Number(quantity),supplier,note));if(mode==='adjust')return run(()=>adjustStock(selected,Number(quantity),note));if(mode==='use')return run(()=>useStock(selected,Number(quantity),note));}
 const invalid=busy|| (mode==='new'?(!selectedMaterial||!unit.trim()):(!selected||!quantity||Number(quantity)<0||((mode==='receive'||mode==='use')&&Number(quantity)<=0)||((mode==='adjust'||mode==='use')&&!note.trim())));
 const heading=mode==='new'?'Add raw material':mode==='receive'?'Receive stock':mode==='use'?'Record material usage':'Adjust stock quantity';
 return <div className="stock-page">
  <section className="stock-overview" aria-label="Stock overview">
   <div className="stock-stat"><span className="stock-stat-icon">▦</span><div><span className="stock-stat-label">Tracked materials</span><strong>{items.length}</strong><small>Raw material types</small></div></div>
   <div className="stock-stat"><span className="stock-stat-icon stock-warn">!</span><div><span className="stock-stat-label">Low stock</span><strong>{low.length}</strong><small>At or below minimum</small></div></div>
   <div className="stock-stat"><span className="stock-stat-icon">◫</span><div><span className="stock-stat-label">Units tracked</span><strong>{new Set(items.map(i=>i.unit)).size}</strong><small>Different measurement units</small></div></div>
  </section>

  {low.length>0&&<section className="stock-alert"><span className="stock-alert-mark">!</span><div><b>Low stock needs attention</b><p>{low.map(i=>i.name+' · '+number(i.quantity)+' '+i.unit+' remaining').join('  /  ')}</p></div></section>}

  <section className="card stock-panel">
   <div className="stock-panel-head"><div><span className="stock-eyebrow">INVENTORY</span><h2>Raw materials</h2><p className="muted">Monitor quantities, minimum levels and suppliers in one place.</p></div><div className="stock-header-actions">{items.some(i=>i.notes?.startsWith('DEMO TEST STOCK'))&&<ActionButton action={deleteDemoStock} label="Delete demo stock" pendingLabel="Deleting…" className="btn danger" successText="Demo stock deleted" confirmText="This permanently removes only the seeded demo stock items and their stock movement history. Your real stock, catalogue materials and products will remain untouched." />}<button className="btn primary stock-add" onClick={()=>start('new')}>＋ <span>Add material</span></button></div></div>
   {items.length===0?<div className="stock-empty"><span className="stock-empty-icon">▦</span><b>Your stock list is empty</b><p className="muted">Add a material from your existing catalogue to start tracking stock.</p><button className="btn primary" onClick={()=>start('new')}>Add your first material</button></div>:
   <><div className="stock-table-wrap"><table className="tbl stock-table"><thead><tr><th>Material</th><th>Available</th><th>Minimum level</th><th>Supplier</th><th className="stock-actions-heading">Actions</th></tr></thead><tbody>{items.map(i=>{const isLow=Number(i.quantity)<=Number(i.minimum_quantity);return <tr key={i.id}><td><div className="stock-material-name">{i.name}</div><span className="stock-unit">{i.unit}</span></td><td><strong className="stock-quantity">{number(i.quantity)}</strong><span className="stock-unit"> {i.unit}</span></td><td>{number(i.minimum_quantity)} <span className="stock-unit">{i.unit}</span></td><td>{i.supplier||<span className="muted">Not set</span>}</td><td><div className="stock-row-actions"><button className="btn sm" onClick={()=>start('receive',i.id)}>Receive</button><button className="btn sm" onClick={()=>start('use',i.id)}>Record use</button><button className="btn sm" onClick={()=>start('adjust',i.id)}>Adjust</button></div>{isLow&&<span className="stock-low-label">Low stock</span>}</td></tr>})}</tbody></table></div>
   <div className="stock-mobile-list">{items.map(i=><article className="stock-mobile-item" key={i.id}><div className="stock-mobile-top"><div><b>{i.name}</b><span className="stock-unit">{i.unit}</span></div><strong className={Number(i.quantity)<=Number(i.minimum_quantity)?'stock-quantity-low':'stock-quantity'}>{number(i.quantity)} <small>{i.unit}</small></strong></div><div className="stock-mobile-meta"><span>Minimum <b>{number(i.minimum_quantity)} {i.unit}</b></span><span>Supplier <b>{i.supplier||'Not set'}</b></span></div><div className="stock-row-actions"><button className="btn sm" onClick={()=>start('receive',i.id)}>Receive</button><button className="btn sm" onClick={()=>start('use',i.id)}>Record use</button><button className="btn sm" onClick={()=>start('adjust',i.id)}>Adjust</button></div></article>)}</div></>}
  </section>

  {mode&&<section className="card stock-form-panel">
   <div className="stock-form-heading"><div><span className="stock-eyebrow">STOCK ACTION</span><h2>{heading}</h2><p className="muted">{mode==='new'?'Choose a catalogue material and set its stock alert level.':'Record a clear stock movement for your inventory.'}</p></div><button type="button" className="btn stock-cancel" disabled={busy} onClick={()=>setMode(null)}>Close</button></div>
   {mode==='new'?<div className="stock-form-grid"><div className="field"><label>Catalogue material *</label><select value={selectedMaterial} onChange={e=>{setSelectedMaterial(e.target.value);setUnit(unitForMaterial(e.target.value));}}><option value="">Choose a material…</option>{availableMaterials.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select>{availableMaterials.length===0&&<small className="muted">All active catalogue materials are already tracked.</small>}</div><div className="field"><label>Stock unit</label><input value={unit} readOnly aria-label="Stock unit derived from the material pricing basis"/></div><div className="field"><label>Minimum stock level</label><input type="number" min="0" step="0.001" value={minimum} onChange={e=>setMinimum(e.target.value)}/></div><div className="field"><label>Supplier</label><input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Supplier name (optional)"/></div></div>
   :<div className="stock-form-grid"><div className="field"><label>Material *</label><select value={selected} onChange={e=>setSelected(e.target.value)}>{items.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></div><div className="field"><label>{mode==='receive'?'Quantity received':mode==='use'?'Quantity used':'New stock quantity'} *</label><input type="number" min="0" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Enter quantity"/></div>{mode==='receive'&&<div className="field"><label>Supplier</label><input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Supplier name (optional)"/></div>}</div>}
   <div className="field stock-notes"><label>{mode==='adjust'?'Reason for adjustment': 'Notes (optional)'}</label><textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Add a short note…"/></div>
   <div className="stock-form-actions"><button className="btn primary" disabled={invalid} onClick={submit}>{busy?'Saving…':'Save stock change'}</button><button className="btn" disabled={busy} onClick={()=>setMode(null)}>Cancel</button></div>
  </section>}

  <section className="card stock-panel stock-history">
   <div className="stock-panel-head stock-history-head"><div><span className="stock-eyebrow">AUDIT TRAIL</span><h2>Recent stock history</h2><p className="muted">A record of every stock adjustment, receipt and usage.</p></div><span className="stock-history-count">{movements.length} {movements.length===1?'movement':'movements'}</span></div>
   {movements.length===0?<div className="stock-history-empty"><span className="muted">No stock movements have been recorded yet.</span></div>:<div className="stock-table-wrap"><table className="tbl stock-table"><thead><tr><th>Date</th><th>Material</th><th>Movement</th><th>Change</th><th>Balance after</th><th>Recorded by</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{new Date(m.performed_at).toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'})}</td><td>{m.item_name}</td><td>{movementLabel(m.movement_type)}</td><td><strong className={m.quantity_change<0?'stock-change-negative':'stock-change-positive'}>{m.quantity_change>0?'+':''}{number(m.quantity_change)}</strong></td><td>{number(m.quantity_after)}</td><td>{m.performed_by_name}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
