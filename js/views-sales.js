// شاشات البيع: الرئيسية، الحجوزات، الدفعات، الزبائن.
import * as store from './store.js';
import { register, state, inv, data, settings, nav, rerender, ui, setUi, formData } from './core.js';
import { esc, icon, thumb, statusChip, stockPill, money, fmtDate, timeAgo, today, toast, options, emptyState, copyText, waLink, telLink } from './ui.js';
import { STATUSES, live, fmtNum, fmtIQD, bookingTotals, lineTotals, batchStats, priceListText, report, customers, isReservedStatus, isShippedStatus, stockLevel } from './logic.js';
import * as sync from './sync.js';

const n = (v) => Number(v) || 0;
const pmap = () => Object.fromEntries(store.all('products').map((p) => [p.id, p]));

// ---------- الرئيسية ----------
function syncChip() {
  const st = sync.getStatus();
  if (!sync.isGoogle()) return `<button type="button" class="sync-chip off" data-act="connectGoogle">${icon('cloudOff', 16)}<span>ربط بحساب Google</span></button>`;
  const map = {
    syncing: ['busy', 'refresh', 'جاري المزامنة…'],
    error: ['err', 'cloudOff', 'فشلت، اضغط للإعادة'],
    offline: ['off', 'cloudOff', 'بدون إنترنت'],
    needsAuth: ['warn', 'refresh', 'اضغط للمزامنة'],
    idle: ['warn', 'refresh', 'اضغط للمزامنة'],
  };
  const [cls, ic, label] = map[st.state] || ['ok', 'cloudOk', 'متزامن مع Drive'];
  return `<button type="button" class="sync-chip ${cls}" data-act="syncNow" title="${esc(st.message || '')}">${icon(ic, 16)}<span>${label}</span></button>`;
}

function homeView() {
  const d = data();
  const items = inv().items;
  const t = today();
  const monthStart = t.slice(0, 8) + '01';
  const rToday = report(d, inv(), t, t);
  const rMonth = report(d, inv(), monthStart, t);
  const pending = store.all('bookings').filter((b) => b.status === 'reserved').length;
  const toShip = store.all('bookings').filter((b) => b.status === 'confirmed').length;
  const products = store.all('products');
  const pieces = products.reduce((s, p) => s + Math.max(items[p.id]?.stock || 0, 0), 0);
  const openBatch = store.all('batches').filter((b) => b.status !== 'closed').sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))[0];
  const bs = openBatch ? batchStats(d, openBatch) : null;
  const alerts = products
    .map((p) => ({ p, it: items[p.id], lvl: stockLevel(items[p.id], p.minStock ?? settings().defaultMinStock) }))
    .filter((x) => x.lvl !== 'ok' && (x.it?.received || 0) > 0)
    .sort((a, b) => (a.it?.available || 0) - (b.it?.available || 0))
    .slice(0, 5);

  return `
  <header class="page-head home-head">
    <div class="col"><h1>${esc(settings().storeName || 'متجر رواسي')}</h1><span class="muted">${esc(fmtDate(t, true))}</span></div>
    <div class="row gap">${syncChip()}<a class="icon-btn accent" href="#/ai" aria-label="المساعد الذكي">${icon('spark', 20)}</a></div>
  </header>

  <a class="hero" href="#/bookings?tab=reserved">
    <div class="col"><span>حجوزات بانتظار التأكيد</span><b>${fmtNum(pending)}</b>${toShip ? `<small>${fmtNum(toShip)} مؤكدة تنتظر الإرسال</small>` : ''}</div>
    <span class="hero-btn">عرض الحجوزات ${icon('chev', 16)}</span>
  </a>

  <div class="quick">
    <a href="#/booking/new">${icon('clip', 22)}<span>حجز جديد</span></a>
    <a href="#/ai?mode=parse">${icon('chat', 22)}<span>حجز من رسالة</span></a>
    <a href="#/lot/new">${icon('inbox', 22)}<span>وارد للمخزن</span></a>
    <a href="#/product/new" class="hide-sm-not">${icon('box', 22)}<span>منتج جديد</span></a>
  </div>

  <section class="kpis" aria-label="أرقام سريعة">
    <div class="kpi"><span>مبيعات اليوم</span><b>${fmtNum(rToday.revenue)} <small>د.ع</small></b></div>
    <div class="kpi"><span>ربح الشهر الصافي</span><b>${fmtNum(rMonth.netProfit)} <small>د.ع</small></b></div>
    <div class="kpi"><span>قطع في المخزن</span><b>${fmtNum(pieces)}</b></div>
    <div class="kpi">${bs ? `<span>متبقي من الدفعة الحالية</span><b>${fmtNum(bs.remaining)} <small>من ${fmtNum(bs.allocated)}</small></b>` : `<span>مبيعات الشهر</span><b>${fmtNum(rMonth.revenue)} <small>د.ع</small></b>`}</div>
  </section>

  <div class="two-col">
    ${bs ? `<section class="card">
      <div class="row between"><h2>${esc(openBatch.name || 'الدفعة الحالية')}</h2><a class="link" href="#/batch/${esc(openBatch.id)}">التفاصيل</a></div>
      ${batchBar(bs)}
    </section>` : ''}
    <section class="card">
      <div class="row between"><h2>تنبيهات المخزن</h2><a class="link" href="#/products" data-act="prodAlerts">الكل</a></div>
      ${alerts.length ? `<ul class="list">${alerts.map(({ p, it }) => `<li><a class="row gap" href="#/product/${esc(p.id)}">${thumb(p, 40)}<span class="grow col"><b>${esc(p.name)}</b><small class="muted">${esc(p.category || '')}</small></span>${stockPill(it, p.minStock ?? settings().defaultMinStock)}</a></li>`).join('')}</ul>` : `<p class="muted">${products.length ? 'كل شي متوفر ✓' : 'أضف منتجاتك من وجبة تجهيز أو ملف إكسل.'}</p>`}
    </section>
  </div>`;
}

