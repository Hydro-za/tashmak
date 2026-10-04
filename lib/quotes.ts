import type { SupabaseClient } from '@supabase/supabase-js';
export async function loadQuote(sb: SupabaseClient, id: string) {
  const { data: q } = await sb.from('quotes').select('*, customers(id,name,company,phone,email,address,notes)').eq('id', id).maybeSingle();
  if (!q) return null;
  const { data: items } = await sb.from('quote_items').select('*').eq('quote_id', id).order('position');
  return { ...q, items: items || [] };
}
