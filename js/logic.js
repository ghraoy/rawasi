// منطق المتجر: المخزن حسب الوجبات (FIFO)، التومان، الخصومات، التقارير.
// دوال صافية لا تلمس الواجهة ولا التخزين، حتى تُختبر بسهولة.

export const STATUSES = {
  reserved: { label: 'محجوز', bg: '#F8EBD3', fg: '#8A5A0B' },
  confirmed: { label: 'مؤكد', bg: '#DCEBE8', fg: '#0E6B66' },
  shipped: { label: 'مُرسل', bg: '#E0E9F5', fg: '#2B5A9A' },
  delivered: { label: 'مُستلم', bg: '#E1EFE2', fg: '#2F6B3A' },
  cancelled: { label: 'ملغي', bg: '#ECEAE5', fg: '#5E6869' },
};
export const STATUS_ORDER = ['reserved', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export const isReservedStatus = (s) => s === 'reserved' || s === 'confirmed';
export const isShippedStatus = (s) => s === 'shipped' || s === 'delivered';

export const live = (arr) => (arr || []).filter((r) => r && !r.deleted);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const round = (n) => Math.round(num(n));

export function fmtIQD(n) {
  return round(n).toLocaleString('en-US') + ' د.ع';
}
export function fmtNum(n) {
  return round(n).toLocaleString('en-US');
}

// ---------- التومان وسعر الصرف ----------
// سعر الصرف يُخزن كـ "كم تومان مقابل 1000 دينار".
export function tomanToIqd(toman, tomanPer1000) {
  const r = num(tomanPer1000);
  if (r <= 0) return 0;
  return (num(toman) * 1000) / r;
}

// إذا أعطى المستخدم مجموع ما دفعه بالدينار، نستخرج سعر الصرف من مجموع التومان.
export function rateFromTotals(totalToman, totalIqdPaid) {
  const iqd = num(totalIqdPaid);
  if (iqd <= 0) return 0;
  return (num(totalToman) / iqd) * 1000;
}

export function lotTotalToman(lot) {
  return (lot.lines || []).reduce((s, l) => s + num(l.costToman) * num(l.qty), 0);
}

// يحسب كلفة القطعة الواحدة بالدينار لكل سطر في الوجبة، بعد توزيع المصاريف الإضافية
// (نقل، كمرك…) على القطع حسب قيمتها.
export function lotBreakdown(lot) {
  const rate = num(lot.tomanPer1000);
  const lines = (lot.lines || []).map((l) => {
    const qty = num(l.qty);
    const baseUnit = l.costIqd != null && l.costIqd !== '' && num(l.costIqd) > 0
      ? num(l.costIqd)
      : tomanToIqd(l.costToman, rate);
    return { ...l, qty, baseUnit, baseTotal: baseUnit * qty };
  });
  const totalBase = lines.reduce((s, l) => s + l.baseTotal, 0);
  const extra = num(lot.extraCostIqd);
  return lines.map((l) => {
    const share = totalBase > 0 ? (l.baseTotal / totalBase) * extra : 0;
    const extraUnit = l.qty > 0 ? share / l.qty : 0;
    return { ...l, extraUnit, unitCost: l.baseUnit + extraUnit, lineCost: l.baseTotal + share };
  });
}

export function lotTotals(lot) {
  const lines = lotBreakdown(lot);
  return {
    toman: lotTotalToman(lot),
    qty: lines.reduce((s, l) => s + l.qty, 0),
    cost: lines.reduce((s, l) => s + l.lineCost, 0),
  };
}

// ---------- الحجوزات والخصومات ----------
export function lineTotals(line) {
  const qty = num(line.qty);
  const price = num(line.price);
  const gross = qty * price;
  let discount = 0;
  if (line.discType === 'pct') discount = (gross * num(line.disc)) / 100;
  else discount = num(line.disc);
  discount = Math.min(Math.max(discount, 0), gross);
  return { qty, price, gross, discount, net: gross - discount };
}

export function bookingTotals(b) {
  const lines = (b.lines || []).map(lineTotals);
  const gross = lines.reduce((s, l) => s + l.gross, 0);
  const lineDiscounts = lines.reduce((s, l) => s + l.discount, 0);
  const afterLines = gross - lineDiscounts;
  const orderDiscount = Math.min(Math.max(num(b.orderDiscount), 0), afterLines);
  const itemsNet = afterLines - orderDiscount;
  const delivery = num(b.deliveryFee);
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  return { lines, gross, lineDiscounts, orderDiscount, discounts: lineDiscounts + orderDiscount, itemsNet, delivery, total: itemsNet + delivery, qty };
}

// ---------- المخزن (FIFO حسب الوجبات) ----------
// نعيد تشغيل كل الحركات بالترتيب الزمني: وارد الوجبات، التعديلات، والقطع المرسلة.
// هكذا كلفة كل بيعة تُحسب من الوجبة الأقدم المتبقية، والأرقام ما تنحرف أبداً.
export function computeInventory(db) {
  const products = live(db.products);
  const inv = {};
  for (const p of products) {
    inv[p.id] = { productId: p.id, received: 0, sold: 0, adjusted: 0, stock: 0, reserved: 0, available: 0, lastUnitCost: 0, queue: [], negative: false };
  }
  const ensure = (id) => {
    if (!inv[id]) inv[id] = { productId: id, received: 0, sold: 0, adjusted: 0, stock: 0, reserved: 0, available: 0, lastUnitCost: 0, queue: [], negative: false, orphan: true };
    return inv[id];
  };

  const events = [];
  for (const lot of live(db.lots)) {
    lotBreakdown(lot).forEach((l, idx) => {
      if (!l.productId || l.qty <= 0) return;
      events.push({ t: lot.date || lot.createdAt || '', order: 0, kind: 'in', productId: l.productId, qty: l.qty, unitCost: l.unitCost, lotId: lot.id, lineIdx: idx });
    });
  }
  for (const a of live(db.adjustments)) {
    const q = num(a.qty);
    if (!a.productId || q === 0) continue;
    events.push({ t: a.date || a.createdAt || '', order: 1, kind: q > 0 ? 'adjIn' : 'adjOut', productId: a.productId, qty: Math.abs(q), adjId: a.id });
  }
  const bookingCost = {};
  for (const b of live(db.bookings)) {
    if (!isShippedStatus(b.status)) continue;
    (b.lines || []).forEach((l, idx) => {
      const q = num(l.qty);
      if (!l.productId || q <= 0) return;
      events.push({ t: b.shippedAt || b.date || b.createdAt || '', order: 2, kind: 'out', productId: l.productId, qty: q, bookingId: b.id, lineIdx: idx });
    });
  }
  events.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : x.order - y.order));

  const take = (it, qty) => {
    let need = qty;
    let cost = 0;
    while (need > 0 && it.queue.length) {
      const head = it.queue[0];
      const used = Math.min(head.remaining, need);
      cost += used * head.unitCost;
      head.remaining -= used;
      need -= used;
      if (head.remaining <= 0) it.queue.shift();
    }
    if (need > 0) {
      // بيع أكثر من الوارد المسجل: نحسب على آخر كلفة معروفة ونعلّم المنتج.
      cost += need * it.lastUnitCost;
      it.negative = true;
    }
    return cost;
  };

  for (const e of events) {
    const it = ensure(e.productId);
    if (e.kind === 'in') {
      it.queue.push({ lotId: e.lotId, remaining: e.qty, qty: e.qty, unitCost: e.unitCost, date: e.t });
      it.received += e.qty;
      it.lastUnitCost = e.unitCost;
    } else if (e.kind === 'adjIn') {
      const unit = avgQueueCost(it) || it.lastUnitCost;
      it.queue.push({ lotId: null, remaining: e.qty, qty: e.qty, unitCost: unit, date: e.t });
      it.adjusted += e.qty;
    } else if (e.kind === 'adjOut') {
      take(it, e.qty);
      it.adjusted -= e.qty;
    } else if (e.kind === 'out') {
      const cost = take(it, e.qty);
      it.sold += e.qty;
      bookingCost[e.bookingId] = bookingCost[e.bookingId] || { total: 0, lines: {} };
      bookingCost[e.bookingId].total += cost;
      bookingCost[e.bookingId].lines[e.lineIdx] = cost;
    }
  }

  for (const b of live(db.bookings)) {
    if (!isReservedStatus(b.status)) continue;
    for (const l of b.lines || []) {
      if (!l.productId) continue;
      ensure(l.productId).reserved += num(l.qty);
    }
  }

  for (const it of Object.values(inv)) {
    it.stock = it.received + it.adjusted - it.sold;
    it.available = it.stock - it.reserved;
    it.avgCost = avgQueueCost(it) || it.lastUnitCost;
    it.stockValue = it.queue.reduce((s, q) => s + q.remaining * q.unitCost, 0);
  }
  return { items: inv, bookingCost };
}

