// سجل المبيعات: كل البيعات حسب التاريخ، مع تعديل وحذف البيع المباشر.
import * as store from './store.js';
import { register, state, inv, nav, rerender, ui, setUi, formData } from './core.js';
import { esc, icon, thumb, money, fmtDate, today, toast, options, emptyState } from './ui.js';
import { fmtNum, fmtIQD, bookingTotals, isShippedStatus } from './logic.js';

const n = (v) => Number(v) || 0;

// التاريخ المحلي (يوم البيع حسب توقيت الجهاز)
function localDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  const z = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function localTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit' });
}

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const z2 = (x) => String(x).padStart(2, '0');
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
function shiftMonth(ym, delta) {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}`;
}
function monthEnd(ym) {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0, 12);
  return `${ym}-${z2(d.getDate())}`;
}

function periodRange(key) {
  const t = today();
  const d = new Date(t + 'T12:00:00');
  const iso = (x) => localDay(x.toISOString());
  if (key === 'today') return [t, t];
  if (key === 'week') return [iso(new Date(d.getTime() - 6 * 864e5)), t];
  if (key === 'month') {
    const ym = ui('salesMonth', t.slice(0, 7));
    return [ym + '-01', monthEnd(ym)];
  }
  if (key === 'range') {
    let from = ui('salesFrom', t.slice(0, 8) + '01');
    let to = ui('salesTo', t);
    if (from && to && from > to) [from, to] = [to, from];
    return [from || '0000-01-01', to || '9999-12-31'];
  }
  return ['', ''];
}

function soldBookings() {
  return store.all('bookings').filter((b) => isShippedStatus(b.status));
}

function salesView() {
  const P = Object.fromEntries(store.all('products').map((p) => [p.id, p]));
  const period = ui('salesPeriod', 'all');
  const q = (ui('salesQ', '') || '').trim();
  const [from, to] = periodRange(period);
  let list = soldBookings().map((b) => ({ b, day: localDay(b.shippedAt || b.date) }));
  if (from) list = list.filter((x) => x.day >= from && x.day <= to);
  if (q) list = list.filter(({ b }) => (b.lines || []).some((l) => (P[l.productId]?.name || '').includes(q)) || (b.customer?.name || '').includes(q));
  list.sort((a, b) => ((a.b.shippedAt || a.b.date || '') < (b.b.shippedAt || b.b.date || '') ? 1 : -1));
  const costs = inv().bookingCost;
  const groups = [];
  for (const x of list) {
    let g = groups[groups.length - 1];
    if (!g || g.day !== x.day) groups.push((g = { day: x.day, items: [], total: 0, profit: 0, pieces: 0 }));
    const t = bookingTotals(x.b);
    g.items.push(x.b);
    g.total += t.itemsNet;
    g.profit += t.itemsNet - (costs[x.b.id]?.total || 0);
    g.pieces += t.qty;
  }
  const sum = groups.reduce((s, g) => s + g.total, 0);
  const profit = groups.reduce((s, g) => s + g.profit, 0);
  const pieces = groups.reduce((s, g) => s + g.pieces, 0);

  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/more" aria-label="رجوع">${icon('back')}</a><h1>سجل المبيعات</h1></div></header>
  <div class="chips">${[['today', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'حسب الشهر'], ['range', 'من تاريخ إلى تاريخ'], ['all', 'الكل']].map(([k, l]) => `<button type="button" class="pill${k === period ? ' on' : ''}" data-act="salesPeriod" data-v="${k}">${l}</button>`).join('')}</div>
  ${period === 'month' ? (() => { const ym = ui('salesMonth', today().slice(0, 7)); const cur = today().slice(0, 7); return `<div class="card"><div class="row between month-nav">
    <button type="button" class="icon-btn flip" data-act="salesMonthShift" data-v="-1" aria-label="الشهر السابق">${icon('chev', 20)}</button>
    <label class="col center grow"><b>${esc(monthLabel(ym))}</b><input type="month" value="${esc(ym)}" data-in="salesMonthPick" aria-label="اختر الشهر" class="month-pick"></label>
    <button type="button" class="icon-btn" data-act="salesMonthShift" data-v="1" aria-label="الشهر التالي"${ym >= cur ? ' disabled' : ''}>${icon('chev', 20)}</button>
  </div></div>`; })() : ''}
  ${period === 'range' ? `<div class="card grid2 range-pick">
    <label class="field"><span>من تاريخ</span><input type="date" value="${esc(ui('salesFrom', today().slice(0, 8) + '01'))}" data-in="salesFrom"></label>
    <label class="field"><span>إلى تاريخ</span><input type="date" value="${esc(ui('salesTo', today()))}" data-in="salesTo"></label>
  </div>` : ''}
  <div class="search">${icon('search', 18)}<label for="salesQ" class="sr">بحث</label><input id="salesQ" type="search" placeholder="ابحث باسم المنتج أو الزبون" value="${esc(q)}" data-in="salesSearch" autocomplete="off"></div>
  <section class="kpis kpis-3">
    <div class="kpi"><span>المبيعات</span><b>${fmtNum(sum)} <small>د.ع</small></b></div>
    <div class="kpi"><span>الربح</span><b>${fmtNum(profit)} <small>د.ع</small></b></div>
    <div class="kpi"><span>القطع</span><b>${fmtNum(pieces)} <small>· ${fmtNum(list.length)} بيعة</small></b></div>
  </section>
  ${period === 'all' && !q ? monthsSummary(list, costs) : ''}
  <div id="salesList">${groups.length ? groups.map((g) => `
    <section class="card sale-day">
      <div class="row between"><h2>${esc(fmtDate(g.day, true))}</h2><span class="small"><b>${money(g.total)}</b> <span class="muted">· ربح ${fmtNum(g.profit)}</span></span></div>
      <ul class="list">${g.items.map((b) => {
        const t = bookingTotals(b);
        const first = P[b.lines[0]?.productId];
        const names = b.lines.map((l) => `${P[l.productId]?.name || 'منتج محذوف'} ×${fmtNum(l.qty)}`).join('، ');
        const href = b.quick ? `#/sale/${b.id}` : `#/booking/${b.id}`;
        return `<li><a class="row gap sale-row" href="${href}">${thumb(first, 40)}
          <span class="grow col"><b>${esc(names)}</b><small class="muted">${esc(localTime(b.shippedAt || b.date))} · ${b.quick ? 'بيع مباشر' : 'حجز #' + esc(b.no)}${b.customer?.name && b.customer.name !== 'بيع مباشر' ? ' · ' + esc(b.customer.name) : ''}</small></span>
          <span class="col end"><b>${money(t.itemsNet)}</b><small class="link">${b.quick ? 'تعديل' : 'فتح'}</small></span></a></li>`;
      }).join('')}</ul>
    </section>`).join('') : emptyState(q || from ? 'ما كو مبيعات بهذا البحث' : 'ما كو مبيعات مسجلة بعد')}</div>`;
}

