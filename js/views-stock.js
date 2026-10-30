// شاشات المخزن: المنتجات، وجبات التجهيز، التعديلات، رفع الإكسل.
import * as store from './store.js';
import { register, state, inv, data, settings, nav, rerender, ui, setUi, formData, bumpVersion } from './core.js';
import { esc, icon, thumb, stockPill, money, fmtDate, today, toast, resizeImage, options, emptyState, copyText } from './ui.js';
import { live, fmtNum, fmtIQD, lotBreakdown, lotTotals, lotRemaining, productCostHistory, rateFromTotals, tomanToIqd, stockLevel, round } from './logic.js';
import { parseFile, downloadTemplate, sheetToText } from './excel.js';
import * as ai from './ai.js';
import * as sync from './sync.js';

const n = (v) => Number(v) || 0;

// إعادة رسم صفحة المنتج بدون ما تضيع القيم اللي كتبها المستخدم.
function rerenderKeepForm(form) {
  const vals = {};
  if (form) for (const el of form.elements) if (el.name) vals[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  const openWeb = form?.querySelector('.web-box')?.open;
  rerender();
  const nf = document.querySelector('form[data-submit="saveProduct"]');
  if (!nf) return;
  for (const [k, v] of Object.entries(vals)) {
    const el = nf.elements[k];
    if (!el || el.type === 'file') continue;
    if (el.type === 'checkbox') el.checked = v;
    else el.value = v;
  }
  if (openWeb) nf.querySelector('.web-box')?.setAttribute('open', '');
}

function productsSorted() {
  const items = inv().items;
  const q = (ui('prodQ', '') || '').trim().toLowerCase();
  const cat = ui('prodCat', 'الكل');
  const sort = ui('prodSort', 'new');
  let list = store.all('products');
  if (cat === 'تنبيهات') list = list.filter((p) => stockLevel(items[p.id], p.minStock ?? settings().defaultMinStock) !== 'ok');
  else if (cat !== 'الكل') list = list.filter((p) => p.category === cat);
  if (q) list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase() === q || (p.code || '').toLowerCase().includes(q));
  if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  else if (sort === 'stock') list.sort((a, b) => (items[a.id]?.available || 0) - (items[b.id]?.available || 0));
  else list.sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
  return list;
}

function productGrid() {
  const items = inv().items;
  const list = productsSorted();
  if (!list.length) {
    return emptyState(store.all('products').length ? 'ما لقيت منتجات بهذا البحث' : 'ما عندك منتجات بعد. ابدأ بإضافة وجبة تجهيز أو رفع ملف إكسل.',
      store.all('products').length ? '' : `<div class="row gap"><a class="btn" href="#/lot/new">وجبة تجهيز جديدة</a><a class="btn btn-ghost" href="#/import">رفع إكسل</a></div>`);
  }
  return `<div class="pgrid">${list.map((p) => {
    const it = items[p.id];
    return `<a class="pcard" href="#/product/${esc(p.id)}">
      <div class="pcard-img">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : thumb(p, 40)}<span class="pcard-cat">${esc(p.category || '—')}</span></div>
      <div class="pcard-body"><h3>${esc(p.name)}</h3>
      <div class="row between"><span class="price">${money(p.price)}</span>${stockPill(it, p.minStock ?? settings().defaultMinStock)}</div></div></a>`;
  }).join('')}</div>`;
}