function batchBar(bs) {
  const tot = Math.max(bs.allocated, bs.sold + bs.reserved, 1);
  const pct = (v) => ((v / tot) * 100).toFixed(1) + '%';
  return `<div class="stack-bar" role="img" aria-label="${fmtNum(bs.sold)} مباع، ${fmtNum(bs.reserved)} محجوز، ${fmtNum(bs.remaining)} متبقي">
      <div style="width:${pct(bs.sold)};background:var(--teal)"></div><div style="width:${pct(bs.reserved)};background:var(--amber)"></div><div style="flex:1;background:var(--sand)"></div></div>
    <div class="legend">
      <div><span><i style="background:var(--teal)"></i>مباع</span><b>${fmtNum(bs.sold)}</b></div>
      <div><span><i style="background:var(--amber)"></i>محجوز</span><b>${fmtNum(bs.reserved)}</b></div>
      <div><span><i style="background:var(--sand-dark)"></i>متبقي</span><b>${fmtNum(bs.remaining)}${bs.allocated ? ` <small>من ${fmtNum(bs.allocated)}</small>` : ''}</b></div>
    </div>`;
}

// ---------- الحجوزات ----------
const TABS = [
  { key: 'active', label: 'نشطة', test: (s) => s !== 'delivered' && s !== 'cancelled' },
  { key: 'reserved', label: 'محجوز', test: (s) => s === 'reserved' },
  { key: 'confirmed', label: 'مؤكد', test: (s) => s === 'confirmed' },
  { key: 'shipped', label: 'مُرسل', test: (s) => s === 'shipped' },
  { key: 'delivered', label: 'مُستلم', test: (s) => s === 'delivered' },
  { key: 'cancelled', label: 'ملغي', test: (s) => s === 'cancelled' },
  { key: 'all', label: 'الكل', test: () => true },
];
const NEXT = { reserved: ['confirmed', 'تأكيد'], confirmed: ['shipped', 'إرسال'], shipped: ['delivered', 'استلم'] };

