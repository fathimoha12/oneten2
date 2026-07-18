const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CATALOG_ADS,
  CATALOG_BATCH,
  CATALOG_CATEGORIES,
  CATALOG_PRODUCTS,
} = require("../lib/catalog-seed");

test("AI seed contains the complete ONE TEN catalog", () => {
  assert.equal(CATALOG_PRODUCTS.length, 40);
  assert.equal(CATALOG_CATEGORIES.length, 9);
  assert.equal(CATALOG_ADS.length, 4);
  assert.equal(new Set(CATALOG_PRODUCTS.map((product) => product.name)).size, 40);
});

test("every seeded product has four clean panel views and unified size stock", () => {
  CATALOG_PRODUCTS.forEach((product, index) => {
    assert.equal(product.images.length, 4);
    assert.equal(product.image, product.images[0]);
    assert.deepEqual(product.images.map((image) => image.match(/#panel=(\d)$/)?.[1]), ["1", "2", "3", "4"]);
    assert.match(product.image, new RegExp(`product-${String(index + 1).padStart(2, "0")}\\.webp`));
    assert.equal(product.stock, product.product_sizes.reduce((sum, row) => sum + row.stock, 0));
    assert.ok(product.product_sizes.every((row) => row.size && row.stock > 0));
    assert.equal(product.seed_batch, CATALOG_BATCH);
    assert.match(product.contact_sheet_prompt, /no words, no letters, no numbers, no logo/i);
  });
});

test("generated Supabase SQL contains all catalog records and safe clearing", () => {
  const publicDirectory = path.join(__dirname, "..", "public");
  const seedSql = fs.readFileSync(path.join(publicDirectory, "supabase_catalog_seed_40.sql"), "utf8");
  const clearSql = fs.readFileSync(path.join(publicDirectory, "supabase_clear_products.sql"), "utf8");
  CATALOG_PRODUCTS.forEach((product) => assert.ok(seedSql.includes(product.name)));
  assert.match(seedSql, /ON DELETE SET NULL/);
  assert.match(clearSql, /DELETE FROM products;/);
  assert.match(clearSql, /ON DELETE SET NULL/);
});