function productsView() {
  const cats = ['الكل', ...settings().categories, 'تنبيهات'];
  const cur = ui('prodCat', 'الكل');
  const total = store.all('products').length;
  const canScan = 'BarcodeDetector' in window;
  return `
  <header class="page-head">
    <div class="row baseline gap"><h1>المنتجات</h1><span class="muted">${fmtNum(total)} منتج</span></div>
    <div class="row gap">
      <a class="btn btn-ghost btn-sm" href="#/lots">${icon('truck', 18)}<span>وجبات التجهيز</span></a>
      <a class="btn btn-ghost btn-sm" href="#/import">${icon('spark', 18)}<span>إضافة بالذكاء</span></a>
      <a class="btn btn-ghost btn-sm" href="#/web">${icon('globe', 18)}<span>الموقع</span></a>
    </div>
  </header>
  <div class="search">
    ${icon('search', 18)}
    <label for="prodQ" class="sr">ابحث عن منتج</label>
    <input id="prodQ" type="search" placeholder="ابحث بالاسم أو الكود…" value="${esc(ui('prodQ', ''))}" data-in="prodSearch" autocomplete="off">
    ${canScan ? `<button type="button" class="icon-btn" data-act="scan" aria-label="قراءة باركود">${icon('barcode', 20)}</button>` : ''}
  </div>
  <div class="row between gap wrap">
    <div class="chips" role="group" aria-label="التصنيفات">
      ${cats.map((c) => `<button type="button" class="pill${c === cur ? ' on' : ''}" data-act="prodCat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <label class="sort"><span class="sr">ترتيب</span><select data-in="prodSort">${options([{ value: 'new', label: 'الأحدث' }, { value: 'stock', label: 'الأقل مخزوناً' }, { value: 'name', label: 'حسب الاسم' }], ui('prodSort', 'new'))}</select></label>
  </div>
  <div id="prodGrid">${productGrid()}</div>
  <a class="fab" href="#/product/new" aria-label="إضافة منتج">${icon('plus', 26)}</a>`;
}

// ---------- صفحة المنتج ----------
function productView(id) {
  const isNew = id === 'new';
  const p = isNew ? { category: settings().categories[0] || '', minStock: '' } : store.get('products', id);
  if (!p) return emptyState('هذا المنتج غير موجود', '<a class="btn" href="#/products">رجوع للمنتجات</a>');
  const draftPhoto = state.drafts.productPhoto?.id === id ? state.drafts.productPhoto.photo : p.photo;
  const extraPhotos = state.drafts.productPhotos?.id === id ? state.drafts.productPhotos.list : (p.photos || []);
  const it = isNew ? null : inv().items[p.id];
  const history = isNew ? [] : productCostHistory(data(), p.id);
  const adjustments = isNew ? [] : store.all('adjustments').filter((a) => a.productId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const margin = it && it.avgCost > 0 && n(p.price) > 0 ? Math.round(((n(p.price) - it.avgCost) / n(p.price)) * 100) : null;
  const cats = [...new Set([...settings().categories, p.category].filter(Boolean))];

  return `
  <header class="page-head">
    <div class="row gap"><a class="icon-btn" href="#/products" aria-label="رجوع">${icon('back')}</a><h1>${isNew ? 'منتج جديد' : esc(p.name)}</h1></div>
    ${isNew ? '' : `<a class="btn btn-ghost btn-sm" href="#/ai?mode=caption&product=${esc(p.id)}">${icon('spark', 18)}<span>كابشن</span></a>`}
  </header>

  ${isNew ? '' : `
  <section class="kpis kpis-3">
    <div class="kpi"><span>المتاح للبيع</span><b>${fmtNum(it?.available || 0)}</b></div>
    <div class="kpi"><span>محجوز</span><b>${fmtNum(it?.reserved || 0)}</b></div>
    <div class="kpi"><span>الموجود فعلياً</span><b>${fmtNum(it?.stock || 0)}</b></div>
    <div class="kpi"><span>متوسط الكلفة</span><b>${fmtNum(it?.avgCost || 0)} <small>د.ع</small></b></div>
    <div class="kpi"><span>قيمة المخزن</span><b>${fmtNum(it?.stockValue || 0)} <small>د.ع</small></b></div>
    <div class="kpi"><span>هامش الربح</span><b>${margin == null ? '—' : margin + '%'}</b></div>
  </section>
  ${it?.negative ? `<p class="note note-warn">${icon('bulb', 18)} مبيعات هذا المنتج أكثر من الوارد المسجل. أضف وجبة تجهيز أو تعديل جرد حتى تنضبط الكلفة.</p>` : ''}`}

  ${isNew ? '' : (() => {
    const sales = store.all('bookings').filter((b) => b.quick && (b.lines || []).some((l) => l.productId === p.id)).sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1)).slice(0, 8);
    return `<section class="card form quick-sale">
    <h2>${icon('tag', 20)} تسجيل بيع مباشر</h2>
    <p class="muted small">للبيع اللي صار بدون حجز بالتطبيق. القطع تنخصم من المخزن فوراً وتنحسب بالأرباح.</p>
    <form class="col gap" data-submit="quickSale" data-id="${esc(p.id)}">
      <div class="grid3">
        <label class="field"><span>عدد القطع المباعة</span><input name="qty" inputmode="numeric" required placeholder="1"></label>
        <label class="field"><span>سعر القطعة</span><input name="price" inputmode="numeric" value="${esc(p.price || '')}"></label>
        <label class="field"><span>خصم كلي (دينار)</span><input name="disc" inputmode="numeric" placeholder="0"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>التاريخ</span><input type="date" name="date" value="${today()}"></label>
        <label class="field"><span>الزبون (اختياري)</span><input name="customer" placeholder="الاسم أو ملاحظة"></label>
      </div>
      <button class="btn" type="submit">${icon('check', 18)}<span>تسجيل البيع</span></button>
    </form>
    ${sales.length ? `<div class="row between"><b class="small">آخر البيعات</b><a class="link" href="#/sales">سجل المبيعات</a></div><ul class="list">${sales.map((b) => { const l = b.lines.find((x) => x.productId === p.id); return `<li class="row between"><a class="col grow" href="#/sale/${esc(b.id)}" style="color:inherit"><b>${fmtNum(l.qty)} قطعة × ${fmtNum(l.price)} <small class="link">تعديل</small></b><small class="muted">${esc(fmtDate(b.shippedAt || b.date))}${b.customer?.name && b.customer.name !== 'بيع مباشر' ? ' · ' + esc(b.customer.name) : ''}</small></a><span class="row gap"><b>${money(n(l.qty) * n(l.price) - n(l.disc))}</b><button type="button" class="icon-btn sm" data-act="deleteQuickSale" data-id="${esc(b.id)}" aria-label="حذف البيعة">${icon('x', 16)}</button></span></li>`; }).join('')}</ul>` : ''}
  </section>`;
  })()}

  <form class="card form" data-submit="saveProduct" data-id="${esc(isNew ? '' : p.id)}">
    <div class="photo-row">
      <div class="col gap-sm">
      <label class="photo-pick" for="pphoto">
        ${draftPhoto ? `<img src="${esc(draftPhoto)}" alt="صورة المنتج">` : `<span>${icon('camera', 26)}<small>إضافة صورة</small></span>`}
      </label>
      <input id="pphoto" type="file" accept="image/*" class="sr" data-in="productPhoto" data-id="${esc(id)}">
      ${draftPhoto ? `<button type="button" class="btn btn-ghost btn-sm photo-ai" data-act="aiProductFromPhoto" data-id="${esc(id)}">${icon('spark', 16)}<span>اقترح من الصورة</span></button>` : ''}
      </div>
      <div class="grow col gap">
        <label class="field"><span>اسم المنتج</span><input name="name" required value="${esc(p.name || '')}" placeholder="مثلاً: صحن سيراميك فيروزي"></label>
        <div class="grid2">
          <label class="field"><span>التصنيف</span><select name="category">${options(cats, p.category)}<option value="__new">+ تصنيف جديد…</option></select></label>
          <label class="field"><span>سعر البيع (دينار)</span><input name="price" inputmode="numeric" value="${esc(p.price ?? '')}" placeholder="25000"></label>
        </div>
      </div>
    </div>
    <div class="grid3">
      <label class="field"><span>تنبيه إذا قل عن</span><input name="minStock" inputmode="numeric" value="${esc(p.minStock ?? '')}" placeholder="${esc(settings().defaultMinStock)}"></label>
      <label class="field"><span>الكود / الباركود</span><input name="code" value="${esc(p.code || '')}" placeholder="اختياري" dir="ltr"></label>
      <label class="field"><span>تصنيف جديد</span><input name="newCategory" placeholder="فقط إذا اخترت تصنيف جديد"></label>
    </div>
    <label class="field"><span>ملاحظات <small class="muted">داخلية، ما تظهر للزبون</small></span><textarea name="notes" rows="2" placeholder="القياس، المادة، اللون…">${esc(p.notes || '')}</textarea></label>
    <details class="web-box"${p.webDesc || p.featured || p.compareAt || p.webHide || extraPhotos.length ? ' open' : ''}>
      <summary><b>${icon('globe', 18)} على الموقع الإلكتروني</b><span class="muted small">${p.webHide ? 'مخفي' : 'ظاهر'}</span></summary>
      <div class="col gap">
        <div class="row gap wrap">
          <label class="check"><input type="checkbox" name="webShow" ${p.webHide ? '' : 'checked'}> <span>إظهار بالموقع</span></label>
          <label class="check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> <span>قطعة مميزة (تظهر بواجهة الموقع)</span></label>
        </div>
        <label class="field"><span>السعر قبل الخصم <small class="muted">اختياري، يظهر مشطوب مع نسبة الخصم</small></span><input name="compareAt" inputmode="numeric" value="${esc(p.compareAt || '')}" placeholder="مثلاً 30000"></label>
        <label class="field"><span class="row between"><span>وصف للزبون</span><button type="button" class="link small" data-act="aiWebDesc" data-id="${esc(id)}">${icon('spark', 14)} اكتبه بالذكاء</button></span><textarea name="webDesc" rows="3" placeholder="المادة، اللون، القياس، وين يصير بالبيت…">${esc(p.webDesc || '')}</textarea></label>
        <div class="field"><span>صور إضافية <small class="muted">حتى 3، من زوايا مختلفة أو بالبيت</small></span>
          <div class="row gap wrap">
            ${extraPhotos.map((src, i) => `<div class="ai-thumb"><img src="${esc(src)}" alt="صورة إضافية ${i + 1}"><button type="button" class="icon-btn sm" data-act="removeProductPhoto" data-id="${esc(id)}" data-i="${i}" aria-label="حذف الصورة">${icon('x', 14)}</button></div>`).join('')}
            ${extraPhotos.length < 3 ? `<label class="photo-add" for="pphotos">${icon('plus', 22)}<span class="sr">إضافة صور</span></label><input id="pphotos" type="file" accept="image/*" multiple class="sr" data-in="productPhotos" data-id="${esc(id)}">` : ''}
          </div>
        </div>
      </div>
    </details>
    ${isNew ? `<p class="muted small">الكمية والكلفة تنضاف من خلال <a href="#/lot/new">وجبة تجهيز</a>، حتى ينحسب الربح صح.</p>` : ''}
    <div class="row gap">
      <button class="btn grow" type="submit">${icon('check', 18)}<span>حفظ</span></button>
      ${isNew ? '' : `<button class="btn btn-danger-ghost" type="button" data-act="deleteProduct" data-id="${esc(p.id)}" aria-label="حذف المنتج">${icon('trash', 18)}</button>`}
    </div>
  </form>

  ${isNew ? '' : `
  <section class="card">
    <div class="row between"><h2>الكلفة حسب الوجبات</h2><a class="link" href="#/lot/new">+ وجبة</a></div>
    ${history.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>الوجبة</th><th>التاريخ</th><th>الكمية</th><th>تومان للقطعة</th><th>الكلفة بالدينار</th></tr></thead><tbody>
      ${history.map((h) => `<tr><td><a href="#/lot/${esc(h.lotId)}">${esc(h.lotName || 'وجبة')}</a></td><td>${esc(fmtDate(h.date))}</td><td>${fmtNum(h.qty)}</td><td>${h.costToman ? fmtNum(h.costToman) : '—'}</td><td><b>${fmtNum(h.unitCost)}</b></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">ما مسجل له وارد بعد.</p>'}
  </section>

  <section class="card">
    <h2>تعديل المخزن</h2>
    <p class="muted small">للقطع التالفة، الهدايا، أو تصحيح الجرد. الوارد الجديد سجله كوجبة تجهيز.</p>
    <form class="row gap wrap end" data-submit="addAdjustment" data-id="${esc(p.id)}">
      <label class="field"><span>النوع</span><select name="kind">${options([{ value: 'damaged', label: 'تالف' }, { value: 'gift', label: 'هدية / عينة' }, { value: 'countMinus', label: 'جرد: ناقص' }, { value: 'countPlus', label: 'جرد: زائد' }], 'damaged')}</select></label>
      <label class="field w-90"><span>العدد</span><input name="qty" inputmode="numeric" required placeholder="1"></label>
      <label class="field grow"><span>ملاحظة</span><input name="note" placeholder="اختياري"></label>
      <button class="btn btn-ghost" type="submit">تسجيل</button>
    </form>
    ${adjustments.length ? `<ul class="list">${adjustments.map((a) => `<li class="row between"><span>${esc(adjLabel(a))} · ${esc(fmtDate(a.date))}${a.note ? ' · ' + esc(a.note) : ''}</span><span class="row gap"><b class="${n(a.qty) < 0 ? 'neg' : 'pos'}">${n(a.qty) > 0 ? '+' : ''}${fmtNum(a.qty)}</b><button class="icon-btn sm" data-act="deleteAdjustment" data-id="${esc(a.id)}" aria-label="حذف">${icon('x', 16)}</button></span></li>`).join('')}</ul>` : ''}
  </section>`}`;
}

