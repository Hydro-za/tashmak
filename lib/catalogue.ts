import type { SupabaseClient } from '@supabase/supabase-js';

const byId = (rows: any[] | null) => Object.fromEntries((rows || []).map((r: any) => [r.id, { ...r.data, id: r.id }]));

/** Loads the calculator's catalogue + settings from PostgreSQL in the exact shape the (unchanged) calculator engine expects. */
export async function loadCalcConfig(sb: SupabaseClient) {
  const [pr, cat, mat, mac, lab, fin, ps, ss] = await Promise.all([
    sb.from('products').select('id,data'), sb.from('product_categories').select('id,data'), sb.from('materials').select('id,data'), sb.from('machines').select('id,data'),
    sb.from('labour_types').select('id,data'), sb.from('finishing_options').select('id,data'), sb.from('pricing_settings').select('data').eq('id', 1).maybeSingle(), sb.from('system_settings').select('key,value')
  ]);
  const sys = Object.fromEntries((ss.data || []).map((r: any) => [r.key, r.value]));
  const pricing = ps.data?.data || {};
  const settings = { ...pricing, business: sys.business || {}, quotes: sys.quotes || {}, permissions: { manager: {}, staff: {} }, defaultRole: 'staff' };
  return { settings, products: byId(pr.data), categories: byId(cat.data), materials: byId(mat.data), machines: byId(mac.data), labour: byId(lab.data), finishing: byId(fin.data), productCount: (pr.data || []).length };
}
export const TABLE_FOR_KIND: Record<string, string> = { materials: 'materials', machines: 'machines', labour: 'labour_types', finishing: 'finishing_options', categories: 'product_categories', products: 'products' };
