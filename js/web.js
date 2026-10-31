// ربط التطبيق بموقع المتجر: نبني "كتالوج" للزبون (بدون أي كلفة أو أرباح) ونرفعه للموقع على GitHub.
// buildCatalog دالة صافية (تنختبر بسهولة)، والباقي يحتاج المتصفح.
import { live, computeInventory, report } from './logic.js';

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const WEB_DEFAULTS = {
  tagline: 'سيراميك وديكور وتحف دينية تدفّي البيت',
  about: 'متجر رواسي من العراق. نختار كل قطعة بإيدنا، وننزلها بكميات محدودة.',
  instagram: 'rawaas_y',
  whatsapp: '',
  announcement: '',
  deliveryNote: 'نوصل لكل المحافظات',
  dmHours: '',
  orderNote: 'الحجز حسب الأسبقية. الكمية محدودة.',
  dropEndsAt: '',
  showSoldOut: true,
  siteUrl: 'rawasistore.com',
};

export function webSettings(settings = {}) {
  return { ...WEB_DEFAULTS, ...(settings.web || {}) };
}

// بصمة سريعة لنص (FNV-1a) — لتسمية الصور ومعرفة إذا تغيّر الكتالوج.
export function fingerprint(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + s.length.toString(36);
}

function imageName(dataUrl) {
  const mime = /^data:([^;]+);/.exec(dataUrl)?.[1] || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return `img/${fingerprint(dataUrl)}.${ext}`;
}

const LOW = 3; // نكتب "باقي X" لما تقل الكمية عن هذا
const NEW_DAYS = 21;
const MAX_PER_ORDER = 10;