const ADJ = { damaged: 'تالف', gift: 'هدية', countMinus: 'جرد ناقص', countPlus: 'جرد زائد' };
const adjLabel = (a) => ADJ[a.kind] || 'تعديل';

// ---------- وجبات التجهيز ----------
function lotsView() {
  const lots = store.all('lots').sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
  return `
  <header class="page-head">
    <div class="row gap"><a class="icon-btn" href="#/products" aria-label="رجوع">${icon('back')}</a><h1>وجبات التجهيز</h1></div>
    <a class="btn btn-ghost btn-sm" href="#/import">${icon('sheet', 18)}<span>من إكسل</span></a>
  </header>
  <p class="muted small">كل مرة تشتري بضاعة من المورد سجّلها هنا: الأسعار بالتومان مع سعر الصرف بيومها. التطبيق يحسب كلفة كل قطعة بالدينار ويبيع من الأقدم أولاً.</p>
  ${lots.length ? `<div class="col gap">${(() => { const remAll = lotRemaining(inv()); return lots.map((l) => {
    const t = lotTotals(l);
    const rem = Object.values(remAll[l.id] || {}).reduce((a, b) => a + b, 0);
    const sold = Math.max(t.qty - rem, 0);
    const pct = t.qty ? Math.round((sold / t.qty) * 100) : 0;
    return `<a class="card card-link" href="#/lot/${esc(l.id)}">
      <div class="row between"><div class="col"><b>${esc(l.name || 'وجبة')}</b><span class="muted small">${esc(fmtDate(l.date, true))}${l.supplier ? ' · ' + esc(l.supplier) : ''}</span></div><span class="price">${money(t.cost)}</span></div>
      <div class="row gap wrap small muted"><span>${fmtNum(t.qty)} قطعة</span>${l.currency !== 'iqd' && t.toman ? `<span>· ${fmtNum(t.toman)} تومان</span><span>· الصرف ${fmtNum(l.tomanPer1000)} تومان/1000 د.ع</span>` : ''}${n(l.extraCostIqd) ? `<span>· مصاريف ${fmtNum(l.extraCostIqd)}</span>` : ''}</div>
      <div class="mini-bar"><div style="width:${pct}%;background:var(--teal)"></div></div>
      <div class="row between small"><span>انباع <b>${fmtNum(sold)}</b></span><span>باقي <b>${fmtNum(rem)}</b> من ${fmtNum(t.qty)}</span></div>
    </a>`;
  }).join(''); })()}</div>` : emptyState('ما عندك وجبات تجهيز بعد', '<a class="btn" href="#/lot/new">سجل أول وجبة</a>')}
  <a class="fab" href="#/lot/new" aria-label="وجبة جديدة">${icon('plus', 26)}</a>`;
}

function lotDraft(id) {
  const key = 'lot:' + id;
  if (!state.drafts[key]) {
    if (id === 'new') {
      const d = today();
      state.drafts[key] = { name: '', date: d, supplier: '', currency: 'toman', tomanPer1000: settings().tomanPer1000 || '', totalIqdPaid: '', extraCostIqd: '', note: '', lines: [emptyLotLine()] };
    } else {
      const lot = store.get('lots', id);
      if (!lot) return null;
      state.drafts[key] = JSON.parse(JSON.stringify({ totalIqdPaid: '', currency: 'toman', ...lot }));
      state.drafts[key].lines = state.drafts[key].lines.map((l) => ({ salePrice: '', ...l }));
    }
  }
  return state.drafts[key];
}
const emptyLotLine = () => ({ productId: '', newName: '', newCategory: '', qty: '', costToman: '', costIqd: '', salePrice: '' });

