const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cartKey,
  getProductSizes,
  getSizeStock,
  normalizeWhatsAppNumber,
  safeCartItems,
} = require("../lib/store-utils");

test("safeCartItems normalizes qty and size", () => {
  assert.deepEqual(safeCartItems([{ id: 7, size: "xl", qty: 0 }]), [{ id: 7, size: "XL", qty: 1 }]);
});

test("cartKey keeps different sizes as different product lines", () => {
  assert.notEqual(cartKey({ id: 7, size: "S" }), cartKey({ id: 7, size: "XL" }));
});

test("getProductSizes removes empty stock and uppercases size labels", () => {
  assert.deepEqual(getProductSizes({ product_sizes: [{ size: "s", stock: 4 }, { size: "m", stock: 0 }] }), [
    { size: "S", stock: 4 },
  ]);
});

test("getSizeStock returns selected size stock only", () => {
  const product = { product_sizes: [{ size: "S", stock: 4 }, { size: "XL", stock: 2 }] };
  assert.equal(getSizeStock(product, "xl"), 2);
  assert.equal(getSizeStock(product, "M"), 0);
});

test("normalizeWhatsAppNumber converts Somaliland local number to international format", () => {
  assert.equal(normalizeWhatsAppNumber("0633454984"), "252633454984");
});
