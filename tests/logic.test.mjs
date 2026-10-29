import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { merge } from '../js/store.js';

// سعر الصرف: 500,000 تومان مقابل 1000 دينار (رقم تجريبي فقط)
assert.equal(L.tomanToIqd(1_000_000, 500_000), 2000);
assert.equal(L.rateFromTotals(10_000_000, 20_000), 500_000);

const db = {
  products: [
    { id: 'p1', name: 'صحن', price: 25000 },
    { id: 'p2', name: 'مسبحة', price: 18000 },
  ],
  lots: [
    // الوجبة الأولى: الصحن بكلفة 10,000 دينار، مصاريف نقل 4,000 توزع حسب القيمة
    { id: 'L1', date: '2026-09-01', tomanPer1000: 500_000, extraCostIqd: 4000, lines: [
      { productId: 'p1', qty: 2, costToman: 5_000_000 }, // 10,000 د.ع للقطعة
      { productId: 'p2', qty: 4, costToman: 2_500_000 }, // 5,000 د.ع للقطعة
    ] },
    // الوجبة الثانية: الصحن صار أغلى
    { id: 'L2', date: '2026-10-01', tomanPer1000: 400_000, extraCostIqd: 0, lines: [
      { productId: 'p1', qty: 3, costToman: 5_000_000 }, // 12,500 د.ع
    ] },
  ],
  adjustments: [{ id: 'a1', productId: 'p2', qty: -1, date: '2026-09-05', reason: 'تالف' }],
  bookings: [
    { id: 'b1', status: 'delivered', date: '2026-10-10', shippedAt: '2026-10-10', lines: [{ productId: 'p1', qty: 3, price: 25000, discType: 'amt', disc: 5000 }], orderDiscount: 0, deliveryFee: 5000 },
    { id: 'b2', status: 'reserved', date: '2026-10-12', lines: [{ productId: 'p1', qty: 1, price: 25000 }, { productId: 'p2', qty: 2, price: 18000, discType: 'pct', disc: 10 }], orderDiscount: 1000 },
    { id: 'b3', status: 'cancelled', date: '2026-10-12', lines: [{ productId: 'p1', qty: 5, price: 25000 }] },
  ],
  batches: [],
  expenses: [{ id: 'e1', date: '2026-10-05', amount: 3000, category: 'تغليف' }],
};

// توزيع المصاريف: القيمة الأساسية 20,000 + 20,000 = 40,000، كل سطر ياخذ نص الـ 4,000
const br = L.lotBreakdown(db.lots[0]);
assert.equal(br[0].unitCost, 11000); // 10,000 + 2,000/2
assert.equal(br[1].unitCost, 5500); // 5,000 + 2,000/4

const inv = L.computeInventory(db);
const p1 = inv.items.p1;
assert.equal(p1.received, 5);
assert.equal(p1.sold, 3);
assert.equal(p1.stock, 2);
assert.equal(p1.reserved, 1);
assert.equal(p1.available, 1);
// FIFO: قطعتين من الوجبة الأولى (11,000) + وحدة من الثانية (12,500)
assert.equal(inv.bookingCost.b1.total, 11000 * 2 + 12500);
const p2 = inv.items.p2;
assert.equal(p2.stock, 3);
assert.equal(p2.available, 1);

// الخصومات
const t2 = L.bookingTotals(db.bookings[1]);
assert.equal(t2.gross, 25000 + 36000);
assert.equal(t2.lineDiscounts, 3600);
assert.equal(t2.itemsNet, 61000 - 3600 - 1000);

const rep = L.report(db, inv, '2026-10-01', '2026-10-31');
assert.equal(rep.revenue, 70000);
assert.equal(rep.cost, 34500);
assert.equal(rep.grossProfit, 35500);
assert.equal(rep.expenses, 3000);
assert.equal(rep.netProfit, 32500);
assert.equal(rep.discounts, 5000);

// الدمج: الأحدث يفوز، والحذف ينتقل
const m = merge(
  { products: [{ id: 'x', name: 'قديم', updatedAt: '2026-01-01' }, { id: 'y', name: 'باقي', updatedAt: '2026-01-01' }] },
  { products: [{ id: 'x', name: 'جديد', updatedAt: '2026-02-01' }, { id: 'y', deleted: true, updatedAt: '2026-03-01' }] },
);
assert.equal(m.products.find((p) => p.id === 'x').name, 'جديد');
assert.equal(m.products.find((p) => p.id === 'y').deleted, true);

console.log('كل الاختبارات نجحت ✓');
