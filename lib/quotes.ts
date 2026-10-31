import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadQuoteCustomers(sb: SupabaseClient) {
  const { data, error } = await sb.from('customers').select('id,name,company').is('archived_at', null).order('name');
  if (error) throw new Error(`Could not load customers for the quote: ${error.message}`);
  return data || [];
}

export async function loadQuote(sb: SupabaseClient, id: string) {
  const { data: q, error: quoteError } = await sb.from('quotes').select('*, customers(id,name,company,phone,email,address,notes)').eq('id', id).maybeSingle();
  if (quoteError) throw new Error(`Could not load this quote: ${quoteError.message}`);
  if (!q) return null;
  const { data: items, error: itemsError } = await sb.from('quote_items').select('*').eq('quote_id', id).order('position');
  if (itemsError) throw new Error(`Could not load this quote's items: ${itemsError.message}`);
  return { ...q, items: items || [] };
}