function lotLineCost(draft) {
  return lotBreakdown(lotForCalc(draft));
}
function lotForCalc(d) {
  return {
    ...d,
    tomanPer1000: d.currency === 'iqd' ? 0 : n(d.tomanPer1000),
    lines: d.lines.map((l) => ({ ...l, qty: n(l.qty), costToman: d.currency === 'iqd' ? 0 : n(l.costToman), costIqd: d.currency === 'iqd' ? n(l.costIqd) : '' })),
  };
}

function lotTotalsHtml(d) {
  const calc = lotForCalc(d);
  const t = lotTotals(calc);
  return `<div class="sum-row"><span>عدد القطع</span><b>${fmtNum(t.qty)}</b></div>
    ${d.currency === 'iqd' ? '' : `<div class="sum-row"><span>مجموع التومان</span><b>${fmtNum(t.toman)}</b></div>`}
    <div class="sum-row"><span>المصاريف الإضافية</span><b>${fmtIQD(d.extraCostIqd)}</b></div>
    <div class="sum-row total"><span>كلفة الوجبة بالدينار</span><b>${fmtIQD(t.cost)}</b></div>
    ${d.currency !== 'iqd' && !n(d.tomanPer1000) ? '<p class="note note-warn small">اكتب سعر الصرف حتى تنحسب الكلفة بالدينار.</p>' : ''}`;
}

function lotView(id) {
  const d = lotDraft(id);
  if (!d) return emptyState('هذه الوجبة غير موجودة', '<a class="btn" href="#/lots">رجوع</a>');
  const isNew = id === 'new';
  const products = store.all('products').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const costs = lotLineCost(d);
  const prodOpts = (sel) => `<option value="">اختر منتج…</option><option value="__new"${sel === '__new' ? ' selected' : ''}>+ منتج جديد</option>` +
    products.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const toman = d.currency !== 'iqd';

  return `
  <header class="page-head">
    <div class="row gap"><a class="icon-btn" href="#/lots" aria-label="رجوع">${icon('back')}</a><h1>${isNew ? 'وجبة تجهيز جديدة' : esc(d.name || 'وجبة')}</h1></div>
    ${isNew ? '' : `<button class="btn btn-ghost btn-sm" data-act="batchFromLot" data-id="${esc(id)}">${icon('layers', 18)}<span>دفعة نشر منها</span></button>`}
  </header>
  <form class="col gap" data-submit="saveLot" data-id="${esc(id)}">
    <section class="card form">
      <div class="grid2">
        <label class="field"><span>اسم الوجبة</span><input data-in="lotField" data-k="name" value="${esc(d.name)}" placeholder="مثلاً: وجبة تشرين"></label>
        <label class="field"><span>التاريخ</span><input type="date" data-in="lotField" data-k="date" value="${esc(d.date)}"></label>
        <label class="field"><span>المورد</span><input data-in="lotField" data-k="supplier" value="${esc(d.supplier)}" placeholder="اختياري"></label>
        <label class="field"><span>عملة الشراء</span><select data-in="lotCurrency">${options([{ value: 'toman', label: 'تومان' }, { value: 'iqd', label: 'دينار عراقي' }], d.currency)}</select></label>
      </div>
      ${toman ? `
      <div class="rate-box">
        <label class="field"><span>سعر الصرف: كم تومان مقابل 1000 دينار؟</span><input inputmode="numeric" data-in="lotField" data-k="tomanPer1000" value="${esc(d.tomanPer1000)}" placeholder="اكتب سعر يوم الشراء"></label>
        <span class="muted small or">أو</span>
        <label class="field"><span>كم دفعت فعلياً بالدينار؟</span><input inputmode="numeric" data-in="lotPaid" value="${esc(d.totalIqdPaid)}" placeholder="ويطلع الصرف لحاله"></label>
      </div>` : ''}
      <label class="field"><span>مصاريف إضافية بالدينار (نقل، كمرك، تغليف…)</span><input inputmode="numeric" data-in="lotField" data-k="extraCostIqd" value="${esc(d.extraCostIqd)}" placeholder="0"><small class="muted">تنوزع على القطع حسب قيمتها.</small></label>
    </section>

    <section class="card">
      <h2>القطع</h2>
      <div class="col gap">
      ${d.lines.map((l, i) => `
        <div class="lot-line">
          <div class="row gap">
            <label class="field grow"><span class="sr">المنتج</span><select data-in="lotLineProduct" data-i="${i}">${prodOpts(l.productId)}</select></label>
            <button type="button" class="icon-btn sm" data-act="lotRemoveLine" data-i="${i}" aria-label="حذف السطر">${icon('x', 16)}</button>
          </div>
          ${l.productId === '__new' ? `<div class="grid2">
            <label class="field"><span>اسم المنتج الجديد</span><input data-in="lotLine" data-i="${i}" data-k="newName" value="${esc(l.newName)}" required></label>
            <label class="field"><span>التصنيف</span><select data-in="lotLine" data-i="${i}" data-k="newCategory">${options(settings().categories, l.newCategory || settings().categories[0])}</select></label>
          </div>` : ''}
          <div class="grid3">
            <label class="field"><span>الكمية</span><input inputmode="numeric" data-in="lotLine" data-i="${i}" data-k="qty" value="${esc(l.qty)}" placeholder="0"></label>
            ${toman
              ? `<label class="field"><span>سعر القطعة (تومان)</span><input inputmode="numeric" data-in="lotLine" data-i="${i}" data-k="costToman" value="${esc(l.costToman)}" placeholder="0"></label>`
              : `<label class="field"><span>سعر القطعة (دينار)</span><input inputmode="numeric" data-in="lotLine" data-i="${i}" data-k="costIqd" value="${esc(l.costIqd)}" placeholder="0"></label>`}
            ${l.productId === '__new' ? `<label class="field"><span>سعر البيع للمنتج الجديد</span><input inputmode="numeric" data-in="lotLine" data-i="${i}" data-k="salePrice" value="${esc(l.salePrice)}" placeholder="0"></label>` : ''}
          </div>
          <div class="muted small" id="lc-${i}">${lineCostText(costs[i])}</div>
          ${id !== 'new' && l.productId && l.productId !== '__new' ? (() => { const r = (lotRemaining(inv())[id] || {})[l.productId]; const q = n(l.qty); return r == null && !q ? '' : `<div class="small">انباع <b>${fmtNum(Math.max(q - (r || 0), 0))}</b> · باقي <b>${fmtNum(r || 0)}</b> من ${fmtNum(q)}</div>`; })() : ''}
        </div>`).join('')}
      </div>
      <button type="button" class="btn btn-dashed" data-act="lotAddLine">+ إضافة قطعة</button>
    </section>

    <section class="card" id="lotTotals">${lotTotalsHtml(d)}</section>
    <label class="field card"><span>ملاحظات</span><textarea rows="2" data-in="lotField" data-k="note">${esc(d.note || '')}</textarea></label>
    <div class="row gap sticky-actions">
      <button class="btn grow" type="submit">${icon('check', 18)}<span>حفظ الوجبة</span></button>
      ${isNew ? '' : `<button class="btn btn-danger-ghost" type="button" data-act="deleteLot" data-id="${esc(id)}" aria-label="حذف الوجبة">${icon('trash', 18)}</button>`}
    </div>
  </form>`;
}

