// المزامنة: الطريقة الأساسية زر "ربط بحساب Google" (مباشرة مع Drive).
// السكربت (Apps Script) صار اختياري، فقط للمساعد الذكي.
import * as store from './store.js';
import * as gdrive from './gdrive.js';
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

export const googleEmail = () => localStorage.getItem('rawasi.gconnected') || '';
export const isGoogle = () => !!googleEmail();
export const aiViaScript = () => {
  const c = getConfig();
  return !!(c.url && c.token);
};
export const aiReady = () => isGoogle() || aiViaScript();
export const isConfigured = () => isGoogle();

let status = { state: 'idle', message: '' };
const listeners = new Set();
export const getStatus = () => status;
export const onStatus = (fn) => (listeners.add(fn), () => listeners.delete(fn));
function setStatus(s) {
  status = s;
  for (const fn of listeners) fn(s);
}

// طلب لسكربت Google (للمساعد الذكي). نرسل النص بدون ترويسة JSON حتى ما يحتاج طلب CORS إضافي.
export async function call(action, payload = {}, { timeout = 60000 } = {}) {
  const c = getConfig();
  if (!c.url || !c.token) throw new Error('المساعد الذكي غير مفعّل. شوف الإعدادات ← المساعد الذكي.');
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

// ربط بحساب Google بضغطة وحدة، وبعدها مزامنة فورية.
export async function connectGoogle() {
  await gdrive.signIn();
  let email = '';
  try {
    email = await gdrive.accountEmail();
  } catch {}
  localStorage.setItem('rawasi.gconnected', email || 'متصل');
  return syncNow({ interactive: true });
}

export function disconnectGoogle() {
  gdrive.signOut();
  localStorage.removeItem('rawasi.gconnected');
  setStatus({ state: 'idle', message: '' });
}

let syncing = null;
let applyingRemote = false;

// بصمة مختصرة للبيانات حتى نعرف إذا المزامنة جابت شي جديد
function signature(d) {
  const parts = [d.settings?.updatedAt || '', d.meta?.bookingSeq || 0];
  for (const c of store.COLLECTIONS) {
    const list = d[c] || [];
    let max = '';
    for (const r of list) if ((r.updatedAt || '') > max) max = r.updatedAt;
    parts.push(c + ':' + list.length + ':' + max);
  }
  return parts.join('|');
}

// interactive: true لما المستخدم ضغط (نقدر نفتح نافذة Google إذا انتهت الجلسة).
export function syncNow({ quiet = false, interactive = false } = {}) {
  if (syncing) return syncing;
  if (!isGoogle()) return Promise.resolve(false);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline', message: 'بدون إنترنت' });
    return Promise.resolve(false);
  }
  if (!gdrive.hasToken() && !interactive) {
    setStatus({ state: 'needsAuth', message: 'اضغط بأي مكان للمزامنة' });
    return Promise.resolve(false);
  }
  setStatus({ ...status, state: 'syncing', message: 'جاري المزامنة…', changed: false });
  syncing = (async () => {
    try {
      if (!gdrive.hasToken()) await gdrive.signIn({ hint: googleEmail().includes('@') ? googleEmail() : undefined });
      const remoteMerged = await gdrive.sync(buildSheets);
      // نعيد الدمج مع النسخة المحلية الحالية حتى ما تضيع أي تعديلات صارت أثناء الطلب.
      const before = signature(store.getData());
      const merged = store.merge(store.getData(), remoteMerged);
      const changed = signature(merged) !== before;
      if (changed) {
        applyingRemote = true;
        try {
          store.replaceAll(merged);
        } finally {
          applyingRemote = false;
        }
      } else {
        store.markClean();
      }
      const when = new Date().toISOString();
      setConfig({ lastSync: when });
      setStatus({ state: 'ok', message: 'متزامن', at: when, changed });
      return true;
    } catch (e) {
      setStatus({ state: gdrive.hasToken() ? 'error' : 'needsAuth', message: e.message, changed: false });
      if (!quiet) throw e;
      return false;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// مزامنة تلقائية ومستمرة:
// - بعد كل تعديل بثواني قليلة
// - كل دقيقة تجيب التعديلات من الأجهزة الثانية (لما التطبيق مفتوح)
// - لما ترجع للتطبيق، ولما يرجع الإنترنت
// - إذا جلسة Google انتهت، تتجدد تلقائياً مع أول ضغطة بأي مكان بالتطبيق
let timer = null;
let lastAuthTry = 0;
export function startAuto() {
  gdrive.preload();
  store.subscribe(() => {
    if (applyingRemote || !isGoogle() || !getConfig().auto) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow({ quiet: true }), 4000);
  });
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (!isGoogle()) return;
    if (document.visibilityState === 'visible') syncNow({ quiet: true });
    else if (store.isDirty()) syncNow({ quiet: true });
  });
  window.addEventListener('online', () => isGoogle() && syncNow({ quiet: true }));
  window.addEventListener('pagehide', () => isGoogle() && store.isDirty() && syncNow({ quiet: true }));
  setInterval(() => {
    if (isGoogle() && getConfig().auto && document.visibilityState === 'visible' && gdrive.hasToken()) syncNow({ quiet: true });
  }, 60000);
  // تجديد الجلسة مع ضغطة المستخدم (المتصفح يسمح بنافذة Google بس بعد ضغطة)
  document.addEventListener('click', () => {
    if (!isGoogle() || syncing) return;
    if (gdrive.tokenMinutesLeft() > 8) return;
    if (Date.now() - lastAuthTry < 90000) return;
    lastAuthTry = Date.now();
    const hint = googleEmail().includes('@') ? googleEmail() : undefined;
    gdrive.signIn({ hint, force: true }).then(() => syncNow({ quiet: true })).catch(() => {});
  }, true);
  if (isGoogle()) setTimeout(() => syncNow({ quiet: true }), 800);
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
