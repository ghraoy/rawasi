// موقع متجر رواسي: يقرأ data/catalog.json اللي ينشره تطبيق الإدارة، ويعرض القطع والسلة والطلب.
const DATA = 'data/catalog.json';
const LS = { cart: 'rawasi.shop.cart', fav: 'rawasi.shop.fav', buyer: 'rawasi.shop.buyer', theme: 'rawasi.shop.theme', orders: 'rawasi.shop.orders' };

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Math.round(Number(n) || 0).toLocaleString('en-US') + ' د.ع';
const read = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

// توحيد الحروف العربية للبحث: أ إ آ ← ا، ة ← ه، ى ← ي، وحذف التشكيل.
const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').trim();

const ICON = {
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  bag: 'M5 8h14l-1.2 11H6.2zM9 8V6a3 3 0 0 1 6 0v2',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  share: 'M12 4v11M8 8l4-4 4 4M5 13v6h14v-6',
  check: 'm5 12 4.5 4.5L19 7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M8 8h12v12H8zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
  chev: 'm15 6-6 6 6 6',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  ig: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
  wa: 'M4 20l1.3-4A8 8 0 1 1 8 18.7zM9 9.5c.3 2 2.5 4.3 4.8 4.9l1.2-1.1 1.8.8c-.3 1.3-1.5 2-2.7 1.8-3.2-.6-6-3.4-6.5-6.5-.2-1.2.5-2.4 1.8-2.7l.8 1.8z',
};
const icon = (n, size = 20) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

const state = {
  data: null,
  error: '',
  cat: 'all',
  sort: 'featured',
  onlyAvail: false,
  q: '',
  cart: read(LS.cart, []), // [{id, qty}]
  fav: read(LS.fav, []),
  route: { name: '', id: '' },
};

let lastFetch = 0;
async function load({ silent = false } = {}) {
  try {
    const res = await fetch(DATA + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? 'empty' : 'HTTP ' + res.status);
    const data = await res.json();
    const changed = !state.data || state.data.updatedAt !== data.updatedAt;
    state.data = data;
    state.error = '';
    lastFetch = Date.now();
    if (changed) {
      clampCart();
      renderAll();
    }
  } catch (e) {
    if (!state.data) {
      state.error = e.message === 'empty' ? 'empty' : 'net';
      renderAll();
    } else if (!silent) toast('تعذر التحديث، تأكد من الإنترنت');
  }
}

const products = () => state.data?.products || [];
const byId = (id) => products().find((p) => p.id === id);
const imgUrl = (src) => (!src ? '' : /^https?:/.test(src) ? src : 'data/' + src);

// ---------- السلة ----------
function saveCart() {
  write(LS.cart, state.cart);
  updateBadges();
}
function cartQty(id) {
  return state.cart.find((l) => l.id === id)?.qty || 0;
}
function setQty(id, qty) {
  const p = byId(id);
  const max = p ? Math.max(p.max, 0) : 0;
  const q = Math.max(0, Math.min(qty, max || 0));
  const i = state.cart.findIndex((l) => l.id === id);
  if (q <= 0) {
    if (i >= 0) state.cart.splice(i, 1);
  } else if (i >= 0) state.cart[i].qty = q;
  else state.cart.push({ id, qty: q });
  saveCart();
  return q;
}
function addToCart(id, qty = 1) {
  const p = byId(id);
  if (!p || p.status === 'out') return toast('هذه القطعة نفدت');
  const before = cartQty(id);
  const after = setQty(id, before + qty);
  if (after === before) return toast(`ما يصير أكثر من ${p.max} من هذه القطعة`);
  toast(`انضافت للسلة: ${p.name}`, { href: '#/cart', label: 'افتح السلة' });
  bump('#cartCount');
}
// بعد كل تحديث للبيانات: نصحح الكميات حسب المتوفر.
function clampCart() {
  let changed = false;
  for (const l of state.cart) {
    const p = byId(l.id);
    const max = p && p.status !== 'out' ? p.max : 0;
    if (l.qty > max) {
      l.over = true;
      changed = true;
    } else delete l.over;
  }
  if (changed) write(LS.cart, state.cart);
}
function cartLines() {
  return state.cart.map((l) => ({ ...l, p: byId(l.id) })).filter((l) => l.p);
}
function cartTotals() {
  const lines = cartLines().filter((l) => l.p.status !== 'out');
  const items = lines.reduce((s, l) => s + Math.min(l.qty, l.p.max) * l.p.price, 0);
  const count = lines.reduce((s, l) => s + Math.min(l.qty, l.p.max), 0);
  const fee = count ? Number(state.data?.store?.deliveryFee) || 0 : 0;
  return { lines, items, count, fee, total: items + fee };
}

