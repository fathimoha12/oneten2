-- ONE TEN: clear every product in one action while preserving order history snapshots.
BEGIN;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS seed_batch TEXT NOT NULL DEFAULT '';
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
END $$;

DELETE FROM products;

COMMIT;

SELECT COUNT(*) AS products_remaining FROM products;
