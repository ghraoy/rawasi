// تخزين البيانات محلياً في المتصفح (IndexedDB) حتى يشتغل التطبيق بدون إنترنت.
// كل سجل عنده id و updatedAt، والحذف يكون بعلامة deleted حتى تنجح المزامنة بين الأجهزة.

export const COLLECTIONS = ['products', 'lots', 'bookings', 'batches', 'expenses', 'adjustments'];

const DB_NAME = 'rawasi';
const STORE = 'kv';
const KEY = 'data';

export const DEFAULT_SETTINGS = {
  storeName: 'متجر رواسي',
  deliveryFee: 5000,
  tomanPer1000: 0,
  categories: ['سيراميك', 'دينيات', 'ديكور', 'مخمل'],
  expenseCategories: ['تغليف', 'إعلانات', 'توصيل', 'نقل وكمرك', 'أخرى'],
  governorates: ['بغداد', 'النجف', 'كربلاء', 'البصرة', 'بابل', 'الديوانية', 'واسط', 'ذي قار', 'ميسان', 'المثنى', 'ديالى', 'صلاح الدين', 'كركوك', 'نينوى', 'الأنبار', 'أربيل', 'السليمانية', 'دهوك'],
  defaultMinStock: 2,
  updatedAt: '',
};

function emptyData() {
  const d = { settings: { ...DEFAULT_SETTINGS }, meta: { bookingSeq: 0 } };
  for (const c of COLLECTIONS) d[c] = [];
  return d;
}

let data = emptyData();
let dirty = false;
const listeners = new Set();
let saveTimer = null;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(KEY);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(value) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function normalize(raw) {
  const d = emptyData();
  if (!raw || typeof raw !== 'object') return d;
  for (const c of COLLECTIONS) d[c] = Array.isArray(raw[c]) ? raw[c] : [];
  d.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  d.meta = { bookingSeq: 0, ...(raw.meta || {}) };
  const maxNo = d.bookings.reduce((m, b) => Math.max(m, Number(b.no) || 0), 0);
  d.meta.bookingSeq = Math.max(d.meta.bookingSeq || 0, maxNo);
  return d;
}

export async function load() {
  try {
    data = normalize(await idbGet());
  } catch (e) {
    console.error('load failed', e);
    data = emptyData();
  }
  return data;
}

export function getData() {
  return data;
}

export function nowIso() {
  return new Date().toISOString();
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function changed() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 150);
  for (const fn of listeners) fn(data);
}

export async function persist() {
  clearTimeout(saveTimer);
  await idbSet(JSON.parse(JSON.stringify(data)));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function all(col) {
  return (data[col] || []).filter((r) => !r.deleted);
}

export function get(col, id) {
  return (data[col] || []).find((r) => r.id === id && !r.deleted) || null;
}

export function put(col, rec) {
  const list = data[col];
  const r = { ...rec };
  if (!r.id) {
    r.id = uid();
    r.createdAt = nowIso();
  }
  r.updatedAt = nowIso();
  const i = list.findIndex((x) => x.id === r.id);
  if (i >= 0) list[i] = r;
  else list.push(r);
  changed();
  return r;
}

export function remove(col, id) {
  const list = data[col];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  // نترك علامة حذف فقط (بدون البيانات الثقيلة) حتى تعرف الأجهزة الثانية بالحذف.
  list[i] = { id, deleted: true, updatedAt: nowIso() };
  changed();
}

export function nextBookingNo() {
  data.meta.bookingSeq = (data.meta.bookingSeq || 0) + 1;
  return data.meta.bookingSeq;
}

export function setSettings(patch) {
  data.settings = { ...data.settings, ...patch, updatedAt: nowIso() };
  changed();
}

// استبدال كل البيانات (بعد المزامنة أو استرجاع نسخة احتياطية).
export function replaceAll(raw, { silent = false } = {}) {
  data = normalize(raw);
  dirty = false;
  persist();
  if (!silent) for (const fn of listeners) fn(data);
}

export function isDirty() {
  return dirty;
}
export function markClean() {
  dirty = false;
}

// دمج نسختين: لكل سجل نأخذ الأحدث حسب updatedAt. يُستخدم بالمزامنة.
export function merge(a, b) {
  const A = normalize(a);
  const B = normalize(b);
  const out = normalize({});
  for (const c of COLLECTIONS) {
    const map = new Map();
    for (const r of [...A[c], ...B[c]]) {
      if (!r || !r.id) continue;
      const cur = map.get(r.id);
      if (!cur || (r.updatedAt || '') > (cur.updatedAt || '')) map.set(r.id, r);
    }
    out[c] = [...map.values()];
  }
  out.settings = (A.settings.updatedAt || '') >= (B.settings.updatedAt || '') ? A.settings : B.settings;
  out.meta = { bookingSeq: Math.max(A.meta.bookingSeq || 0, B.meta.bookingSeq || 0) };
  return normalize(out);
}