function toggleFav(id) {
  const i = state.fav.indexOf(id);
  if (i >= 0) state.fav.splice(i, 1);
  else {
    state.fav.push(id);
    bump('#favCount');
  }
  write(LS.fav, state.fav);
  updateBadges();
  for (const b of document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`)) {
    b.classList.toggle('on', state.fav.includes(id));
    b.setAttribute('aria-pressed', state.fav.includes(id));
  }
}

function updateBadges() {
  const n = state.cart.reduce((s, l) => s + (byId(l.id) ? l.qty : 0), 0);
  const c = $('#cartCount');
  c.textContent = n;
  c.hidden = !n;
  const f = state.fav.filter((id) => byId(id)).length;
  const fc = $('#favCount');
  fc.textContent = f;
  fc.hidden = !f;
}
function bump(sel) {
  const el = $(sel);
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ---------- البطاقات ----------
function badges(p) {
  const out = [];
  if (p.status === 'out') out.push('<span class="tag tag-out">نفدت</span>');
  else {
    if (p.was) out.push(`<span class="tag tag-sale">خصم ${Math.round((1 - p.price / p.was) * 100)}%</span>`);
    if (p.status === 'low') out.push(`<span class="tag tag-low">${p.left === 1 ? 'آخر قطعة' : `باقي ${p.left}`}</span>`);
    else if (p.isNew) out.push('<span class="tag tag-new">وصل جديد</span>');
  }
  return out.join('');
}
function priceHtml(p, cls = '') {
  return `<span class="price ${cls}">${money(p.price)}</span>${p.was ? `<s class="was">${money(p.was)}</s>` : ''}`;
}
function photo(p, { eager = false, cls = 'card-img' } = {}) {
  const src = imgUrl(p.imgs?.[0]);
  return src
    ? `<img class="${cls}" src="${esc(src)}" alt="${esc(p.name)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" width="560" height="700">`
    : `<div class="${cls} img-empty" aria-hidden="true"><span>${esc((p.name || 'ر').trim()[0])}</span></div>`;
}
function card(p, i = 0) {
  const fav = state.fav.includes(p.id);
  const href = `#/p/${encodeURIComponent(p.id)}`;
  return `<article class="card${p.status === 'out' ? ' is-out' : ''}">
    <div class="card-media">
      <a href="${href}" tabindex="-1" aria-hidden="true">${photo(p, { eager: i < 4 })}</a>
      <div class="tags">${badges(p)}</div>
      <button type="button" class="fav${fav ? ' on' : ''}" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="${fav ? 'شيل من المفضلة' : 'أضف للمفضلة'}: ${esc(p.name)}">${icon('heart', 18)}</button>
    </div>
    <div class="card-body">
      <a class="card-name" href="${href}">${esc(p.name)}</a>
      <div class="card-foot"><div class="card-price">${priceHtml(p)}</div>${p.status === 'out' ? '' : `<button type="button" class="quick" data-add="${esc(p.id)}" aria-label="أضف ${esc(p.name)} للسلة">${icon('plus', 18)}</button>`}</div>
    </div>
  </article>`;
}
const grid = (list) => `<div class="grid">${list.map(card).join('')}</div>`;
const rail = (list) => `<div class="rail" tabindex="0">${list.map(card).join('')}</div>`;

// ---------- الفرز والبحث ----------
function filtered() {
  let list = products().slice();
  if (state.cat !== 'all') list = list.filter((p) => p.cat === state.cat);
  if (state.onlyAvail) list = list.filter((p) => p.status !== 'out');
  if (state.q) {
    const words = norm(state.q).split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = norm(p.name + ' ' + p.cat + ' ' + (p.desc || ''));
      return words.every((w) => hay.includes(w));
    });
  }
  const outLast = (a, b) => (a.status === 'out') - (b.status === 'out');
  if (state.sort === 'new') list.sort((a, b) => outLast(a, b) || (a.added < b.added ? 1 : -1));
  else if (state.sort === 'low') list.sort((a, b) => outLast(a, b) || a.price - b.price);
  else if (state.sort === 'high') list.sort((a, b) => outLast(a, b) || b.price - a.price);
  return list;
}

// ---------- الصفحة الرئيسية ----------
function heroPick() {
  const list = products().filter((p) => p.imgs?.length && p.status !== 'out');
  return list.find((p) => p.feat) || list.find((p) => p.drop) || list[0];
}

function countdown(endsAt) {
  const end = new Date(endsAt).getTime();
  const left = end - Date.now();
  if (!endsAt || !Number.isFinite(end) || left <= 0) return '';
  const d = Math.floor(left / 864e5);
  const h = Math.floor((left % 864e5) / 36e5);
  const m = Math.floor((left % 36e5) / 6e4);
  const parts = [];
  if (d) parts.push(`${d} ${d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? 'أيام' : 'يوم'}`);
  if (h) parts.push(`${h} ساعة`);
  if (!d) parts.push(`${m} دقيقة`);
  return parts.join(' و');
}

function topbar() {
  const s = state.data?.store || {};
  const drop = state.data?.drop;
  const cd = drop?.endsAt ? countdown(drop.endsAt) : '';
  const msg = cd ? `${esc(drop.name)}: تنتهي بعد ${cd}` : esc(s.announcement || '');
  $('#topbar').innerHTML = msg ? `<div class="topbar">${cd ? icon('clock', 16) : ''}<span>${msg}</span></div>` : '';
}

