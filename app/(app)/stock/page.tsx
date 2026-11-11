import {requireMe} from '@/lib/session';
import {notFound} from 'next/navigation';
import StockManager from '@/components/StockManager';
import {Top} from '@/components/ui';
export const dynamic='force-dynamic';
export default async function StockPage(){
 const me=await requireMe();
 if(!me.isOwner)notFound();
 const [{data,error},{data:materials,error:materialsError}]=await Promise.all([
  me.sb.rpc('stock_snapshot'),
  me.sb.from('materials').select('id,name,data').eq('active',true).order('name')
 ]);
 if(error)throw new Error('Could not load stock: '+error.message);
 if(materialsError)throw new Error('Could not load materials: '+materialsError.message);
 return <><Top title="Stock management" sub="Track raw materials, incoming stock and stock movements."/><StockManager items={data?.items||[]} movements={data?.movements||[]} materials={materials||[]}/></>;
}
