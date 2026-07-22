const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const { Pool } = require("pg");
const { CATALOG_ADS, CATALOG_BATCH, CATALOG_CATEGORIES, CATALOG_PRODUCTS } = require("./lib/catalog-seed");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4181);
const HOST = process.env.HOST || "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const SECRET_SETTING_KEYS = new Set(["openai_api_key"]);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 140);
const rateBuckets = new Map();
const STAFF_PERMISSION_CATALOG = [
  { key: "pos.sell", label: "Create in-store sales", group: "Point of Sale" },
  { key: "pos.history", label: "View POS sale history and receipts", group: "Point of Sale" },
  { key: "pos.void", label: "Void a POS sale and restore stock", group: "Point of Sale" },
  { key: "inventory.view", label: "View products and stock", group: "Store Access" },
  { key: "orders.view", label: "View online customer orders", group: "Store Access" },
  { key: "orders.manage", label: "Update online order status", group: "Store Access" },
  { key: "customers.view", label: "View registered customers", group: "Store Access" },
  { key: "reports.view", label: "View sales totals and reports", group: "Store Access" },
];
const STAFF_PERMISSION_KEYS = new Set(STAFF_PERMISSION_CATALOG.map((item) => item.key));
const DEFAULT_STAFF_PERMISSIONS = ["pos.sell", "pos.history", "inventory.view"];

if (!DATABASE_URL.trim()) {
  console.warn("DATABASE_URL is missing. Add your Supabase/Postgres connection string on Render.");
}

function normalizeDatabaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    ["sslmode", "sslcert", "sslkey", "sslrootcert"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return raw;
  }
}

const DB_CONNECTION_STRING = normalizeDatabaseUrl(DATABASE_URL);
const DB_SSL = DB_CONNECTION_STRING && process.env.PGSSL !== "false"
  ? { rejectUnauthorized: false }
  : undefined;

const pool = new Pool({
  connectionString: DB_CONNECTION_STRING,
  ssl: DB_SSL,
  max: Number(process.env.PG_POOL_MAX || 6),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

let databaseStartupError = "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function securePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function passwordMatches(password, storedHash) {
  const stored = String(storedHash || "");
  if (!stored.startsWith("scrypt$")) return hashPassword(password) === stored;
  const [, salt, expectedHex] = stored.split("$");
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(String(password || ""), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function token() {
  return crypto.randomBytes(24).toString("hex");
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return !["", "0", "false", "no", "off"].includes(value.toLowerCase());
  return !!value;
}

function jsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "object") return Array.isArray(value) ? value : [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function staffPermissions(value) {
  const permissions = [...new Set(jsonList(value).map((item) => String(item || "").trim()).filter((item) => STAFF_PERMISSION_KEYS.has(item)))];
  if (permissions.includes("pos.void") && !permissions.includes("pos.history")) permissions.push("pos.history");
  if (permissions.includes("orders.manage") && !permissions.includes("orders.view")) permissions.push("orders.view");
  return permissions;
}

function publicStaffRecord(staff) {
  if (!staff) return null;
  return {
    id: staff.id,
    name: staff.name,
    username: staff.username,
    role: staff.role || "Receptionist",
    permissions: staffPermissions(staff.permissions),
    active: toBool(staff.active),
    created_at: staff.created_at,
    updated_at: staff.updated_at,
    last_login_at: staff.last_login_at || "",
  };
}

function productImageList(data = {}) {
  const rawImages = jsonList(data.images);
  const images = rawImages.map((item) => String(item || "").trim()).filter(Boolean);
  const primary = String(data.image || "").trim();
  if (primary) images.unshift(primary);
  return [...new Set(images)].filter(Boolean).length ? [...new Set(images)].filter(Boolean) : ["assets/ai-products.png"];
}

function productSizes(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value && value.product_sizes)
      ? value.product_sizes
      : jsonList(value && value.product_sizes);
  const clean = new Map();
  source.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const size = String(item.size || "").trim().toUpperCase();
    const stock = Math.max(0, Number.parseInt(item.stock || 0, 10) || 0);
    if (size) clean.set(size, (clean.get(size) || 0) + stock);
  });
  const rows = [...clean.entries()].map(([size, stock]) => ({ size, stock }));
  if (rows.length) return rows;
  const hasFallbackStock = !Array.isArray(value) && value && typeof value === "object" && value.stock !== undefined;
  return hasFallbackStock
    ? [{ size: "ONE SIZE", stock: Math.max(0, Number.parseInt(value.stock || 0, 10) || 0) }]
    : [];
}

function productTotalStock(sizeRows, fallback = 0) {
  return sizeRows.length ? sizeRows.reduce((sum, item) => sum + Number(item.stock || 0), 0) : Math.max(0, Number.parseInt(fallback || 0, 10) || 0);
}

function publicSizeRows(sizeRows) {
  return sizeRows.filter((item) => Number(item.stock || 0) > 0);
}

function publicProductRecord(product, full = false) {
  if (!product) return null;
  const sizes = publicSizeRows(productSizes(product));
  if (productSizes(product).length && !sizes.length) return null;
  const gallery = jsonList(product.ai_images).length ? jsonList(product.ai_images) : productImageList(product);
  const image = gallery[0] || "assets/ai-products.png";
  const clean = {
    id: product.id,
    category_id: product.category_id,
    category: product.category,
    name: product.name,
    price: Number(product.price),
    old_price: product.old_price === null || product.old_price === undefined ? null : Number(product.old_price),
    badge: product.badge || "",
    rating: product.rating || "4.8",
    stock: productTotalStock(sizes, product.stock),
    product_sizes: sizes,
    image,
    images: [image],
    crop: product.crop || "center",
    description: product.description || "",
    active: product.active,
  };
  if (full) {
    clean.images = gallery;
    clean.ai_images = jsonList(product.ai_images);
    clean.ai_prompts = jsonList(product.ai_prompts);
    clean.ai_type = product.ai_type || "top";
  }
  return clean;
}

function adminProductRecord(product) {
  const sizes = productSizes(product);
  const gallery = jsonList(product.ai_images).length ? jsonList(product.ai_images) : productImageList(product);
  return {
    ...product,
    price: Number(product.price),
    old_price: product.old_price === null || product.old_price === undefined ? null : Number(product.old_price),
    product_sizes: sizes,
    stock: productTotalStock(sizes, product.stock),
    images: gallery,
    image: gallery[0] || "assets/ai-products.png",
    ai_images: jsonList(product.ai_images),
    ai_prompts: jsonList(product.ai_prompts),
  };
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").trim();
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function getAuthToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.replace("Bearer ", "").trim();
  const cookies = parseCookies(req);
  return cookies.staffToken || cookies.adminToken || cookies.customerToken || "";
}

function sessionCookie(name, value) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax${secure}`;
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
}

function rateLimitError(req, pathname) {
  if (req.method === "OPTIONS" || pathname === "/api/health") return null;
  const nowMs = Date.now();
  const bucketKey = `${clientIp(req)}:${pathname}`;
  const current = rateBuckets.get(bucketKey) || { count: 0, resetAt: nowMs + RATE_LIMIT_WINDOW_MS };
  if (nowMs > current.resetAt) {
    current.count = 0;
    current.resetAt = nowMs + RATE_LIMIT_WINDOW_MS;
  }
  current.count += 1;
  rateBuckets.set(bucketKey, current);
  if (rateBuckets.size > 5000) {
    for (const [key, bucket] of rateBuckets.entries()) {
      if (nowMs > bucket.resetAt) rateBuckets.delete(key);
    }
  }
  return current.count > RATE_LIMIT_MAX ? { status: 429, error: "Too many requests. Please try again shortly." } : null;
}

function originError(req) {
  if (!["POST", "PUT", "DELETE"].includes(req.method)) return null;
  const origin = req.headers.origin;
  if (!origin) return null;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  try {
    return new URL(origin).host === host ? null : { status: 403, error: "Request origin is not allowed" };
  } catch {
    return { status: 403, error: "Request origin is not allowed" };
  }
}

function cleanText(value, max = 240) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function cleanEmail(value) {
  return cleanText(value, 180).toLowerCase();
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

async function withClient(callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function initDb() {
  if (!DATABASE_URL.trim()) return;
  if (process.env.INIT_DB_ON_START !== "1") {
    await ensureRuntimeSchema();
    return;
  }
  const schemaPath = path.join(ROOT, "supabase_schema.sql");
  if (fs.existsSync(schemaPath)) {
    await query(fs.readFileSync(schemaPath, "utf8"));
  }
  await ensureRuntimeSchema();
}

async function ensureRuntimeSchema() {
  await query("SELECT 1");
  await query(
    `CREATE TABLE IF NOT EXISTS staff_users (
       id bigint generated by default as identity primary key,
       name text not null,
       username text unique not null,
       password_hash text not null,
       role text default 'Receptionist',
       permissions jsonb default '[]'::jsonb,
       active boolean default true,
       created_by bigint references admin_users(id) on delete set null,
       created_at text not null,
       updated_at text not null,
       last_login_at text
     )`
  );
  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS product_sizes jsonb DEFAULT '[]'::jsonb");
  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS seed_batch text DEFAULT ''");
  await query("ALTER TABLE categories ADD COLUMN IF NOT EXISTS seed_batch text DEFAULT ''");
  await query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS seed_batch text DEFAULT ''");
  await query("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size text DEFAULT ''");
  await query("ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL");
  await query("ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id bigint REFERENCES staff_users(id) ON DELETE SET NULL");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text DEFAULT 'online'");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_channel text DEFAULT 'website'");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch text DEFAULT 'Online Store'");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_number text");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT ''");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'Pending'");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount numeric(10,2) DEFAULT 0");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) DEFAULT 0");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_due numeric(10,2) DEFAULT 0");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo text DEFAULT ''");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text DEFAULT ''");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_at text");
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_by bigint REFERENCES staff_users(id) ON DELETE SET NULL");
  await query(
    `CREATE TABLE IF NOT EXISTS inventory_movements (
       id bigint generated by default as identity primary key,
       product_id bigint references products(id) on delete set null,
       product_name text default '',
       size text default '',
       quantity_delta integer not null,
       movement_type text not null,
       reference_type text default '',
       reference_id bigint,
       performed_by_type text default '',
       performed_by_id bigint,
       performed_by_name text default '',
       note text default '',
       created_at text not null
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS notifications (
       id bigint generated by default as identity primary key,
       recipient_type text not null,
       recipient_id bigint not null,
       order_id bigint references orders(id) on delete cascade,
       notification_type text default 'order_update',
       title text not null,
       message text not null,
       link text default '',
       read_at text,
       created_at text not null
     )`
  );
  await query(
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'order_items_product_id_fkey'
           AND conrelid = 'order_items'::regclass
           AND confdeltype <> 'n'
       ) THEN
         ALTER TABLE order_items DROP CONSTRAINT order_items_product_id_fkey;
       END IF;
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'order_items_product_id_fkey'
           AND conrelid = 'order_items'::regclass
       ) THEN
         ALTER TABLE order_items
           ADD CONSTRAINT order_items_product_id_fkey
           FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
       END IF;
     END $$`
  );
  await query(
    `UPDATE products
     SET product_sizes = jsonb_build_array(jsonb_build_object('size', 'ONE SIZE', 'stock', GREATEST(COALESCE(stock, 0), 0)))
     WHERE product_sizes IS NULL OR product_sizes = '[]'::jsonb`
  );
  await query(
    `WITH inventory_totals AS (
       SELECT p.id, COALESCE(SUM(GREATEST(0, COALESCE((item->>'stock')::integer, 0))), 0)::integer AS total
       FROM products p
       LEFT JOIN LATERAL jsonb_array_elements(p.product_sizes) AS item ON true
       GROUP BY p.id
     )
     UPDATE products p
     SET stock = inventory_totals.total
     FROM inventory_totals
     WHERE p.id = inventory_totals.id AND p.stock IS DISTINCT FROM inventory_totals.total`
  );
  await query("UPDATE products SET active = false WHERE stock <= 0 AND active = true");
  await query("UPDATE orders SET source = 'online' WHERE source IS NULL OR source = ''");
  await query("UPDATE orders SET sales_channel = CASE WHEN source = 'pos' THEN 'store' ELSE 'website' END WHERE sales_channel IS NULL OR sales_channel = ''");
  await query("UPDATE orders SET sales_channel = 'store' WHERE source = 'pos' AND sales_channel = 'website'");
  await query("UPDATE orders SET branch = CASE WHEN source = 'pos' THEN 'Main Branch' ELSE 'Online Store' END WHERE branch IS NULL OR branch = ''");
  await query("UPDATE orders SET branch = 'Main Branch' WHERE source = 'pos' AND branch = 'Online Store'");
  await query("UPDATE orders SET subtotal = total WHERE COALESCE(subtotal, 0) = 0 AND total > 0");
  await query("CREATE INDEX IF NOT EXISTS idx_staff_users_active ON staff_users(active)");
  await query("CREATE INDEX IF NOT EXISTS idx_orders_source_created ON orders(source, created_at)");
  await query("CREATE INDEX IF NOT EXISTS idx_orders_channel_branch_created ON orders(sales_channel, branch, created_at)");
  await query("CREATE INDEX IF NOT EXISTS idx_orders_staff ON orders(staff_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id, created_at)");
  await query("CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id, read_at, created_at)");
  await query("CREATE INDEX IF NOT EXISTS idx_notifications_order ON notifications(order_id)");
  await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_number ON orders(receipt_number) WHERE receipt_number IS NOT NULL");
}

