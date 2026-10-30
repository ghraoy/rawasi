import assert from 'node:assert/strict';
import { buildCatalog, catalogHash, fingerprint } from '../js/web.js';

const photo = 'data:image/jpeg;base64,AAAA';
const db = {
  settings: { storeName: 'متجر رواسي', deliveryFee: 5000, categories: ['سيراميك', 'دينيات'], web: { showSoldOut: true } },
  products: [
    { id: 'p1', name: 'صحن', category: 'سيراميك', price: 25000, photo, notes: 'سري جداً', code: 'C1', compareAt: 30000, webDesc: 'صحن فيروزي', featured: true, createdAt: '2026-10-01' },
    { id: 'p2', name: 'مسبحة', category: 'دينيات', price: 18000, photo, photos: [photo] },
    { id: 'p3', name: 'مخفي', category: 'دينيات', price: 9000, webHide: true },
    { id: 'p4', name: 'بدون سعر', category: 'دينيات', price: 0 },
    { id: 'p5', name: 'نافد', category: 'سيراميك', price: 7000 },
  ],
  lots: [{ id: 'L1', date: '2026-10-20', tomanPer1000: 500000, extraCostIqd: 0, lines: [
    { productId: 'p1', qty: 20, costToman: 4321000 },
    { productId: 'p2', qty: 3, costToman: 1000000 },
  ] }],
  bookings: [{ id: 'b1', status: 'reserved', lines: [{ productId: 'p2', qty: 1, price: 18000 }] }],
  batches: [{ id: 'B1', name: 'نزلة تشرين', date: '2026-10-28', status: 'open', items: [{ productId: 'p1', qty: 5, price: 22000 }] }],
  adjustments: [],
  expenses: [],
};

const { catalog, images } = buildCatalog(db, '2026-10-31T10:00:00.000Z');
const json = JSON.stringify(catalog);

// ما يطلع أي شي داخلي: الكلفة، التومان، الملاحظات، الكود
assert.ok(!/سري|C1|4321000|cost|toman|notes|code/i.test(json), 'تسريب بيانات داخلية');

const ids = catalog.products.map((p) => p.id);
assert.deepEqual(ids.sort(), ['p1', 'p2', 'p5']); // المخفي وبدون سعر ما يظهرون
const p1 = catalog.products.find((p) => p.id === 'p1');
assert.equal(p1.price, 22000); // سعر الدفعة المفتوحة يغلب
assert.equal(p1.was, 30000);
assert.equal(p1.drop, true);
assert.equal(p1.feat, true);
assert.equal(p1.status, 'ok');
assert.equal(p1.max, 10); // حد الطلب الواحد
assert.equal(p1.desc, 'صحن فيروزي');
const p2 = catalog.products.find((p) => p.id === 'p2');
assert.equal(p2.status, 'low'); // 3 وارد - 1 محجوز = 2
assert.equal(p2.left, 2);
assert.equal(p2.imgs.length, 2);
assert.equal(images.size, 1); // نفس الصورة تنرفع مرة وحدة
assert.equal(catalog.products.find((p) => p.id === 'p5').status, 'out');
assert.equal(catalog.drop.name, 'نزلة تشرين');
assert.deepEqual(catalog.categories, ['سيراميك', 'دينيات']);

// إخفاء النافد
const hideOut = buildCatalog({ ...db, settings: { ...db.settings, web: { showSoldOut: false } } }, '2026-10-31T10:00:00.000Z').catalog;
assert.ok(!hideOut.products.some((p) => p.id === 'p5'));

// البصمة ما تتغير بتغير وقت النشر فقط
const again = buildCatalog(db, '2026-11-02T10:00:00.000Z').catalog;
assert.equal(catalogHash(again), catalogHash(catalog));
assert.notEqual(fingerprint('a'), fingerprint('b'));

console.log('web tests passed ✓');