function lineCostText(c) {
  if (!c || !c.qty) return '';
  return `كلفة القطعة الواصلة: <b>${fmtIQD(c.unitCost)}</b>${c.extraUnit ? ` (منها ${fmtNum(c.extraUnit)} مصاريف)` : ''}`;
}

function refreshLotNumbers(id) {
  const d = lotDraft(id);
  const costs = lotLineCost(d);
  costs.forEach((c, i) => {
    const el = document.getElementById('lc-' + i);
    if (el) el.innerHTML = lineCostText(c);
  });
  const t = document.getElementById('lotTotals');
  if (t) t.innerHTML = lotTotalsHtml(d);
}

// ---------- رفع الإكسل ----------
function importView() {
  const rows = state.drafts.importRows;
  const products = store.all('products');
  const byName = new Map(products.map((p) => [p.name.trim(), p]));
  const opt = state.drafts.importOpt || (state.drafts.importOpt = { mode: 'lot', date: today(), currency: 'toman', tomanPer1000: settings().tomanPer1000 || '', name: '' });
  return `
  <header class="page-head">
    <div class="row gap"><a class="icon-btn" href="#/products" aria-label="رجوع">${icon('back')}</a><h1>إضافة منتجات</h1></div>
  </header>
  <section class="card col gap">
    <h2>${icon('spark', 20)} بالذكاء الاصطناعي</h2>
    <p class="muted small">الصق قائمة منتجات بأي شكل (رسالة المورد، أسعار، جدول منسوخ)، أو صوّر الفاتورة أو قائمة الأسعار أو البضاعة. المساعد يرتبها لك وتراجعها قبل الحفظ.</p>
    <label class="field"><span class="sr">النص</span><textarea id="aiProdText" rows="5" placeholder="مثلاً: صحن فيروزي 12 قطعة سعر 5 مليون تومان، مزهرية عاجية 8 قطع 7 مليون، نبيعها 25 و 35 ألف…">${esc(state.drafts.aiProdText || '')}</textarea></label>
    ${(state.drafts.aiProdImages || []).length ? `<div class="row gap wrap">${state.drafts.aiProdImages.map((src, i) => `<div class="ai-thumb">${src.startsWith('data:application/pdf') ? `<div class="thumb-empty" style="width:100%;height:100%;background:var(--red-soft);color:var(--red-ink);font-weight:700">PDF</div>` : `<img src="${esc(src)}" alt="صورة ${i + 1}">`}<button type="button" class="icon-btn sm" data-act="aiProdRemoveImg" data-i="${i}" aria-label="حذف الصورة">${icon('x', 14)}</button></div>`).join('')}</div>` : ''}
    <div class="row gap wrap">
      <label class="btn btn-ghost" for="aiProdImg">${icon('camera', 18)}<span>صورة / فاتورة / PDF</span></label>
      <input id="aiProdImg" class="sr" type="file" accept="image/*,application/pdf" multiple data-in="aiProdImg">
      <button class="btn grow" type="button" data-act="aiExtractProducts" ${state.ui.aiBusy ? 'disabled' : ''}>${state.ui.aiBusy ? '<span class="spin"></span><span>جاري الترتيب…</span>' : icon('spark', 18) + '<span>رتّبها بالذكاء</span>'}</button>
    </div>
    ${sync.aiReady() ? '' : '<p class="small muted">يحتاج ربط حساب Google (من الإعدادات أو زر المزامنة بالرئيسية).</p>'}
  </section>
  <section class="card col gap">
    <h2>${icon('sheet', 20)} من ملف إكسل</h2>
    <p class="muted small">أي ملف إكسل أو CSV. إذا الأعمدة مو مرتبة، المساعد الذكي يقرأه لحاله.</p>
    <div class="row gap wrap">
      <label class="btn btn-dashed grow" for="xfile">${icon('upload', 18)}<span>اختيار ملف</span></label>
      <button class="btn btn-ghost" data-act="downloadTemplate">${icon('download', 18)}<span>النموذج</span></button>
    </div>
    <input id="xfile" class="sr" type="file" accept=".xlsx,.xls,.csv,.json" data-in="importFile">
  </section>
  ${state.drafts.aiProdNote ? `<p class="note">${icon('spark', 18)} <span>${esc(state.drafts.aiProdNote)}</span></p>` : ''}
  ${rows ? `
  <section class="card">
    <div class="row between"><h2>معاينة (${fmtNum(rows.length)} صف)</h2><button class="link" data-act="importClear">إلغاء</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>المنتج</th><th>الحالة</th><th>الكمية</th><th>شراء تومان</th><th>شراء دينار</th><th>البيع</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><div class="row gap">${r.photo ? `<img class="thumb" src="${esc(r.photo)}" alt="" style="width:40px;height:40px;border-radius:8px">` : ''}<div>${esc(r.name)}<div class="muted small">${esc(r.category)}</div></div></div></td><td>${byName.has(r.name.trim()) ? '<span class="chip chip-ok">موجود</span>' : '<span class="chip chip-low">جديد</span>'}</td><td>${fmtNum(r.qty)}</td><td>${r.costToman ? fmtNum(r.costToman) : '—'}</td><td>${r.costIqd ? fmtNum(r.costIqd) : '—'}</td><td>${r.price ? fmtNum(r.price) : '—'}</td></tr>`).join('')}
    </tbody></table></div>
  </section>
  <form class="card form" data-submit="importApply">
    <h2>شنو أسوي بالملف؟</h2>
    <label class="radio"><input type="radio" name="mode" value="lot" ${opt.mode === 'lot' ? 'checked' : ''}> <span>أسجله كوجبة تجهيز (يضيف الكميات والكلفة للمخزن)</span></label>
    <label class="radio"><input type="radio" name="mode" value="products" ${opt.mode === 'products' ? 'checked' : ''}> <span>أحدّث المنتجات والأسعار فقط (بدون كميات)</span></label>
    <div class="grid2">
      <label class="field"><span>اسم الوجبة</span><input name="name" value="${esc(opt.name)}" placeholder="وجبة من إكسل"></label>
      <label class="field"><span>التاريخ</span><input type="date" name="date" value="${esc(opt.date)}"></label>
      <label class="field"><span>عملة الشراء بالملف</span><select name="currency">${options([{ value: 'toman', label: 'تومان' }, { value: 'iqd', label: 'دينار' }], opt.currency)}</select></label>
      <label class="field"><span>تومان مقابل 1000 دينار</span><input name="tomanPer1000" inputmode="numeric" value="${esc(opt.tomanPer1000)}"></label>
    </div>
    <button class="btn" type="submit">${icon('check', 18)}<span>تطبيق</span></button>
  </form>` : ''}`;
}

// ---------- قراءة الباركود بالكاميرا ----------
async function scanBarcode() {
  if (!('BarcodeDetector' in window)) {
    toast('المتصفح ما يدعم قراءة الباركود. اكتب الكود يدوياً.');
    return null;
  }
  const detector = new window.BarcodeDetector();
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-box"><video playsinline muted></video><p class="muted small">وجّه الكاميرا على الباركود</p><button class="btn btn-ghost" type="button">إلغاء</button></div>`;
  document.body.appendChild(wrap);
  const video = wrap.querySelector('video');
  let stream;
  let done = false;
  const close = () => {
    done = true;
    stream?.getTracks().forEach((t) => t.stop());
    wrap.remove();
  };
  return new Promise(async (resolve) => {
    wrap.querySelector('button').onclick = () => (close(), resolve(null));
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      const tick = async () => {
        if (done) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            close();
            return resolve(codes[0].rawValue);
          }
        } catch {}
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      close();
      toast('ما قدرت أفتح الكاميرا');
      resolve(null);
    }
  });
}