async function requireSession(req, userType) {
  const authToken = getAuthToken(req);
  if (!authToken) return null;
  const session = await query("SELECT * FROM sessions WHERE token = $1 AND user_type = $2", [authToken, userType]);
  if (!session.rows[0]) return null;
  const table = userType === "admin" ? "admin_users" : userType === "staff" ? "staff_users" : "customers";
  const user = await query(`SELECT * FROM ${table} WHERE id = $1`, [session.rows[0].user_id]);
  if (userType === "staff" && user.rows[0] && !toBool(user.rows[0].active)) return null;
  return user.rows[0] || null;
}

async function requireStaffPermission(req, permission) {
  const staff = await requireSession(req, "staff");
  if (!staff) return { error: "Staff login required", status: 401, staff: null };
  const permissions = staffPermissions(staff.permissions);
  if (permission && !permissions.includes(permission)) return { error: "You do not have permission for this action", status: 403, staff: null };
  return { error: "", status: 200, staff: { ...staff, permissions } };
}

function receiptNumber(orderId, createdAt = now()) {
  const date = String(createdAt).slice(0, 10).replace(/-/g, "");
  return `POS-${date}-${String(orderId).padStart(6, "0")}`;
}

function normalizeSaleItems(rawItems) {
  const itemMap = new Map();
  (Array.isArray(rawItems) ? rawItems : []).forEach((item) => {
    const id = Number(item && item.id);
    if (!id) return;
    const size = String(item.size || "").trim().toUpperCase();
    const qty = Math.max(1, Number.parseInt(item.qty || 1, 10) || 1);
    const key = `${id}::${size}`;
    const current = itemMap.get(key) || { id, size, qty: 0 };
    current.qty += qty;
    itemMap.set(key, current);
  });
  return [...itemMap.values()];
}

async function publicPayload(includeProducts = false) {
  const [categories, ads, settingsRows] = await Promise.all([
    query("SELECT * FROM categories ORDER BY sort_order, name"),
    query("SELECT * FROM ads WHERE active = true ORDER BY sort_order, id"),
    query("SELECT key, value FROM settings"),
  ]);
  const settings = {};
  const rawSettings = {};
  settingsRows.rows.forEach((row) => {
    rawSettings[row.key] = row.value;
    if (!SECRET_SETTING_KEYS.has(row.key)) settings[row.key] = row.value;
  });
  ["information_links", "department_links", "branches"].forEach((key) => {
    settings[key] = jsonList(settings[key]);
  });
  if (!settings.branches.length) settings.branches = ["Main Branch"];
  settings.openai_api_configured = (process.env.OPENAI_API_KEY || rawSettings.openai_api_key || "").trim() ? "1" : "";
  const payload = {
    categories: categories.rows,
    products: [],
    ads: ads.rows,
    settings,
  };
  if (includeProducts) payload.products = await publicProducts();
  return payload;
}

async function publicProducts() {
  const products = await query(
    `SELECT p.*, c.name AS category
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = true AND COALESCE(p.stock, 0) > 0
     ORDER BY p.id DESC`
  );
  return products.rows.map((product) => publicProductRecord(product, false)).filter(Boolean);
}

async function syncProductVisibility(client, productId) {
  const product = await client.query("SELECT stock, product_sizes FROM products WHERE id = $1", [productId]);
  if (!product.rows[0]) return;
  const sizes = productSizes(product.rows[0]);
  const stock = productTotalStock(sizes, product.rows[0].stock);
  await client.query("UPDATE products SET stock = $1, active = $2 WHERE id = $3", [stock, stock > 0, productId]);
}

async function addProductSizeStock(client, productId, size, qty) {
  const amount = Number.parseInt(qty || 0, 10) || 0;
  if (amount <= 0) return;
  const product = await client.query("SELECT stock, product_sizes FROM products WHERE id = $1", [productId]);
  if (!product.rows[0]) return;
  const sizes = productSizes(product.rows[0]);
  const requestedSize = String(size || "").trim().toUpperCase();
  const selected = requestedSize || (sizes.length === 1 && sizes[0].size === "ONE SIZE" ? "ONE SIZE" : "");
  if (sizes.length && selected) {
    const match = sizes.find((item) => item.size === selected);
    if (match) match.stock += amount;
    else sizes.push({ size: selected, stock: amount });
    await client.query("UPDATE products SET stock = $1, product_sizes = $2::jsonb WHERE id = $3", [productTotalStock(sizes), JSON.stringify(sizes), productId]);
  } else {
    await client.query("UPDATE products SET stock = COALESCE(stock, 0) + $1 WHERE id = $2", [amount, productId]);
  }
  await syncProductVisibility(client, productId);
}

async function reserveInventoryForSale(client, items) {
  const ids = [...new Set(items.map((item) => Number(item.id)).filter(Boolean))];
  const products = await client.query("SELECT * FROM products WHERE id = ANY($1::bigint[]) FOR UPDATE", [ids]);
  const productMap = new Map(products.rows.map((product) => [String(product.id), product]));
  if (productMap.size !== ids.length) throw Object.assign(new Error("One or more products no longer exist"), { status: 409 });

  const sizeState = new Map();
  const stockState = new Map();
  const prepared = [];
  let subtotal = 0;

  for (const item of items) {
    const product = productMap.get(String(item.id));
    const qty = Math.max(1, Number.parseInt(item.qty || 1, 10) || 1);
    let selectedSize = String(item.size || "").trim().toUpperCase();
    const sizes = sizeState.get(String(product.id)) || productSizes(product);
    if (!sizeState.has(String(product.id))) sizeState.set(String(product.id), sizes);
    if (!selectedSize && sizes.length === 1 && sizes[0].size === "ONE SIZE") selectedSize = "ONE SIZE";
    const stock = sizes.length
      ? productTotalStock(sizes, product.stock)
      : stockState.has(String(product.id))
        ? stockState.get(String(product.id))
        : productTotalStock(sizes, product.stock);
    if (!product.active || stock <= 0) throw Object.assign(new Error(`${product.name} is out of stock`), { status: 409 });
    if (sizes.length) {
      const sizeRow = sizes.find((row) => row.size === selectedSize);
      if (!selectedSize || !sizeRow || Number(sizeRow.stock || 0) <= 0) throw Object.assign(new Error(`Size ${selectedSize || "selected"} is not available for ${product.name}`), { status: 409 });
      if (qty > Number(sizeRow.stock || 0)) throw Object.assign(new Error(`Only ${sizeRow.stock} left for ${product.name} size ${selectedSize}`), { status: 409 });
      sizeRow.stock = Math.max(0, Number(sizeRow.stock || 0) - qty);
    } else if (qty > stock) {
      throw Object.assign(new Error(`Only ${stock} left for ${product.name}`), { status: 409 });
    } else {
      stockState.set(String(product.id), Math.max(0, stock - qty));
    }
    subtotal += Number(product.price) * qty;
    prepared.push({ product, qty, selectedSize });
  }

  for (const [productId, sizes] of sizeState.entries()) {
    if (sizes.length) {
      await client.query("UPDATE products SET stock = $1, product_sizes = $2::jsonb WHERE id = $3", [productTotalStock(sizes), JSON.stringify(sizes), productId]);
    }
  }
  for (const [productId, stock] of stockState.entries()) {
    if (!sizeState.get(productId) || !sizeState.get(productId).length) {
      await client.query("UPDATE products SET stock = $1 WHERE id = $2", [stock, productId]);
    }
  }
  for (const productId of new Set(prepared.map((item) => item.product.id))) await syncProductVisibility(client, productId);
  return { prepared, subtotal: Number(subtotal.toFixed(2)) };
}

async function recordInventoryMovement(client, {
  product,
  size = "",
  quantityDelta,
  movementType,
  referenceType = "order",
  referenceId,
  performedByType,
  performedById,
  performedByName,
  note = "",
}) {
  await client.query(
    `INSERT INTO inventory_movements
     (product_id, product_name, size, quantity_delta, movement_type, reference_type, reference_id, performed_by_type, performed_by_id, performed_by_name, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [product && product.id || null, product && product.name || "", size || "", Number(quantityDelta || 0), movementType, referenceType, referenceId || null, performedByType || "", performedById || null, performedByName || "", note || "", now()]
  );
}

async function saleRecord(client, orderId) {
  const order = await client.query(
    `SELECT o.*, s.name AS staff_name, s.username AS staff_username
     FROM orders o
     LEFT JOIN staff_users s ON s.id = o.staff_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (!order.rows[0]) return null;
  const items = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [orderId]);
  return { ...order.rows[0], order_items: items.rows };
}

async function recalcOrder(client, orderId) {
  const total = await client.query("SELECT COALESCE(SUM(price * qty), 0) AS total FROM order_items WHERE order_id = $1 AND status != 'Cancelled'", [orderId]);
  const items = await client.query("SELECT status FROM order_items WHERE order_id = $1", [orderId]);
  const activeItems = items.rows.filter((item) => item.status !== "Cancelled");
  let status = "Processing";
  if (!items.rows.length || !activeItems.length) status = "Cancelled";
  else if (activeItems.every((item) => item.status === "Approved")) status = "Approved";
  await client.query("UPDATE orders SET total = $1, status = $2 WHERE id = $3", [Number(total.rows[0].total || 0), status, orderId]);
}