// يرجع { catalog, images } — images: خريطة اسم الملف ← صورة data URL.
export function buildCatalog(db, nowIso = new Date().toISOString()) {
  const settings = db.settings || {};
  const web = webSettings(settings);
  const inv = computeInventory(db);
  const images = new Map();
  const addImg = (src) => {
    if (!src || typeof src !== 'string') return null;
    if (/^https?:\/\//.test(src)) return src;
    if (!src.startsWith('data:image/')) return null;
    const name = imageName(src);
    images.set(name, src);
    return name;
  };

  // الدفعة المفتوحة الأحدث = "النزلة الحالية" بالموقع، وسعرها يغلب على السعر العادي.
  const openBatch = live(db.batches)
    .filter((b) => (b.status || 'open') === 'open' && (b.items || []).length)
    .sort((a, b) => ((a.date || a.createdAt || '') < (b.date || b.createdAt || '') ? 1 : -1))[0];
  const batchPrice = {};
  for (const i of openBatch?.items || []) if (num(i.price) > 0) batchPrice[i.productId] = num(i.price);

  // تاريخ آخر وارد لكل منتج (حتى نعرف "وصل حديثاً").
  const lastIn = {};
  for (const lot of live(db.lots)) {
    for (const l of lot.lines || []) {
      const d = lot.date || lot.createdAt || '';
      if (l.productId && d > (lastIn[l.productId] || '')) lastIn[l.productId] = d;
    }
  }

  // الأكثر طلباً بآخر 60 يوم: نرسل علامة فقط، بدون أرقام المبيعات.
  const today = nowIso.slice(0, 10);
  const from = new Date(new Date(today).getTime() - 60 * 864e5).toISOString().slice(0, 10);
  const top = report(db, inv, from, today).top.filter((t) => t.qty > 0).slice(0, 6).map((t) => t.productId);
  const hot = new Set(top);

  const newSince = new Date(new Date(today).getTime() - NEW_DAYS * 864e5).toISOString().slice(0, 10);

  const products = [];
  for (const p of live(db.products)) {
    if (p.webHide || !String(p.name || '').trim()) continue;
    const price = batchPrice[p.id] || num(p.price);
    if (price <= 0) continue;
    const it = inv.items[p.id] || {};
    const avail = Math.max(0, Math.floor(num(it.available)));
    const status = avail <= 0 ? 'out' : avail <= LOW ? 'low' : 'ok';
    if (status === 'out' && !web.showSoldOut) continue;
    const imgs = [p.photo, ...(Array.isArray(p.photos) ? p.photos : [])].map(addImg).filter(Boolean);
    const added = (lastIn[p.id] || p.createdAt || '').slice(0, 10);
    const was = num(p.compareAt) > price ? num(p.compareAt) : 0;
    const rec = {
      id: p.id,
      name: String(p.name).trim(),
      cat: p.category || 'أخرى',
      price,
      status,
      max: Math.min(avail, MAX_PER_ORDER),
      imgs,
      added,
    };
    if (was) rec.was = was;
    if (status === 'low') rec.left = avail;
    if (String(p.webDesc || '').trim()) rec.desc = String(p.webDesc).trim();
    if (p.featured) rec.feat = true;
    if (hot.has(p.id)) rec.hot = true;
    if (added && added >= newSince) rec.isNew = true;
    if (openBatch && (openBatch.items || []).some((i) => i.productId === p.id)) rec.drop = true;
    products.push(rec);
  }

  const rank = { ok: 0, low: 0, out: 1 };
  products.sort((a, b) => rank[a.status] - rank[b.status] || (b.feat ? 1 : 0) - (a.feat ? 1 : 0) || (a.added < b.added ? 1 : a.added > b.added ? -1 : 0));

  const present = new Set(products.map((p) => p.cat));
  const categories = [...(settings.categories || []).filter((c) => present.has(c)), ...[...present].filter((c) => !(settings.categories || []).includes(c))];

  const catalog = {
    v: 1,
    updatedAt: nowIso,
    store: {
      name: settings.storeName || 'متجر رواسي',
      tagline: web.tagline,
      about: web.about,
      instagram: String(web.instagram || '').replace(/^@/, '').trim(),
      whatsapp: String(web.whatsapp || '').replace(/[^\d+]/g, ''),
      announcement: web.announcement,
      deliveryFee: num(settings.deliveryFee),
      deliveryNote: web.deliveryNote,
      dmHours: web.dmHours,
      orderNote: web.orderNote,
      governorates: settings.governorates || [],
    },
    drop: openBatch ? { name: openBatch.name || 'النزلة الحالية', date: openBatch.date || '', endsAt: web.dropEndsAt || '' } : null,
    categories,
    products,
  };
  if (!catalog.drop && web.dropEndsAt) catalog.drop = { name: 'النزلة الحالية', date: '', endsAt: web.dropEndsAt };
  return { catalog, images };
}

// بصمة الكتالوج بدون وقت التحديث، حتى ما نرفع إذا ما تغيّر شي.
export function catalogHash(catalog) {
  return fingerprint(JSON.stringify({ ...catalog, updatedAt: '' }));
}

// ---------- الرفع إلى GitHub ----------
const KEY = 'rawasi.web';
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=public_repo&description=' + encodeURIComponent('Rawasi shop');

// الموقع صار بمستودع خاص بيه (ghraoy/rawasistore) على الدومين rawasistore.com.
// التطبيق يبقى على ghraoy.github.io/rawasi حتى يبقى تسجيل Google شغال.
export function getConfig() {
  const def = { token: '', repo: 'ghraoy/rawasistore', branch: 'main', dir: '', auto: true, lastHash: '', lastAt: '', lastError: '' };
  let c = def;
  try {
    c = { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {}
  if (c.repo === 'ghraoy/rawasi' && c.dir === 'shop' && !c.movedToStore) {
    c = { ...c, repo: 'ghraoy/rawasistore', dir: '', branch: 'main', lastHash: '', movedToStore: true };
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch {}
  }
  return c;
}

export function setConfig(patch) {
  const c = { ...getConfig(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(c));
  return c;
}

export function siteUrl(settings = {}) {
  const custom = webSettings(settings).siteUrl || WEB_DEFAULTS.siteUrl;
  if (custom) return /^https?:\/\//.test(custom) ? custom : 'https://' + custom.replace(/\/+$/, '') + '/';
  const c = getConfig();
  const [owner, repo] = c.repo.split('/');
  if (!owner || !repo) return '';
  const base = repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${repo}/` : `https://${owner}.github.io/${repo}/`;
  return base + (c.dir ? c.dir.replace(/^\/|\/$/g, '') + '/' : '');
}

async function gh(path, { method = 'GET', body } = {}) {
  const c = getConfig();
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error('رمز GitHub غير صالح أو انتهى. سوّ رمز جديد من صفحة الموقع.');
  if (res.status === 403 || res.status === 404) throw new Error('الرمز ما عنده صلاحية على المستودع ' + c.repo + '. تأكد إنك اخترت public_repo.');
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      msg = (await res.json()).message || msg;
    } catch {}
    const e = new Error('GitHub: ' + msg);
    e.status = res.status;
    throw e;
  }
  return res.status === 204 ? null : res.json();
}

let status = { state: 'idle', message: '' };
const listeners = new Set();
export const getStatus = () => status;
export const onStatus = (fn) => (listeners.add(fn), () => listeners.delete(fn));
function setStatus(s) {
  status = s;
  for (const fn of listeners) fn(s);
}

let running = null;
// ينشر الكتالوج والصور بـ commit واحد. force: حتى لو ما تغيّر شي.
export function publish(db, { force = false } = {}) {
  if (running) return running;
  const c = getConfig();
  if (!c.token) return Promise.reject(new Error('اربط الموقع أولاً: صفحة "الموقع الإلكتروني" ← الصق رمز GitHub.'));
  const { catalog, images } = buildCatalog(db);
  const hash = catalogHash(catalog);
  if (!force && hash === c.lastHash) return Promise.resolve({ skipped: true });
  setStatus({ state: 'publishing', message: 'جاري النشر…' });
  running = (async () => {
    try {
      const dir = c.dir.replace(/^\/|\/$/g, '');
      const pre = dir ? dir + '/' : '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const ref = await gh(`/repos/${c.repo}/git/ref/heads/${c.branch}`);
        const parent = ref.object.sha;
        const commit = await gh(`/repos/${c.repo}/git/commits/${parent}`);
        const tree = await gh(`/repos/${c.repo}/git/trees/${commit.tree.sha}?recursive=1`);
        const imgDir = `${pre}data/img/`;
        const existing = new Set((tree.tree || []).filter((t) => t.type === 'blob' && t.path.startsWith(imgDir)).map((t) => t.path));
        const entries = [];
        for (const [name, dataUrl] of images) {
          const path = `${pre}data/${name}`;
          if (existing.has(path)) continue;
          const blob = await gh(`/repos/${c.repo}/git/blobs`, { method: 'POST', body: { content: dataUrl.slice(dataUrl.indexOf(',') + 1), encoding: 'base64' } });
          entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        }
        const keep = new Set([...images.keys()].map((n) => `${pre}data/${n}`));
        for (const path of existing) if (!keep.has(path)) entries.push({ path, mode: '100644', type: 'blob', sha: null });
        entries.push({ path: `${pre}data/catalog.json`, mode: '100644', type: 'blob', content: JSON.stringify(catalog) });
        const newTree = await gh(`/repos/${c.repo}/git/trees`, { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
        const newCommit = await gh(`/repos/${c.repo}/git/commits`, { method: 'POST', body: { message: `تحديث موقع المتجر (${catalog.products.length} منتج)`, tree: newTree.sha, parents: [parent] } });
        try {
          await gh(`/repos/${c.repo}/git/refs/heads/${c.branch}`, { method: 'PATCH', body: { sha: newCommit.sha } });
          break;
        } catch (e) {
          if (e.status === 422 && attempt === 0) continue; // صار تحديث ثاني بنفس اللحظة، نعيد مرة وحدة
          throw e;
        }
      }
      const at = new Date().toISOString();
      setConfig({ lastHash: hash, lastAt: at, lastError: '' });
      setStatus({ state: 'ok', message: 'انشر ✓ يظهر بالموقع خلال دقيقة', at });
      return { ok: true, products: catalog.products.length };
    } catch (e) {
      setConfig({ lastError: e.message });
      setStatus({ state: 'error', message: e.message });
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

// يتأكد من الرمز والمستودع قبل الحفظ.
export async function testToken(token, repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' } });
  if (res.status === 401) throw new Error('الرمز غير صالح. انسخه كامل وجرب مرة ثانية.');
  if (!res.ok) throw new Error('ما لقيت المستودع ' + repo + ' بهذا الرمز.');
  const j = await res.json();
  if (!j.permissions?.push) throw new Error('الرمز ما عنده صلاحية كتابة. سوّه من الرابط واختار public_repo.');
  return { branch: j.default_branch || 'main' };
}

// نشر تلقائي: بعد أي تعديل بدقيقة، فقط إذا تغيّر شي يخص الزبون.
let timer = null;
export function startAuto(store) {
  store.subscribe(() => {
    const c = getConfig();
    if (!c.token || !c.auto) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      publish(store.getData()).catch(() => {});
    }, 60000);
  });
}