function bookingsList() {
  const tabKey = ui('bkTab', 'active');
  const tab = TABS.find((t) => t.key === tabKey) || TABS[0];
  const q = (ui('bkQ', '') || '').trim();
  const batchId = state.route.params.batch || '';
  const custKey = state.route.params.customer || '';
  const P = pmap();
  let list = store.all('bookings').filter((b) => tab.test(b.status));
  if (batchId) list = list.filter((b) => b.batchId === batchId);
  if (custKey) list = list.filter((b) => ((b.customer?.phone || '').replace(/\D/g, '') || (b.customer?.name || '').trim()) === custKey);
  if (q) list = list.filter((b) => String(b.no) === q.replace('#', '') || (b.customer?.name || '').includes(q) || (b.customer?.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '~'));
  const old = tabKey === 'delivered' || tabKey === 'cancelled' || tabKey === 'all';
  list.sort((a, b) => (old ? n(b.no) - n(a.no) : n(a.no) - n(b.no)));
  if (!list.length) return emptyState(q ? 'ما لقيت حجز بهذا البحث' : 'ما كو حجوزات هنا', tabKey === 'active' && !q ? '<a class="btn" href="#/booking/new">حجز جديد</a>' : '');
  return `<div class="bk-list">${list.map((b) => {
    const t = bookingTotals(b);
    const items = (b.lines || []).map((l) => `${P[l.productId]?.name || 'منتج محذوف'} ×${fmtNum(l.qty)}`).join(' · ');
    const nx = NEXT[b.status];
    return `<article class="card bk">
      <a class="bk-main" href="#/booking/${esc(b.id)}">
        <div class="row gap">
          <span class="badge-no">#${esc(b.no)}</span>
          <div class="grow col"><b>${esc(b.customer?.name || 'بدون اسم')}</b><small class="muted">${esc(b.customer?.gov || '')}${b.customer?.gov ? ' · ' : ''}${esc(timeAgo(b.date))}</small></div>
          ${statusChip(b.status)}
        </div>
        <p class="bk-items">${esc(items)}</p>
      </a>
      <div class="row between">
        <span class="price">${money(t.total)}${t.discounts ? ` <small class="muted">(خصم ${fmtNum(t.discounts)})</small>` : ''}</span>
        <div class="row gap">
          ${b.customer?.phone ? `<a class="icon-btn bordered" href="${esc(telLink(b.customer.phone))}" aria-label="اتصال">${icon('phone', 18)}</a>` : ''}
          ${nx ? `<button type="button" class="btn btn-sm" data-act="advance" data-id="${esc(b.id)}" data-to="${nx[0]}">${nx[1]}</button>` : ''}
        </div>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function bookingsView() {
  if (state.route.params.tab) {
    state.ui.bkTab = state.route.params.tab;
    state.route.params.tab = '';
  }
  const tabKey = ui('bkTab', 'active');
  const all = store.all('bookings');
  const batch = state.route.params.batch ? store.get('batches', state.route.params.batch) : null;
  const cust = state.route.params.customer || '';
  return `
  <header class="page-head">
    <div class="col"><h1>الحجوزات</h1><span class="muted small">${batch ? 'دفعة: ' + esc(batch.name) + ' · ' : ''}${cust ? 'زبون محدد · ' : ''}مرتبة حسب الأسبقية</span></div>
    ${batch || cust ? `<a class="btn btn-ghost btn-sm" href="#/bookings">إلغاء الفلتر</a>` : ''}
  </header>
  <div class="tabs" role="tablist" aria-label="حالة الحجز">
    ${TABS.map((t) => `<button type="button" role="tab" aria-selected="${t.key === tabKey}" class="tab${t.key === tabKey ? ' on' : ''}" data-act="bkTab" data-v="${t.key}">${t.label} <small>${fmtNum(all.filter((b) => t.test(b.status)).length)}</small></button>`).join('')}
  </div>
  <div class="search">${icon('search', 18)}<label for="bkQ" class="sr">بحث</label><input id="bkQ" type="search" placeholder="الاسم، الهاتف، أو رقم الحجز" value="${esc(ui('bkQ', ''))}" data-in="bkSearch" autocomplete="off"></div>
  <div id="bkList">${bookingsList()}</div>
  <a class="fab fab-wide" href="#/booking/new">${icon('plus', 20)}<span>حجز جديد</span></a>`;
}

function bookingDraft(id) {
  const key = 'booking:' + id;
  if (!state.drafts[key]) {
    if (id === 'new') {
      const openBatch = store.all('batches').filter((b) => b.status !== 'closed').sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))[0];
      state.drafts[key] = { customer: { name: '', phone: '', gov: '', address: '', ig: '' }, lines: [emptyLine()], orderDiscount: '', deliveryFee: settings().deliveryFee ?? '', status: 'reserved', batchId: openBatch?.id || '', note: '' };
    } else {
      const b = store.get('bookings', id);
      if (!b) return null;
      state.drafts[key] = JSON.parse(JSON.stringify(b));
      state.drafts[key].customer = { name: '', phone: '', gov: '', address: '', ig: '', ...(b.customer || {}) };
    }
  }
  return state.drafts[key];
}
const emptyLine = () => ({ productId: '', qty: 1, price: '', discType: 'amt', disc: '', showDisc: false });

function availableFor(productId, editingId) {
  const it = inv().items[productId];
  if (!it) return 0;
  let a = it.available;
  if (editingId && editingId !== 'new') {
    const orig = store.get('bookings', editingId);
    if (orig && isReservedStatus(orig.status)) for (const l of orig.lines || []) if (l.productId === productId) a += n(l.qty);
  }
  return a;
}

function bookingTotalsHtml(d) {
  const t = bookingTotals(d);
  return `<div class="sum-row"><span>مجموع القطع</span><b>${fmtIQD(t.gross)}</b></div>
    ${t.discounts ? `<div class="sum-row"><span>الخصومات</span><b class="neg">− ${fmtIQD(t.discounts)}</b></div>` : ''}
    <div class="sum-row"><span>التوصيل</span><b>${fmtIQD(t.delivery)}</b></div>
    <div class="sum-row total"><span>الكلي</span><b>${fmtIQD(t.total)}</b></div>`;
}

function lineInfo(d, i, id) {
  const l = d.lines[i];
  if (!l.productId) return '';
  const lt = lineTotals(l);
  const avail = availableFor(l.productId, id);
  const warn = isReservedStatus(d.status) || d.status === 'shipped' ? n(l.qty) > avail : false;
  return `${lt.discount ? `بعد الخصم: <b>${fmtIQD(lt.net)}</b> · ` : `المجموع: <b>${fmtIQD(lt.net)}</b> · `}${warn ? `<span class="neg">المتاح ${fmtNum(avail)} فقط!</span>` : `<span class="muted">المتاح ${fmtNum(avail)}</span>`}`;
}

