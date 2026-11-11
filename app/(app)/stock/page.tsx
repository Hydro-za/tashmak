import {requireMe} from '@/lib/session';
import {notFound} from 'next/navigation';
import StockManager from '@/components/StockManager';
export const dynamic='force-dynamic';
export default async function StockPage(){
 const me=await requireMe();
 const allowed=me.isOwner||me.perms.some((p:string)=>['stock.view','stock.receive','stock.adjust','stock.history'].includes(p));
 if(!allowed)notFound();
 const {data,error}=await me.sb.rpc('stock_snapshot');
 if(error)throw new Error('Could not load stock: '+error.message);
 return <div className="page"><div className="page-head"><div><p className="eyebrow">Inventory</p><h1>Stock management</h1><p className="muted">Track raw materials, incoming stock and stock movements.</p></div></div><StockManager items={data?.items||[]} movements={data?.movements||[]} perms={me.perms||[]}/></div>;
}
