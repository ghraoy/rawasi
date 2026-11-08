// الطلبات المسبقة: زبائن (جملة أو مفرد) يطلبون بضاعة ما وصلت بعد.
// ما تأثر على المخزن. لما توصل البضاعة تتحول لحجز عادي.
import * as store from './store.js';
import { register, state, nav, rerender, ui, setUi, formData } from './core.js';
import { esc, icon, money, fmtDate, timeAgo, toast, emptyState, telLink } from './ui.js';
import { fmtNum, customers } from './logic.js';
import { data } from './core.js';

const n = (v) => Number(v) || 0;

export const PRE_STATUSES = {
  waiting: { label: 'بانتظار البضاعة', bg: '#FBF4E6', fg: '#7A5410' },
  arrived: { label: 'وصلت البضاعة', bg: '#E4F1EE', fg: '#0F5E57' },
  done: { label: 'تحوّل لحجز', bg: '#E8EDF7', fg: '#2D4A86' },
  cancelled: { label: 'ملغي', bg: '#F3E6E6', fg: '#8A2E2E' },
};
const TABS = [
  { key: 'open', label: 'المفتوحة', test: (s) => s === 'waiting' || s === 'arrived' },
  { key: 'waiting', label: 'بانتظار البضاعة', test: (s) => s === 'waiting' },
  { key: 'arrived', label: 'وصلت', test: (s) => s === 'arrived' },
  { key: 'done', label: 'منتهية', test: (s) => s === 'done' || s === 'cancelled' },
];
const KINDS = ['جملة', 'مفرد', 'زبون مميز'];

const chip = (s) => {
  const x = PRE_STATUSES[s] || PRE_STATUSES.waiting;
  return `<span class="chip" style="background:${x.bg};color:${x.fg}">${x.label}</span>`;
};
const emptyItem = () => ({ name: '', qty: 1, price: '', productId: '' });
export const preTotals = (p) => {
  const items = p.items || [];
  const qty = items.reduce((s, i) => s + n(i.qty), 0);
  const priced = items.filter((i) => n(i.price) > 0);
  const est = priced.reduce((s, i) => s + n(i.qty) * n(i.price), 0);
  return { qty, est, unpriced: items.length - priced.length };
};

export function bookingsSwitch(active) {
  const open = store.all('preorders').filter((p) => p.status === 'waiting' || p.status === 'arrived').length;
  return `<div class="seg-switch" role="tablist">
    <a role="tab" class="${active === 'bookings' ? 'on' : ''}" href="#/bookings">الحجوزات</a>
    <a role="tab" class="${active === 'preorders' ? 'on' : ''}" href="#/preorders">طلبات مسبقة${open ? ` <small class="count">${fmtNum(open)}</small>` : ''}</a>
  </div>`;
}

function productByName(name) {
  const t = (name || '').trim();
  return t ? store.all('products').find((p) => (p.name || '').trim() === t) : null;
}

