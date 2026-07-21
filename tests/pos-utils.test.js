const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSaleItems, passwordMatches, receiptNumber, securePasswordHash, staffPermissions } = require("../server")._test;

test("POS combines duplicate product and size lines before reserving stock", () => {
  assert.deepEqual(
    normalizeSaleItems([{ id: 7, size: "xl", qty: 2 }, { id: 7, size: "XL", qty: 3 }, { id: 7, size: "s", qty: 1 }]),
    [{ id: 7, size: "XL", qty: 5 }, { id: 7, size: "S", qty: 1 }]
  );
});

test("staff permissions reject unknown keys and require history for void access", () => {
  assert.deepEqual(staffPermissions(["pos.void", "unknown.permission", "inventory.view"]), ["pos.void", "inventory.view", "pos.history"]);
});

test("POS receipts receive a stable dated sequence", () => {
  assert.equal(receiptNumber(42, "2026-07-20T11:22:00Z"), "POS-20260720-000042");
});

test("staff passwords use salted scrypt and preserve legacy admin verification", () => {
  const stored = securePasswordHash("safe-pass");
  assert.match(stored, /^scrypt\$/);
  assert.equal(passwordMatches("safe-pass", stored), true);
  assert.equal(passwordMatches("wrong-pass", stored), false);
  assert.equal(passwordMatches("oneten", "35b744a8fe1df824c128bffc20a7097ce25b65ae34da5442e1268f70b697b79a"), true);
});
