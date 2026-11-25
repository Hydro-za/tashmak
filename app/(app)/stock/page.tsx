import {requirePerm} from '@/lib/session';
import StockManager from '@/components/StockManager';
import {Top} from '@/components/ui';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function StockPage({searchParams}:{searchParams:Promise<{view?:string}>}){
 const [{view},me]=await Promise.all([searchParams,requirePerm('stock.manage')]);
 const {data:setting}=await me.sb.from('system_settings').select('value').eq('key','stock').maybeSingle();
 const purchaseOrdersEnabled=setting?.value?.purchaseOrdersEnabled!==false;
 const purchaseView=view==='purchase-orders';
 if(purchaseView&&!purchaseOrdersEnabled)redirect('/stock');
 const [{data:stock,error},secondary]=await Promise.all([
  me.sb.rpc('stock_snapshot'),
  purchaseView?me.sb.rpc('purchase_order_snapshot'):me.sb.from('products').select('id,name,data').order('name')
 ]);
 if(error)throw new Error('Could not load stock: '+error.message);
 if(secondary.error)throw new Error(purchaseView?'Could not load purchase orders: '+secondary.error.message:'Could not load product links: '+secondary.error.message);
 const products=purchaseView?[]:(secondary.data||[]);
 const orders=purchaseView?(secondary.data||[]):[];
 return <><Top title="Stock management" sub="Manage raw materials, purchase orders and stock movements in one place."/><StockManager items={stock?.items||[]} movements={stock?.movements||[]} products={products} orders={orders} initialView={purchaseView?'purchase-orders':'inventory'} isOwner={me.isOwner} purchaseOrdersEnabled={purchaseOrdersEnabled}/></>;
}
