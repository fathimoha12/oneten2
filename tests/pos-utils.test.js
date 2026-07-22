const test = require("node:test");
const assert = require("node:assert/strict");
const { customerOrderStatusCopy, normalizeSaleItems, passwordMatches, receiptNumber, securePasswordHash, staffPermissions } = require("../server")._test;

test("POS combines duplicate product and size lines before reserving stock", () => {
  assert.deepEqual(
    normalizeSaleItems([{ id: 7, size: "xl", qty: 2 }, { id: 7, size: "XL", qty: 3 }, { id: 7, size: "s", qty: 1 }]),
    [{ id: 7, size: "XL", qty: 5 }, { id: 7, size: "S", qty: 1 }]
  );
});

test("staff permissions reject unknown keys and require history for void access", () => {
  assert.deepEqual(staffPermissions(["pos.void", "unknown.permission", "inventory.view"]), ["pos.void", "inventory.view", "pos.history"]);
  assert.deepEqual(staffPermissions(["orders.manage"]), ["orders.manage", "orders.view"]);
});

test("POS receipts receive a stable dated sequence", () => {
  assert.equal(receiptNumber(42, "2026-07-20T11:22:00Z"), "POS-20260720-000042");
});

test("customer order notifications describe the current status", () => {
  assert.deepEqual(customerOrderStatusCopy(27, "Packed"), ["Order #27 is packed", "Your products are packed and ready for the next step."]);
  assert.match(customerOrderStatusCopy(27, "Delivered")[0], /completed/);
  assert.match(customerOrderStatusCopy(27, "Cancelled")[1], /cancelled/i);
});

test("staff passwords use salted scrypt and preserve legacy admin verification", () => {
  const stored = securePasswordHash("safe-pass");
  assert.match(stored, /^scrypt\$/);
  assert.equal(passwordMatches("safe-pass", stored), true);
  assert.equal(passwordMatches("wrong-pass", stored), false);
  assert.equal(passwordMatches("oneten", "35b744a8fe1df824c128bffc20a7097ce25b65ae34da5442e1268f70b697b79a"), true);
});
