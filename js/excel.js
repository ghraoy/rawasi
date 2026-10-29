// قراءة وكتابة ملفات الإكسل (مكتبة SheetJS تنحمّل فقط وقت الحاجة).
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

let loading = null;
export function loadXLSX() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => resolve(globalThis.XLSX);
    s.onerror = () => {
      loading = null;
      reject(new Error('تعذر تحميل أداة الإكسل. تأكد من الإنترنت.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const TEMPLATE_HEADERS = ['اسم المنتج', 'التصنيف', 'الكمية', 'سعر الشراء (تومان)', 'سعر الشراء (دينار)', 'سعر البيع (دينار)', 'الكود'];

const ALIASES = {
  name: ['اسم المنتج', 'الاسم', 'المنتج', 'name', 'product'],
  category: ['التصنيف', 'الصنف', 'النوع', 'category'],
  qty: ['الكمية', 'العدد', 'qty', 'quantity'],
  costToman: ['سعر الشراء (تومان)', 'سعر الشراء بالتومان', 'الشراء تومان', 'تومان', 'سعر الشراء', 'cost toman', 'toman'],
  costIqd: ['سعر الشراء (دينار)', 'سعر الشراء بالدينار', 'الشراء دينار', 'cost iqd'],
  price: ['سعر البيع (دينار)', 'سعر البيع', 'البيع', 'price', 'sale price'],
  code: ['الكود', 'الباركود', 'code', 'barcode', 'sku'],
};

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function toNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[,،\s]/g, '')
    .replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export async function parseFile(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) return [];
  // نبحث عن صف العناوين بأول 5 صفوف
  let headerRow = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].some((c) => ALIASES.name.map(norm).includes(norm(c)))) {
      headerRow = i;
      break;
    }
  }
  const headers = rows[headerRow].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = headers.findIndex((h) => names.map(norm).includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.name == null) throw new Error('ما لقيت عمود "اسم المنتج" بالملف. استخدم النموذج الجاهز.');
  const out = [];
  for (const r of rows.slice(headerRow + 1)) {
    const name = String(r[col.name] ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      category: col.category != null ? String(r[col.category] ?? '').trim() : '',
      qty: col.qty != null ? toNumber(r[col.qty]) : 0,
      costToman: col.costToman != null ? toNumber(r[col.costToman]) : 0,
      costIqd: col.costIqd != null ? toNumber(r[col.costIqd]) : 0,
      price: col.price != null ? toNumber(r[col.price]) : 0,
      code: col.code != null ? String(r[col.code] ?? '').trim() : '',
    });
  }
  return out;
}

export async function downloadWorkbook(filename, sheets) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = (rows[0] || []).map((h) => ({ wch: Math.max(10, String(h).length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function downloadTemplate() {
  return downloadWorkbook('نموذج-منتجات-رواسي.xlsx', {
    'المنتجات': [
      TEMPLATE_HEADERS,
      ['صحن سيراميك بنقش فيروزي', 'سيراميك', 12, 0, 0, 25000, ''],
      ['مسبحة كهرب', 'دينيات', 20, 0, 0, 18000, ''],
    ],
  });
}

// تحويل أول ورقة لنص (للملفات اللي أعمدتها مو مرتبة، يقرأها الذكاء الاصطناعي).
export async function sheetToText(file, maxRows = 300) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).filter((r) => r.some((c) => String(c).trim()));
  return rows.slice(0, maxRows).map((r) => r.join(' | ')).join('\n');
}