// ---------- القائمة ----------
function preordersView() {
  const tabKey = ui('preTab', 'open');
  const tab = TABS.find((t) => t.key === tabKey) || TABS[0];
  const q = (ui('preQ', '') || '').trim();
  const all = store.all('preorders');
  let list = all.filter((p) => tab.test(p.status || 'waiting'));
  if (q) list = list.filter((p) => (p.customer?.name || '').includes(q) || (p.customer?.phone || '').includes(q) || (p.items || []).some((i) => (i.name || '').includes(q)));
  list.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));

  // ملخص: شنو لازم أجيب للطلبات المفتوحة (مجموع كل منتج)
  const need = {};
  for (const p of all.filter((x) => x.status === 'waiting')) {
    for (const i of p.items || []) {
      const k = (i.name || '').trim();
      if (!k) continue;
      const r = need[k] || (need[k] = { qty: 0, who: new Set() });
      r.qty += n(i.qty);
      r.who.add(p.customer?.name || 'بدون اسم');
    }
  }
  const needKeys = Object.keys(need).sort((a, b) => need[b].qty - need[a].qty);

  return `
  <header class="page-head"><div class="col"><h1>الحجوزات</h1><span class="muted small">طلبات لبضاعة ما وصلت بعد — ما تأثر على المخزن</span></div></header>
  ${bookingsSwitch('preorders')}
  ${needKeys.length ? `<section class="card need-card">
    <div class="row between"><h2>المطلوب جلبه</h2><span class="muted small">${fmtNum(needKeys.length)} منتج</span></div>
    <ul class="need-list">${needKeys.map((k) => `<li><b>${esc(k)}</b><span class="badge-no">×${fmtNum(need[k].qty)}</span><small class="muted">${esc([...need[k].who].join('، '))}</small></li>`).join('')}</ul>
  </section>` : ''}
  <div class="tabs" role="tablist" aria-label="حالة الطلب">
    ${TABS.map((t) => `<button type="button" role="tab" aria-selected="${t.key === tabKey}" class="tab${t.key === tabKey ? ' on' : ''}" data-act="preTab" data-v="${t.key}">${t.label} <small>${fmtNum(all.filter((p) => t.test(p.status || 'waiting')).length)}</small></button>`).join('')}
  </div>
  <div class="search">${icon('search', 18)}<label for="preQ" class="sr">بحث</label><input id="preQ" type="search" placeholder="الزبون أو اسم المنتج" value="${esc(q)}" data-in="preSearch" autocomplete="off"></div>
  <div class="bk-list">${list.length ? list.map((p) => {
    const t = preTotals(p);
    const items = (p.items || []).map((i) => `${i.name || '؟'} ×${fmtNum(i.qty)}`).join(' · ');
    return `<article class="card bk">
      <a class="bk-main" href="#/preorder/${esc(p.id)}">
        <div class="row gap">
          <span class="badge-no">${esc(p.customer?.kind || 'طلب')}</span>
          <div class="grow col"><b>${esc(p.customer?.name || 'بدون اسم')}</b><small class="muted">${esc(timeAgo(p.date))}${p.expected ? ' · متوقع ' + esc(fmtDate(p.expected)) : ''}</small></div>
          ${chip(p.status)}
        </div>
        <p class="bk-items">${esc(items)}</p>
      </a>
      <div class="row between">
        <span class="price">${t.est ? money(t.est) + (t.unpriced ? ' <small class="muted">+ بدون سعر</small>' : ' <small class="muted">تقريبي</small>') : '<span class="muted small">بدون سعر</span>'}${n(p.deposit) ? ` <small class="muted">· عربون ${fmtNum(p.deposit)}</small>` : ''}</span>
        <div class="row gap">
          ${p.customer?.phone ? `<a class="icon-btn bordered" href="${esc(telLink(p.customer.phone))}" aria-label="اتصال">${icon('phone', 18)}</a>` : ''}
          ${p.status === 'waiting' ? `<button type="button" class="btn btn-sm btn-ghost" data-act="preStatus" data-id="${esc(p.id)}" data-to="arrived">وصلت</button>` : ''}
          ${p.status === 'waiting' || p.status === 'arrived' ? `<button type="button" class="btn btn-sm" data-act="preConvert" data-id="${esc(p.id)}">تحويل لحجز</button>` : ''}
        </div>
      </div>
    </article>`;
  }).join('') : emptyState(q ? 'ما لقيت طلب بهذا البحث' : 'ما كو طلبات مسبقة هنا', !q ? '<a class="btn" href="#/preorder/new">طلب مسبق جديد</a>' : '')}</div>
  <a class="fab fab-wide" href="#/preorder/new">${icon('plus', 20)}<span>طلب مسبق</span></a>`;
}

// ---------- النموذج ----------
function draft(id) {
  const key = 'pre:' + id;
  if (!state.drafts[key]) {
    if (id === 'new') {
      state.drafts[key] = { customer: { name: '', phone: '', kind: 'جملة' }, items: [emptyItem()], deposit: '', expected: '', note: '', status: 'waiting' };
    } else {
      const p = store.get('preorders', id);
      if (!p) return null;
      state.drafts[key] = JSON.parse(JSON.stringify(p));
      if (!state.drafts[key].items?.length) state.drafts[key].items = [emptyItem()];
    }
  }
  return state.drafts[key];
}

// ينقل القيم المكتوبة بالنموذج للمسودة (قبل إضافة/حذف سطر)
function captureForm(form, d) {
  const v = formData(form);
  d.customer = { ...(d.customer || {}), name: v.cname || '', phone: v.cphone || '', kind: v.ckind || '' };
  d.deposit = v.deposit || '';
  d.expected = v.expected || '';
  d.note = v.note || '';
  d.items = d.items.map((it, i) => ({ ...it, name: v['iname' + i] ?? it.name, qty: v['iqty' + i] ?? it.qty, price: v['iprice' + i] ?? it.price }));
}