function confirmMessage(b) {
  const P = pmap();
  const t = bookingTotals(b);
  const lines = (b.lines || []).map((l) => {
    const lt = lineTotals(l);
    return `• ${P[l.productId]?.name || ''} ×${l.qty} — ${fmtNum(lt.net)} د.ع`;
  });
  return [
    `هلا ${b.customer?.name || ''}، حجزك تأكد ✓${b.no ? ` (رقم ${b.no})` : ''}`,
    ...lines,
    t.discounts ? `الخصم: ${fmtNum(t.discounts)} د.ع` : '',
    `التوصيل: ${fmtNum(t.delivery)} د.ع`,
    `المجموع الكلي: ${fmtNum(t.total)} د.ع`,
    b.customer?.gov || b.customer?.address ? `العنوان: ${[b.customer?.gov, b.customer?.address].filter(Boolean).join(' - ')}` : '',
    'شكراً لثقتك بـ ' + (settings().storeName || 'متجر رواسي'),
  ].filter(Boolean).join('\n');
}

function bookingView(id) {
  const d = bookingDraft(id);
  if (!d) return emptyState('هذا الحجز غير موجود', '<a class="btn" href="#/bookings">رجوع</a>');
  const isNew = id === 'new';
  const products = store.all('products').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const items = inv().items;
  const batches = store.all('batches').filter((b) => b.status !== 'closed' || b.id === d.batchId);
  const govs = settings().governorates || [];
  const prodOpts = (sel) => `<option value="">اختر قطعة…</option>` + settings().categories.concat(['']).map((cat) => {
    const group = products.filter((p) => (cat ? p.category === cat : !settings().categories.includes(p.category)));
    if (!group.length) return '';
    return `<optgroup label="${esc(cat || 'أخرى')}">${group.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)} (${fmtNum(items[p.id]?.available || 0)})</option>`).join('')}</optgroup>`;
  }).join('');
  const nextNo = isNew ? (data().meta.bookingSeq || 0) + 1 : d.no;

  return `
  <header class="page-head">
    <div class="row gap"><a class="icon-btn" href="#/bookings" aria-label="رجوع">${icon('back')}</a><h1>${isNew ? 'حجز جديد' : 'حجز #' + esc(d.no)}</h1></div>
    <span class="chip chip-plain">الترتيب #${esc(nextNo)}</span>
  </header>
  ${d.aiNote ? `<p class="note">${icon('spark', 18)} <span>${esc(d.aiNote)}</span></p>` : ''}
  <form class="col gap" data-submit="saveBooking" data-id="${esc(id)}">
    <section class="card form" aria-label="بيانات الزبون">
      <label class="field"><span>اسم الزبون</span><input data-in="bkCust" data-k="name" value="${esc(d.customer.name)}" required autocomplete="off" list="custNames"></label>
      <datalist id="custNames">${customers(data()).slice(0, 200).map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <div class="grid2">
        <label class="field"><span>رقم الهاتف</span><input type="tel" dir="ltr" class="ltr-right" data-in="bkCust" data-k="phone" value="${esc(d.customer.phone)}" placeholder="07xx xxx xxxx"></label>
        <label class="field"><span>المحافظة</span><select data-in="bkCust" data-k="gov">${options(govs, d.customer.gov, { empty: 'اختر…' })}</select></label>
      </div>
      <label class="field"><span>العنوان وأقرب نقطة دالة</span><input data-in="bkCust" data-k="address" value="${esc(d.customer.address)}" placeholder="الحي، الشارع، قرب…"></label>
      <label class="field"><span>حساب الإنستقرام (اختياري)</span><input dir="ltr" class="ltr-right" data-in="bkCust" data-k="ig" value="${esc(d.customer.ig)}" placeholder="@"></label>
    </section>

    <section class="card" aria-label="القطع">
      <h2>القطع</h2>
      <div class="col gap">
      ${d.lines.map((l, i) => {
        const p = products.find((x) => x.id === l.productId);
        return `<div class="bk-line">
          <div class="row gap">
            ${thumb(p, 44)}
            <label class="field grow"><span class="sr">القطعة</span><select data-in="bkLineProduct" data-i="${i}">${prodOpts(l.productId)}</select></label>
            <button type="button" class="icon-btn sm" data-act="bkRemoveLine" data-i="${i}" aria-label="حذف القطعة">${icon('x', 16)}</button>
          </div>
          <div class="row gap wrap">
            <div class="stepper" role="group" aria-label="الكمية">
              <button type="button" data-act="bkQty" data-i="${i}" data-d="1" aria-label="زيادة">+</button>
              <span id="bq-${i}">${fmtNum(l.qty)}</span>
              <button type="button" data-act="bkQty" data-i="${i}" data-d="-1" aria-label="إنقاص">−</button>
            </div>
            <label class="field grow"><span class="sr">سعر القطعة</span><input inputmode="numeric" data-in="bkLine" data-i="${i}" data-k="price" value="${esc(l.price)}" placeholder="السعر"></label>
            <button type="button" class="btn btn-ghost btn-sm" data-act="bkToggleDisc" data-i="${i}">${icon('tag', 16)}<span>خصم</span></button>
          </div>
          ${l.showDisc || n(l.disc) ? `<div class="row gap">
            <label class="field grow"><span class="sr">قيمة الخصم</span><input inputmode="numeric" data-in="bkLine" data-i="${i}" data-k="disc" value="${esc(l.disc)}" placeholder="الخصم"></label>
            <label class="field w-110"><span class="sr">نوع الخصم</span><select data-in="bkLine" data-i="${i}" data-k="discType">${options([{ value: 'amt', label: 'دينار' }, { value: 'pct', label: '٪ نسبة' }], l.discType)}</select></label>
            <label class="field grow"><span class="sr">سبب الخصم</span><input data-in="bkLine" data-i="${i}" data-k="discNote" value="${esc(l.discNote || '')}" placeholder="السبب (اختياري)"></label>
          </div>` : ''}
          <div class="small" id="bl-${i}">${lineInfo(d, i, id)}</div>
        </div>`;
      }).join('')}
      </div>
      <button type="button" class="btn btn-dashed" data-act="bkAddLine">+ إضافة قطعة</button>
    </section>

    <section class="card form">
      <div class="grid2">
        <label class="field"><span>خصم على الحجز كله (دينار)</span><input inputmode="numeric" data-in="bkField" data-k="orderDiscount" value="${esc(d.orderDiscount)}" placeholder="0"></label>
        <label class="field"><span>أجور التوصيل</span><input inputmode="numeric" data-in="bkField" data-k="deliveryFee" value="${esc(d.deliveryFee)}"></label>
        <label class="field"><span>الحالة</span><select data-in="bkField" data-k="status" data-rerender="1">${options(Object.entries(STATUSES).map(([k, s]) => ({ value: k, label: s.label })), d.status)}</select></label>
        <label class="field"><span>الدفعة</span><select data-in="bkField" data-k="batchId">${options(batches.map((b) => ({ value: b.id, label: b.name })), d.batchId, { empty: 'بدون' })}</select></label>
      </div>
      <label class="field"><span>ملاحظة</span><input data-in="bkField" data-k="note" value="${esc(d.note || '')}" placeholder="اختياري"></label>
    </section>

    <section class="card" id="bkTotals">${bookingTotalsHtml(d)}</section>

    <div class="row gap sticky-actions">
      <button class="btn grow" type="submit">${icon('check', 18)}<span>${isNew ? 'حفظ الحجز' : 'حفظ التعديلات'}</span></button>
      ${isNew ? '' : `<button type="button" class="btn btn-ghost" data-act="copyConfirm" data-id="${esc(id)}" aria-label="نسخ رسالة تأكيد">${icon('copy', 18)}</button>
      ${d.customer.phone ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${esc(waLink(d.customer.phone, confirmMessage(d)))}" aria-label="واتساب">${icon('chat', 18)}</a>` : ''}
      <button class="btn btn-danger-ghost" type="button" data-act="deleteBooking" data-id="${esc(id)}" aria-label="حذف">${icon('trash', 18)}</button>`}
    </div>
    ${isReservedStatus(d.status) ? '<p class="muted small center">الكمية تنحجز من المخزن فور الحفظ، وتنخصم نهائياً لما تصير الحالة "مُرسل".</p>' : ''}
  </form>`;
}

function refreshBooking(id) {
  const d = bookingDraft(id);
  d.lines.forEach((_, i) => {
    const el = document.getElementById('bl-' + i);
    if (el) el.innerHTML = lineInfo(d, i, id);
    const q = document.getElementById('bq-' + i);
    if (q) q.textContent = fmtNum(d.lines[i].qty);
  });
  const t = document.getElementById('bkTotals');
  if (t) t.innerHTML = bookingTotalsHtml(d);
}

function setStatus(b, to) {
  const rec = { ...b, status: to };
  if (isShippedStatus(to) && !b.shippedAt) rec.shippedAt = new Date().toISOString();
  if (!isShippedStatus(to)) delete rec.shippedAt;
  return store.put('bookings', rec);
}

// ---------- الدفعات ----------
function batchesView() {
  const list = store.all('batches').sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || ((a.date || '') < (b.date || '') ? 1 : -1));
  const d = data();
  return `
  <header class="page-head"><h1>الدفعات</h1><a class="btn btn-ghost btn-sm" href="#/batch/new">+ دفعة جديدة</a></header>
  <p class="muted small">الدفعة هي القطع اللي تنزلها بالإنستقرام مرة وحدة. اربط الحجوزات بالدفعة حتى تعرف شكد انباع وشكد باقي.</p>
  ${list.length ? `<div class="col gap">${list.map((b) => {
    const s = batchStats(d, b);
    return `<a class="card card-link" href="#/batch/${esc(b.id)}">
      <div class="row between"><div class="col"><b>${esc(b.name)}</b><small class="muted">${esc(fmtDate(b.date, true))} · ${fmtNum(s.bookings)} حجز</small></div>
      <span class="chip ${b.status === 'closed' ? 'chip-plain' : 'chip-ok'}">${b.status === 'closed' ? 'مغلقة' : 'مفتوحة'}</span></div>
      ${batchBar(s)}
      <div class="row between small"><span class="muted">إيراد الدفعة</span><b>${money(s.revenue)}</b></div>
    </a>`;
  }).join('')}</div>` : emptyState('ما عندك دفعات بعد', '<a class="btn" href="#/batch/new">أول دفعة</a>')}
  <a class="fab" href="#/batch/new" aria-label="دفعة جديدة">${icon('plus', 26)}</a>`;
}