function monthsSummary(list, costs) {
  const m = {};
  for (const { b, day } of list) {
    const ym = day.slice(0, 7);
    const t = bookingTotals(b);
    const r = m[ym] || (m[ym] = { total: 0, profit: 0, pieces: 0, n: 0 });
    r.total += t.itemsNet; r.profit += t.itemsNet - (costs[b.id]?.total || 0); r.pieces += t.qty; r.n++;
  }
  const keys = Object.keys(m).sort().reverse();
  if (keys.length < 1) return '';
  return `<section class="card"><h2>ملخص الأشهر</h2><ul class="list">${keys.map((k) => `<li><a class="row between" href="#/sales" data-act="salesGoMonth" data-v="${k}"><span class="col"><b>${esc(monthLabel(k))}</b><small class="muted">${fmtNum(m[k].n)} بيعة · ${fmtNum(m[k].pieces)} قطعة</small></span><span class="col end"><b>${money(m[k].total)}</b><small class="muted">ربح ${fmtNum(m[k].profit)}</small></span></a></li>`).join('')}</ul></section>`;
}

function saleDraft(id) {
  const key = 'sale:' + id;
  if (!state.drafts[key]) {
    const b = store.get('bookings', id);
    if (!b) return null;
    const l = b.lines[0] || {};
    const when = b.shippedAt || b.date || new Date().toISOString();
    const d = new Date(when);
    const z = (x) => String(x).padStart(2, '0');
    state.drafts[key] = {
      productId: l.productId || '',
      qty: l.qty || 1,
      price: l.price || '',
      disc: l.disc || '',
      date: localDay(when),
      time: isNaN(d) ? '12:00' : `${z(d.getHours())}:${z(d.getMinutes())}`,
      customer: b.customer?.name === 'بيع مباشر' ? '' : b.customer?.name || '',
    };
  }
  return state.drafts[key];
}