function preorderForm(id) {
  const d = draft(id);
  if (!d) return emptyState('هذا الطلب غير موجود', '<a class="btn" href="#/preorders">الطلبات المسبقة</a>');
  const isNew = id === 'new';
  const t = preTotals(d);
  const names = store.all('products').map((p) => p.name).filter(Boolean);
  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/preorders" aria-label="رجوع">${icon('back')}</a><h1>${isNew ? 'طلب مسبق جديد' : 'تعديل الطلب'}</h1></div>${isNew ? '' : chip(d.status)}</header>
  <form class="form" data-submit="savePre" data-id="${esc(id)}">
    <section class="card">
      <h2>الزبون</h2>
      <div class="grid3">
        <label class="field"><span>الاسم</span><input name="cname" value="${esc(d.customer?.name)}" list="preCust" required placeholder="اسم الزبون أو المحل"></label>
        <label class="field"><span>الهاتف (اختياري)</span><input name="cphone" inputmode="tel" value="${esc(d.customer?.phone)}"></label>
        <label class="field"><span>النوع</span><select name="ckind">${KINDS.map((k) => `<option${k === d.customer?.kind ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
      </div>
      <datalist id="preCust">${customers(data()).slice(0, 200).map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
    </section>

    <section class="card">
      <div class="row between"><h2>البضاعة المطلوبة</h2><span class="muted small">السعر تقريبي واختياري</span></div>
      <datalist id="preProducts">${names.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="pre-items">${d.items.map((it, i) => `
        <div class="pre-item">
          <label class="field grow"><span>اسم المنتج (مبدئي)</span><input name="iname${i}" value="${esc(it.name)}" list="preProducts" placeholder="مثلاً: ساعة جدارية كبيرة" ${i === 0 ? 'required' : ''}></label>
          <label class="field qty"><span>العدد</span><input name="iqty${i}" inputmode="numeric" value="${esc(it.qty)}" data-in="preCalc"></label>
          <label class="field price"><span>السعر للقطعة</span><input name="iprice${i}" inputmode="numeric" value="${esc(it.price)}" placeholder="—" data-in="preCalc"></label>
          ${d.items.length > 1 ? `<button type="button" class="icon-btn" data-act="preDelItem" data-i="${i}" aria-label="حذف السطر">${icon('trash', 18)}</button>` : ''}
        </div>`).join('')}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-act="preAddItem">${icon('plus', 16)}<span>منتج آخر</span></button>
      <div class="sum-row total"><span>المجموع التقريبي</span><b id="preTotal">${t.est ? money(t.est) : '—'}</b></div>
    </section>

    <section class="card">
      <div class="grid3">
        <label class="field"><span>عربون مستلم (اختياري)</span><input name="deposit" inputmode="numeric" value="${esc(d.deposit)}" placeholder="0"></label>
        <label class="field"><span>موعد الوصول المتوقع</span><input type="date" name="expected" value="${esc(d.expected)}"></label>
        <label class="field"><span>ملاحظة</span><input name="note" value="${esc(d.note)}" placeholder="لون، قياس، تفاصيل…"></label>
      </div>
    </section>

    <div class="row gap">
      <button class="btn grow" type="submit">${icon('check', 18)}<span>${isNew ? 'حفظ الطلب' : 'حفظ التعديل'}</span></button>
      ${isNew ? '' : `<button class="btn btn-danger-ghost" type="button" data-act="preDelete" data-id="${esc(id)}" aria-label="حذف">${icon('trash', 18)}</button>`}
    </div>
    ${isNew ? '' : `<div class="row gap wrap pre-actions">
      ${d.status !== 'waiting' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="preStatus" data-id="${esc(id)}" data-to="waiting">بانتظار البضاعة</button>` : ''}
      ${d.status !== 'arrived' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="preStatus" data-id="${esc(id)}" data-to="arrived">وصلت البضاعة</button>` : ''}
      ${d.status === 'waiting' || d.status === 'arrived' ? `<button type="button" class="btn btn-sm" data-act="preConvert" data-id="${esc(id)}">تحويل لحجز</button>` : ''}
      ${d.status !== 'cancelled' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="preStatus" data-id="${esc(id)}" data-to="cancelled">إلغاء الطلب</button>` : ''}
    </div>`}
    <p class="muted small">الطلب المسبق ما ينقص من المخزن. لما توصل البضاعة اضغط "تحويل لحجز" حتى ينحجز من المخزن.</p>
  </form>`;
}

function savePre(form) {
  const id = form.dataset.id;
  const d = draft(id);
  captureForm(form, d);
  const items = d.items
    .filter((i) => (i.name || '').trim())
    .map((i) => ({ name: i.name.trim(), qty: Math.max(1, n(i.qty) || 1), price: n(i.price) || '', productId: productByName(i.name)?.id || '' }));
  if (!items.length) return toast('اكتب اسم منتج واحد على الأقل', 'err');
  const base = id === 'new' ? { date: new Date().toISOString(), status: 'waiting' } : store.get('preorders', id) || {};
  const rec = store.put('preorders', { ...base, customer: d.customer, items, deposit: n(d.deposit) || '', expected: d.expected || '', note: d.note || '' });
  delete state.drafts['pre:' + id];
  toast('انحفظ الطلب ✓');
  nav('#/preorders');
  return rec;
}

register({
  view: {
    preorders: () => preordersView(),
    preorder: (id) => preorderForm(id || 'new'),
  },
  input: {
    preSearch: (el) => {
      setUi('preQ', el.value, { render: false });
      const pos = el.selectionStart;
      rerender();
      const ne = document.getElementById('preQ');
      if (ne) { ne.focus(); ne.setSelectionRange(pos, pos); }
    },
    preCalc: (el) => {
      const f = el.form;
      let est = 0;
      for (let i = 0; f.elements['iqty' + i]; i++) est += n(f.elements['iqty' + i].value) * n(f.elements['iprice' + i].value);
      const out = document.getElementById('preTotal');
      if (out) out.textContent = est ? money(est).replace(/<[^>]+>/g, '') : '—';
    },
  },
  act: {
    preTab: (el) => setUi('preTab', el.dataset.v),
    preAddItem: (el) => {
      const id = state.route.id || 'new';
      const d = draft(id);
      captureForm(el.closest('form'), d);
      d.items.push(emptyItem());
      rerender();
    },
    preDelItem: (el) => {
      const id = state.route.id || 'new';
      const d = draft(id);
      captureForm(el.closest('form'), d);
      d.items.splice(Number(el.dataset.i), 1);
      rerender();
    },
    preStatus: (el) => {
      const p = store.get('preorders', el.dataset.id);
      if (!p) return;
      store.put('preorders', { ...p, status: el.dataset.to });
      delete state.drafts['pre:' + p.id];
      toast(PRE_STATUSES[el.dataset.to]?.label || 'تم');
      rerender();
    },
    preDelete: (el) => {
      if (!confirm('تحذف هذا الطلب المسبق؟')) return;
      store.remove('preorders', el.dataset.id);
      delete state.drafts['pre:' + el.dataset.id];
      toast('انحذف الطلب');
      nav('#/preorders');
    },
    // يفتح حجز جديد معبّى بالزبون والمنتجات الموجودة بالمخزن
    preConvert: (el) => {
      const p = store.get('preorders', el.dataset.id);
      if (!p) return;
      const lines = [];
      const missing = [];
      for (const i of p.items || []) {
        const prod = (i.productId && store.get('products', i.productId)) || productByName(i.name);
        if (prod) lines.push({ productId: prod.id, qty: n(i.qty) || 1, price: n(i.price) || n(prod.price) || '', discType: 'amt', disc: '', showDisc: false });
        else missing.push(`${i.name} ×${i.qty}`);
      }
      const noteParts = [`من طلب مسبق (${fmtDate(p.date)})`];
      if (n(p.deposit)) noteParts.push(`عربون مستلم ${fmtNum(p.deposit)}`);
      if (missing.length) noteParts.push('غير مضاف للمنتجات: ' + missing.join('، '));
      if (p.note) noteParts.push(p.note);
      state.drafts['booking:new'] = {
        customer: { name: p.customer?.name || '', phone: p.customer?.phone || '', gov: '', address: '', ig: '' },
        lines: lines.length ? lines : [{ productId: '', qty: 1, price: '', discType: 'amt', disc: '', showDisc: false }],
        orderDiscount: '', deliveryFee: '', status: 'reserved', batchId: '', note: noteParts.join(' · '),
        fromPreorder: p.id,
      };
      if (missing.length) toast(`${missing.length} منتج مو موجود بالمخزن بعد — أضفه أولاً أو اختاره من القائمة`, 'err');
      nav('#/booking/new');
    },
  },
  submit: { savePre },
});
