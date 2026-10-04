/** Builds the employee-safe specification of a quote line: names, sizes, quantities — never prices or costs. */
export type SpecRow = { label: string; value: string };
export function buildSpec(item: any, ctx: { materials: Record<string, any>; finishing: Record<string, any> }): SpecRow[] {
  const rows: SpecRow[] = [];
  const profile = item.profile || (item.calc && item.calc.profile) || '';
  const add = (label: string, value: any) => { if (value !== undefined && value !== null && String(value).trim() !== '') rows.push({ label, value: String(value) }); };
  const mat = item.materialId && ctx.materials[item.materialId];
  add('Quantity', item.qty);
  if (item.desc) add('Description', item.desc);
  const hasSize = Number(item.w) > 0 && Number(item.h) > 0;
  if (hasSize) add('Size', `${item.w} × ${item.h} ${item.unit || 'mm'}`);
  if (mat) add(mat.type === 'garment' || mat.costBasis === 'unit' ? 'Garment' : 'Material', mat.name);
  const info = item.calc && item.calc.info;
  if (info && Number(info.pages) > 1) add('Pages', info.pages);
  if (profile === 'paper' || (info && info.leaves !== undefined && Number(item.sides))) { add('Print sides', Number(item.sides) === 2 ? 'Double-sided' : 'Single-sided'); add('Colour', item.colour === 'bw' ? 'Black & white' : 'Full colour'); }
  if (item.garmentColour) add('Garment colour', item.garmentColour);
  if (Array.isArray(item.prints) && item.prints.length) {
    item.prints.forEach((p: any, i: number) => add(`Print ${i + 1}${p.label ? ' — ' + p.label : ''}`, `${p.w} × ${p.h} cm${Number(p.count) > 1 ? ' × ' + p.count : ''}`));
    add('Prints per item', item.prints.reduce((a: number, p: any) => a + Number(p.count || 1), 0));
  }
  const fin = (item.finishing || []).map((s: any) => { const f = ctx.finishing[s.id]; if (!f) return ''; return f.askQty ? `${f.name} (${s.qty} ${f.qtyLabel || ''})`.trim() : f.name; }).filter(Boolean);
  if (fin.length) add('Finishing', fin.join(', '));
  if (item.notes) add('Line notes', item.notes);
  return rows;
}