function batchDraft(id) {
  const key = 'batch:' + id;
  if (!state.drafts[key]) {
    if (id === 'new') state.drafts[key] = { name: 'دفعة ' + fmtDate(today()), date: today(), status: 'open', lotId: '', note: '', items: [{ productId: '', qty: '', price: '' }] };
    else {
      const b = store.get('batches', id);
      if (!b) return null;
      state.drafts[key] = JSON.parse(JSON.stringify(b));
    }
  }
  return state.drafts[key];
}

function batchView(id) {
  const d = batchDraft(id);
  if (!d) return emptyState('هذه الدفعة غير موجودة', '<a class="btn" href="#/batches">رجوع</a>');
  const isNew = id === 'new';
  const saved = isNew ? null : store.get('batches', id);
  const s = saved ? batchStats(data(), saved) : null;
  const P = pmap();
  const products = store.all('products').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const items = inv().items;
  const lots = store.all('lots');
  return `
  <header class="page-head">
    <div class="row gap"><a class="icon-btn" href="#/batches" aria-label="رجوع">${icon('back')}</a><h1>${isNew ? 'دفعة جديدة' : esc(d.name)}</h1></div>
    ${saved ? `<span class="chip ${saved.status === 'closed' ? 'chip-plain' : 'chip-ok'}">${saved.status === 'closed' ? 'مغلقة' : 'مفتوحة'}</span>` : ''}
  </header>
  ${s ? `<section class="card">
    ${batchBar(s)}
    <div class="row gap wrap">
      <button class="btn grow" data-act="copyPriceList" data-id="${esc(id)}">${icon('copy', 18)}<span>نسخ قائمة الأسعار للإنستقرام</span></button>
      <a class="btn btn-ghost" href="#/bookings?batch=${esc(id)}&tab=all">الحجوزات (${fmtNum(s.bookings)})</a>
    </div>
    ${s.rows.length ? `<ul class="list">${s.rows.map((r) => {
      const tot = Math.max(r.allocated, r.reserved + r.sold, 1);
      const p = Math.round(((r.reserved + r.sold) / tot) * 100);
      return `<li class="col gap-sm"><div class="row between small"><b>${esc(P[r.productId]?.name || 'منتج محذوف')}</b><span class="muted">${fmtNum(r.reserved + r.sold)} من ${fmtNum(r.allocated)}${r.extra ? ' (خارج الدفعة)' : ''}</span></div><div class="mini-bar"><div style="width:${p}%;background:${p >= 80 ? 'var(--amber)' : 'var(--teal)'}"></div></div></li>`;
    }).join('')}</ul>` : ''}
  </section>` : ''}

  <form class="col gap" data-submit="saveBatch" data-id="${esc(id)}">
    <section class="card form">
      <div class="grid2">
        <label class="field"><span>اسم الدفعة</span><input data-in="btField" data-k="name" value="${esc(d.name)}" required></label>
        <label class="field"><span>تاريخ النشر</span><input type="date" data-in="btField" data-k="date" value="${esc(d.date)}"></label>
        <label class="field"><span>الحالة</span><select data-in="btField" data-k="status">${options([{ value: 'open', label: 'مفتوحة' }, { value: 'closed', label: 'مغلقة' }], d.status)}</select></label>
        <label class="field"><span>من وجبة تجهيز (اختياري)</span><select data-in="btLot">${options(lots.map((l) => ({ value: l.id, label: l.name })), d.lotId, { empty: 'بدون' })}</select></label>
      </div>
    </section>
    <section class="card">
      <h2>قطع الدفعة</h2>
      <p class="muted small">الكمية اللي تعرضها بهذي الدفعة، والسعر إذا يختلف عن سعر المنتج.</p>
      <div class="col gap">
        ${d.items.map((it, i) => `<div class="row gap wrap bt-line">
          <label class="field grow"><span class="sr">المنتج</span><select data-in="btItem" data-i="${i}" data-k="productId">${`<option value="">اختر…</option>` + products.map((p) => `<option value="${esc(p.id)}"${p.id === it.productId ? ' selected' : ''}>${esc(p.name)} (متاح ${fmtNum(items[p.id]?.available || 0)})</option>`).join('')}</select></label>
          <label class="field w-90"><span class="sr">الكمية</span><input inputmode="numeric" data-in="btItem" data-i="${i}" data-k="qty" value="${esc(it.qty)}" placeholder="الكمية"></label>
          <label class="field w-110"><span class="sr">السعر</span><input inputmode="numeric" data-in="btItem" data-i="${i}" data-k="price" value="${esc(it.price)}" placeholder="${esc(P[it.productId]?.price || 'السعر')}"></label>
          <button type="button" class="icon-btn sm" data-act="btRemove" data-i="${i}" aria-label="حذف">${icon('x', 16)}</button>
        </div>`).join('')}
      </div>
      <button type="button" class="btn btn-dashed" data-act="btAdd">+ إضافة قطعة</button>
    </section>
    <div class="row gap sticky-actions">
      <button class="btn grow" type="submit">${icon('check', 18)}<span>حفظ الدفعة</span></button>
      ${isNew ? '' : `<button class="btn btn-danger-ghost" type="button" data-act="deleteBatch" data-id="${esc(id)}" aria-label="حذف">${icon('trash', 18)}</button>`}
    </div>
  </form>`;
}

