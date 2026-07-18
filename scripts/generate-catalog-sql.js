const fs = require("fs");
const path = require("path");
const {
  CATALOG_ADS,
  CATALOG_BATCH,
  CATALOG_CATEGORIES,
  CATALOG_PRODUCTS,
} = require("../lib/catalog-seed");

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonValue(value) {
  return `${sqlValue(JSON.stringify(value))}::jsonb`;
}

const migration = `ALTER TABLE categories ADD COLUMN IF NOT EXISTS seed_batch TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS seed_batch TEXT NOT NULL DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS seed_batch TEXT NOT NULL DEFAULT '';
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_items_product_id_fkey'
      AND conrelid = 'order_items'::regclass
  ) THEN
    ALTER TABLE order_items DROP CONSTRAINT order_items_product_id_fkey;
  END IF;
  ALTER TABLE order_items
    ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
END $$;`;

const categoryRows = CATALOG_CATEGORIES.map((category) => `(
  ${sqlValue(category.name)},
  ${sqlValue(category.description)},
  ${sqlValue(category.price_mode)},
  ${sqlValue(category.sort_order)},
  ${sqlValue(CATALOG_BATCH)},
  NOW()
)`).join(",\n");

const productRows = CATALOG_PRODUCTS.map((product) => `(
  (SELECT id FROM categories WHERE name = ${sqlValue(CATALOG_CATEGORIES.find((category) => category.key === product.category_key).name)} LIMIT 1),
  ${sqlValue(product.name)},
  ${sqlValue(product.price)},
  ${sqlValue(product.old_price)},
  ${sqlValue(product.badge)},
  ${sqlValue(product.rating)},
  ${sqlValue(product.stock)},
  ${jsonValue(product.product_sizes)},
  ${sqlValue(product.image)},
  ${jsonValue(product.images)},
  ${sqlValue(product.crop)},
  ${sqlValue(product.description)},
  ${sqlValue(product.ai_type)},
  ${jsonValue(product.ai_images)},
  ${jsonValue(product.ai_prompts)},
  ${product.stock > 0 ? "TRUE" : "FALSE"},
  ${sqlValue(CATALOG_BATCH)},
  NOW()
)`).join(",\n");

const adRows = CATALOG_ADS.map((ad) => `(
  ${sqlValue(ad.title)},
  ${sqlValue(ad.subtitle)},
  ${sqlValue(ad.button_text)},
  ${sqlValue(ad.link)},
  ${sqlValue(ad.image)},
  ${ad.active ? "TRUE" : "FALSE"},
  ${sqlValue(ad.sort_order)},
  ${sqlValue(CATALOG_BATCH)},
  NOW()
)`).join(",\n");

const seedSql = `-- ONE TEN AI catalog: 40 products, 9 categories, and 4 landing ads.
-- Run once in Supabase SQL Editor. Re-running safely refreshes only this seed batch.
BEGIN;

${migration}

DELETE FROM products WHERE seed_batch = ${sqlValue(CATALOG_BATCH)};
DELETE FROM ads WHERE seed_batch = ${sqlValue(CATALOG_BATCH)};

INSERT INTO categories (name, description, price_mode, sort_order, seed_batch, created_at)
VALUES
${categoryRows}
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  price_mode = EXCLUDED.price_mode,
  sort_order = EXCLUDED.sort_order,
  seed_batch = CASE
    WHEN categories.seed_batch = '' THEN EXCLUDED.seed_batch
    ELSE categories.seed_batch
  END;

INSERT INTO products (
  category_id, name, price, old_price, badge, rating, stock, product_sizes,
  image, images, crop, description, ai_type, ai_images, ai_prompts,
  active, seed_batch, created_at
)
VALUES
${productRows};

INSERT INTO ads (
  title, subtitle, button_text, link, image, active, sort_order, seed_batch, created_at
)
VALUES
${adRows};

COMMIT;

SELECT
  (SELECT COUNT(*) FROM products WHERE seed_batch = ${sqlValue(CATALOG_BATCH)}) AS products_added,
  (SELECT COUNT(*) FROM categories WHERE seed_batch = ${sqlValue(CATALOG_BATCH)}) AS seeded_categories,
  (SELECT COUNT(*) FROM ads WHERE seed_batch = ${sqlValue(CATALOG_BATCH)}) AS ads_added;
`;

const clearSql = `-- ONE TEN: clear every product in one action while preserving order history snapshots.
BEGIN;

${migration}

DELETE FROM products;

COMMIT;

SELECT COUNT(*) AS products_remaining FROM products;
`;

const publicDirectory = path.join(__dirname, "..", "public");
fs.writeFileSync(path.join(publicDirectory, "supabase_catalog_seed_40.sql"), seedSql, "utf8");
fs.writeFileSync(path.join(publicDirectory, "supabase_clear_products.sql"), clearSql, "utf8");

console.log(`Generated catalog SQL with ${CATALOG_PRODUCTS.length} products, ${CATALOG_CATEGORIES.length} categories, and ${CATALOG_ADS.length} ads.`);
