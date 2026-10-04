/* DEMO DEFAULTS — placeholder numbers so the system works on first open.
   These are NOT real market prices. Every record carries demo:true until the owner edits it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PQSeed = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';
const D = o => ({ demo: true, active: true, ...o });

function makeSeed() {
  const settings = {
    demo: true,
    business: { name: 'Your Printing Company (Pty) Ltd', address: '12 Example Street\nCape Town, 8001', phone: '021 000 0000', email: 'quotes@example.co.za', website: 'www.example.co.za', regNo: '', vatNo: '', logo: '' },
    pricing: { defaultMarkup: 45, maxMarkup: 500, defaultWastagePct: 0, minCharge: 0, minOrder: 0, rounding: { step: 1, mode: 'nearest' } },
    calc: { includeMachine: true, includeLabour: true, includeFinishing: true, includePackaging: true, includeWastage: true, includeOther: true, wastageAppliesTo: 'materials_print', markupMode: 'markup', gutterMm: 3 },
    vat: { enabled: true, rate: 15, mode: 'exclusive' },
    discount: { allowStaff: true, staffMaxPct: 5, managerMaxPct: 20, requireApproval: true, discountReducesVat: true },
    quotes: { prefix: 'QT', yearFormat: 'YYYY', separator: '-', length: 4, startNumber: 1, resetYearly: true, expiryDays: 14,
      paymentTerms: '50% deposit on acceptance, balance before collection/delivery.',
      defaultNotes: '',
      terms: 'Quote valid until the expiry date shown. Prices are estimates based on supplied artwork; extra design or artwork changes are charged separately. Production starts after deposit and artwork approval.' },
    permissions: {
      manager: { createQuotes: 1, editQuotes: 1, viewAllQuotes: 1, deleteQuotes: 0, changeStatus: 1, viewCosts: 1, viewProfit: 1, viewMargin: 1, overrideMarkup: 1, overridePrice: 1, applyDiscount: 1, approveDiscount: 1, viewReports: 1, editProducts: 0, editPricing: 0, viewAudit: 0, importExport: 0 },
      staff:   { createQuotes: 1, editQuotes: 1, viewAllQuotes: 0, deleteQuotes: 0, changeStatus: 1, viewCosts: 0, viewProfit: 0, viewMargin: 0, overrideMarkup: 0, overridePrice: 0, applyDiscount: 1, approveDiscount: 0, viewReports: 0, editProducts: 0, editPricing: 0, viewAudit: 0, importExport: 0 }
    },
    defaultRole: 'staff'
  };
  Object.keys(settings.permissions).forEach(r => Object.keys(settings.permissions[r]).forEach(k => settings.permissions[r][k] = !!settings.permissions[r][k]));

  const categories = [
    D({ id: 'cat_paper', name: 'Paper Printing', markupPct: 40, minPrice: null }),
    D({ id: 'cat_large', name: 'Large Format', markupPct: 60, minPrice: 200 }),
    D({ id: 'cat_dtf', name: 'DTF & Apparel', markupPct: 50, minPrice: 100 }),
    D({ id: 'cat_other', name: 'Custom & Other', markupPct: null, minPrice: null })
  ];

  const M = (id, name, type, costBasis, cost, extra) => D({ id, name, type, costBasis, cost, supplier: 'Demo Supplier', wastagePct: 2, stock: 0, minStock: 0, tags: [], notes: '', ...extra });
  const materials = [
    M('mat_80', '80gsm paper A4', 'paper', 'sheet', 0.18, { sheetW: 297, sheetH: 210, tags: ['paper'] }),
    M('mat_100', '100gsm paper A4', 'paper', 'sheet', 0.24, { sheetW: 297, sheetH: 210, tags: ['paper'] }),
    M('mat_130a4', '130gsm gloss A4', 'paper', 'sheet', 0.42, { sheetW: 297, sheetH: 210, tags: ['paper'] }),
    M('mat_130', '130gsm gloss SRA3', 'paper', 'sheet', 0.85, { sheetW: 450, sheetH: 320, tags: ['paper'] }),
    M('mat_170', '170gsm gloss SRA3', 'paper', 'sheet', 1.15, { sheetW: 450, sheetH: 320, tags: ['paper'] }),
    M('mat_250', '250gsm card SRA3', 'card', 'sheet', 1.95, { sheetW: 450, sheetH: 320, tags: ['paper'] }),
    M('mat_300', '300gsm card SRA3', 'card', 'sheet', 2.35, { sheetW: 450, sheetH: 320, tags: ['paper'] }),
    M('mat_stickerpaper', 'Sticker paper SRA3', 'sticker', 'sheet', 3.4, { sheetW: 450, sheetH: 320, tags: ['paper'] }),
    M('mat_posterroll', 'Poster paper 914mm roll', 'paper', 'metre', 38, { rollWidth: 914, tags: ['large'] }),
    M('mat_vinyl', 'Self-adhesive vinyl 1220mm roll', 'vinyl', 'metre', 72, { rollWidth: 1220, tags: ['large'] }),
    M('mat_banner', 'PVC banner material', 'banner', 'sqm', 24, { wastagePct: 3, tags: ['large'] }),
    M('mat_board', 'Corex sign board 3mm (1220×2440)', 'board', 'sheet', 260, { sheetW: 1220, sheetH: 2440, wastagePct: 3, tags: ['large'] }),
    M('mat_dtffilm', 'DTF film 600mm roll', 'dtf', 'metre', 30, { rollWidth: 600, wastagePct: 5, tags: ['dtf'] }),
    M('mat_dtfpowder', 'DTF adhesive powder', 'dtf', 'kg', 220, { wastagePct: 5, tags: ['dtf'] }),
    M('mat_tee_white', 'T-shirt — white', 'garment', 'unit', 40, { wastagePct: 0, tags: ['dtf'] }),
    M('mat_tee_col', 'T-shirt — coloured', 'garment', 'unit', 46, { wastagePct: 0, tags: ['dtf'] }),
    M('mat_hoodie', 'Hoodie', 'garment', 'unit', 135, { wastagePct: 0, tags: ['dtf'] })
  ];

  const machines = [
    D({ id: 'mac_digital', name: 'Digital Press', costPerHour: 120, costPerPrint: 0.12, costPerSqm: 0, setupCost: 0, maintenancePerHour: 15, depreciationPerHour: 20, tags: ['paper'], notes: '' }),
    D({ id: 'mac_dtf', name: 'DTF Printer', costPerHour: 60, costPerPrint: 0, costPerSqm: 0, setupCost: 0, maintenancePerHour: 20, depreciationPerHour: 25, tags: ['dtf'], notes: '' }),
    D({ id: 'mac_press', name: 'Heat Press', costPerHour: 25, costPerPrint: 0, costPerSqm: 0, setupCost: 0, maintenancePerHour: 5, depreciationPerHour: 5, tags: ['dtf'], notes: '' }),
    D({ id: 'mac_lfp', name: 'Large Format Printer', costPerHour: 90, costPerPrint: 0, costPerSqm: 4, setupCost: 15, maintenancePerHour: 20, depreciationPerHour: 30, tags: ['large'], notes: '' }),
    D({ id: 'mac_cutter', name: 'Plotter / Cutter', costPerHour: 40, costPerPrint: 0, costPerSqm: 0, setupCost: 10, maintenancePerHour: 5, depreciationPerHour: 10, tags: ['large', 'paper'], notes: '' }),
    D({ id: 'mac_lam', name: 'Laminator', costPerHour: 30, costPerPrint: 0, costPerSqm: 1.5, setupCost: 0, maintenancePerHour: 5, depreciationPerHour: 5, tags: ['paper', 'large'], notes: '' })
  ];

  const labour = [
    D({ id: 'lab_designer', name: 'Designer', hourly: 250, defaultMinutes: 30, minCharge: 150, markupPct: 0, tags: [] }),
    D({ id: 'lab_operator', name: 'Printing Operator', hourly: 110, defaultMinutes: 10, minCharge: 0, markupPct: 0, tags: ['paper', 'large'] }),
    D({ id: 'lab_dtf', name: 'DTF Operator', hourly: 100, defaultMinutes: 10, minCharge: 0, markupPct: 0, tags: ['dtf'] }),
    D({ id: 'lab_finish', name: 'Finishing', hourly: 85, defaultMinutes: 10, minCharge: 0, markupPct: 0, tags: ['paper', 'large'] }),
    D({ id: 'lab_install', name: 'Installation', hourly: 160, defaultMinutes: 60, minCharge: 250, markupPct: 0, tags: ['large'] }),
    D({ id: 'lab_pack', name: 'Packing', hourly: 70, defaultMinutes: 5, minCharge: 0, markupPct: 0, tags: ['dtf'] })
  ];

  const F = (id, name, method, price, extra) => D({ id, name, method, price, minCharge: 0, setup: 0, tags: [], askQty: false, defaultQty: 1, qtyLabel: '', metreBasis: 'perimeter', labourId: '', minutes: 0, ...extra });
  const finishing = [
    F('fin_cut', 'Cutting / trimming', 'labour', 0, { labourId: 'lab_finish', minutes: 0.15, minCharge: 15, tags: ['paper'] }),
    F('fin_fold', 'Folding', 'per_item', 0.35, { tags: ['paper'] }),
    F('fin_crease', 'Creasing', 'per_item', 0.25, { tags: ['paper'] }),
    F('fin_lam', 'Laminating (gloss/matt)', 'per_sqm', 55, { minCharge: 30, tags: ['paper', 'large'] }),
    F('fin_bind', 'Binding (wire/comb)', 'per_item', 9, { tags: ['paper'] }),
    F('fin_staple', 'Stapling (saddle stitch)', 'per_item', 0.8, { tags: ['paper'] }),
    F('fin_hem', 'Banner hemming', 'per_metre', 4, { metreBasis: 'perimeter', tags: ['large'] }),
    F('fin_eyelet', 'Eyelets', 'per_item', 2.5, { askQty: true, defaultQty: 4, qtyLabel: 'Eyelets per piece', tags: ['large'] }),
    F('fin_weed', 'Weeding', 'per_sqm', 30, { tags: ['large'] }),
    F('fin_contour', 'Contour cutting', 'per_sqm', 35, { minCharge: 40, tags: ['large'] }),
    F('fin_press', 'Heat pressing', 'labour', 0, { labourId: 'lab_dtf', minutes: 1.5, tags: ['dtf'] }),
    F('fin_pack', 'Packaging', 'per_item', 2, { tags: ['dtf', 'paper'] }),
    F('fin_install', 'Installation', 'labour', 0, { labourId: 'lab_install', minutes: 45, minCharge: 250, tags: ['large'] }),
    F('fin_design', 'Design fee', 'labour', 0, { labourId: 'lab_designer', minutes: 60, minCharge: 150, tags: [] }),
    F('fin_setup', 'Job setup fee', 'fixed', 50, { tags: [] })
  ];

  const base = { demo: true, active: true, unit: 'mm', defaultW: 0, defaultH: 0, defaultQty: 1, defaultSides: 1, defaultPages: 1, method: 'per_item', basePrice: 0, setupFee: 0,
    components: [], print: null, machines: [], labour: [], defaultFinishing: [], allowedFinishing: [], otherCosts: [], tiers: [], wastagePct: null, markupPct: null, minPrice: null,
    usePrintList: false, defaultPrints: [], description: '' };
  const P = (o) => ({ ...base, ...o });
  const paperFin = ['fin_cut', 'fin_fold', 'fin_crease', 'fin_lam', 'fin_bind', 'fin_staple', 'fin_pack', 'fin_design', 'fin_setup'];
  const largeFin = ['fin_hem', 'fin_eyelet', 'fin_lam', 'fin_weed', 'fin_contour', 'fin_install', 'fin_pack', 'fin_design', 'fin_setup'];
  const dtfFin = ['fin_press', 'fin_pack', 'fin_design', 'fin_setup'];
  const products = [
    P({ id: 'p_flyer', name: 'A4 Colour Flyer', category: 'cat_paper', profile: 'paper', method: 'per_sheet', defaultW: 210, defaultH: 297, defaultQty: 100, defaultSides: 2,
      components: [{ label: 'Paper', materialId: 'mat_130', primary: true, group: 'material' }],
      print: { label: 'Colour printing', rate: 0.6, basis: 'sheetSide', bwFactor: 0.4 },
      machines: [{ machineId: 'mac_digital', minutesPerUnit: 0.1, unitBasis: 'sheet', fixedMinutes: 5 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 0.05, unitBasis: 'sheet', setupMinutes: 8 }],
      defaultFinishing: ['fin_cut'], allowedFinishing: paperFin, wastagePct: 5, description: 'Flyer on SRA3 sheet, imposed 2-up.' }),
    P({ id: 'p_cards', name: 'Business Cards 90×55', category: 'cat_paper', profile: 'paper', method: 'per_sheet', defaultW: 90, defaultH: 55, defaultQty: 500, defaultSides: 2,
      components: [{ label: 'Card', materialId: 'mat_300', primary: true, group: 'material' }],
      print: { label: 'Colour printing', rate: 0.75, basis: 'sheetSide', bwFactor: 0.4 },
      machines: [{ machineId: 'mac_digital', minutesPerUnit: 0.12, unitBasis: 'sheet', fixedMinutes: 5 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 0.05, unitBasis: 'sheet', setupMinutes: 8 }],
      defaultFinishing: ['fin_cut'], allowedFinishing: paperFin, wastagePct: 8, minPrice: 120 }),
    P({ id: 'p_invite', name: 'Invitation A6', category: 'cat_paper', profile: 'paper', method: 'per_sheet', defaultW: 105, defaultH: 148, defaultQty: 50, defaultSides: 2,
      components: [{ label: 'Card', materialId: 'mat_250', primary: true, group: 'material' }],
      print: { label: 'Colour printing', rate: 0.75, basis: 'sheetSide', bwFactor: 0.4 },
      machines: [{ machineId: 'mac_digital', minutesPerUnit: 0.12, unitBasis: 'sheet', fixedMinutes: 5 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 0.05, unitBasis: 'sheet', setupMinutes: 8 }],
      defaultFinishing: ['fin_cut'], allowedFinishing: paperFin, wastagePct: 8 }),
    P({ id: 'p_cert', name: 'Certificate A4 (250gsm)', category: 'cat_paper', profile: 'paper', method: 'per_sheet', defaultW: 210, defaultH: 297, defaultQty: 20, defaultSides: 1,
      components: [{ label: 'Card', materialId: 'mat_250', primary: true, group: 'material' }],
      print: { label: 'Colour printing', rate: 0.75, basis: 'sheetSide', bwFactor: 0.4 },
      machines: [{ machineId: 'mac_digital', minutesPerUnit: 0.12, unitBasis: 'sheet', fixedMinutes: 5 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 0.05, unitBasis: 'sheet', setupMinutes: 8 }],
      defaultFinishing: ['fin_cut'], allowedFinishing: paperFin, wastagePct: 5, minPrice: 100 }),
    P({ id: 'p_brochure', name: 'Brochure A4 tri-fold', category: 'cat_paper', profile: 'paper', method: 'per_sheet', defaultW: 297, defaultH: 210, defaultQty: 250, defaultSides: 2,
      components: [{ label: 'Paper', materialId: 'mat_170', primary: true, group: 'material' }],
      print: { label: 'Colour printing', rate: 0.75, basis: 'sheetSide', bwFactor: 0.4 },
      machines: [{ machineId: 'mac_digital', minutesPerUnit: 0.12, unitBasis: 'sheet', fixedMinutes: 5 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 0.05, unitBasis: 'sheet', setupMinutes: 8 }],
      defaultFinishing: ['fin_fold'], allowedFinishing: paperFin, wastagePct: 5 }),
    P({ id: 'p_booklet', name: 'A5 Booklet (saddle-stitched)', category: 'cat_paper', profile: 'paper', method: 'per_page', defaultW: 148, defaultH: 210, defaultQty: 50, defaultSides: 2, defaultPages: 12,
      components: [{ label: 'Inside paper', materialId: 'mat_130', primary: true, group: 'material' }],
      print: { label: 'Colour printing', rate: 0.55, basis: 'sheetSide', bwFactor: 0.4 },
      machines: [{ machineId: 'mac_digital', minutesPerUnit: 0.1, unitBasis: 'sheet', fixedMinutes: 5 }],
      labour: [{ labourId: 'lab_finish', minutesPerUnit: 0.4, unitBasis: 'item', setupMinutes: 10 }],
      defaultFinishing: ['fin_fold', 'fin_staple'], allowedFinishing: paperFin, wastagePct: 5, description: 'Enter total pages (multiple of 4).' }),
    P({ id: 'p_poster', name: 'Poster (roll-printed)', category: 'cat_large', profile: 'large', method: 'per_sqm', unit: 'mm', defaultW: 420, defaultH: 594, defaultQty: 1,
      components: [{ label: 'Poster paper', materialId: 'mat_posterroll', primary: true, group: 'material' }, { label: 'Ink', basis: 'sqm', rate: 28, group: 'print' }],
      machines: [{ machineId: 'mac_lfp', minutesPerUnit: 0, unitBasis: 'sqm', fixedMinutes: 6 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 4, unitBasis: 'sqm', setupMinutes: 6 }],
      allowedFinishing: largeFin, wastagePct: 5, minPrice: 90 }),
    P({ id: 'p_sticker', name: 'Vinyl Sticker / Label', category: 'cat_large', profile: 'large', method: 'per_sqm', unit: 'mm', defaultW: 100, defaultH: 100, defaultQty: 100,
      components: [{ label: 'Vinyl', materialId: 'mat_vinyl', primary: true, group: 'material' }, { label: 'Ink', basis: 'sqm', rate: 30, group: 'print' }],
      machines: [{ machineId: 'mac_lfp', minutesPerUnit: 0, unitBasis: 'sqm', fixedMinutes: 6 }, { machineId: 'mac_cutter', minutesPerUnit: 2, unitBasis: 'sqm', fixedMinutes: 0 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 5, unitBasis: 'sqm', setupMinutes: 8 }],
      defaultFinishing: ['fin_contour', 'fin_weed'], allowedFinishing: largeFin, wastagePct: 8, minPrice: 120 }),
    P({ id: 'p_banner', name: 'PVC Banner', category: 'cat_large', profile: 'large', method: 'per_sqm', unit: 'm', defaultW: 2, defaultH: 1, defaultQty: 1,
      components: [{ label: 'Banner material', materialId: 'mat_banner', primary: true, group: 'material' }, { label: 'Ink', basis: 'sqm', rate: 26, group: 'print' }],
      machines: [{ machineId: 'mac_lfp', minutesPerUnit: 3, unitBasis: 'sqm', fixedMinutes: 6 }],
      labour: [{ labourId: 'lab_operator', minutesPerUnit: 3, unitBasis: 'sqm', setupMinutes: 6 }],
      defaultFinishing: ['fin_hem', 'fin_eyelet'], allowedFinishing: largeFin, wastagePct: 5, minPrice: 250 }),
    P({ id: 'p_sign', name: 'Corex Sign Board', category: 'cat_large', profile: 'large', method: 'per_item', unit: 'mm', defaultW: 600, defaultH: 400, defaultQty: 1,
      components: [{ label: 'Corex board', materialId: 'mat_board', primary: true, group: 'material' }, { label: 'Printed vinyl', materialId: 'mat_vinyl', group: 'material' }, { label: 'Ink', basis: 'sqm', rate: 30, group: 'print' }],
      machines: [{ machineId: 'mac_lfp', minutesPerUnit: 0, unitBasis: 'sqm', fixedMinutes: 6 }, { machineId: 'mac_cutter', minutesPerUnit: 1, unitBasis: 'item', fixedMinutes: 0 }],
      labour: [{ labourId: 'lab_finish', minutesPerUnit: 8, unitBasis: 'item', setupMinutes: 5 }],
      allowedFinishing: largeFin, wastagePct: 5, minPrice: 180 }),
    P({ id: 'p_dtf_tee', name: 'DTF T-shirt', category: 'cat_dtf', profile: 'dtf', method: 'per_garment', defaultQty: 10, usePrintList: true,
      defaultPrints: [{ label: 'Front', w: 21, h: 29.7, count: 1 }],
      components: [
        { label: 'Garment', materialId: 'mat_tee_white', primary: true, group: 'material', qtyPer: 1, perBasis: 'item' },
        { label: 'DTF film', materialId: 'mat_dtffilm', group: 'material' },
        { label: 'DTF powder', materialId: 'mat_dtfpowder', group: 'material', qtyPer: 0.04, perBasis: 'printSqm' },
        { label: 'DTF ink', basis: 'printSqm', rate: 55, group: 'print' },
        { label: 'Poly bag', basis: 'item', rate: 1.5, group: 'packaging' }],
      machines: [{ machineId: 'mac_dtf', minutesPerUnit: 2, unitBasis: 'print', fixedMinutes: 8 }, { machineId: 'mac_press', minutesPerUnit: 1.2, unitBasis: 'print', fixedMinutes: 0 }],
      labour: [{ labourId: 'lab_dtf', minutesPerUnit: 1.5, unitBasis: 'print', setupMinutes: 5 }, { labourId: 'lab_pack', minutesPerUnit: 0.5, unitBasis: 'item', setupMinutes: 0 }],
      allowedFinishing: dtfFin, wastagePct: 3, minPrice: 100 }),
    P({ id: 'p_dtf_hoodie', name: 'DTF Hoodie', category: 'cat_dtf', profile: 'dtf', method: 'per_garment', defaultQty: 5, usePrintList: true,
      defaultPrints: [{ label: 'Front', w: 21, h: 29.7, count: 1 }],
      components: [
        { label: 'Garment', materialId: 'mat_hoodie', primary: true, group: 'material', qtyPer: 1, perBasis: 'item' },
        { label: 'DTF film', materialId: 'mat_dtffilm', group: 'material' },
        { label: 'DTF powder', materialId: 'mat_dtfpowder', group: 'material', qtyPer: 0.04, perBasis: 'printSqm' },
        { label: 'DTF ink', basis: 'printSqm', rate: 55, group: 'print' },
        { label: 'Poly bag', basis: 'item', rate: 2.5, group: 'packaging' }],
      machines: [{ machineId: 'mac_dtf', minutesPerUnit: 2, unitBasis: 'print', fixedMinutes: 8 }, { machineId: 'mac_press', minutesPerUnit: 1.5, unitBasis: 'print', fixedMinutes: 0 }],
      labour: [{ labourId: 'lab_dtf', minutesPerUnit: 1.5, unitBasis: 'print', setupMinutes: 5 }, { labourId: 'lab_pack', minutesPerUnit: 0.6, unitBasis: 'item', setupMinutes: 0 }],
      allowedFinishing: dtfFin, wastagePct: 3, minPrice: 150 }),
    P({ id: 'p_dtf_transfer', name: 'DTF Transfer sheet only (tiered sell price)', category: 'cat_dtf', profile: 'dtf', method: 'tiered', tierBasis: 'print', usePrintList: true, baseIsSell: true,
      defaultQty: 10, defaultPrints: [{ label: 'Transfer A4', w: 21, h: 29.7, count: 1 }],
      tiers: [{ from: 1, price: 20 }, { from: 11, price: 17 }, { from: 51, price: 14 }, { from: 101, price: 12 }],
      components: [{ label: 'DTF film', materialId: 'mat_dtffilm', primary: true, group: 'material' }, { label: 'DTF powder', materialId: 'mat_dtfpowder', group: 'material', qtyPer: 0.04, perBasis: 'printSqm' }, { label: 'DTF ink', basis: 'printSqm', rate: 55, group: 'print' }],
      machines: [], labour: [], allowedFinishing: ['fin_pack', 'fin_setup'], wastagePct: 3, markupPct: 0, minPrice: 100,
      description: 'Demonstrates tiered SELL pricing: 1–10 = R20, 11–50 = R17, 51–100 = R14, 101+ = R12 per print. Component costs are used for profit reporting only.' }),
    P({ id: 'p_custom', name: 'Custom Printed Product', category: 'cat_other', profile: 'general', method: 'per_item', defaultQty: 1,
      components: [], labour: [{ labourId: 'lab_operator', minutesPerUnit: 5, unitBasis: 'item', setupMinutes: 10 }],
      allowedFinishing: ['fin_pack', 'fin_design', 'fin_setup'], description: 'Enter supplier/other costs in "Custom cost" on the quote line.', minPrice: 50 }),
    P({ id: 'p_design', name: 'Design service (fixed price)', category: 'cat_other', profile: 'general', method: 'fixed', basePrice: 300, defaultQty: 1, markupPct: 30, minPrice: 150,
      allowedFinishing: [] })
  ];

  return { settings, categories, materials, machines, labour, finishing, products };
}
return { makeSeed };
});
