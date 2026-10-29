// المزامنة مع Google Drive عن طريق Google Apps Script (سكربت صغير ينحفظ بحساب Google مالتك).
// التطبيق يرسل نسخته، والسكربت يدمجها مع النسخة المحفوظة بالـ Drive ويرجع النسخة الموحدة.
import * as store from './store.js';
import { computeInventory, bookingTotals, lotTotals, live, STATUSES, round } from './logic.js';

const KEY = 'rawasi.sync';

export function getConfig() {
  try {
    return { url: '', token: '', lastSync: '', auto: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { url: '', token: '', lastSync: '', auto: true };
  }
}

export function setConfig(patch) {
  const c = { ...getConfig(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(c));
  return c;
}

export const isConfigured = () => {
  const c = getConfig();
  return !!(c.url && c.token);
};

let status = { state: 'idle', message: '' };
const listeners = new Set();
export const getStatus = () => status;
export const onStatus = (fn) => (listeners.add(fn), () => listeners.delete(fn));
function setStatus(s) {
  status = s;
  for (const fn of listeners) fn(s);
}

// طلب للسكربت. نرسل النص بدون ترويسة JSON حتى ما يحتاج المتصفح طلب CORS إضافي.
export async function call(action, payload = {}, { timeout = 60000 } = {}) {
  const c = getConfig();
  if (!c.url || !c.token) throw new Error('المزامنة غير مفعّلة. افتح الإعدادات وأضف رابط السكربت والرمز السري.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(c.url, {
      method: 'POST',
      body: JSON.stringify({ action, token: c.token, ...payload }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('رد غير مفهوم من السكربت. تأكد من نشره كـ Web app وأن الوصول "Anyone".');
    }
    if (!json.ok) throw new Error(json.error || 'فشل الطلب');
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('انتهت مهلة الاتصال. تأكد من الإنترنت.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function ping() {
  return call('ping', {}, { timeout: 20000 });
}

let syncing = null;
export function syncNow({ quiet = false } = {}) {
  if (syncing) return syncing;
  if (!isConfigured()) return Promise.resolve(false);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline', message: 'بدون إنترنت' });
    return Promise.resolve(false);
  }
  setStatus({ state: 'syncing', message: 'جاري المزامنة…' });
  syncing = (async () => {
    try {
      const local = store.getData();
      const sent = JSON.parse(JSON.stringify(local));
      const res = await call('sync', { data: sent, sheets: buildSheets(sent) }, { timeout: 90000 });
      // نعيد الدمج مع النسخة المحلية الحالية حتى ما تضيع أي تعديلات صارت أثناء الطلب.
      const merged = store.merge(store.getData(), res.data);
      store.replaceAll(merged);
      const when = new Date().toISOString();
      setConfig({ lastSync: when });
      setStatus({ state: 'ok', message: 'متزامن', at: when });
      return true;
    } catch (e) {
      setStatus({ state: 'error', message: e.message });
      if (!quiet) throw e;
      return false;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// مزامنة تلقائية: بعد كل تعديل بعشرين ثانية، وعند فتح التطبيق، وعند الخروج منه.
let timer = null;
export function startAuto() {
  store.subscribe(() => {
    if (!isConfigured() || !getConfig().auto) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow({ quiet: true }), 20000);
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && store.isDirty() && isConfigured() && getConfig().auto) syncNow({ quiet: true });
    });
    window.addEventListener('online', () => isConfigured() && syncNow({ quiet: true }));
  }
  if (isConfigured() && getConfig().auto) setTimeout(() => syncNow({ quiet: true }), 1500);
}

// جداول مقروءة تنكتب بـ Google Sheet (نسخة للعرض فقط؛ الأساس هو ملف البيانات).
export function buildSheets(data) {
  const inv = computeInventory(data);
  const products = live(data.products);
  const pname = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const lots = live(data.lots);
  return {
    'المخزن': [
      ['المنتج', 'التصنيف', 'الكود', 'سعر البيع', 'الوارد', 'المباع', 'تعديلات', 'الموجود', 'محجوز', 'المتاح', 'متوسط الكلفة', 'قيمة المخزن'],
      ...products.map((p) => {
        const it = inv.items[p.id] || {};
        return [p.name, p.category || '', p.code || '', round(p.price), it.received || 0, it.sold || 0, it.adjusted || 0, it.stock || 0, it.reserved || 0, it.available || 0, round(it.avgCost || 0), round(it.stockValue || 0)];
      }),
    ],
    'الحجوزات': [
      ['الرقم', 'التاريخ', 'الزبون', 'الهاتف', 'المحافظة', 'العنوان', 'القطع', 'الخصومات', 'صافي القطع', 'التوصيل', 'الكلي', 'الكلفة', 'الربح', 'الحالة'],
      ...live(data.bookings).map((b) => {
        const t = bookingTotals(b);
        const c = inv.bookingCost[b.id]?.total || 0;
        const items = (b.lines || []).map((l) => `${pname[l.productId] || '؟'} ×${l.qty}`).join('، ');
        const shipped = b.status === 'shipped' || b.status === 'delivered';
        return [b.no || '', (b.date || '').slice(0, 10), b.customer?.name || '', b.customer?.phone || '', b.customer?.gov || '', b.customer?.address || '', items, round(t.discounts), round(t.itemsNet), round(t.delivery), round(t.total), shipped ? round(c) : '', shipped ? round(t.itemsNet - c) : '', STATUSES[b.status]?.label || b.status];
      }),
    ],
    'وجبات التجهيز': [
      ['الوجبة', 'التاريخ', 'المورد', 'تومان لكل 1000 دينار', 'مصاريف إضافية', 'عدد القطع', 'مجموع التومان', 'الكلفة بالدينار'],
      ...lots.map((l) => {
        const t = lotTotals(l);
        return [l.name || '', l.date || '', l.supplier || '', round(l.tomanPer1000), round(l.extraCostIqd), t.qty, round(t.toman), round(t.cost)];
      }),
    ],
    'المصاريف': [
      ['التاريخ', 'النوع', 'المبلغ', 'ملاحظة'],
      ...live(data.expenses).map((e) => [e.date || '', e.category || '', round(e.amount), e.note || '']),
    ],
  };
}