async function createNotification(client, { recipientType, recipientId, orderId, notificationType, title, message, link }) {
  if (!recipientId) return;
  await client.query(
    `INSERT INTO notifications
     (recipient_type, recipient_id, order_id, notification_type, title, message, link, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [recipientType, recipientId, orderId || null, notificationType || "order_update", title, message, link || "", now()]
  );
}

async function notifyNewOnlineOrder(client, { orderId, customerId, customerName, total }) {
  const title = `New online order #${orderId}`;
  const message = `${customerName || "A customer"} placed an online order for $${Number(total || 0).toFixed(2)}.`;
  const createdAt = now();
  await client.query(
    `INSERT INTO notifications
     (recipient_type, recipient_id, order_id, notification_type, title, message, link, created_at)
     SELECT 'staff', id, $1, 'new_online_order', $2, $3, '/pos', $4
     FROM staff_users
     WHERE active = true
       AND (COALESCE(permissions, '[]'::jsonb) @> '["orders.view"]'::jsonb
         OR COALESCE(permissions, '[]'::jsonb) @> '["orders.manage"]'::jsonb)`,
    [orderId, title, message, createdAt]
  );
  await client.query(
    `INSERT INTO notifications
     (recipient_type, recipient_id, order_id, notification_type, title, message, link, created_at)
     SELECT 'admin', id, $1, 'new_online_order', $2, $3, '/admin', $4
     FROM admin_users`,
    [orderId, title, message, createdAt]
  );
  await createNotification(client, {
    recipientType: "customer",
    recipientId: customerId,
    orderId,
    notificationType: "order_received",
    title: `Order #${orderId} received`,
    message: "We received your order. It is now being prepared.",
    link: "/order-history",
  });
}

function customerOrderStatusCopy(orderId, status) {
  const copy = {
    Processing: [`Order #${orderId} is being prepared`, "Your order is being prepared by the ONE TEN team."],
    Approved: [`Order #${orderId} approved`, "Your order has been approved and preparation is continuing."],
    Packed: [`Order #${orderId} is packed`, "Your products are packed and ready for the next step."],
    Delivered: [`Order #${orderId} completed`, "Your order has been completed and marked as delivered."],
    Cancelled: [`Order #${orderId} cancelled`, "Your order was cancelled. Open Order History to see the latest details."],
  };
  return copy[status] || [`Order #${orderId} updated`, `Your order status is now ${status}.`];
}

async function notifyCustomerOrderStatus(client, order, status) {
  if (!order || !order.customer_id || order.source !== "online") return;
  const [title, message] = customerOrderStatusCopy(order.id, status);
  await createNotification(client, {
    recipientType: "customer",
    recipientId: order.customer_id,
    orderId: order.id,
    notificationType: "order_status",
    title,
    message,
    link: "/order-history",
  });
}

async function notifyCustomerOrderItemChange(client, item, newQty, newStatus) {
  if (!item || !item.customer_id || item.order_source !== "online") return;
  const quantityChanged = Number(item.qty || 0) !== Number(newQty || 0);
  const statusChanged = String(item.status || "Processing") !== String(newStatus || "Processing");
  if (!quantityChanged && !statusChanged) return;
  const cancelledQty = Math.max(0, Number(item.qty || 0) - Number(newQty || 0));
  const cancelledAll = newStatus === "Cancelled" || Number(newQty || 0) === 0;
  const title = cancelledAll
    ? `${item.product_name} cancelled`
    : quantityChanged
      ? `${item.product_name} quantity updated`
      : `${item.product_name} status updated`;
  const message = cancelledAll
    ? `This product was cancelled from order #${item.order_id}.`
    : quantityChanged
      ? `${cancelledQty} item${cancelledQty === 1 ? "" : "s"} cancelled; ${newQty} remain in order #${item.order_id}.`
      : `This product is now ${newStatus} in order #${item.order_id}.`;
  await createNotification(client, {
    recipientType: "customer",
    recipientId: item.customer_id,
    orderId: item.order_id,
    notificationType: "order_item_update",
    title,
    message,
    link: "/order-history",
  });
}

async function installCatalogSeed(client) {
  const categoryIds = new Map();
  await client.query("DELETE FROM products WHERE seed_batch = $1", [CATALOG_BATCH]);
  await client.query("DELETE FROM ads WHERE seed_batch = $1", [CATALOG_BATCH]);

  for (const category of CATALOG_CATEGORIES) {
    const result = await client.query(
      `INSERT INTO categories (name, description, price_mode, sort_order, seed_batch, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         price_mode = EXCLUDED.price_mode,
         sort_order = EXCLUDED.sort_order,
         seed_batch = CASE WHEN categories.seed_batch = '' THEN EXCLUDED.seed_batch ELSE categories.seed_batch END
       RETURNING id`,
      [category.name, category.description, category.price_mode, category.sort_order, CATALOG_BATCH, now()]
    );
    categoryIds.set(category.key, result.rows[0].id);
  }

  for (const product of CATALOG_PRODUCTS) {
    await client.query(
      `INSERT INTO products
       (category_id, name, price, old_price, badge, rating, stock, product_sizes, image, images, crop, description, ai_type, ai_images, ai_prompts, active, seed_batch, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18)`,
      [
        categoryIds.get(product.category_key),
        product.name,
        product.price,
        product.old_price,
        product.badge,
        product.rating,
        product.stock,
        JSON.stringify(product.product_sizes),
        product.image,
        JSON.stringify(product.images),
        product.crop,
        product.description,
        product.ai_type,
        JSON.stringify(product.ai_images),
        JSON.stringify(product.ai_prompts),
        product.stock > 0,
        CATALOG_BATCH,
        now(),
      ]
    );
  }

  for (const ad of CATALOG_ADS) {
    await client.query(
      `INSERT INTO ads (title, subtitle, button_text, link, image, active, sort_order, seed_batch, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ad.title, ad.subtitle, ad.button_text, ad.link, ad.image, ad.active, ad.sort_order, CATALOG_BATCH, now()]
    );
  }

  return { products: CATALOG_PRODUCTS.length, categories: CATALOG_CATEGORIES.length, ads: CATALOG_ADS.length };
}

const aiTypeLabels = {
  top: "shirt, t-shirt, jacket, hoodie, or upper-body garment",
  pants: "pants, trousers, jeans, shorts, or lower-body garment",
  outfit: "full outfit, suit, tracksuit, or complete coordinated look",
  shoes: "shoes, sneakers, sandals, or footwear",
  watch: "watch, bracelet, ring, or small accessory",
  accessory: "cap, belt, bag, sunglasses, or men's accessory",
};

function aiProductPrompts(product, aiType, hasModelReference = false) {
  const model = `same stylish young Black male model as the reference portrait, clean shaped beard, modern curly afro, confident professional fashion pose${hasModelReference ? ", preserve the uploaded AI model reference identity and grooming style" : ""}`;
  const rules = {
    top: "focus on the upper garment; crop around chest and torso; pants are neutral and not advertised",
    pants: "focus on lower body first; if torso appears, shirtless athletic upper body with a clean six-pack, no shirt promotion",
    outfit: "show full-body styling, complete outfit visible, fashion campaign pose",
    shoes: "focus on footwear, low-angle shoe detail, model styling supports the shoes",
    watch: "close detail on wrist/hand accessory, luxury men's fashion framing",
    accessory: "focus on the exact accessory placement and use, clean men's fashion styling",
  };
  const type = aiTypeLabels[aiType] || aiTypeLabels.top;
  const focus = rules[aiType] || rules.top;
  const base = `${product.name || "ONE TEN product"}. ${product.description || ""}. Product type: ${type}. ${focus}.`;
  return [
    `Studio ecommerce hero on smooth light gray background, ultra clean product advertisement, ${model}, ${base}`,
    `Sharp catalog detail shot, product texture and cut in focus, soft gray studio lighting, ${model}, ${base}`,
    `Premium lifestyle streetwear scene, red white black ONE TEN color mood, natural confident pose, ${model}, ${base}`,
    `Editorial men's fashion campaign, clean shadows, high-end online shop look, ${model}, ${base}`,
    `Social ad crop, bold modern composition, product clearly visible, professional retouched finish, ${model}, ${base}`,
  ];
}

async function generateAiImages(prompts, apiKey) {
  const key = String(apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!key) return [];
  const images = [];
  for (const prompt of prompts) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        prompt,
        size: "1024x1024",
        quality: process.env.OPENAI_IMAGE_QUALITY || "low",
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    const image = (payload.data || [])[0] || {};
    if (image.b64_json) images.push(`data:image/png;base64,${image.b64_json}`);
    else if (image.url) images.push(image.url);
  }
  return images;
}

function friendlyAiError(errorText) {
  if (!errorText) return "";
  try {
    const payload = JSON.parse(errorText);
    const code = payload.error && payload.error.code;
    const message = payload.error && payload.error.message;
    if (code === "insufficient_quota") return "OpenAI credit/quota is finished. Add billing credit or use another API key.";
    return message || String(errorText).slice(0, 220);
  } catch {
    return String(errorText).slice(0, 220);
  }
}

function sendJson(req, res, status, payload, extraHeaders = {}) {
  let body = Buffer.from(JSON.stringify(payload), "utf8");
  const acceptEncoding = req.headers["accept-encoding"] || "";
  const useBrotli = acceptEncoding.includes("br") && body.length > 1024;
  const useGzip = !useBrotli && acceptEncoding.includes("gzip") && body.length > 1024;
  if (useBrotli) body = zlib.brotliCompressSync(body);
  if (useGzip) body = zlib.gzipSync(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...(useBrotli ? { "Content-Encoding": "br", Vary: "Accept-Encoding" } : {}),
    ...(useGzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
    ...extraHeaders,
    "Content-Length": body.length,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 18_000_000) {
        tooLarge = true;
        const error = new Error("Payload too large");
        error.status = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function cors(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

async function handleGet(req, res, pathname) {
  if (pathname === "/api/health") {
    return sendJson(req, res, 200, {
      ok: !databaseStartupError,
      runtime: "node",
      database: DATABASE_URL.trim() ? (databaseStartupError ? "error" : "configured") : "missing",
      error: databaseStartupError,
    });
  }
  const publicCacheHeaders = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
  if (pathname === "/api/public/bootstrap") return sendJson(req, res, 200, await publicPayload(false), publicCacheHeaders);
  if (pathname === "/api/public/products") return sendJson(req, res, 200, { products: await publicProducts() }, { "Cache-Control": "no-store" });

  const publicProductMatch = pathname.match(/^\/api\/public\/products\/(\d+)$/);
  if (publicProductMatch) {
    const result = await query(
      `SELECT p.*, c.name AS category
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.active = true AND COALESCE(p.stock, 0) > 0`,
      [Number(publicProductMatch[1])]
    );
    const product = publicProductRecord(result.rows[0], true);
    return product ? sendJson(req, res, 200, { product }, { "Cache-Control": "no-store" }) : sendJson(req, res, 404, { error: "Product not found" });
  }

  if (pathname === "/api/customer/me") {
    const user = await requireSession(req, "customer");
    if (!user) return sendJson(req, res, 401, { error: "Login required" });
    return sendJson(req, res, 200, { id: user.id, name: user.name, email: user.email });
  }

  if (pathname === "/api/customer/orders") {
    const user = await requireSession(req, "customer");
    if (!user) return sendJson(req, res, 401, { error: "Login required" });
    const orders = await query("SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC", [user.id]);
    const items = await query(
      `SELECT oi.*
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.customer_id = $1
       ORDER BY oi.order_id DESC, oi.id`,
      [user.id]
    );
    const byOrder = new Map();
    items.rows.forEach((item) => {
      if (!byOrder.has(String(item.order_id))) byOrder.set(String(item.order_id), []);
      byOrder.get(String(item.order_id)).push(item);
    });
    return sendJson(req, res, 200, { orders: orders.rows.map((order) => ({ ...order, order_items: byOrder.get(String(order.id)) || [] })) });
  }

  if (pathname === "/api/customer/notifications") {
    const user = await requireSession(req, "customer");
    if (!user) return sendJson(req, res, 401, { error: "Login required" });
    const result = await query(
      `SELECT n.*,
              (SELECT COUNT(*)::int FROM notifications unread
               WHERE unread.recipient_type = 'customer' AND unread.recipient_id = $1 AND unread.read_at IS NULL) AS total_unread
       FROM notifications n
       WHERE n.recipient_type = 'customer' AND n.recipient_id = $1
       ORDER BY n.id DESC
       LIMIT 60`,
      [user.id]
    );
    const unread = Number(result.rows[0] && result.rows[0].total_unread || 0);
    const notifications = result.rows.map(({ total_unread, ...notification }) => notification);
    return sendJson(req, res, 200, { notifications, unread }, { "Cache-Control": "no-store" });
  }

  if (pathname === "/api/staff/me") {
    const access = await requireStaffPermission(req);
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    return sendJson(req, res, 200, { staff: publicStaffRecord(access.staff), permission_catalog: STAFF_PERMISSION_CATALOG }, { "Cache-Control": "no-store" });
  }

  const staffProductPreviewMatch = pathname.match(/^\/api\/staff\/products\/(\d+)$/);
  if (staffProductPreviewMatch) {
    const access = await requireStaffPermission(req, "orders.view");
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    const result = await query(
      `SELECT p.*, c.name AS category
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [Number(staffProductPreviewMatch[1])]
    );
    if (!result.rows[0]) return sendJson(req, res, 404, { error: "Product not found" });
    const product = adminProductRecord(result.rows[0]);
    return sendJson(req, res, 200, {
      product: {
        id: product.id,
        category: product.category,
        name: product.name,
        price: product.price,
        old_price: product.old_price,
        badge: product.badge,
        stock: product.stock,
        product_sizes: product.product_sizes,
        image: product.image,
        images: product.images,
        description: product.description,
        active: product.active,
      },
    }, { "Cache-Control": "no-store" });
  }

  if (pathname === "/api/staff/notifications") {
    const access = await requireStaffPermission(req, "orders.view");
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    const result = await query(
      `SELECT n.*,
              (SELECT COUNT(*)::int FROM notifications unread
               WHERE unread.recipient_type = 'staff' AND unread.recipient_id = $1 AND unread.read_at IS NULL) AS total_unread
       FROM notifications n
       WHERE n.recipient_type = 'staff' AND n.recipient_id = $1
       ORDER BY n.id DESC
       LIMIT 60`,
      [access.staff.id]
    );
    const unread = Number(result.rows[0] && result.rows[0].total_unread || 0);
    const notifications = result.rows.map(({ total_unread, ...notification }) => notification);
    return sendJson(req, res, 200, { notifications, unread }, { "Cache-Control": "no-store" });
  }

  if (pathname === "/api/staff/bootstrap") {
    const access = await requireStaffPermission(req);
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    const staff = access.staff;
    const permissions = staff.permissions;
    const canSeeProducts = permissions.some((permission) => ["pos.sell", "inventory.view"].includes(permission));
    const canSeePosSales = permissions.some((permission) => ["pos.history", "reports.view"].includes(permission));
    const canSeeOnlineOrders = permissions.includes("orders.view");
    const canSeeCustomers = permissions.includes("customers.view");
    const canSeeReports = permissions.includes("reports.view");

    const [publicData, products, inventoryProducts, posOrders, onlineOrders, customers, orderItems, reportRows, movements, reportOrders, staffNotifications] = await Promise.all([
      publicPayload(false),
      canSeeProducts ? publicProducts() : [],
      permissions.includes("inventory.view")
        ? query(`SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name`)
        : Promise.resolve({ rows: [] }),
      canSeePosSales
        ? query(`SELECT o.*, s.name AS staff_name, s.username AS staff_username FROM orders o LEFT JOIN staff_users s ON s.id = o.staff_id WHERE o.source = 'pos' ORDER BY o.id DESC LIMIT 150`)
        : Promise.resolve({ rows: [] }),
      canSeeOnlineOrders
        ? query(`SELECT o.*, COUNT(oi.id)::int AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE o.source = 'online' GROUP BY o.id ORDER BY o.id DESC LIMIT 150`)
        : Promise.resolve({ rows: [] }),
      canSeeCustomers
        ? query(`SELECT
                   c.id,
                   c.name,
                   c.email,
                   c.created_at,
                   COUNT(o.id) FILTER (WHERE o.status != 'Cancelled')::int AS order_count,
                   COALESCE(SUM(o.total) FILTER (WHERE o.status != 'Cancelled'), 0) AS total_spent,
                   COUNT(o.id) FILTER (WHERE o.status != 'Cancelled' AND COALESCE(o.sales_channel, CASE WHEN o.source = 'pos' THEN 'store' ELSE 'website' END) = 'website')::int AS website_orders,
                   COUNT(o.id) FILTER (WHERE o.status != 'Cancelled' AND o.sales_channel = 'external_online')::int AS external_online_orders,
                   COUNT(o.id) FILTER (WHERE o.status != 'Cancelled' AND COALESCE(o.sales_channel, CASE WHEN o.source = 'pos' THEN 'store' ELSE 'website' END) = 'store')::int AS store_orders,
                   (SELECT o2.phone FROM orders o2 WHERE o2.customer_id = c.id AND COALESCE(o2.phone, '') <> '' ORDER BY o2.id DESC LIMIT 1) AS phone,
                   (SELECT o2.address FROM orders o2 WHERE o2.customer_id = c.id AND COALESCE(o2.address, '') <> '' ORDER BY o2.id DESC LIMIT 1) AS address,
                   (SELECT o2.id FROM orders o2 WHERE o2.customer_id = c.id ORDER BY o2.id DESC LIMIT 1) AS last_order_id,
                   (SELECT o2.created_at FROM orders o2 WHERE o2.customer_id = c.id ORDER BY o2.id DESC LIMIT 1) AS last_order_at
                 FROM customers c
                 LEFT JOIN orders o ON o.customer_id = c.id
                 GROUP BY c.id, c.name, c.email, c.created_at
                 ORDER BY total_spent DESC, c.id DESC
                 LIMIT 150`)
        : Promise.resolve({ rows: [] }),
      canSeePosSales || canSeeOnlineOrders ? query("SELECT * FROM order_items ORDER BY order_id DESC, id") : Promise.resolve({ rows: [] }),
      canSeeReports
        ? query(`SELECT
                   COUNT(*) FILTER (WHERE source = 'pos' AND status != 'Cancelled')::int AS pos_sales,
                   COUNT(*) FILTER (WHERE source = 'online' AND status != 'Cancelled')::int AS online_sales,
                   COALESCE(SUM(total) FILTER (WHERE source = 'pos' AND status != 'Cancelled'), 0) AS pos_revenue,
                   COALESCE(SUM(total) FILTER (WHERE source = 'online' AND status != 'Cancelled'), 0) AS online_revenue,
                   COALESCE(SUM(total) FILTER (WHERE status != 'Cancelled'), 0) AS total_revenue
                 FROM orders`)
        : Promise.resolve({ rows: [{}] }),
      canSeeReports
        ? query("SELECT * FROM inventory_movements ORDER BY id DESC LIMIT 150")
        : Promise.resolve({ rows: [] }),
      canSeeReports
        ? query(`SELECT o.*, s.name AS staff_name, s.username AS staff_username
                 FROM orders o
                 LEFT JOIN staff_users s ON s.id = o.staff_id
                 ORDER BY o.id DESC`)
        : Promise.resolve({ rows: [] }),
      canSeeOnlineOrders
        ? query(
            `SELECT n.*,
                    (SELECT COUNT(*)::int FROM notifications unread
                     WHERE unread.recipient_type = 'staff' AND unread.recipient_id = $1 AND unread.read_at IS NULL) AS total_unread
             FROM notifications n
             WHERE n.recipient_type = 'staff' AND n.recipient_id = $1
             ORDER BY n.id DESC
             LIMIT 60`,
            [staff.id]
          )
        : Promise.resolve({ rows: [] }),
    ]);
    const byOrder = new Map();
    orderItems.rows.forEach((item) => {
      if (!byOrder.has(String(item.order_id))) byOrder.set(String(item.order_id), []);
      byOrder.get(String(item.order_id)).push(item);
    });
    return sendJson(req, res, 200, {
      staff: publicStaffRecord(staff),
      permission_catalog: STAFF_PERMISSION_CATALOG,
      permissions,
      categories: canSeeProducts ? publicData.categories : [],
      settings: publicData.settings,
      products,
      inventory_products: inventoryProducts.rows.map(adminProductRecord),
      pos_sales: posOrders.rows.map((order) => ({ ...order, order_items: byOrder.get(String(order.id)) || [] })),
      online_orders: onlineOrders.rows.map((order) => ({ ...order, order_items: byOrder.get(String(order.id)) || [] })),
      customers: customers.rows,
      reports: reportRows.rows[0] || {},
      report_orders: reportOrders.rows.map((order) => ({ ...order, order_items: byOrder.get(String(order.id)) || [] })),
      inventory_movements: movements.rows,
      notifications: staffNotifications.rows.map(({ total_unread, ...notification }) => notification),
      notification_unread: Number(staffNotifications.rows[0] && staffNotifications.rows[0].total_unread || 0),
    }, { "Cache-Control": "no-store" });
  }

  if (pathname.startsWith("/api/admin/")) {
    const admin = await requireSession(req, "admin");
    if (!admin) return sendJson(req, res, 401, { error: "Admin login required" });
    if (pathname === "/api/admin/bootstrap") {
      const payload = await publicPayload(false);
      const [products, orders, customers, subscribers, orderItems, revenue, staffUsers, channelRevenue, adminNotifications] = await Promise.all([
        query(`SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.id DESC`),
        query(`SELECT o.*, COUNT(oi.id) AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id ORDER BY o.id DESC`),
        query(`SELECT
                 c.id,
                 c.name,
                 c.email,
                 c.created_at,
                 COUNT(o.id) FILTER (WHERE o.status != 'Cancelled')::int AS order_count,
                 COALESCE(SUM(o.total) FILTER (WHERE o.status != 'Cancelled'), 0) AS total_spent,
                 COUNT(o.id) FILTER (WHERE o.status != 'Cancelled' AND COALESCE(o.sales_channel, CASE WHEN o.source = 'pos' THEN 'store' ELSE 'website' END) = 'website')::int AS website_orders,
                 COUNT(o.id) FILTER (WHERE o.status != 'Cancelled' AND o.sales_channel = 'external_online')::int AS external_online_orders,
                 COUNT(o.id) FILTER (WHERE o.status != 'Cancelled' AND COALESCE(o.sales_channel, CASE WHEN o.source = 'pos' THEN 'store' ELSE 'website' END) = 'store')::int AS store_orders,
                 (SELECT o2.phone FROM orders o2 WHERE o2.customer_id = c.id AND COALESCE(o2.phone, '') <> '' ORDER BY o2.id DESC LIMIT 1) AS phone,
                 (SELECT o2.address FROM orders o2 WHERE o2.customer_id = c.id AND COALESCE(o2.address, '') <> '' ORDER BY o2.id DESC LIMIT 1) AS address,
                 (SELECT o2.id FROM orders o2 WHERE o2.customer_id = c.id ORDER BY o2.id DESC LIMIT 1) AS last_order_id,
                 (SELECT o2.created_at FROM orders o2 WHERE o2.customer_id = c.id ORDER BY o2.id DESC LIMIT 1) AS last_order_at
               FROM customers c
               LEFT JOIN orders o ON o.customer_id = c.id
               GROUP BY c.id, c.name, c.email, c.created_at
               ORDER BY c.id DESC`),
        query("SELECT * FROM newsletter_subscribers ORDER BY id DESC"),
        query("SELECT * FROM order_items ORDER BY order_id DESC, id"),
        query("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE status != 'Cancelled'"),
        query("SELECT id, name, username, role, permissions, active, created_at, updated_at, last_login_at FROM staff_users ORDER BY id DESC"),
        query(`SELECT
                 COALESCE(SUM(total) FILTER (WHERE source = 'online' AND status != 'Cancelled'), 0) AS online_revenue,
                 COALESCE(SUM(total) FILTER (WHERE source = 'pos' AND status != 'Cancelled'), 0) AS pos_revenue,
                 COUNT(*) FILTER (WHERE source = 'pos' AND status != 'Cancelled')::int AS pos_sales
               FROM orders`),
        query(
          `SELECT n.*,
                  (SELECT COUNT(*)::int FROM notifications unread
                   WHERE unread.recipient_type = 'admin' AND unread.recipient_id = $1 AND unread.read_at IS NULL) AS total_unread
           FROM notifications n
           WHERE n.recipient_type = 'admin' AND n.recipient_id = $1
           ORDER BY n.id DESC
           LIMIT 60`,
          [admin.id]
        ),
      ]);
      const byOrder = new Map();
      orderItems.rows.forEach((item) => {
        if (!byOrder.has(String(item.order_id))) byOrder.set(String(item.order_id), []);
        byOrder.get(String(item.order_id)).push(item);
      });
      payload.products = products.rows.map(adminProductRecord);
      payload.orders = orders.rows.map((order) => ({ ...order, order_items: byOrder.get(String(order.id)) || [] }));
      payload.customers = customers.rows;
      payload.subscribers = subscribers.rows;
      payload.staff = staffUsers.rows.map(publicStaffRecord);
      payload.permission_catalog = STAFF_PERMISSION_CATALOG;
      payload.admin = { id: admin.id, username: admin.username, created_at: admin.created_at };
      payload.notifications = adminNotifications.rows.map(({ total_unread, ...notification }) => notification);
      payload.notification_unread = Number(adminNotifications.rows[0] && adminNotifications.rows[0].total_unread || 0);
      payload.dashboard = {
        products: payload.products.length,
        categories: payload.categories.length,
        ads: payload.ads.length,
        orders: payload.orders.length,
        customers: payload.customers.length,
        subscribers: payload.subscribers.length,
        revenue: Number(revenue.rows[0].total || 0),
        onlineRevenue: Number(channelRevenue.rows[0].online_revenue || 0),
        posRevenue: Number(channelRevenue.rows[0].pos_revenue || 0),
        posSales: Number(channelRevenue.rows[0].pos_sales || 0),
        staff: payload.staff.filter((member) => member.active).length,
        lowStock: payload.products.filter((product) => Number(product.stock || 0) <= 12).length,
        seededProducts: payload.products.filter((product) => product.seed_batch === CATALOG_BATCH).length,
      };
      return sendJson(req, res, 200, payload);
    }
  }

  return sendJson(req, res, 404, { error: "Route not found" });
}

async function handlePostPutDelete(req, res, method, pathname) {
  const data = await readBody(req);

  if (method === "POST" && pathname === "/api/customer/register") {
    try {
      const email = cleanEmail(data.email);
      const name = cleanText(data.name || "Customer", 120) || "Customer";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJson(req, res, 400, { error: "Valid email is required" });
      if (String(data.password || "").length < 4) return sendJson(req, res, 400, { error: "Password is too short" });
      const inserted = await query(
        "INSERT INTO customers (name, email, password_hash, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
        [name, email, hashPassword(data.password), now()]
      );
      const customerId = inserted.rows[0].id;
      const authToken = token();
      await query("INSERT INTO sessions (token, user_type, user_id, created_at) VALUES ($1, 'customer', $2, $3)", [authToken, customerId, now()]);
      return sendJson(req, res, 201, { token: authToken, user: { id: customerId, name, email } }, { "Set-Cookie": sessionCookie("customerToken", authToken) });
    } catch (error) {
      if (error.code === "23505") return sendJson(req, res, 409, { error: "Email already exists" });
      throw error;
    }
  }

  if (method === "POST" && pathname === "/api/customer/login") {
    const user = await query("SELECT * FROM customers WHERE email = $1 AND password_hash = $2", [cleanEmail(data.email), hashPassword(data.password)]);
    if (!user.rows[0]) return sendJson(req, res, 401, { error: "Wrong email or password" });
    const authToken = token();
    await query("INSERT INTO sessions (token, user_type, user_id, created_at) VALUES ($1, 'customer', $2, $3)", [authToken, user.rows[0].id, now()]);
    return sendJson(req, res, 200, { token: authToken, user: { id: user.rows[0].id, name: user.rows[0].name, email: user.rows[0].email } }, { "Set-Cookie": sessionCookie("customerToken", authToken) });
  }

  if (method === "POST" && pathname === "/api/customer/notifications/read") {
    const customer = await requireSession(req, "customer");
    if (!customer) return sendJson(req, res, 401, { error: "Login required" });
    if (data.id) {
      await query("UPDATE notifications SET read_at = $1 WHERE id = $2 AND recipient_type = 'customer' AND recipient_id = $3", [now(), Number(data.id), customer.id]);
    } else {
      await query("UPDATE notifications SET read_at = $1 WHERE recipient_type = 'customer' AND recipient_id = $2 AND read_at IS NULL", [now(), customer.id]);
    }
    return sendJson(req, res, 200, { ok: true });
  }

  if (method === "POST" && pathname === "/api/admin/login") {
    const user = await query("SELECT * FROM admin_users WHERE username = $1", [cleanText(data.username, 80)]);
    if (!user.rows[0] || !passwordMatches(data.password, user.rows[0].password_hash)) return sendJson(req, res, 401, { error: "Wrong admin username or password" });
    const authToken = token();
    await query("INSERT INTO sessions (token, user_type, user_id, created_at) VALUES ($1, 'admin', $2, $3)", [authToken, user.rows[0].id, now()]);
    return sendJson(req, res, 200, { token: authToken, admin: { id: user.rows[0].id, username: user.rows[0].username } }, { "Set-Cookie": sessionCookie("adminToken", authToken) });
  }

  if (method === "POST" && pathname === "/api/staff/login") {
    const username = cleanText(data.username, 80);
    const result = await query("SELECT * FROM staff_users WHERE username = $1", [username]);
    const staff = result.rows[0];
    if (!staff || !toBool(staff.active) || !passwordMatches(data.password, staff.password_hash)) {
      return sendJson(req, res, 401, { error: "Wrong username or password" });
    }
    const authToken = token();
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("INSERT INTO sessions (token, user_type, user_id, created_at) VALUES ($1, 'staff', $2, $3)", [authToken, staff.id, now()]);
        await client.query("UPDATE staff_users SET last_login_at = $1 WHERE id = $2", [now(), staff.id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    return sendJson(req, res, 200, { token: authToken, staff: publicStaffRecord(staff) }, { "Set-Cookie": sessionCookie("staffToken", authToken) });
  }

  if (method === "POST" && pathname === "/api/staff/logout") {
    const authToken = getAuthToken(req);
    if (authToken) await query("DELETE FROM sessions WHERE token = $1 AND user_type = 'staff'", [authToken]);
    return sendJson(req, res, 200, { ok: true }, { "Set-Cookie": sessionCookie("staffToken", "") });
  }

  if (method === "POST" && pathname === "/api/staff/notifications/read") {
    const access = await requireStaffPermission(req, "orders.view");
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    if (data.id) {
      await query("UPDATE notifications SET read_at = $1 WHERE id = $2 AND recipient_type = 'staff' AND recipient_id = $3", [now(), Number(data.id), access.staff.id]);
    } else {
      await query("UPDATE notifications SET read_at = $1 WHERE recipient_type = 'staff' AND recipient_id = $2 AND read_at IS NULL", [now(), access.staff.id]);
    }
    return sendJson(req, res, 200, { ok: true });
  }

  const staffOrderStatusMatch = pathname.match(/^\/api\/staff\/orders\/(\d+)\/status$/);
  if (staffOrderStatusMatch && method === "PUT") {
    const access = await requireStaffPermission(req, "orders.view");
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    const orderId = Number(staffOrderStatusMatch[1]);
    const status = ["Processing", "Approved", "Packed", "Delivered", "Cancelled"].includes(data.status) ? data.status : "Processing";
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
        const order = result.rows[0];
        if (!order || order.source !== "online") throw Object.assign(new Error("Online order not found"), { status: 404 });
        if (order.status === "Cancelled") throw Object.assign(new Error("A cancelled order cannot be updated"), { status: 409 });
        if (order.status !== status) {
          if (status === "Cancelled") {
            const activeItems = await client.query("SELECT * FROM order_items WHERE order_id = $1 AND status != 'Cancelled' FOR UPDATE", [orderId]);
            for (const item of activeItems.rows) {
              await addProductSizeStock(client, item.product_id, item.size || "", Number(item.qty || 0));
              await syncProductVisibility(client, item.product_id);
              await recordInventoryMovement(client, {
                product: { id: item.product_id, name: item.product_name },
                size: item.size || "",
                quantityDelta: Number(item.qty || 0),
                movementType: "online_order_cancel",
                referenceType: "order",
                referenceId: orderId,
                performedByType: "staff",
                performedById: access.staff.id,
                performedByName: access.staff.name || access.staff.username,
              });
            }
            await client.query("UPDATE order_items SET qty = 0, status = 'Cancelled' WHERE order_id = $1", [orderId]);
            await client.query("UPDATE orders SET status = 'Cancelled', total = 0 WHERE id = $1", [orderId]);
          } else {
            await client.query("UPDATE orders SET status = $1 WHERE id = $2", [status, orderId]);
          }
          await notifyCustomerOrderStatus(client, order, status);
        }
        await client.query("COMMIT");
        return sendJson(req, res, 200, { ok: true, status });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, error.status || 500, { error: error.message || "Order status update failed" });
      }
    });
  }

  const staffOrderItemMatch = pathname.match(/^\/api\/staff\/order-items\/(\d+)$/);
  if (staffOrderItemMatch && method === "PUT") {
    const access = await requireStaffPermission(req, "orders.view");
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    const itemId = Number(staffOrderItemMatch[1]);
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const itemResult = await client.query("SELECT oi.*, o.source AS order_source, o.status AS order_status, o.customer_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = $1 FOR UPDATE", [itemId]);
        const item = itemResult.rows[0];
        if (!item) throw Object.assign(new Error("Order item not found"), { status: 404 });
        if (item.order_source !== "online") throw Object.assign(new Error("Only website orders can be edited here."), { status: 409 });
        if (item.order_status === "Cancelled") throw Object.assign(new Error("A cancelled order cannot be edited because its stock was already restored."), { status: 409 });
        let newStatus = data.status || item.status || "Processing";
        if (!["Processing", "Approved", "Cancelled"].includes(newStatus)) newStatus = "Processing";
        const requestedQty = Math.max(1, Number.parseInt(item.requested_qty || item.qty || 1, 10) || 1);
        let newQty = Math.min(requestedQty, Math.max(0, Number.parseInt(data.qty !== undefined ? data.qty : item.qty || 0, 10) || 0));
        if (newStatus === "Cancelled") newQty = 0;
        const oldReserved = item.status !== "Cancelled" ? Number(item.qty || 0) : 0;
        const newReserved = newStatus !== "Cancelled" ? newQty : 0;
        const stockDelta = oldReserved - newReserved;
        const productResult = await client.query("SELECT stock, name, product_sizes FROM products WHERE id = $1 FOR UPDATE", [item.product_id]);
        const product = productResult.rows[0];
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const sizes = productSizes(product);
        const requestedItemSize = String(item.size || "").trim().toUpperCase();
        const itemSize = requestedItemSize || (sizes.length === 1 && sizes[0].size === "ONE SIZE" ? "ONE SIZE" : "");
        if (sizes.length && itemSize) {
          const sizeRow = sizes.find((row) => row.size === itemSize);
          if (stockDelta >= 0) {
            await addProductSizeStock(client, item.product_id, itemSize, stockDelta);
          } else {
            const needed = Math.abs(stockDelta);
            if (!sizeRow || Number(sizeRow.stock || 0) < needed) throw Object.assign(new Error(`Only ${Number(sizeRow && sizeRow.stock || 0)} left for ${product.name} size ${itemSize}`), { status: 409 });
            sizeRow.stock = Number(sizeRow.stock || 0) - needed;
            await client.query("UPDATE products SET stock = $1, product_sizes = $2::jsonb WHERE id = $3", [productTotalStock(sizes), JSON.stringify(sizes), item.product_id]);
          }
        } else {
          const newStock = Number(product.stock || 0) + stockDelta;
          if (newStock < 0) throw Object.assign(new Error(`Not enough stock for ${product.name}`), { status: 409 });
          await client.query("UPDATE products SET stock = $1 WHERE id = $2", [newStock, item.product_id]);
        }
        await syncProductVisibility(client, item.product_id);
        if (stockDelta) {
          await recordInventoryMovement(client, {
            product: { id: item.product_id, name: product.name },
            size: itemSize,
            quantityDelta: stockDelta,
            movementType: "online_order_adjustment",
            referenceId: item.order_id,
            performedByType: "staff",
            performedById: access.staff.id,
            performedByName: access.staff.name || access.staff.username,
          });
        }
        await client.query("UPDATE order_items SET qty = $1, status = $2 WHERE id = $3", [newQty, newStatus, itemId]);
        await recalcOrder(client, item.order_id);
        await notifyCustomerOrderItemChange(client, item, newQty, newStatus);
        await client.query("COMMIT");
        return sendJson(req, res, 200, { ok: true });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, error.status || 500, { error: error.message || "Order item update failed" });
      }
    });
  }

  if (method === "POST" && pathname === "/api/orders") {
    const customer = await requireSession(req, "customer");
    if (!customer) return sendJson(req, res, 401, { error: "Register or sign in before ordering" });
    const items = normalizeSaleItems(data.items);
    if (!items.length) return sendJson(req, res, 400, { error: "Cart is empty" });
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const { prepared, subtotal } = await reserveInventoryForSale(client, items);
        const createdAt = now();
        const order = await client.query(
          `INSERT INTO orders
           (customer_id, customer_name, phone, address, status, source, sales_channel, branch, payment_status, subtotal, discount, amount_paid, change_due, total, created_at)
           VALUES ($1, $2, $3, $4, 'Processing', 'online', 'website', 'Online Store', 'Pending', $5, 0, 0, 0, $5, $6)
           RETURNING id`,
          [customer.id, customer.name, cleanText(data.phone, 80), cleanText(data.address, 400), subtotal, createdAt]
        );
        const orderId = order.rows[0].id;
        for (const item of prepared) {
          await client.query(
            "INSERT INTO order_items (order_id, product_id, product_name, product_image, price, requested_qty, qty, size, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Processing')",
            [orderId, item.product.id, item.product.name, item.product.image, item.product.price, item.qty, item.qty, item.selectedSize]
          );
          await recordInventoryMovement(client, {
            product: item.product,
            size: item.selectedSize,
            quantityDelta: -item.qty,
            movementType: "online_sale",
            referenceId: orderId,
            performedByType: "customer",
            performedById: customer.id,
            performedByName: customer.name,
          });
        }
        await notifyNewOnlineOrder(client, { orderId, customerId: customer.id, customerName: customer.name, total: subtotal });
        await client.query("COMMIT");
        return sendJson(req, res, 201, { id: orderId, total: subtotal, status: "Processing" });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, error.status || 500, { error: error.message || "Order failed" });
      }
    });
  }

  if (method === "POST" && pathname === "/api/pos/sales") {
    const access = await requireStaffPermission(req, "pos.sell");
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    const items = normalizeSaleItems(data.items);
    if (!items.length) return sendJson(req, res, 400, { error: "Add at least one product to the sale" });
    const allowedPayments = ["Cash", "ZAAD", "eDahab", "Card", "Other"];
    const paymentMethod = allowedPayments.includes(data.payment_method) ? data.payment_method : "Cash";
    const allowedChannels = ["store", "external_online"];
    const salesChannel = allowedChannels.includes(data.sales_channel) ? data.sales_channel : "store";
    const branch = cleanText(data.branch || "Main Branch", 120) || "Main Branch";

    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const { prepared, subtotal } = await reserveInventoryForSale(client, items);
        const discount = Math.min(subtotal, Math.max(0, Number(data.discount) || 0));
        const total = Number((subtotal - discount).toFixed(2));
        const amountPaid = Math.max(0, Number(data.amount_paid) || 0);
        if (amountPaid < total) throw Object.assign(new Error(`Amount paid must be at least $${total.toFixed(2)}`), { status: 400 });
        const changeDue = Number((amountPaid - total).toFixed(2));
        const createdAt = now();
        const requestedCustomerId = Number(data.customer_id) || null;
        let linkedCustomer = null;
        if (requestedCustomerId) {
          const customerResult = await client.query("SELECT id, name, email FROM customers WHERE id = $1", [requestedCustomerId]);
          linkedCustomer = customerResult.rows[0] || null;
          if (!linkedCustomer) throw Object.assign(new Error("Selected customer was not found"), { status: 400 });
        }
        const inserted = await client.query(
          `INSERT INTO orders
           (customer_id, staff_id, customer_name, phone, address, cargo, status, source, sales_channel, branch, payment_method, payment_status, subtotal, discount, amount_paid, change_due, notes, total, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'Delivered', 'pos', $7, $8, $9, 'Paid', $10, $11, $12, $13, $14, $15, $16)
           RETURNING id`,
          [
            linkedCustomer && linkedCustomer.id,
            access.staff.id,
            cleanText(linkedCustomer && linkedCustomer.name || data.customer_name || "Walk-in Customer", 120) || "Walk-in Customer",
            cleanText(data.phone, 80),
            cleanText(data.address, 300),
            cleanText(data.cargo, 160),
            salesChannel,
            branch,
            paymentMethod,
            subtotal,
            discount,
            amountPaid,
            changeDue,
            cleanText(data.notes, 500),
            total,
            createdAt,
          ]
        );
        const orderId = inserted.rows[0].id;
        const receipt = receiptNumber(orderId, createdAt);
        await client.query("UPDATE orders SET receipt_number = $1 WHERE id = $2", [receipt, orderId]);
        for (const item of prepared) {
          await client.query(
            "INSERT INTO order_items (order_id, product_id, product_name, product_image, price, requested_qty, qty, size, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Approved')",
            [orderId, item.product.id, item.product.name, item.product.image, item.product.price, item.qty, item.qty, item.selectedSize]
          );
          await recordInventoryMovement(client, {
            product: item.product,
            size: item.selectedSize,
            quantityDelta: -item.qty,
            movementType: "pos_sale",
            referenceType: "pos_sale",
            referenceId: orderId,
            performedByType: "staff",
            performedById: access.staff.id,
            performedByName: access.staff.name,
            note: receipt,
          });
        }
        const sale = await saleRecord(client, orderId);
        await client.query("COMMIT");
        return sendJson(req, res, 201, { sale });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, error.status || 500, { error: error.message || "POS sale failed" });
      }
    });
  }

  const voidPosSaleMatch = pathname.match(/^\/api\/pos\/sales\/(\d+)\/void$/);
  if (method === "POST" && voidPosSaleMatch) {
    const access = await requireStaffPermission(req, "pos.void");
    if (access.error) return sendJson(req, res, access.status, { error: access.error });
    const orderId = Number(voidPosSaleMatch[1]);
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const orderResult = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
        const order = orderResult.rows[0];
        if (!order || order.source !== "pos") throw Object.assign(new Error("POS sale not found"), { status: 404 });
        if (order.status === "Cancelled") throw Object.assign(new Error("This sale is already voided"), { status: 409 });
        const items = await client.query("SELECT * FROM order_items WHERE order_id = $1 AND status != 'Cancelled' FOR UPDATE", [orderId]);
        for (const item of items.rows) {
          const productResult = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [item.product_id]);
          const product = productResult.rows[0];
          if (!product) continue;
          await addProductSizeStock(client, item.product_id, item.size || "", Number(item.qty || 0));
          await recordInventoryMovement(client, {
            product,
            size: item.size || "",
            quantityDelta: Number(item.qty || 0),
            movementType: "pos_void",
            referenceType: "pos_sale",
            referenceId: orderId,
            performedByType: "staff",
            performedById: access.staff.id,
            performedByName: access.staff.name,
            note: cleanText(data.reason || `Voided ${order.receipt_number || "POS sale"}`, 300),
          });
        }
        await client.query("UPDATE order_items SET qty = 0, status = 'Cancelled' WHERE order_id = $1", [orderId]);
        await client.query("UPDATE orders SET status = 'Cancelled', payment_status = 'Voided', voided_at = $1, voided_by = $2, notes = CONCAT(COALESCE(notes, ''), $3::text) WHERE id = $4", [now(), access.staff.id, `\nVoid reason: ${cleanText(data.reason || "No reason provided", 300)}`, orderId]);
        const sale = await saleRecord(client, orderId);
        await client.query("COMMIT");
        return sendJson(req, res, 200, { sale });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, error.status || 500, { error: error.message || "Could not void POS sale" });
      }
    });
  }

  if (method === "POST" && pathname === "/api/newsletter") {
    const phone = normalizePhone(data.phone);
    if (phone.length < 7) return sendJson(req, res, 400, { error: "Enter a valid phone number" });
    try {
      await query("INSERT INTO newsletter_subscribers (phone, created_at) VALUES ($1, $2)", [phone, now()]);
      return sendJson(req, res, 201, { ok: true });
    } catch (error) {
      if (error.code === "23505") return sendJson(req, res, 409, { error: "This phone number is already subscribed" });
      throw error;
    }
  }

  const admin = pathname.startsWith("/api/admin/") ? await requireSession(req, "admin") : null;
  if (pathname.startsWith("/api/admin/") && !admin) return sendJson(req, res, 401, { error: "Admin login required" });

  if (pathname === "/api/admin/notifications/read" && method === "POST") {
    if (data.id) {
      await query("UPDATE notifications SET read_at = $1 WHERE id = $2 AND recipient_type = 'admin' AND recipient_id = $3", [now(), Number(data.id), admin.id]);
    } else {
      await query("UPDATE notifications SET read_at = $1 WHERE recipient_type = 'admin' AND recipient_id = $2 AND read_at IS NULL", [now(), admin.id]);
    }
    return sendJson(req, res, 200, { ok: true });
  }

  if (pathname === "/api/admin/catalog/install" && method === "POST") {
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const counts = await installCatalogSeed(client);
        await client.query("COMMIT");
        return sendJson(req, res, 201, { ok: true, counts, message: "40-product AI catalog installed" });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, 500, { error: error.message || "Catalog install failed" });
      }
    });
  }

  if (pathname === "/api/admin/catalog/seed" && method === "DELETE") {
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const products = await client.query("DELETE FROM products WHERE seed_batch = $1 RETURNING id", [CATALOG_BATCH]);
        const ads = await client.query("DELETE FROM ads WHERE seed_batch = $1 RETURNING id", [CATALOG_BATCH]);
        await client.query(
          `DELETE FROM categories c
           WHERE c.seed_batch = $1
             AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)`,
          [CATALOG_BATCH]
        );
        await client.query("COMMIT");
        return sendJson(req, res, 200, { ok: true, products: products.rowCount, ads: ads.rowCount, message: "AI seed catalog cleared" });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, 500, { error: error.message || "Catalog clear failed" });
      }
    });
  }

  if (pathname === "/api/admin/catalog/products" && method === "DELETE") {
    const removed = await query("DELETE FROM products RETURNING id");
    return sendJson(req, res, 200, { ok: true, products: removed.rowCount, message: "All products cleared; order history was preserved" });
  }

  if (pathname === "/api/admin/staff" && method === "POST") {
    const name = cleanText(data.name, 120);
    const username = cleanText(data.username, 80).toLowerCase();
    const password = String(data.password || "");
    const permissions = staffPermissions(data.permissions && data.permissions.length ? data.permissions : DEFAULT_STAFF_PERMISSIONS);
    if (name.length < 2) return sendJson(req, res, 400, { error: "Staff name is required" });
    if (!/^[a-z0-9._-]{3,80}$/.test(username)) return sendJson(req, res, 400, { error: "Username must be at least 3 characters and use letters, numbers, dot, dash or underscore" });
    if (password.length < 6) return sendJson(req, res, 400, { error: "Password must be at least 6 characters" });
    if (!permissions.length) return sendJson(req, res, 400, { error: "Choose at least one permission" });
    try {
      const createdAt = now();
      await query(
        `INSERT INTO staff_users (name, username, password_hash, role, permissions, active, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8)`,
        [name, username, securePasswordHash(password), cleanText(data.role || "Receptionist", 80), JSON.stringify(permissions), data.active === undefined ? true : toBool(data.active), admin.id, createdAt]
      );
      return sendJson(req, res, 201, { ok: true });
    } catch (error) {
      if (error.code === "23505") return sendJson(req, res, 409, { error: "This staff username is already used" });
      throw error;
    }
  }

  const staffMatch = pathname.match(/^\/api\/admin\/staff\/(\d+)$/);
  if (staffMatch && ["PUT", "DELETE"].includes(method)) {
    const staffId = Number(staffMatch[1]);
    const existing = await query("SELECT * FROM staff_users WHERE id = $1", [staffId]);
    if (!existing.rows[0]) return sendJson(req, res, 404, { error: "Staff account not found" });
    if (method === "DELETE") {
      await withClient(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("UPDATE staff_users SET active = false, updated_at = $1 WHERE id = $2", [now(), staffId]);
          await client.query("DELETE FROM sessions WHERE user_type = 'staff' AND user_id = $1", [staffId]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
      return sendJson(req, res, 200, { ok: true });
    }

    const name = cleanText(data.name || existing.rows[0].name, 120);
    const username = cleanText(data.username || existing.rows[0].username, 80).toLowerCase();
    const permissions = staffPermissions(data.permissions);
    const password = String(data.password || "");
    if (name.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(username)) return sendJson(req, res, 400, { error: "Enter a valid name and username" });
    if (password && password.length < 6) return sendJson(req, res, 400, { error: "New password must be at least 6 characters" });
    if (!permissions.length) return sendJson(req, res, 400, { error: "Choose at least one permission" });
    try {
      await withClient(async (client) => {
        await client.query("BEGIN");
        try {
          const active = data.active === undefined ? toBool(existing.rows[0].active) : toBool(data.active);
          await client.query(
            `UPDATE staff_users
             SET name=$1, username=$2, role=$3, permissions=$4::jsonb, active=$5, password_hash=$6, updated_at=$7
             WHERE id=$8`,
            [name, username, cleanText(data.role || "Receptionist", 80), JSON.stringify(permissions), active, password ? securePasswordHash(password) : existing.rows[0].password_hash, now(), staffId]
          );
          if (password || !active) await client.query("DELETE FROM sessions WHERE user_type = 'staff' AND user_id = $1", [staffId]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
      return sendJson(req, res, 200, { ok: true });
    } catch (error) {
      if (error.code === "23505") return sendJson(req, res, 409, { error: "This staff username is already used" });
      throw error;
    }
  }

  if (pathname === "/api/admin/profile" && method === "PUT") {
    const nextUsername = String(data.username || "").trim();
    const currentPassword = String(data.current_password || "");
    const nextPassword = String(data.new_password || "");
    const currentToken = getAuthToken(req);

    if (nextUsername.length < 3) return sendJson(req, res, 400, { error: "Username must be at least 3 characters" });
    if (!currentPassword) return sendJson(req, res, 400, { error: "Current password is required" });
    if (hashPassword(currentPassword) !== admin.password_hash) return sendJson(req, res, 403, { error: "Current password is wrong" });
    if (nextPassword && nextPassword.length < 6) return sendJson(req, res, 400, { error: "New password must be at least 6 characters" });

    const duplicate = await query("SELECT id FROM admin_users WHERE username = $1 AND id <> $2", [nextUsername, admin.id]);
    if (duplicate.rows[0]) return sendJson(req, res, 409, { error: "This username is already used" });

    await query(
      "UPDATE admin_users SET username = $1, password_hash = $2 WHERE id = $3",
      [nextUsername, nextPassword ? hashPassword(nextPassword) : admin.password_hash, admin.id]
    );
    if (nextPassword) {
      await query("DELETE FROM sessions WHERE user_type = 'admin' AND user_id = $1 AND token <> $2", [admin.id, currentToken]);
    }
    return sendJson(req, res, 200, { ok: true, admin: { id: admin.id, username: nextUsername } });
  }

  if (pathname === "/api/admin/categories" && method === "POST") {
    await query("INSERT INTO categories (name, description, price_mode, sort_order, created_at) VALUES ($1, $2, $3, $4, $5)", [data.name || "Category", data.description || "", data.price_mode || "range", Number.parseInt(data.sort_order || 0, 10) || 0, now()]);
    return sendJson(req, res, 201, { ok: true });
  }

  const categoryMatch = pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (categoryMatch) {
    const id = Number(categoryMatch[1]);
    if (method === "PUT") await query("UPDATE categories SET name = $1, description = $2, price_mode = $3, sort_order = $4 WHERE id = $5", [data.name || "Category", data.description || "", data.price_mode || "range", Number.parseInt(data.sort_order || 0, 10) || 0, id]);
    if (method === "DELETE") await query("DELETE FROM categories WHERE id = $1", [id]);
    return sendJson(req, res, 200, { ok: true });
  }

  if (pathname === "/api/admin/products" && method === "POST") {
    const images = productImageList(data);
    const sizes = productSizes(data);
    const totalStock = productTotalStock(sizes);
    await query(
      `INSERT INTO products
       (category_id, name, price, old_price, badge, rating, stock, product_sizes, image, images, crop, description, ai_type, ai_images, ai_prompts, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17)`,
      [
        Number(data.category_id || 1),
        data.name || "Product",
        Math.min(10, Math.max(1, Number(data.price) || 1)),
        data.old_price ? Number(data.old_price) : null,
        data.badge || "",
        data.rating || "4.8",
        totalStock,
        JSON.stringify(sizes),
        images[0],
        JSON.stringify(images),
        data.crop || "center",
        data.description || "",
        data.ai_type || "top",
        JSON.stringify(jsonList(data.ai_images)),
        JSON.stringify(jsonList(data.ai_prompts)),
        totalStock > 0,
        now(),
      ]
    );
    return sendJson(req, res, 201, { ok: true });
  }

  const aiPackMatch = pathname.match(/^\/api\/admin\/products\/(\d+)\/ai-pack$/);
  if (aiPackMatch && method === "POST") {
    const productId = Number(aiPackMatch[1]);
    const product = await query("SELECT * FROM products WHERE id = $1", [productId]);
    if (!product.rows[0]) return sendJson(req, res, 404, { error: "Product not found" });
    const aiType = data.ai_type || product.rows[0].ai_type || "top";
    const reference = await query("SELECT value FROM settings WHERE key = 'ai_model_reference'");
    const prompts = aiProductPrompts(product.rows[0], aiType, Boolean(reference.rows[0] && reference.rows[0].value));
    const storedKey = await query("SELECT value FROM settings WHERE key = 'openai_api_key'");
    const apiKey = (process.env.OPENAI_API_KEY || (storedKey.rows[0] && storedKey.rows[0].value) || "").trim();
    let generatedImages = [];
    let aiError = "";
    try {
      generatedImages = await generateAiImages(prompts, apiKey);
    } catch (error) {
      aiError = error.message || String(error);
    }
    const imagesToStore = generatedImages.length ? generatedImages : jsonList(product.rows[0].ai_images);
    await query("UPDATE products SET ai_type = $1, ai_prompts = $2::jsonb, ai_images = $3::jsonb WHERE id = $4", [aiType, JSON.stringify(prompts), JSON.stringify(imagesToStore), productId]);
    const friendly = friendlyAiError(aiError);
    return sendJson(req, res, 200, {
      ok: true,
      ai_type: aiType,
      prompts,
      images: imagesToStore,
      generated: generatedImages.length,
      message: generatedImages.length ? "AI images generated" : friendly ? `AI images were not generated: ${friendly}` : !apiKey ? "OpenAI API key is missing" : "AI prompts saved, but no images were returned",
      error: friendly,
    });
  }

  const productMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    if (method === "PUT") {
      const images = productImageList(data);
      const sizes = productSizes(data);
      const totalStock = productTotalStock(sizes);
      await query(
        `UPDATE products
         SET category_id=$1, name=$2, price=$3, old_price=$4, badge=$5, rating=$6, stock=$7, product_sizes=$8::jsonb, image=$9, images=$10::jsonb, crop=$11, description=$12, ai_type=$13, ai_images=$14::jsonb, ai_prompts=$15::jsonb, active=$16
         WHERE id=$17`,
        [Number(data.category_id || 1), data.name || "Product", Math.min(10, Math.max(1, Number(data.price) || 1)), data.old_price ? Number(data.old_price) : null, data.badge || "", data.rating || "4.8", totalStock, JSON.stringify(sizes), images[0], JSON.stringify(images), data.crop || "center", data.description || "", data.ai_type || "top", JSON.stringify(jsonList(data.ai_images)), JSON.stringify(jsonList(data.ai_prompts)), totalStock > 0, id]
      );
    }
    if (method === "DELETE") await query("DELETE FROM products WHERE id = $1", [id]);
    return sendJson(req, res, 200, { ok: true });
  }

  if (pathname === "/api/admin/ads" && method === "POST") {
    await query("INSERT INTO ads (title, subtitle, button_text, link, image, active, sort_order, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [data.title || "Ad", data.subtitle || "", data.button_text || "Shop Now", data.link || "#/shop", data.image || "assets/ai-hero.png", toBool(data.active !== undefined ? data.active : true), Number.parseInt(data.sort_order || 0, 10) || 0, now()]);
    return sendJson(req, res, 201, { ok: true });
  }

  const adMatch = pathname.match(/^\/api\/admin\/ads\/(\d+)$/);
  if (adMatch) {
    const id = Number(adMatch[1]);
    if (method === "PUT") await query("UPDATE ads SET title=$1, subtitle=$2, button_text=$3, link=$4, image=$5, active=$6, sort_order=$7 WHERE id=$8", [data.title || "Ad", data.subtitle || "", data.button_text || "Shop Now", data.link || "#/shop", data.image || "assets/ai-hero.png", toBool(data.active !== undefined ? data.active : true), Number.parseInt(data.sort_order || 0, 10) || 0, id]);
    if (method === "DELETE") await query("DELETE FROM ads WHERE id = $1", [id]);
    return sendJson(req, res, 200, { ok: true });
  }

  const orderMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (orderMatch && method === "PUT") {
    const orderId = Number(orderMatch[1]);
    const status = ["Processing", "Approved", "Packed", "Delivered", "Cancelled"].includes(data.status) ? data.status : "Processing";
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const orderState = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
        if (!orderState.rows[0]) throw Object.assign(new Error("Order not found"), { status: 404 });
        if (orderState.rows[0].status === "Cancelled" && status !== "Cancelled") {
          throw Object.assign(new Error("A cancelled order cannot be reopened because its stock was already restored"), { status: 409 });
        }
        if (status === "Cancelled") {
          const activeItems = await client.query("SELECT * FROM order_items WHERE order_id = $1 AND status != 'Cancelled'", [orderId]);
          for (const item of activeItems.rows) {
            await addProductSizeStock(client, item.product_id, item.size || "", Number(item.qty || 0));
            await recordInventoryMovement(client, {
              product: { id: item.product_id, name: item.product_name },
              size: item.size || "",
              quantityDelta: Number(item.qty || 0),
              movementType: orderState.rows[0].source === "pos" ? "pos_void" : "online_order_cancel",
              referenceType: orderState.rows[0].source === "pos" ? "pos_sale" : "order",
              referenceId: orderId,
              performedByType: "admin",
              performedById: admin.id,
              performedByName: admin.username,
            });
          }
          await client.query("UPDATE order_items SET qty = 0, status = 'Cancelled' WHERE order_id = $1", [orderId]);
          if (orderState.rows[0].source === "pos") {
            await client.query("UPDATE orders SET status = 'Cancelled', payment_status = 'Voided', voided_at = $1, notes = CONCAT(COALESCE(notes, ''), $2::text) WHERE id = $3", [now(), `\nVoided by admin ${admin.username}`, orderId]);
          } else {
            await client.query("UPDATE orders SET status = 'Cancelled', total = 0 WHERE id = $1", [orderId]);
          }
        } else {
          await client.query("UPDATE orders SET status = $1 WHERE id = $2", [status, orderId]);
        }
        if (orderState.rows[0].status !== status) await notifyCustomerOrderStatus(client, orderState.rows[0], status);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    return sendJson(req, res, 200, { ok: true });
  }

  const orderItemMatch = pathname.match(/^\/api\/admin\/order-items\/(\d+)$/);
  if (orderItemMatch && method === "PUT") {
    const itemId = Number(orderItemMatch[1]);
    return withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const itemResult = await client.query("SELECT oi.*, o.source AS order_source, o.status AS order_status, o.customer_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = $1", [itemId]);
        const item = itemResult.rows[0];
        if (!item) throw Object.assign(new Error("Order item not found"), { status: 404 });
        if (item.order_source === "pos") throw Object.assign(new Error("Completed POS receipts cannot be edited. Void the sale and create a corrected receipt instead."), { status: 409 });
        let newStatus = data.status || item.status || "Processing";
        if (!["Processing", "Approved", "Cancelled"].includes(newStatus)) newStatus = "Processing";
        const requestedQty = Math.max(1, Number.parseInt(item.requested_qty || item.qty || 1, 10) || 1);
        let newQty = Math.min(requestedQty, Math.max(0, Number.parseInt(data.qty !== undefined ? data.qty : item.qty || 0, 10) || 0));
        if (newStatus === "Cancelled") newQty = 0;
        const oldReserved = item.status !== "Cancelled" ? Number(item.qty || 0) : 0;
        const newReserved = newStatus !== "Cancelled" ? newQty : 0;
        const stockDelta = oldReserved - newReserved;
        const productResult = await client.query("SELECT stock, name, product_sizes FROM products WHERE id = $1 FOR UPDATE", [item.product_id]);
        const product = productResult.rows[0];
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const sizes = productSizes(product);
        const requestedItemSize = String(item.size || "").trim().toUpperCase();
        const itemSize = requestedItemSize || (sizes.length === 1 && sizes[0].size === "ONE SIZE" ? "ONE SIZE" : "");
        if (sizes.length && itemSize) {
          const sizeRow = sizes.find((row) => row.size === itemSize);
          if (stockDelta >= 0) {
            await addProductSizeStock(client, item.product_id, itemSize, stockDelta);
          } else {
            const needed = Math.abs(stockDelta);
            if (!sizeRow || Number(sizeRow.stock || 0) < needed) throw Object.assign(new Error(`Only ${Number(sizeRow && sizeRow.stock || 0)} left for ${product.name} size ${itemSize}`), { status: 409 });
            sizeRow.stock = Number(sizeRow.stock || 0) - needed;
            await client.query("UPDATE products SET stock = $1, product_sizes = $2::jsonb WHERE id = $3", [productTotalStock(sizes), JSON.stringify(sizes), item.product_id]);
          }
        } else {
          const newStock = Number(product.stock || 0) + stockDelta;
          if (newStock < 0) throw Object.assign(new Error(`Not enough stock for ${product.name}`), { status: 409 });
          await client.query("UPDATE products SET stock = $1 WHERE id = $2", [newStock, item.product_id]);
        }
        await syncProductVisibility(client, item.product_id);
        if (stockDelta) {
          await recordInventoryMovement(client, {
            product: { id: item.product_id, name: product.name },
            size: itemSize,
            quantityDelta: stockDelta,
            movementType: "online_order_adjustment",
            referenceId: item.order_id,
            performedByType: "admin",
            performedById: admin.id,
            performedByName: admin.username,
          });
        }
        await client.query("UPDATE order_items SET qty = $1, status = $2 WHERE id = $3", [newQty, newStatus, itemId]);
        await recalcOrder(client, item.order_id);
        await notifyCustomerOrderItemChange(client, item, newQty, newStatus);
        await client.query("COMMIT");
        return sendJson(req, res, 200, { ok: true });
      } catch (error) {
        await client.query("ROLLBACK");
        return sendJson(req, res, error.status || 500, { error: error.message || "Order item update failed" });
      }
    });
  }

  if (pathname === "/api/admin/settings" && method === "PUT") {
    for (const [key, rawValue] of Object.entries(data)) {
      const value = Array.isArray(rawValue) || (rawValue && typeof rawValue === "object") ? JSON.stringify(rawValue) : String(rawValue);
      await query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value]);
    }
    return sendJson(req, res, 200, { ok: true });
  }

  return sendJson(req, res, 404, { error: "Route not found" });
}

function serveStatic(req, res, pathname) {
  let safePath = pathname === "/" ? "/index.html" : pathname;
  if (safePath === "/admin") safePath = "/admin.html";
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    const finalPath = error ? path.join(ROOT, "index.html") : filePath;
    fs.readFile(finalPath, (indexError, finalContent) => {
      if (indexError) {
        res.writeHead(404);
        return res.end("Not found");
      }
      const ext = path.extname(finalPath).toLowerCase();
      res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
      res.end(error ? finalContent : content);
    });
  });
}

let initPromise = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = initDb().catch((error) => {
      databaseStartupError = error.message || String(error);
      console.error("Database startup check failed:", databaseStartupError);
    });
  }
  return initPromise;
}

async function handleRequest(req, res) {
  await ensureInit();
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
  try {
    if (req.method === "OPTIONS") return cors(res);
    if (pathname.startsWith("/api/")) {
      if (!DATABASE_URL.trim()) return sendJson(req, res, 500, { error: "DATABASE_URL is missing on the backend host" });
      const limited = rateLimitError(req, pathname);
      if (limited) return sendJson(req, res, limited.status, { error: limited.error });
      const badOrigin = originError(req);
      if (badOrigin) return sendJson(req, res, badOrigin.status, { error: badOrigin.error });
      if (req.method === "GET") return await handleGet(req, res, pathname);
      if (["POST", "PUT", "DELETE"].includes(req.method)) return await handlePostPutDelete(req, res, req.method, pathname);
      return sendJson(req, res, 405, { error: "Method not allowed" });
    }
    return serveStatic(req, res, pathname);
  } catch (error) {
    return sendJson(req, res, error.status || 500, { error: error.message || "Server error" });
  }
}

function startServer() {
  ensureInit().finally(() => {
    const server = http.createServer(handleRequest);
    server.listen(PORT, HOST, () => {
      console.log(`ONE TEN Node backend running on ${HOST}:${PORT}`);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = handleRequest;
module.exports._test = {
  customerOrderStatusCopy,
  normalizeSaleItems,
  passwordMatches,
  receiptNumber,
  securePasswordHash,
  staffPermissions,
};