register({
  view: {
    products: () => productsView(),
    product: (id) => productView(id || 'new'),
    lots: () => lotsView(),
    lot: (id) => lotView(id || 'new'),
    import: () => importView(),
  },
  input: {
    prodSearch: (el) => {
      setUi('prodQ', el.value, { render: false });
      document.getElementById('prodGrid').innerHTML = productGrid();
    },
    prodSort: (el) => setUi('prodSort', el.value),
    productPhoto: async (el) => {
      const f = el.files?.[0];
      if (!f) return;
      const photo = await resizeImage(f);
      state.drafts.productPhoto = { id: el.dataset.id, photo };
      rerenderKeepForm(el.closest('form'));
    },
    productPhotos: async (el) => {
      const id = el.dataset.id;
      const cur = state.drafts.productPhotos?.id === id ? state.drafts.productPhotos.list : (store.get('products', id)?.photos || []);
      const files = [...(el.files || [])].slice(0, 3 - cur.length);
      if (!files.length) return;
      const added = [];
      for (const f of files) added.push(await resizeImage(f));
      state.drafts.productPhotos = { id, list: [...cur, ...added] };
      rerenderKeepForm(el.closest('form'));
    },
    lotField: (el) => {
      const id = state.route.id || 'new';
      const d = lotDraft(id);
      d[el.dataset.k] = el.value;
      if (el.dataset.k === 'tomanPer1000') d.totalIqdPaid = '';
      refreshLotNumbers(id);
    },
    lotPaid: (el) => {
      const id = state.route.id || 'new';
      const d = lotDraft(id);
      d.totalIqdPaid = el.value;
      const totalToman = d.lines.reduce((s, l) => s + n(l.costToman) * n(l.qty), 0);
      const rate = rateFromTotals(totalToman, el.value);
      if (rate > 0) {
        d.tomanPer1000 = String(Math.round(rate));
        const r = document.querySelector('[data-k="tomanPer1000"]');
        if (r) r.value = d.tomanPer1000;
      }
      refreshLotNumbers(id);
    },
    lotCurrency: (el) => {
      lotDraft(state.route.id || 'new').currency = el.value;
      rerender();
    },
    lotLineProduct: (el) => {
      const d = lotDraft(state.route.id || 'new');
      d.lines[+el.dataset.i].productId = el.value;
      rerender();
    },
    lotLine: (el) => {
      const id = state.route.id || 'new';
      const d = lotDraft(id);
      d.lines[+el.dataset.i][el.dataset.k] = el.value;
      if (d.totalIqdPaid && (el.dataset.k === 'qty' || el.dataset.k === 'costToman')) {
        const totalToman = d.lines.reduce((s, l) => s + n(l.costToman) * n(l.qty), 0);
        const rate = rateFromTotals(totalToman, d.totalIqdPaid);
        if (rate > 0) {
          d.tomanPer1000 = String(Math.round(rate));
          const r = document.querySelector('[data-k="tomanPer1000"]');
          if (r) r.value = d.tomanPer1000;
        }
      }
      refreshLotNumbers(id);
    },
    aiProdImg: async (el) => {
      const files = [...(el.files || [])].slice(0, 4);
      if (!files.length) return;
      state.drafts.aiProdText = document.getElementById('aiProdText')?.value || '';
      const read = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      state.drafts.aiProdImages = (state.drafts.aiProdImages || []).concat(await Promise.all(files.map((f) => (f.type === 'application/pdf' ? read(f) : resizeImage(f, 1400, 0.82))))).slice(0, 4);
      rerender();
    },
    importFile: async (el) => {
      const f = el.files?.[0];
      if (!f) return;
      try {
        toast('جاري قراءة الملف…');
        let rows;
        if (/\.json$/i.test(f.name)) {
          const j = JSON.parse(await f.text());
          if (j.format !== 'rawasi-import' || !Array.isArray(j.rows)) throw new Error('ملف JSON غير معروف');
          rows = j.rows.map((r) => ({ name: String(r.name || '').trim(), category: r.category || '', qty: n(r.qty), costToman: n(r.costToman), costIqd: n(r.costIqd), price: n(r.price), code: r.code || '', photo: r.photo || '' })).filter((r) => r.name);
          const opt = state.drafts.importOpt || (state.drafts.importOpt = { mode: 'lot', date: today(), currency: 'toman', tomanPer1000: settings().tomanPer1000 || '', name: '' });
          Object.assign(opt, { mode: 'lot', name: j.lot?.name || '', date: j.lot?.date || today() });
          state.drafts.importNote = j.lot?.note || '';
          state.drafts.importRows = rows;
          opt.currency = j.lot?.currency === 'iqd' ? 'iqd' : opt.currency;
          // إذا المنتجات موجودة سابقاً (انضافت قبل)، نحدّث الصور والأسعار فقط حتى ما تتكرر الكميات
          const names = new Set(store.all('products').map((p) => p.name.trim()));
          if (rows.every((r) => names.has(r.name))) {
            opt.mode = 'products';
            state.drafts.aiProdNote = 'المنتجات موجودة سابقاً، راح أحدّث الصور فقط بدون ما أكرر الكميات.';
          }
          return rerender();
        }
        try {
          rows = await parseFile(f);
        } catch (err) {
          if (!sync.aiReady()) throw err;
          toast('الأعمدة مو مرتبة، المساعد يقرأ الملف…');
          const text = await sheetToText(f);
          const r = await ai.extractProducts({ text, data: data() });
          rows = r.rows;
          state.drafts.aiProdNote = 'رتّبه المساعد من الملف، راجعه قبل التطبيق.' + (r.note ? ' ' + r.note : '');
        }
        if (!rows.length) return toast('الملف فارغ', 'err');
        state.drafts.importRows = rows;
        const hasToman = rows.some((r) => r.costToman > 0);
        const hasIqd = rows.some((r) => r.costIqd > 0);
        if (state.drafts.importOpt) state.drafts.importOpt.currency = hasIqd && !hasToman ? 'iqd' : 'toman';
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
  },
  act: {
    prodCat: (el) => setUi('prodCat', el.dataset.v),
    scan: async () => {
      const code = await scanBarcode();
      if (!code) return;
      const p = store.all('products').find((x) => (x.code || '') === code);
      if (p) nav('#/product/' + p.id);
      else {
        setUi('prodQ', code);
        toast('ما لقيت منتج بهذا الكود');
      }
    },
    deleteProduct: (el) => {
      if (!confirm('تحذف المنتج؟ الحجوزات والوجبات القديمة تبقى بس بدون اسم المنتج.')) return;
      store.remove('products', el.dataset.id);
      toast('انحذف المنتج');
      nav('#/products');
    },
    deleteQuickSale: (el) => {
      if (!confirm('تحذف هذا البيع؟ القطع ترجع للمخزن.')) return;
      store.remove('bookings', el.dataset.id);
      toast('انحذف البيع');
      rerender();
    },
    deleteAdjustment: (el) => {
      if (!confirm('تحذف هذا التعديل؟')) return;
      store.remove('adjustments', el.dataset.id);
      rerender();
    },
    lotAddLine: () => {
      lotDraft(state.route.id || 'new').lines.push(emptyLotLine());
      rerender();
    },
    lotRemoveLine: (el) => {
      const d = lotDraft(state.route.id || 'new');
      d.lines.splice(+el.dataset.i, 1);
      if (!d.lines.length) d.lines.push(emptyLotLine());
      rerender();
    },
    deleteLot: (el) => {
      if (!confirm('تحذف الوجبة؟ كميات وكلفة قطعها راح تنشال من المخزن.')) return;
      store.remove('lots', el.dataset.id);
      delete state.drafts['lot:' + el.dataset.id];
      toast('انحذفت الوجبة');
      nav('#/lots');
    },
    batchFromLot: (el) => {
      const lot = store.get('lots', el.dataset.id);
      if (!lot) return;
      const items = lot.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: n(l.qty), price: '' }));
      state.drafts['batch:new'] = { name: 'دفعة ' + fmtDate(today()), date: today(), status: 'open', lotId: lot.id, note: '', items };
      nav('#/batch/new');
    },
    downloadTemplate: () => downloadTemplate().catch((e) => toast(e.message, 'err')),
    aiProdRemoveImg: (el) => {
      state.drafts.aiProdText = document.getElementById('aiProdText')?.value || '';
      state.drafts.aiProdImages.splice(+el.dataset.i, 1);
      rerender();
    },
    aiExtractProducts: async () => {
      const text = document.getElementById('aiProdText')?.value.trim() || '';
      const images = state.drafts.aiProdImages || [];
      state.drafts.aiProdText = text;
      if (!text && !images.length) return toast('الصق نص أو أضف صورة أولاً', 'err');
      state.ui.aiBusy = true;
      rerender();
      try {
        const r = await ai.extractProducts({ text, images, data: data() });
        if (!r.rows.length) {
          toast('ما لقيت منتجات بالنص أو الصورة', 'err');
        } else {
          state.drafts.importRows = r.rows;
          const opt = state.drafts.importOpt || (state.drafts.importOpt = { mode: 'lot', date: today(), currency: 'toman', tomanPer1000: settings().tomanPer1000 || '', name: '' });
          opt.currency = r.currency;
          if (!r.rows.some((x) => x.qty > 0)) opt.mode = 'products';
          state.drafts.aiProdNote = `رتّب المساعد ${fmtNum(r.rows.length)} منتج، راجعهم تحت قبل التطبيق.` + (r.note ? ' ' + r.note : '');
          state.drafts.aiProdText = '';
          state.drafts.aiProdImages = [];
        }
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        state.ui.aiBusy = false;
        rerender();
        document.querySelector('.table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    removeProductPhoto: (el) => {
      const id = el.dataset.id;
      const cur = state.drafts.productPhotos?.id === id ? state.drafts.productPhotos.list : (store.get('products', id)?.photos || []);
      state.drafts.productPhotos = { id, list: cur.filter((_, i) => i !== Number(el.dataset.i)) };
      rerenderKeepForm(el.closest('form'));
    },
    aiWebDesc: async (el) => {
      const form = el.closest('form');
      const v = formData(form);
      if (!v.name) return toast('اكتب اسم المنتج أولاً', 'err');
      const id = el.dataset.id;
      const photo = state.drafts.productPhoto?.id === id ? state.drafts.productPhoto.photo : store.get('products', id)?.photo;
      const label = el.innerHTML;
      el.disabled = true;
      el.textContent = 'جاري الكتابة…';
      try {
        const text = await ai.webDescription({ name: v.name, category: v.category === '__new' ? v.newCategory : v.category, notes: v.notes }, { photo });
        form.elements.webDesc.value = text;
        toast('انكتب الوصف، راجعه وعدّله إذا تحب');
      } catch (e) {
        toast(e.message || 'ما قدرت أكتب الوصف', 'err');
      } finally {
        el.disabled = false;
        el.innerHTML = label;
      }
    },
    aiProductFromPhoto: async (el) => {
      const id = el.dataset.id;
      const photo = state.drafts.productPhoto?.id === id ? state.drafts.productPhoto.photo : store.get('products', id)?.photo;
      if (!photo) return toast('أضف صورة للمنتج أولاً', 'err');
      const form = el.closest('form');
      el.disabled = true;
      el.innerHTML = '<span class="spin"></span><span>جاري…</span>';
      try {
        const r = await ai.productFromPhoto(photo, data());
        if (r.name && !form.elements.name.value) form.elements.name.value = r.name;
        else if (r.name) form.elements.name.value = r.name;
        if (r.category) {
          const sel = form.elements.category;
          if ([...sel.options].some((o) => o.value === r.category)) sel.value = r.category;
          else {
            sel.value = '__new';
            form.elements.newCategory.value = r.category;
          }
        }
        if (r.notes && !form.elements.notes.value) form.elements.notes.value = r.notes;
        toast('عبّاها المساعد، راجعها واحفظ ✓');
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        el.disabled = false;
        el.innerHTML = icon('spark', 16) + '<span>اقترح من الصورة</span>';
      }
    },
    importClear: () => {
      state.drafts.aiProdNote = '';
      state.drafts.importRows = null;
      rerender();
    },
  },
  submit: {
    saveProduct: (form) => {
      const v = formData(form);
      const id = form.dataset.id;
      let category = v.category;
      if (category === '__new') {
        category = v.newCategory;
        if (!category) return toast('اكتب اسم التصنيف الجديد', 'err');
      }
      if (category && !settings().categories.includes(category)) store.setSettings({ categories: [...settings().categories, category] });
      const base = id ? store.get('products', id) : {};
      const photo = state.drafts.productPhoto?.id === (id || 'new') ? state.drafts.productPhoto.photo : base.photo;
      const photos = state.drafts.productPhotos?.id === (id || 'new') ? state.drafts.productPhotos.list : base.photos || [];
      const rec = store.put('products', {
        ...base, name: v.name, category, price: n(v.price), minStock: v.minStock === '' ? '' : n(v.minStock), code: v.code, notes: v.notes, photo: photo || '',
        photos, webHide: !v.webShow, featured: !!v.featured, compareAt: n(v.compareAt) || '', webDesc: v.webDesc || '',
      });
      state.drafts.productPhoto = null;
      state.drafts.productPhotos = null;
      toast('انحفظ ✓');
      nav('#/product/' + rec.id);
    },
    quickSale: (form) => {
      const v = formData(form);
      const qty = Math.abs(n(v.qty));
      if (!qty) return toast('اكتب عدد القطع', 'err');
      const pid = form.dataset.id;
      const it = inv().items[pid];
      if (it && qty > it.available && !confirm(`المتاح ${fmtNum(it.available)} قطعة فقط. تسجل البيع على كل حال؟`)) return;
      const when = (v.date || today()) + 'T' + new Date().toTimeString().slice(0, 8);
      store.put('bookings', {
        no: store.nextBookingNo(),
        quick: true,
        date: new Date(when).toISOString(),
        shippedAt: new Date(when).toISOString(),
        status: 'delivered',
        customer: { name: v.customer || 'بيع مباشر', phone: '', gov: '', address: '', ig: '' },
        lines: [{ productId: pid, qty, price: n(v.price), discType: 'amt', disc: n(v.disc), discNote: '' }],
        orderDiscount: 0,
        deliveryFee: 0,
        batchId: '',
        note: 'بيع مباشر من صفحة المنتج',
      });
      toast(`انسجل بيع ${fmtNum(qty)} قطعة ✓`);
      rerender();
    },
    addAdjustment: (form) => {
      const v = formData(form);
      const q = Math.abs(n(v.qty));
      if (!q) return toast('اكتب العدد', 'err');
      const sign = v.kind === 'countPlus' ? 1 : -1;
      store.put('adjustments', { productId: form.dataset.id, kind: v.kind, qty: sign * q, note: v.note, date: new Date().toISOString() });
      toast('انسجل التعديل');
      rerender();
    },
    saveLot: (form) => {
      const id = form.dataset.id;
      const d = lotDraft(id);
      const lines = [];
      for (const l of d.lines) {
        if (!l.productId && !n(l.qty)) continue;
        if (!l.productId) return toast('اختر المنتج لكل سطر', 'err');
        if (!n(l.qty)) return toast('اكتب الكمية لكل قطعة', 'err');
        let productId = l.productId;
        if (productId === '__new') {
          if (!l.newName) return toast('اكتب اسم المنتج الجديد', 'err');
          const existing = store.all('products').find((p) => p.name.trim() === l.newName.trim());
          productId = existing ? existing.id : store.put('products', { name: l.newName.trim(), category: l.newCategory || settings().categories[0] || '', price: n(l.salePrice), minStock: '', code: '', notes: '', photo: '' }).id;
        }
        // سعر البيع يتغير من صفحة المنتج فقط؛ الوجبة تحدد سعر البيع بس للمنتج الجديد
        if (false && n(l.salePrice) > 0) {
          const p = store.get('products', productId);
          if (p && n(p.price) !== n(l.salePrice)) store.put('products', { ...p, price: n(l.salePrice) });
        }
        lines.push({ productId, qty: n(l.qty), costToman: d.currency === 'iqd' ? 0 : n(l.costToman), costIqd: d.currency === 'iqd' ? n(l.costIqd) : '' });
      }
      if (!lines.length) return toast('أضف قطعة وحدة على الأقل', 'err');
      if (d.currency !== 'iqd' && !n(d.tomanPer1000)) return toast('اكتب سعر الصرف', 'err');
      const base = id === 'new' ? {} : store.get('lots', id) || {};
      const rec = store.put('lots', {
        ...base,
        name: d.name || 'وجبة ' + fmtDate(d.date),
        date: d.date || today(),
        supplier: d.supplier,
        currency: d.currency,
        tomanPer1000: d.currency === 'iqd' ? 0 : n(d.tomanPer1000),
        extraCostIqd: n(d.extraCostIqd),
        note: d.note,
        lines,
      });
      if (d.currency !== 'iqd' && n(d.tomanPer1000)) store.setSettings({ tomanPer1000: n(d.tomanPer1000) });
      delete state.drafts['lot:' + id];
      toast('انحفظت الوجبة ✓');
      nav('#/lot/' + rec.id);
    },
    importApply: (form) => {
      const v = formData(form);
      const rows = state.drafts.importRows || [];
      const byName = new Map(store.all('products').map((p) => [p.name.trim(), p]));
      const lines = [];
      for (const r of rows) {
        let p = byName.get(r.name.trim());
        if (r.category && !settings().categories.includes(r.category)) store.setSettings({ categories: [...settings().categories, r.category] });
        if (!p) {
          p = store.put('products', { name: r.name.trim(), category: r.category || settings().categories[0] || '', price: n(r.price), code: r.code || '', minStock: '', notes: '', photo: r.photo || '' });
          byName.set(p.name, p);
        } else if (n(r.price) > 0 || r.code || r.category || r.photo) {
          p = store.put('products', { ...p, price: n(r.price) > 0 ? n(r.price) : p.price, code: r.code || p.code, category: r.category || p.category, photo: r.photo || p.photo || '' });
        }
        if (v.mode === 'lot' && n(r.qty) > 0) lines.push({ productId: p.id, qty: n(r.qty), costToman: v.currency === 'iqd' ? 0 : n(r.costToman), costIqd: v.currency === 'iqd' ? n(r.costIqd || r.costToman) : (n(r.costToman) ? '' : n(r.costIqd) || '') });
      }
      if (v.mode === 'lot') {
        if (!lines.length) return toast('ما بالملف كميات حتى أسوي وجبة', 'err');
        if (v.currency !== 'iqd' && !n(v.tomanPer1000) && lines.some((l) => l.costToman)) return toast('اكتب سعر الصرف', 'err');
        const lot = store.put('lots', { name: v.name || 'وجبة من إكسل', date: v.date || today(), supplier: '', currency: v.currency, tomanPer1000: v.currency === 'iqd' ? 0 : n(v.tomanPer1000), extraCostIqd: 0, note: state.drafts.importNote || 'مرفوعة من ملف', lines });
        state.drafts.importRows = null;
        state.drafts.importNote = '';
        toast(`انضافت ${fmtNum(lines.length)} قطعة كوجبة تجهيز ✓`);
        nav('#/lot/' + lot.id);
      } else {
        state.drafts.importRows = null;
        toast('تحدّثت المنتجات ✓');
        nav('#/products');
      }
    },
  },
});

export { scanBarcode };