// ---------- الزبائن ----------
function customersView() {
  const q = (ui('custQ', '') || '').trim();
  let list = customers(data());
  if (q) list = list.filter((c) => (c.name || '').includes(q) || (c.phone || '').includes(q) || (c.gov || '').includes(q));
  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/more" aria-label="رجوع">${icon('back')}</a><h1>الزبائن</h1></div><span class="muted">${fmtNum(list.length)}</span></header>
  <div class="search">${icon('search', 18)}<label for="custQ" class="sr">بحث</label><input id="custQ" type="search" placeholder="الاسم، الهاتف، المحافظة" value="${esc(q)}" data-in="custSearch"></div>
  <div id="custList">${list.length ? `<div class="col gap">${list.map((c) => `
    <div class="card row gap">
      <div class="avatar">${esc((c.name || '؟').trim().charAt(0))}</div>
      <a class="grow col" href="#/bookings?customer=${encodeURIComponent(c.key)}&tab=all"><b>${esc(c.name || 'بدون اسم')}</b><small class="muted">${esc(c.gov || '')} · ${fmtNum(c.orders)} طلب · ${fmtIQD(c.spent)}</small></a>
      ${c.phone ? `<a class="icon-btn bordered" href="${esc(telLink(c.phone))}" aria-label="اتصال">${icon('phone', 18)}</a><a class="icon-btn bordered" target="_blank" rel="noopener" href="${esc(waLink(c.phone))}" aria-label="واتساب">${icon('chat', 18)}</a>` : ''}
    </div>`).join('')}</div>` : emptyState('الزبائن يظهرون هنا تلقائياً من الحجوزات')}</div>`;
}

register({
  view: {
    home: () => homeView(),
    bookings: () => bookingsView(),
    booking: (id) => bookingView(id || 'new'),
    batches: () => batchesView(),
    batch: (id) => batchView(id || 'new'),
    customers: () => customersView(),
  },
  input: {
    bkSearch: (el) => {
      setUi('bkQ', el.value, { render: false });
      document.getElementById('bkList').innerHTML = bookingsList();
    },
    custSearch: (el) => {
      setUi('custQ', el.value, { render: false });
      const pos = el.selectionStart;
      rerender();
      const ne = document.getElementById('custQ');
      if (ne) {
        ne.focus();
        ne.setSelectionRange(pos, pos);
      }
    },
    bkCust: (el) => {
      const id = state.route.id || 'new';
      const d = bookingDraft(id);
      d.customer[el.dataset.k] = el.value;
      // إذا اختار اسم زبون سابق نعبّي بياناته
      if (el.dataset.k === 'name' && id === 'new' && !d.customer.phone) {
        const c = customers(data()).find((x) => x.name === el.value);
        if (c) {
          Object.assign(d.customer, { phone: c.phone || '', gov: c.gov || '', address: c.address || '', ig: c.ig || '' });
          rerender();
        }
      }
    },
    bkField: (el) => {
      const id = state.route.id || 'new';
      bookingDraft(id)[el.dataset.k] = el.value;
      if (el.dataset.rerender) rerender();
      else refreshBooking(id);
    },
    bkLineProduct: (el) => {
      const id = state.route.id || 'new';
      const d = bookingDraft(id);
      const l = d.lines[+el.dataset.i];
      l.productId = el.value;
      const p = store.get('products', el.value);
      const batch = d.batchId ? store.get('batches', d.batchId) : null;
      const bPrice = batch?.items?.find((x) => x.productId === el.value)?.price;
      l.price = n(bPrice) > 0 ? n(bPrice) : p ? n(p.price) : '';
      rerender();
    },
    bkLine: (el) => {
      const id = state.route.id || 'new';
      bookingDraft(id).lines[+el.dataset.i][el.dataset.k] = el.value;
      refreshBooking(id);
    },
    btField: (el) => {
      batchDraft(state.route.id || 'new')[el.dataset.k] = el.value;
    },
    btLot: (el) => {
      const d = batchDraft(state.route.id || 'new');
      d.lotId = el.value;
      const lot = store.get('lots', el.value);
      if (lot && (!d.items.some((i) => i.productId) || confirm('أعبّي قطع الدفعة من هذه الوجبة؟'))) {
        d.items = lot.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: n(l.qty), price: '' }));
      }
      rerender();
    },
    btItem: (el) => {
      const d = batchDraft(state.route.id || 'new');
      d.items[+el.dataset.i][el.dataset.k] = el.value;
      if (el.dataset.k === 'productId') rerender();
    },
  },
  act: {
    connectGoogle: async () => {
      try {
        await sync.connectGoogle();
        toast('انربط حساب Google وتمت المزامنة ✓');
      } catch (e) {
        toast(e.message, 'err');
      }
      rerender();
    },
    syncNow: async () => {
      try {
        await sync.syncNow({ interactive: true });
        toast('تمت المزامنة ✓');
      } catch (e) {
        toast(e.message, 'err');
      }
      rerender();
    },
    prodAlerts: () => setUi('prodCat', 'تنبيهات', { render: false }),
    bkTab: (el) => setUi('bkTab', el.dataset.v),
    advance: (el) => {
      const b = store.get('bookings', el.dataset.id);
      if (!b) return;
      setStatus(b, el.dataset.to);
      delete state.drafts['booking:' + b.id];
      toast(`صار ${STATUSES[el.dataset.to].label} ✓`);
      rerender();
    },
    bkAddLine: () => {
      bookingDraft(state.route.id || 'new').lines.push(emptyLine());
      rerender();
    },
    bkRemoveLine: (el) => {
      const d = bookingDraft(state.route.id || 'new');
      d.lines.splice(+el.dataset.i, 1);
      if (!d.lines.length) d.lines.push(emptyLine());
      rerender();
    },
    bkQty: (el) => {
      const id = state.route.id || 'new';
      const l = bookingDraft(id).lines[+el.dataset.i];
      l.qty = Math.max(1, n(l.qty) + n(el.dataset.d));
      refreshBooking(id);
    },
    bkToggleDisc: (el) => {
      const l = bookingDraft(state.route.id || 'new').lines[+el.dataset.i];
      l.showDisc = !l.showDisc;
      rerender();
    },
    copyConfirm: (el) => copyText(confirmMessage(bookingDraft(el.dataset.id))),
    deleteBooking: (el) => {
      if (!confirm('تحذف الحجز نهائياً؟ (إذا الزبون ألغى، الأفضل تغيّر الحالة إلى ملغي)')) return;
      store.remove('bookings', el.dataset.id);
      delete state.drafts['booking:' + el.dataset.id];
      nav('#/bookings');
    },
    btAdd: () => {
      batchDraft(state.route.id || 'new').items.push({ productId: '', qty: '', price: '' });
      rerender();
    },
    btRemove: (el) => {
      const d = batchDraft(state.route.id || 'new');
      d.items.splice(+el.dataset.i, 1);
      rerender();
    },
    copyPriceList: (el) => {
      const b = store.get('batches', el.dataset.id);
      if (b) copyText(priceListText(data(), b, settings()));
    },
    deleteBatch: (el) => {
      if (!confirm('تحذف الدفعة؟ الحجوزات تبقى.')) return;
      store.remove('batches', el.dataset.id);
      delete state.drafts['batch:' + el.dataset.id];
      nav('#/batches');
    },
  },
  submit: {
    saveBooking: (form) => {
      const id = form.dataset.id;
      const d = bookingDraft(id);
      if (!d.customer.name) return toast('اكتب اسم الزبون', 'err');
      const lines = d.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: Math.max(1, n(l.qty)), price: n(l.price), discType: l.discType || 'amt', disc: n(l.disc), discNote: l.discNote || '' }));
      if (!lines.length) return toast('أضف قطعة وحدة على الأقل', 'err');
      const short = lines.filter((l) => n(l.qty) > availableFor(l.productId, id));
      if (short.length && (isReservedStatus(d.status) || d.status === 'shipped') && !confirm('بعض القطع أكثر من المتاح بالمخزن. تحفظ الحجز على كل حال؟')) return;
      const base = id === 'new' ? { no: store.nextBookingNo(), date: new Date().toISOString() } : store.get('bookings', id) || {};
      let rec = { ...base, customer: { ...d.customer }, lines, orderDiscount: n(d.orderDiscount), deliveryFee: n(d.deliveryFee), batchId: d.batchId || '', note: d.note || '' };
      rec.status = d.status;
      if (isShippedStatus(d.status) && !rec.shippedAt) rec.shippedAt = new Date().toISOString();
      if (!isShippedStatus(d.status)) delete rec.shippedAt;
      delete rec.aiNote;
      rec = store.put('bookings', rec);
      delete state.drafts['booking:' + id];
      toast(id === 'new' ? `انحفظ الحجز #${rec.no} ✓` : 'انحفظ ✓');
      nav(id === 'new' ? '#/bookings' : '#/booking/' + rec.id);
    },
    saveBatch: (form) => {
      const id = form.dataset.id;
      const d = batchDraft(id);
      if (!d.name) return toast('اكتب اسم الدفعة', 'err');
      const items = d.items.filter((i) => i.productId).map((i) => ({ productId: i.productId, qty: n(i.qty), price: n(i.price) || '' }));
      const base = id === 'new' ? {} : store.get('batches', id) || {};
      const rec = store.put('batches', { ...base, name: d.name, date: d.date || today(), status: d.status || 'open', lotId: d.lotId || '', note: d.note || '', items });
      delete state.drafts['batch:' + id];
      toast('انحفظت الدفعة ✓');
      nav('#/batch/' + rec.id);
    },
  },
});

export { bookingDraft };