function homeHtml() {
  const d = state.data;
  const s = d.store || {};
  const all = products();
  const hero = heroPick();
  const drop = d.drop ? all.filter((p) => p.drop) : [];
  const fresh = all.filter((p) => p.isNew && p.status !== 'out' && !p.drop).slice(0, 12);
  const hot = all.filter((p) => p.hot && p.status !== 'out').slice(0, 12);
  const available = all.filter((p) => p.status !== 'out').length;
  const browsing = state.q || state.cat !== 'all';

  const heroHtml = `<section class="hero" aria-labelledby="heroTitle">
      <div class="hero-text">
        <h1 id="heroTitle" class="hero-title">${esc(s.tagline || s.name || 'متجر رواسي')}</h1>
        <p class="hero-tag">${esc(s.about || '')}</p>
        <div class="hero-cta"><a class="btn btn-buy" href="#all" data-scroll="all">تصفّح القطع</a>${s.instagram ? `<a class="btn btn-line" href="https://instagram.com/${esc(s.instagram)}" target="_blank" rel="noopener">${icon('ig', 18)}<span>@${esc(s.instagram)}</span></a>` : ''}</div>
        <p class="hero-meta"><span><b>${available}</b> قطعة متوفرة</span>${s.deliveryNote ? `<span>${esc(s.deliveryNote)}</span>` : ''}</p>
      </div>
      <a class="hero-media" ${hero ? `href="#/p/${encodeURIComponent(hero.id)}" aria-label="${esc(hero.name)}"` : 'aria-hidden="true" tabindex="-1"'}>
        ${hero ? photo(hero, { eager: true, cls: 'hero-img' }) : '<div class="hero-img img-empty"></div>'}
        ${hero ? `<span class="hero-pill"><b>${esc(hero.name)}</b><span>${money(hero.price)}</span></span>` : ''}
      </a>
    </section>`;

  const section = (id, title, sub, body) => `<section class="sec" id="${id}" aria-labelledby="${id}T"><div class="sec-head"><h2 id="${id}T">${title}</h2>${sub ? `<p class="sec-sub">${sub}</p>` : ''}</div>${body}</section>`;

  const cats = d.categories || [];
  const counts = Object.fromEntries(cats.map((c) => [c, all.filter((p) => p.cat === c).length]));
  const list = filtered();
  const allSec = `<section class="sec sec-all" id="all" aria-labelledby="allT">
    <div class="sec-head row"><h2 id="allT">${state.q ? `نتائج "${esc(state.q)}"` : state.cat === 'all' ? 'كل القطع' : esc(state.cat)}</h2><span class="sec-count">${list.length} قطعة</span></div>
    <div class="filters">
      <div class="chips" role="group" aria-label="الأقسام">
        <button type="button" class="chip${state.cat === 'all' ? ' on' : ''}" data-cat="all" aria-pressed="${state.cat === 'all'}">الكل <small>${all.length}</small></button>
        ${cats.map((c) => `<button type="button" class="chip${state.cat === c ? ' on' : ''}" data-cat="${esc(c)}" aria-pressed="${state.cat === c}">${esc(c)} <small>${counts[c]}</small></button>`).join('')}
      </div>
      <div class="filter-row">
        <label class="switch"><input type="checkbox" id="onlyAvail" ${state.onlyAvail ? 'checked' : ''}><span>المتوفر فقط</span></label>
        <label class="sort"><span class="sr">ترتيب</span><select id="sort">
          ${[['featured', 'المقترح'], ['new', 'الأحدث'], ['low', 'السعر: الأقل'], ['high', 'السعر: الأعلى']].map(([v, l]) => `<option value="${v}"${state.sort === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>
      </div>
    </div>
    ${list.length ? grid(list) : `<div class="empty"><p>${state.q ? 'ما لقينا قطعة بهذا الاسم. جرّب كلمة ثانية أو شيل الفلتر.' : 'ما بهذا القسم قطع متوفرة حالياً.'}</p><button type="button" class="btn btn-line" data-reset>اعرض كل القطع</button></div>`}
  </section>`;

  const steps = `<section class="sec how" aria-labelledby="howT">
    <div class="sec-head"><h2 id="howT">شلون تطلب؟</h2>${s.orderNote ? `<p class="sec-sub">${esc(s.orderNote)}</p>` : ''}</div>
    <ol class="steps">
      <li><b>اختار قطعك</b><span>ضيفها للسلة، وتقدر تغيّر الكمية بأي وقت.</span></li>
      <li><b>اكتب معلوماتك</b><span>الاسم والهاتف والعنوان، وينحفظون لطلبك الجاي.</span></li>
      <li><b>احجز بالدايركت</b><span>نجهّز لك رسالة الحجز، ترسلها لنا بدايركت الانستقرام @${esc(s.instagram || 'rawaas_y')} ونأكد حجزك هناك.</span></li>
    </ol>
    <div class="facts">
      <div class="fact">${icon('truck', 22)}<div><b>التوصيل ${s.deliveryFee ? money(s.deliveryFee) : ''}</b><span>${esc(s.deliveryNote || 'لكل المحافظات')}</span></div></div>
      ${s.dmHours ? `<div class="fact">${icon('clock', 22)}<div><b>الرد على الرسائل</b><span>${esc(s.dmHours)}</span></div></div>` : ''}
    </div>
  </section>`;

  const catTiles = cats.length > 1 ? `<section class="sec sec-cats" aria-labelledby="catsT"><div class="sec-head"><h2 id="catsT">الأقسام</h2></div><div class="cats">
    ${cats.map((c) => {
      const pick = all.find((p) => p.cat === c && p.imgs?.length && p.status !== 'out') || all.find((p) => p.cat === c && p.imgs?.length);
      return `<button type="button" class="cat" data-cat="${esc(c)}"><span class="cat-img">${pick ? photo(pick, { cls: 'cat-photo' }) : ''}</span><b>${esc(c)}</b><small>${counts[c]} قطعة</small></button>`;
    }).join('')}
  </div></section>` : '';

  if (browsing) return allSec;
  return [
    heroHtml,
    catTiles,
    drop.length ? section('drop', esc(d.drop.name || 'النزلة الحالية'), d.drop.endsAt && countdown(d.drop.endsAt) ? `تنتهي بعد ${countdown(d.drop.endsAt)}. الحجز حسب الأسبقية.` : 'كمية محدودة، والحجز حسب الأسبقية.', grid(drop)) : '',
    fresh.length >= 3 ? section('new', 'وصل حديثاً', '', rail(fresh)) : '',
    hot.length >= 3 ? section('hot', 'الأكثر طلباً', 'القطع اللي يكثر عليها الطلب', rail(hot)) : '',
    allSec,
    steps,
  ].join('');
}

function footerHtml() {
  const s = state.data?.store || {};
  const upd = state.data?.updatedAt ? new Date(state.data.updatedAt) : null;
  return `<footer class="foot">
    <div class="foot-brand"><img class="brand-logo" src="logo.jpg" alt="" width="46" height="46"><div><b>${esc(s.name || 'متجر رواسي')}</b><p>${esc(s.about || '')}</p></div></div>
    <div class="foot-links">
      ${s.instagram ? `<a href="https://instagram.com/${esc(s.instagram)}" target="_blank" rel="noopener">${icon('ig', 18)}<span>@${esc(s.instagram)}</span></a>` : ''}
    </div>
    ${upd ? `<p class="foot-upd">الكميات محدّثة ${relTime(upd)}</p>` : ''}
  </footer>`;
}

function relTime(d) {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 90) return 'قبل لحظات';
  if (s < 3600) return `قبل ${Math.round(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.round(s / 3600)} ساعة`;
  return 'بتاريخ ' + d.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long' });
}

function waLink(phone, text = '') {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '964' + p.slice(1);
  return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

function renderMain() {
  const main = $('#main');
  if (state.error) {
    main.innerHTML = state.error === 'empty'
      ? `<div class="state"><img class="brand-logo big" src="logo.jpg" alt="" width="96" height="96"><h1>القطع تنزل قريباً</h1><p>نجهّز المتجر حالياً. تابعنا على الانستقرام حتى توصلك أول نزلة.</p><a class="btn" href="https://instagram.com/rawaas_y" target="_blank" rel="noopener">${icon('ig', 18)}<span>@rawaas_y</span></a></div>`
      : `<div class="state"><h1>ما قدرنا نحمّل القطع</h1><p>تأكد من الإنترنت وجرّب مرة ثانية.</p><button type="button" class="btn" data-retry>إعادة المحاولة</button></div>`;
    return;
  }
  if (!state.data) return;
  main.innerHTML = homeHtml() + footerHtml();
}

function renderAll() {
  if (state.data) topbar();
  renderMain();
  updateBadges();
  renderLayer();
  setMeta();
}

function setMeta() {
  const s = state.data?.store;
  if (!s) return;
  const p = state.route.name === 'p' ? byId(state.route.id) : null;
  document.title = p ? `${p.name} — ${s.name}` : `${s.name} — ${s.tagline || ''}`.replace(/ — $/, '');
}

// ---------- الطبقة (صفحة المنتج، السلة، المفضلة، الطلب) ----------
function productHtml(p) {
  const s = state.data.store || {};
  const fav = state.fav.includes(p.id);
  const inCart = cartQty(p.id);
  const imgs = p.imgs?.length ? p.imgs : [null];
  const related = products().filter((x) => x.cat === p.cat && x.id !== p.id && x.status !== 'out').slice(0, 8);
  return `<div class="sheet sheet-product" role="dialog" aria-modal="true" aria-labelledby="pTitle">
    <button type="button" class="close" data-close aria-label="إغلاق">${icon('x', 22)}</button>
    <div class="pd">
      <div class="gallery">
        <div class="gal-track" id="galTrack" tabindex="0" aria-label="صور ${esc(p.name)}">
          ${imgs.map((src, i) => `<div class="gal-slide">${src ? `<img src="${esc(imgUrl(src))}" alt="${esc(p.name)}${imgs.length > 1 ? `، صورة ${i + 1}` : ''}" ${i ? 'loading="lazy"' : ''}>` : `<div class="img-empty"><span>${esc(p.name.trim()[0])}</span></div>`}</div>`).join('')}
        </div>
        ${imgs.length > 1 ? `<div class="gal-dots">${imgs.map((_, i) => `<button type="button" class="dot${i ? '' : ' on'}" data-slide="${i}" aria-label="صورة ${i + 1}"></button>`).join('')}</div>` : ''}
      </div>
      <div class="pd-info">
        <p class="pd-cat">${esc(p.cat)}</p>
        <h2 id="pTitle" class="pd-name">${esc(p.name)}</h2>
        <div class="pd-price">${priceHtml(p, 'big')}${p.was ? `<span class="save">توفّر ${money(p.was - p.price)}</span>` : ''}</div>
        <p class="pd-stock st-${p.status}">${p.status === 'out' ? 'نفدت هذه القطعة. تابعنا على الانستقرام حتى تعرف إذا رجعت.' : p.status === 'low' ? (p.left === 1 ? 'آخر قطعة متوفرة' : `باقي ${p.left} قطع فقط`) : 'متوفرة'}${p.drop && p.status !== 'out' ? '، ضمن النزلة الحالية' : ''}</p>
        ${p.desc ? `<p class="pd-desc">${esc(p.desc).replace(/\n/g, '<br>')}</p>` : ''}
        ${p.status === 'out' ? '' : `<div class="buy">
          <div class="stepper" role="group" aria-label="الكمية">
            <button type="button" data-step="1" aria-label="زيادة">${icon('plus', 18)}</button>
            <output id="pQty" aria-live="polite">1</output>
            <button type="button" data-step="-1" aria-label="نقصان">${icon('minus', 18)}</button>
          </div>
          <button type="button" class="btn btn-buy" data-addq="${esc(p.id)}">${icon('bag', 20)}<span>${inCart ? `أضف للسلة (فيها ${inCart})` : 'أضف للسلة'}</span></button>
        </div>`}
        <div class="pd-actions">
          <button type="button" class="btn-text${fav ? ' on' : ''}" data-fav="${esc(p.id)}" aria-pressed="${fav}">${icon('heart', 18)}<span>المفضلة</span></button>
          <button type="button" class="btn-text" data-share="${esc(p.id)}">${icon('share', 18)}<span>مشاركة</span></button>
        </div>
        <ul class="pd-facts">
          <li>${icon('truck', 18)}<span>التوصيل ${s.deliveryFee ? money(s.deliveryFee) : ''}، ${esc(s.deliveryNote || 'لكل المحافظات')}</span></li>
          ${s.orderNote ? `<li>${icon('clock', 18)}<span>${esc(s.orderNote)}</span></li>` : ''}
        </ul>
      </div>
    </div>
    ${related.length ? `<div class="pd-related"><h3>من نفس القسم</h3>${rail(related)}</div>` : ''}
  </div>`;
}

function cartHtml() {
  const t = cartTotals();
  const all = cartLines();
  return `<div class="sheet sheet-side" role="dialog" aria-modal="true" aria-labelledby="cartT">
    <div class="side-head"><h2 id="cartT">السلة</h2><button type="button" class="close" data-close aria-label="إغلاق">${icon('x', 22)}</button></div>
    ${all.length ? `<ul class="lines">
      ${all.map((l) => {
        const out = l.p.status === 'out';
        const over = !out && l.qty > l.p.max;
        return `<li class="line${out ? ' is-out' : ''}">
          <a class="line-img" href="#/p/${encodeURIComponent(l.p.id)}">${photo(l.p, { cls: 'thumb' })}</a>
          <div class="line-body">
            <b>${esc(l.p.name)}</b>
            <span class="line-price">${money(l.p.price)}</span>
            ${out ? '<span class="warn">نفدت، شيلها من السلة</span>' : over ? `<span class="warn">المتوفر صار ${l.p.max} فقط</span>` : ''}
            ${out ? '' : `<div class="stepper sm" role="group" aria-label="كمية ${esc(l.p.name)}">
              <button type="button" data-cq="${esc(l.p.id)}" data-d="1" aria-label="زيادة" ${l.qty >= l.p.max ? 'disabled' : ''}>${icon('plus', 16)}</button>
              <output>${Math.min(l.qty, l.p.max)}</output>
              <button type="button" data-cq="${esc(l.p.id)}" data-d="-1" aria-label="نقصان">${icon('minus', 16)}</button>
            </div>`}
          </div>
          <button type="button" class="line-rm" data-rm="${esc(l.p.id)}" aria-label="شيل ${esc(l.p.name)}">${icon('trash', 18)}</button>
        </li>`;
      }).join('')}
    </ul>
    <div class="sum">
      <div><span>القطع (${t.count})</span><b>${money(t.items)}</b></div>
      <div><span>التوصيل</span><b>${money(t.fee)}</b></div>
      <div class="sum-total"><span>المجموع</span><b>${money(t.total)}</b></div>
    </div>
    <div class="side-foot">
      <a class="btn btn-buy wide${t.count ? '' : ' disabled'}" href="#/checkout" ${t.count ? '' : 'aria-disabled="true" tabindex="-1"'}>أكمل الحجز</a>
      ${state.data.store.orderNote ? `<p class="hint">${esc(state.data.store.orderNote)}</p>` : ''}
    </div>` : `<div class="empty"><p>السلة فارغة. ضيف القطع اللي عجبتك وارجع هنا.</p><button type="button" class="btn" data-close>تصفّح القطع</button></div>`}
  </div>`;
}

function favHtml() {
  const list = state.fav.map(byId).filter(Boolean);
  return `<div class="sheet sheet-side" role="dialog" aria-modal="true" aria-labelledby="favT">
    <div class="side-head"><h2 id="favT">المفضلة</h2><button type="button" class="close" data-close aria-label="إغلاق">${icon('x', 22)}</button></div>
    ${list.length ? `<div class="side-scroll">${grid(list)}</div>` : `<div class="empty"><p>اضغط القلب على أي قطعة حتى تحفظها هنا وترجعلها بعدين.</p><button type="button" class="btn" data-close>تصفّح القطع</button></div>`}
  </div>`;
}

function checkoutHtml() {
  const t = cartTotals();
  if (!t.count) return cartHtml();
  const b = read(LS.buyer, {});
  const govs = state.data.store.governorates || [];
  return `<div class="sheet sheet-side" role="dialog" aria-modal="true" aria-labelledby="coT">
    <div class="side-head"><a class="close back" href="#/cart" aria-label="رجوع للسلة">${icon('chev', 22)}</a><h2 id="coT">معلومات التوصيل</h2><button type="button" class="close" data-close aria-label="إغلاق">${icon('x', 22)}</button></div>
    <form class="form" id="coForm" novalidate>
      <label class="field"><span>الاسم</span><input name="name" required autocomplete="name" value="${esc(b.name || '')}"></label>
      <label class="field"><span>رقم الهاتف</span><input name="phone" required inputmode="tel" autocomplete="tel" dir="ltr" placeholder="07xx xxx xxxx" value="${esc(b.phone || '')}"></label>
      <label class="field"><span>المحافظة</span><select name="gov" required><option value="">اختار المحافظة</option>${govs.map((g) => `<option${b.gov === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="field"><span>العنوان</span><input name="address" required autocomplete="street-address" placeholder="المنطقة، أقرب نقطة دالة" value="${esc(b.address || '')}"></label>
      <label class="field"><span>حسابك بالانستقرام <small>اختياري</small></span><input name="ig" dir="ltr" placeholder="@" value="${esc(b.ig || '')}"></label>
      <label class="field"><span>ملاحظة <small>اختياري</small></span><textarea name="note" rows="2" placeholder="مثلاً: هدية، تغليف خاص…"></textarea></label>
      <div class="sum">
        <div><span>القطع (${t.count})</span><b>${money(t.items)}</b></div>
        <div><span>التوصيل</span><b>${money(t.fee)}</b></div>
        <div class="sum-total"><span>المجموع</span><b>${money(t.total)}</b></div>
      </div>
      <p class="form-err" id="coErr" role="alert" hidden></p>
      <button class="btn btn-buy wide" type="submit">${icon('ig', 18)}<span>جهّز رسالة الحجز</span></button>
      <p class="hint">الحجز يتم بدايركت الانستقرام. نجهّز لك رسالة فيها قطعك ومعلوماتك، وأنت ترسلها لنا.${state.data.store.dmHours ? ' ' + esc(state.data.store.dmHours) + '.' : ''}</p>
    </form>
  </div>`;
}

function orderText(buyer, ref) {
  const s = state.data.store;
  const t = cartTotals();
  const lines = t.lines.map((l, i) => `${i + 1}. ${l.p.name} × ${Math.min(l.qty, l.p.max)} — ${money(l.p.price * Math.min(l.qty, l.p.max))}`);
  return [
    `حجز من موقع ${s.name} (${ref})`,
    '',
    ...lines,
    '',
    `القطع: ${money(t.items)}`,
    `التوصيل: ${money(t.fee)}`,
    `المجموع: ${money(t.total)}`,
    '',
    `الاسم: ${buyer.name}`,
    `الهاتف: ${buyer.phone}`,
    `المحافظة: ${buyer.gov}`,
    `العنوان: ${buyer.address}`,
    buyer.ig ? `الانستقرام: ${buyer.ig}` : '',
    buyer.note ? `ملاحظة: ${buyer.note}` : '',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n').trim();
}

let lastOrder = null;
function doneHtml() {
  const o = lastOrder;
  if (!o) return cartHtml();
  const s = state.data.store;
  return `<div class="sheet sheet-side" role="dialog" aria-modal="true" aria-labelledby="doneT">
    <div class="side-head"><h2 id="doneT">باقي خطوة وحدة</h2><button type="button" class="close" data-close aria-label="إغلاق">${icon('x', 22)}</button></div>
    <div class="side-scroll done">
      <p>الحجز يتم بدايركت حسابنا بالانستقرام. ${o.copied ? 'نسخنا رسالة الحجز،' : 'انسخ رسالة الحجز تحت،'} افتح الدايركت والصقها، ونأكد حجزك هناك.</p>
      <ol class="steps steps-sm">
        <li><b>${o.copied ? 'تم نسخ الرسالة' : 'انسخ الرسالة'}</b><button type="button" class="btn btn-line" data-copy>${icon(o.copied ? 'check' : 'copy', 18)}<span>${o.copied ? 'انسخها مرة ثانية' : 'انسخ الرسالة'}</span></button></li>
        <li><b>افتح الدايركت والصقها</b><div class="send-row">
          <a class="btn btn-buy" href="https://ig.me/m/${esc(s.instagram || 'rawaas_y')}" target="_blank" rel="noopener" data-dm>${icon('ig', 18)}<span>افتح دايركت @${esc(s.instagram || 'rawaas_y')}</span></a>
        </div></li>
      </ol>
      <pre class="order-text" tabindex="0">${esc(o.text)}</pre>
      <p class="hint">${esc(s.orderNote || '')} الحجز ينثبت بعد ما نأكده لك بالدايركت.</p>
      <div class="send-row"><button type="button" class="btn-text" data-clear>${icon('trash', 18)}<span>فرّغ السلة</span></button><button type="button" class="btn-text" data-close>رجوع للمتجر</button></div>
    </div>
  </div>`;
}

let lastFocus = null;
function renderLayer() {
  const layer = $('#layer');
  const r = state.route;
  let html = '';
  if (state.data) {
    if (r.name === 'p') {
      const p = byId(r.id);
      html = p ? productHtml(p) : `<div class="sheet sheet-side" role="dialog" aria-modal="true"><div class="side-head"><h2>القطعة مو موجودة</h2><button type="button" class="close" data-close aria-label="إغلاق">${icon('x', 22)}</button></div><div class="empty"><p>يمكن انباعت أو انشالت من المتجر.</p><button type="button" class="btn" data-close>تصفّح القطع</button></div></div>`;
    } else if (r.name === 'cart') html = cartHtml();
    else if (r.name === 'fav') html = favHtml();
    else if (r.name === 'checkout') html = checkoutHtml();
    else if (r.name === 'done') html = doneHtml();
  }
  const open = !!html;
  if (open && layer.hidden) lastFocus = document.activeElement;
  layer.hidden = !open;
  document.body.classList.toggle('locked', open);
  layer.innerHTML = open ? `<div class="scrim" data-close></div>${html}` : '';
  if (open) {
    const first = layer.querySelector('.sheet .close, .sheet button, .sheet a');
    first?.focus({ preventScroll: true });
    layer.querySelector('.sheet')?.scrollTo?.(0, 0);
    bindGallery();
  } else if (lastFocus) {
    lastFocus.focus?.({ preventScroll: true });
    lastFocus = null;
  }
}

function bindGallery() {
  const track = $('#galTrack');
  if (!track) return;
  track.addEventListener('scroll', () => {
    const i = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    document.querySelectorAll('.gal-dots .dot').forEach((d, n) => d.classList.toggle('on', n === i));
  }, { passive: true });
}

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  return { name: ['p', 'cart', 'fav', 'checkout', 'done'].includes(name) ? name : '', id: id ? decodeURIComponent(id) : '' };
}
function onRoute() {
  state.route = parseRoute();
  if (state.route.name === 'done' && !lastOrder) return closeLayer();
  renderLayer();
  setMeta();
}
function closeLayer() {
  if (location.hash && location.hash !== '#') {
    history.pushState('', document.title, location.pathname + location.search);
  }
  onRoute();
}

// ---------- إشعار صغير ----------
let toastTimer = null;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<a href="${action.href}">${esc(action.label)}</a>` : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

// ---------- الأحداث ----------
function bind() {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t) {
      if (e.target.closest('[data-close]')) closeLayer();
      return;
    }
    const d = t.dataset;
    if (d.close !== undefined) {
      e.preventDefault();
      return closeLayer();
    }
    if (d.fav) return toggleFav(d.fav);
    if (d.add) return addToCart(d.add, 1);
    if (d.addq) {
      const q = Number($('#pQty')?.textContent) || 1;
      addToCart(d.addq, q);
      return renderLayer();
    }
    if (d.step) {
      const out = $('#pQty');
      const p = byId(state.route.id);
      if (!out || !p) return;
      out.textContent = Math.max(1, Math.min(p.max - cartQty(p.id) || 1, (Number(out.textContent) || 1) + Number(d.step)));
      return;
    }
    if (d.cq) {
      setQty(d.cq, cartQty(d.cq) + Number(d.d));
      clampCart();
      return renderLayer();
    }
    if (d.rm) {
      setQty(d.rm, 0);
      return renderLayer();
    }
    if (d.cat) {
      state.cat = d.cat;
      renderMain();
      return $('#all')?.scrollIntoView({ block: 'start' });
    }
    if (d.reset !== undefined) {
      state.cat = 'all';
      state.q = '';
      state.onlyAvail = false;
      $('#q').value = '';
      return renderMain();
    }
    if (d.retry !== undefined) return load();
    if (d.scroll) {
      e.preventDefault();
      return document.getElementById(d.scroll)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    if (d.slide) {
      const track = $('#galTrack');
      const i = Number(d.slide);
      track?.scrollTo({ left: -i * track.clientWidth * (getComputedStyle(track).direction === 'rtl' ? 1 : -1), behavior: 'smooth' });
      return;
    }
    if (d.share) {
      const p = byId(d.share);
      const url = location.href.split('#')[0] + '#/p/' + encodeURIComponent(d.share);
      if (navigator.share) {
        try {
          await navigator.share({ title: p?.name, text: `${p?.name} — ${money(p?.price)}`, url });
        } catch {}
      } else if (await copy(url)) toast('نسخنا رابط القطعة');
      return;
    }
    if (d.dm !== undefined && lastOrder) {
      copy(lastOrder.text); // ننسخها مرة ثانية حتى تكون جاهزة للصق بالدايركت
      return;
    }
    if (d.copy !== undefined && lastOrder) {
      lastOrder.copied = await copy(lastOrder.text);
      toast(lastOrder.copied ? 'نسخنا رسالة الحجز' : 'ما قدرنا ننسخ، حدد النص وانسخه يدوياً');
      return renderLayer();
    }
    if (d.clear !== undefined) {
      state.cart = [];
      saveCart();
      lastOrder = null;
      toast('فرّغنا السلة');
      return closeLayer();
    }
    if (t.id === 'themeBtn') return toggleTheme();
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      state.q = e.target.value.trim();
      clearTimeout(bind.qt);
      bind.qt = setTimeout(() => {
        renderMain();
        if (state.q) $('#all')?.scrollIntoView({ block: 'start' });
      }, 180);
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'sort') {
      state.sort = e.target.value;
      renderMain();
    } else if (e.target.id === 'onlyAvail') {
      state.onlyAvail = e.target.checked;
      renderMain();
    }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'coForm') return;
    e.preventDefault();
    const f = e.target;
    const buyer = Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]));
    const phone = buyer.phone.replace(/[\s-]/g, '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
    const err = $('#coErr');
    let msg = '';
    if (!buyer.name) msg = 'اكتب اسمك.';
    else if (!/^(\+?964|0)?7\d{9}$/.test(phone)) msg = 'اكتب رقم هاتف عراقي صحيح، مثل 07701234567.';
    else if (!buyer.gov) msg = 'اختار المحافظة.';
    else if (!buyer.address) msg = 'اكتب العنوان حتى نوصلك.';
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      return;
    }
    buyer.phone = phone;
    write(LS.buyer, { name: buyer.name, phone, gov: buyer.gov, address: buyer.address, ig: buyer.ig });
    const ref = 'R' + Date.now().toString(36).slice(-5).toUpperCase();
    const text = orderText(buyer, ref);
    const copied = await copy(text);
    lastOrder = { ref, text, copied, at: new Date().toISOString() };
    const hist = read(LS.orders, []);
    hist.unshift({ ref, at: lastOrder.at, total: cartTotals().total });
    write(LS.orders, hist.slice(0, 20));
    location.hash = '#/done';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#layer').hidden) closeLayer();
    if (e.key === 'Tab' && !$('#layer').hidden) {
      const items = [...$('#layer').querySelectorAll('.sheet a[href], .sheet button:not([disabled]), .sheet input, .sheet select, .sheet textarea, .sheet [tabindex="0"]')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener('hashchange', onRoute);
  // نحدّث الكميات لما يرجع الزبون للصفحة، وكل دقيقتين وهو فاتحها.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastFetch > 30000) load({ silent: true });
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') load({ silent: true });
  }, 120000);
  setInterval(() => state.data && topbar(), 60000);
  const head = $('#head');
  window.addEventListener('scroll', () => head.classList.toggle('scrolled', window.scrollY > 8), { passive: true });
}

// ---------- الوضع الليلي ----------
function applyTheme() {
  const t = read(LS.theme, '');
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  write(LS.theme, dark ? 'light' : 'dark');
  applyTheme();
}

applyTheme();
bind();
state.route = parseRoute();
load();