function saleEditView(id) {
  const b = store.get('bookings', id);
  if (!b) return emptyState('هذه البيعة غير موجودة', '<a class="btn" href="#/sales">سجل المبيعات</a>');
  if (!b.quick) {
    nav('#/booking/' + id);
    return '';
  }
  const d = saleDraft(id);
  const products = store.all('products').sort((a, c) => (a.name || '').localeCompare(c.name || '', 'ar'));
  const p = store.get('products', d.productId);
  const total = n(d.qty) * n(d.price) - n(d.disc);
  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/sales" aria-label="رجوع">${icon('back')}</a><h1>تعديل بيعة</h1></div></header>
  <form class="card form" data-submit="saveSale" data-id="${esc(id)}">
    <div class="row gap">${thumb(p, 56, 12)}
      <label class="field grow"><span>المنتج</span><select name="productId">${options(products.map((x) => ({ value: x.id, label: x.name })), d.productId)}</select></label>
    </div>
    <div class="grid3">
      <label class="field"><span>عدد القطع</span><input name="qty" data-in="saleCalc" inputmode="numeric" value="${esc(d.qty)}" required></label>
      <label class="field"><span>سعر القطعة</span><input name="price" data-in="saleCalc" inputmode="numeric" value="${esc(d.price)}"></label>
      <label class="field"><span>خصم كلي (دينار)</span><input name="disc" data-in="saleCalc" inputmode="numeric" value="${esc(d.disc)}" placeholder="0"></label>
    </div>
    <div class="grid3">
      <label class="field"><span>تاريخ البيع</span><input type="date" name="date" value="${esc(d.date)}" required></label>
      <label class="field"><span>الوقت</span><input type="time" name="time" value="${esc(d.time)}"></label>
      <label class="field"><span>الزبون (اختياري)</span><input name="customer" value="${esc(d.customer)}" placeholder="الاسم أو ملاحظة"></label>
    </div>
    <div class="sum-row total"><span>المجموع</span><b id="saleTotal">${fmtIQD(total)}</b></div>
    <div class="row gap">
      <button class="btn grow" type="submit">${icon('check', 18)}<span>حفظ التعديل</span></button>
      <button class="btn btn-danger-ghost" type="button" data-act="deleteSale" data-id="${esc(id)}" aria-label="حذف البيعة">${icon('trash', 18)}</button>
    </div>
    <p class="muted small">بعد الحفظ، المخزن والأرباح يتحدثون تلقائياً.</p>
  </form>`;
}

register({
  view: {
    sales: () => salesView(),
    sale: (id) => saleEditView(id),
  },
  input: {
    saleCalc: (el) => {
      const f = el.form;
      const t = n(f.elements.qty.value) * n(f.elements.price.value) - n(f.elements.disc.value);
      const out = document.getElementById('saleTotal');
      if (out) out.textContent = fmtIQD(t);
    },
    salesMonthPick: (el) => { if (el.value) setUi('salesMonth', el.value); },
    salesFrom: (el) => { if (el.value) setUi('salesFrom', el.value); },
    salesTo: (el) => { if (el.value) setUi('salesTo', el.value); },
    salesSearch: (el) => {
      setUi('salesQ', el.value, { render: false });
      const pos = el.selectionStart;
      rerender();
      const ne = document.getElementById('salesQ');
      if (ne) {
        ne.focus();
        ne.setSelectionRange(pos, pos);
      }
    },
  },
  act: {
    salesPeriod: (el) => setUi('salesPeriod', el.dataset.v),
    salesMonthShift: (el) => {
      const cur = ui('salesMonth', today().slice(0, 7));
      const next = shiftMonth(cur, Number(el.dataset.v));
      if (next > today().slice(0, 7)) return;
      setUi('salesMonth', next);
    },
    salesGoMonth: (el, e) => { e?.preventDefault?.(); setUi('salesMonth', el.dataset.v, { render: false }); setUi('salesPeriod', 'month'); },
    deleteSale: (el) => {
      if (!confirm('تحذف هذه البيعة؟ القطع ترجع للمخزن.')) return;
      store.remove('bookings', el.dataset.id);
      delete state.drafts['sale:' + el.dataset.id];
      toast('انحذفت البيعة');
      nav('#/sales');
    },
  },
  submit: {
    saveSale: (form) => {
      const id = form.dataset.id;
      const b = store.get('bookings', id);
      if (!b) return;
      const v = formData(form);
      const qty = Math.abs(n(v.qty));
      if (!qty) return toast('اكتب عدد القطع', 'err');
      if (!v.date) return toast('اختر تاريخ البيع', 'err');
      const when = new Date(`${v.date}T${v.time || '12:00'}:00`).toISOString();
      store.put('bookings', {
        ...b,
        date: when,
        shippedAt: when,
        customer: { ...(b.customer || {}), name: v.customer || 'بيع مباشر' },
        lines: [{ productId: v.productId, qty, price: n(v.price), discType: 'amt', disc: n(v.disc), discNote: '' }],
      });
      delete state.drafts['sale:' + id];
      toast('انحفظ التعديل ✓');
      nav('#/sales');
    },
  },
});