function avgQueueCost(it) {
  const qty = it.queue.reduce((s, q) => s + q.remaining, 0);
  if (qty <= 0) return 0;
  return it.queue.reduce((s, q) => s + q.remaining * q.unitCost, 0) / qty;
}

// تاريخ كلفة منتج عبر الوجبات (لصفحة المنتج).
export function productCostHistory(db, productId) {
  const out = [];
  for (const lot of live(db.lots)) {
    lotBreakdown(lot).forEach((l) => {
      if (l.productId === productId) out.push({ lotId: lot.id, lotName: lot.name, date: lot.date, qty: l.qty, costToman: num(l.costToman), unitCost: l.unitCost, rate: num(lot.tomanPer1000) });
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function stockLevel(it, minStock) {
  const min = minStock == null || minStock === '' ? 2 : num(minStock);
  if (!it || it.available <= 0) return 'out';
  if (it.available <= min) return 'low';
  return 'ok';
}

// ---------- الدفعات (نشر الإنستقرام) ----------
export function batchStats(db, batch) {
  const bookings = live(db.bookings).filter((b) => b.batchId === batch.id && b.status !== 'cancelled');
  const per = {};
  for (const item of batch.items || []) {
    per[item.productId] = { productId: item.productId, allocated: num(item.qty), price: item.price, reserved: 0, sold: 0 };
  }
  for (const b of bookings) {
    for (const l of b.lines || []) {
      const row = per[l.productId] || (per[l.productId] = { productId: l.productId, allocated: 0, reserved: 0, sold: 0, extra: true });
      if (isShippedStatus(b.status)) row.sold += num(l.qty);
      else row.reserved += num(l.qty);
    }
  }
  const rows = Object.values(per).map((r) => ({ ...r, remaining: Math.max(r.allocated - r.reserved - r.sold, 0) }));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const revenue = bookings.reduce((s, b) => s + bookingTotals(b).itemsNet, 0);
  return { rows, allocated: sum('allocated'), reserved: sum('reserved'), sold: sum('sold'), remaining: sum('remaining'), bookings: bookings.length, revenue };
}

export function priceListText(db, batch, settings = {}) {
  const products = Object.fromEntries(live(db.products).map((p) => [p.id, p]));
  const lines = (batch.items || [])
    .filter((i) => products[i.productId])
    .map((i, n) => {
      const p = products[i.productId];
      const price = num(i.price) > 0 ? num(i.price) : num(p.price);
      return `${n + 1}. ${p.name} — ${fmtNum(price)} د.ع${num(i.qty) > 0 ? ` (الكمية ${fmtNum(i.qty)})` : ''}`;
    });
  const header = settings.storeName ? `${settings.storeName} — ${batch.name || ''}`.trim() : batch.name || '';
  return [header, '', ...lines, '', 'الحجز بالخاص حسب الأسبقية: القطع + الاسم + العنوان + رقم الهاتف'].join('\n').trim();
}

// ---------- التقارير ----------
export function inRange(iso, from, to) {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
}

export function report(db, inv, from, to) {
  const products = Object.fromEntries(live(db.products).map((p) => [p.id, p]));
  const shipped = live(db.bookings).filter((b) => isShippedStatus(b.status) && inRange(b.shippedAt || b.date, from, to));
  let revenue = 0, cost = 0, discounts = 0, delivery = 0, pieces = 0;
  const byProduct = {};
  const byDay = {};
  for (const b of shipped) {
    const t = bookingTotals(b);
    const c = inv.bookingCost[b.id] || { total: 0, lines: {} };
    revenue += t.itemsNet;
    cost += c.total;
    discounts += t.discounts;
    delivery += t.delivery;
    pieces += t.qty;
    const day = (b.shippedAt || b.date || '').slice(0, 10);
    byDay[day] = byDay[day] || { revenue: 0, profit: 0 };
    byDay[day].revenue += t.itemsNet;
    byDay[day].profit += t.itemsNet - c.total;
    // توزيع خصم الحجز الكلي على السطور حسب قيمتها
    const afterLines = t.gross - t.lineDiscounts;
    t.lines.forEach((l, idx) => {
      const pid = b.lines[idx].productId;
      const orderShare = afterLines > 0 ? (l.net / afterLines) * t.orderDiscount : 0;
      const net = l.net - orderShare;
      const row = byProduct[pid] || (byProduct[pid] = { productId: pid, name: products[pid]?.name || 'منتج محذوف', qty: 0, revenue: 0, cost: 0 });
      row.qty += l.qty;
      row.revenue += net;
      row.cost += c.lines[idx] || 0;
    });
  }
  const expenses = live(db.expenses).filter((e) => inRange(e.date, from, to));
  const expensesTotal = expenses.reduce((s, e) => s + num(e.amount), 0);
  const expensesByCat = {};
  for (const e of expenses) expensesByCat[e.category || 'أخرى'] = (expensesByCat[e.category || 'أخرى'] || 0) + num(e.amount);
  const purchases = live(db.lots).filter((l) => inRange(l.date, from, to)).reduce((s, l) => s + lotTotals(l).cost, 0);
  const top = Object.values(byProduct).map((r) => ({ ...r, profit: r.revenue - r.cost })).sort((a, b) => b.qty - a.qty);
  return {
    orders: shipped.length, pieces, revenue, cost, grossProfit: revenue - cost, discounts, delivery,
    expenses: expensesTotal, expensesByCat, netProfit: revenue - cost - expensesTotal, purchases, top, byDay,
  };
}

// ---------- الزبائن ----------
export function customers(db) {
  const map = {};
  for (const b of live(db.bookings)) {
    const c = b.customer || {};
    const key = (c.phone || '').replace(/\D/g, '') || (c.name || '').trim();
    if (!key) continue;
    const row = map[key] || (map[key] = { key, name: c.name, phone: c.phone, gov: c.gov, address: c.address, ig: c.ig, orders: 0, spent: 0, last: '', bookings: [] });
    row.name = c.name || row.name;
    row.gov = c.gov || row.gov;
    row.address = c.address || row.address;
    row.ig = c.ig || row.ig;
    row.bookings.push(b.id);
    if (b.status !== 'cancelled') {
      row.orders += 1;
      row.spent += bookingTotals(b).itemsNet;
    }
    if ((b.date || '') > row.last) row.last = b.date || '';
  }
  return Object.values(map).sort((a, b) => (a.last < b.last ? 1 : -1));
}

// ---------- ملخص للذكاء الاصطناعي ----------
export function aiSummary(db, inv, todayIso) {
  const today = todayIso.slice(0, 10);
  const d60 = new Date(new Date(today).getTime() - 60 * 864e5).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const r60 = report(db, inv, d60, today);
  const rMonth = report(db, inv, monthStart, today);
  const sales60 = Object.fromEntries(r60.top.map((t) => [t.productId, t.qty]));
  return {
    today,
    products: live(db.products).map((p) => {
      const it = inv.items[p.id] || {};
      return { name: p.name, category: p.category, price: num(p.price), stock: it.stock || 0, reserved: it.reserved || 0, available: it.available || 0, avgCost: round(it.avgCost || 0), sold60d: sales60[p.id] || 0 };
    }),
    month: { revenue: round(rMonth.revenue), grossProfit: round(rMonth.grossProfit), expenses: round(rMonth.expenses), netProfit: round(rMonth.netProfit), orders: rMonth.orders, discounts: round(rMonth.discounts) },
    last60days: { revenue: round(r60.revenue), grossProfit: round(r60.grossProfit), orders: r60.orders },
    openBookings: live(db.bookings).filter((b) => isReservedStatus(b.status)).length,
  };
}
