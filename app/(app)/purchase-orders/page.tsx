import {requireMe} from '@/lib/session';
import {notFound} from 'next/navigation';
import {Top} from '@/components/ui';
import PurchaseOrders from '@/components/PurchaseOrders';
export const dynamic='force-dynamic';
export default async function PurchaseOrdersPage(){
 const me=await requireMe();
 if(!me.isOwner)notFound();
 const [{data:orders,error:ordersError},{data:stockSnapshot,error:stockError}]=await Promise.all([
  me.sb.rpc('purchase_order_snapshot'),
  me.sb.rpc('stock_snapshot')
 ]);
 if(ordersError)throw new Error('Could not load purchase orders: '+ordersError.message);
 if(stockError)throw new Error('Could not load stock materials: '+stockError.message);
 return <><Top title="Purchase orders" sub="Manage suppliers, material orders and incoming deliveries."/><PurchaseOrders orders={orders||[]} stock={stockSnapshot?.items||[]}/></>;
}