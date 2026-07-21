/* eslint-disable @next/next/no-img-element */
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const emptyData = {
  staff: null,
  permissions: [],
  categories: [],
  products: [],
  inventory_products: [],
  pos_sales: [],
  online_orders: [],
  customers: [],
  reports: {},
  inventory_movements: [],
  settings: {},
};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function assetUrl(value) {
  const source = String(value || "/assets/ai-products.png");
  if (/^(https?:|data:|blob:|\/)/.test(source)) return source;
  return `/${source}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function itemKey(item) {
  return `${item.id}::${String(item.size || "").toUpperCase()}`;
}

function productImages(product) {
  const images = [product && product.image, ...(Array.isArray(product && product.images) ? product.images : [])].filter(Boolean);
  return [...new Set(images.length ? images : ["/assets/ai-products.png"])];
}

async function staffApi(path, options = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("staffToken") : "";
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function Login({ onLogin, message, settings }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(event) {
    event.preventDefault();
    setBusy(true);
    onLogin(username, password).finally(() => setBusy(false));
  }

  return (
    <main className="pos-login-page">
      <section className="pos-login-brand">
        <Link href="/" aria-label="ONE TEN home">
          <img src={assetUrl(settings.logo_night || settings.logo_image || "/assets/logo-white.png")} alt="ONE TEN" />
        </Link>
        <span>Store operations</span>
        <h1>One stock.<br />Every sale.</h1>
        <p>The in-store POS and online shop share the same live inventory.</p>
        <div className="pos-login-points">
          <span>✓ Stock by size</span>
          <span>✓ Automatic receipts</span>
          <span>✓ Admin-controlled access</span>
        </div>
      </section>
      <section className="pos-login-panel">
        <form onSubmit={submit}>
          <img src={assetUrl(settings.logo_day || settings.logo_image || "/assets/logo-red.png")} alt="ONE TEN" />
          <p className="pos-kicker">Receptionist / Seller</p>
          <h2>Sign in to POS</h2>
          <p>Use the account created for you by the administrator.</p>
          {message && <div className="pos-alert error">{message}</div>}
          <label>
            <span>Username</span>
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button disabled={busy} type="submit">{busy ? "Signing in..." : "Open Point of Sale"}</button>
          <Link href="/">Back to online store</Link>
        </form>
      </section>
    </main>
  );
}

function ProductCard({ product, onAdd, onView }) {
  const sizes = Array.isArray(product.product_sizes) ? product.product_sizes.filter((item) => Number(item.stock) > 0) : [];
  return (
    <article className="pos-product-card">
      <div className="pos-product-media">
        <img src={assetUrl(productImages(product)[0])} alt={product.name} />
        {product.badge && <span>{product.badge}</span>}
        <button onClick={() => onView(product)} type="button">View</button>
      </div>
      <div>
        <span>{product.category || "Product"}</span>
        <h3>{product.name}</h3>
        <div className="pos-product-meta"><strong>{money(product.price)}</strong><em>{product.stock} in stock</em></div>
        <div className="pos-size-buttons">
          {sizes.map((size) => (
            <button key={size.size} onClick={() => onAdd(product, size.size)} type="button">
              {size.size}<small>{size.stock}</small>
            </button>
          ))}
          {!sizes.length && <button onClick={() => onAdd(product, "")} type="button">Add</button>}
        </div>
      </div>
    </article>
  );
}

function ProductQuickView({ product, onAdd, onClose }) {
  const [detail, setDetail] = useState(product);
  const [activeImage, setActiveImage] = useState(productImages(product)[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setDetail(product);
    setActiveImage(productImages(product)[0]);
    setLoading(true);
    staffApi(`/api/public/products/${product.id}`)
      .then((payload) => {
        if (!active || !payload.product) return;
        setDetail(payload.product);
        setActiveImage(productImages(payload.product)[0]);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [product]);

  const images = productImages(detail);
  const sizes = Array.isArray(detail.product_sizes) ? detail.product_sizes.filter((item) => Number(item.stock) > 0) : [];
  return <div className="pos-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${detail.name} details`}>
    <section className="pos-product-view" onClick={(event) => event.stopPropagation()}>
      <button className="pos-product-view-close" onClick={onClose} type="button" aria-label="Close">×</button>
      <div className="pos-product-view-gallery">
        <img src={assetUrl(activeImage)} alt={detail.name} />
        {images.length > 1 && <div>{images.map((image, index) => <button className={image === activeImage ? "active" : ""} key={`${image}-${index}`} onClick={() => setActiveImage(image)} type="button"><img src={assetUrl(image)} alt={`${detail.name} ${index + 1}`} /></button>)}</div>}
      </div>
      <div className="pos-product-view-copy">
        <span>{detail.category || "Product"}</span>
        <h2>{detail.name}</h2>
        <div className="pos-product-view-price"><strong>{money(detail.price)}</strong>{detail.old_price && <del>{money(detail.old_price)}</del>}</div>
        <p>{detail.description || "Product details and live store inventory."}</p>
        <div className="pos-product-view-stock"><strong>{detail.stock} available</strong><span>Live online + in-store inventory</span></div>
        <div className="pos-product-view-sizes">
          {sizes.map((size) => <button key={size.size} onClick={() => { onAdd(detail, size.size); onClose(); }} type="button"><strong>{size.size}</strong><small>{size.stock} left</small></button>)}
          {!sizes.length && <button onClick={() => { onAdd(detail, ""); onClose(); }} type="button"><strong>Add product</strong></button>}
        </div>
        {loading && <small className="pos-product-view-loading">Loading full gallery...</small>}
      </div>
    </section>
  </div>;
}

function Receipt({ sale, settings, onClose }) {
  if (!sale) return null;
  const visibleQty = (item) => Number(item.qty || item.requested_qty || 0);
  return (
    <div className="pos-modal-backdrop" role="dialog" aria-modal="true" aria-label="Sale receipt">
      <div className="pos-receipt-modal">
        <div className="receipt-actions no-print">
          <button onClick={() => window.print()} type="button">Print Receipt</button>
          <button className="secondary" onClick={onClose} type="button">Close</button>
        </div>
        <article className="print-receipt">
          <img src={assetUrl(settings.logo_day || settings.logo_image || "/assets/logo-red.png")} alt="ONE TEN" />
          <h2>ONE TEN</h2>
          <p>{settings.location || "Hargaysa"} · {settings.phone || ""}</p>
          <div className="receipt-rule" />
          <dl>
            <div><dt>Receipt</dt><dd>{sale.receipt_number}</dd></div>
            <div><dt>Date</dt><dd>{formatDate(sale.created_at)}</dd></div>
            <div><dt>Cashier</dt><dd>{sale.staff_name || "Staff"}</dd></div>
            <div><dt>Customer</dt><dd>{sale.customer_name || "Walk-in Customer"}</dd></div>
          </dl>
          <div className="receipt-rule" />
          <div className="receipt-lines">
            {(sale.order_items || []).map((item) => (
              <div key={item.id || `${item.product_id}-${item.size}`}>
                <span>{item.product_name}{item.size ? ` / ${item.size}` : ""}<small>{visibleQty(item)} × {money(item.price)}</small></span>
                <strong>{money(Number(item.price) * visibleQty(item))}</strong>
              </div>
            ))}
          </div>
          <div className="receipt-rule" />
          <dl className="receipt-totals">
            <div><dt>Subtotal</dt><dd>{money(sale.subtotal)}</dd></div>
            {Number(sale.discount) > 0 && <div><dt>Discount</dt><dd>-{money(sale.discount)}</dd></div>}
            <div className="grand"><dt>Total</dt><dd>{money(sale.total)}</dd></div>
            <div><dt>Paid · {sale.payment_method}</dt><dd>{money(sale.amount_paid)}</dd></div>
            <div><dt>Change</dt><dd>{money(sale.change_due)}</dd></div>
          </dl>
          <p className="receipt-thanks">Thank you for shopping at ONE TEN.</p>
          {sale.status === "Cancelled" && <strong className="receipt-void">VOIDED</strong>}
        </article>
      </div>
    </div>
  );
}

function SaleWorkspace({ data, refresh, notify }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ id: "", name: "", phone: "", payment_method: "Cash", discount: "0", amount_paid: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);

  const products = useMemo(() => (data.products || []).filter((product) => {
    const searchMatch = `${product.name} ${product.category || ""} ${product.id}`.toLowerCase().includes(query.trim().toLowerCase());
    const categoryMatch = category === "all" || String(product.category_id) === String(category);
    return searchMatch && categoryMatch;
  }), [data.products, query, category]);

  const lines = useMemo(() => cart.map((line) => {
    const product = (data.products || []).find((item) => String(item.id) === String(line.id));
    return product ? { ...line, product } : null;
  }).filter(Boolean), [cart, data.products]);
  const subtotal = lines.reduce((sum, line) => sum + Number(line.product.price) * Number(line.qty), 0);
  const discount = Math.min(subtotal, Math.max(0, Number(customer.discount) || 0));
  const total = Number((subtotal - discount).toFixed(2));
  const paid = customer.amount_paid === "" ? total : Math.max(0, Number(customer.amount_paid) || 0);
  const change = Math.max(0, paid - total);

  function sizeStock(product, size) {
    const sizes = Array.isArray(product.product_sizes) ? product.product_sizes : [];
    if (!sizes.length) return Number(product.stock || 0);
    const match = sizes.find((item) => String(item.size) === String(size));
    return Number(match && match.stock || 0);
  }

  function add(product, size) {
    const key = itemKey({ id: product.id, size });
    const existing = cart.find((item) => itemKey(item) === key);
    const nextQty = Number(existing && existing.qty || 0) + 1;
    const available = sizeStock(product, size);
    if (nextQty > available) return notify(`Only ${available} left for ${product.name}${size ? ` size ${size}` : ""}`, "error");
    setCart(existing ? cart.map((item) => itemKey(item) === key ? { ...item, qty: nextQty } : item) : [{ id: product.id, size, qty: 1 }, ...cart]);
  }

  function changeQty(line, delta) {
    const next = Number(line.qty) + delta;
    if (next <= 0) return setCart(cart.filter((item) => itemKey(item) !== itemKey(line)));
    const available = sizeStock(line.product, line.size);
    if (next > available) return notify(`Only ${available} in stock`, "error");
    setCart(cart.map((item) => itemKey(item) === itemKey(line) ? { ...item, qty: next } : item));
  }

  function completeSale() {
    if (!lines.length) return notify("Add at least one product", "error");
    if (paid < total) return notify(`Amount paid must be at least ${money(total)}`, "error");
    setBusy(true);
    staffApi("/api/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        items: cart,
        customer_id: customer.id || null,
        customer_name: customer.name || "Walk-in Customer",
        phone: customer.phone,
        payment_method: customer.payment_method,
        discount,
        amount_paid: paid,
        notes: customer.notes,
      }),
    }).then((payload) => {
      setReceipt(payload.sale);
      setCart([]);
      setCustomer({ id: "", name: "", phone: "", payment_method: "Cash", discount: "0", amount_paid: "", notes: "" });
      notify(`${payload.sale.receipt_number} completed. Stock is now synced.`, "success");
      return refresh();
    }).catch((error) => notify(error.message, "error")).finally(() => setBusy(false));
  }

  return (
    <div className="pos-sale-layout">
      <section className="pos-catalog">
        <div className="pos-catalog-toolbar">
          <div><span>Live inventory</span><h2>Choose products</h2></div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or ID..." />
        </div>
        <div className="pos-category-strip">
          <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")} type="button">All</button>
          {(data.categories || []).map((item) => <button className={String(category) === String(item.id) ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)} type="button">{item.name}</button>)}
        </div>
        <div className="pos-product-grid">
          {products.map((product) => <ProductCard key={product.id} product={product} onAdd={add} onView={setViewProduct} />)}
          {!products.length && <div className="pos-empty"><h3>No products found</h3><p>Try a different name or category.</p></div>}
        </div>
      </section>
      <aside className="pos-cart-panel">
        <div className="pos-cart-title"><div><span>Current sale</span><h2>{lines.length} lines</h2></div>{lines.length > 0 && <button onClick={() => setCart([])} type="button">Clear</button>}</div>
        <div className="pos-cart-lines">
          {lines.map((line) => (
            <article key={itemKey(line)}>
              <img src={assetUrl(line.product.image)} alt="" />
              <div><strong>{line.product.name}</strong><span>{line.size || "ONE SIZE"} · {money(line.product.price)}</span><div><button onClick={() => changeQty(line, -1)} type="button">−</button><b>{line.qty}</b><button onClick={() => changeQty(line, 1)} type="button">+</button></div></div>
              <strong>{money(Number(line.product.price) * Number(line.qty))}</strong>
            </article>
          ))}
          {!lines.length && <div className="pos-empty cart"><span>＋</span><h3>Sale is empty</h3><p>Select a product and size to begin.</p></div>}
        </div>
        <div className="pos-customer-fields">
          {(data.customers || []).length > 0 && <select className="pos-customer-select" value={customer.id} onChange={(event) => {
            const linked = (data.customers || []).find((item) => String(item.id) === String(event.target.value));
            setCustomer({ ...customer, id: event.target.value, name: linked ? linked.name : "", phone: linked && linked.phone || "" });
          }}><option value="">Walk-in / unregistered customer</option>{(data.customers || []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select>}
          <input value={customer.name} onChange={(event) => setCustomer({ ...customer, id: "", name: event.target.value })} placeholder="Customer name (optional)" />
          <input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} placeholder="Phone (optional)" />
          <div><select value={customer.payment_method} onChange={(event) => setCustomer({ ...customer, payment_method: event.target.value })}>{["Cash", "ZAAD", "eDahab", "Card", "Other"].map((method) => <option key={method}>{method}</option>)}</select><input min="0" step="0.01" type="number" value={customer.discount} onChange={(event) => setCustomer({ ...customer, discount: event.target.value })} placeholder="Discount" /></div>
          <input min="0" step="0.01" type="number" value={customer.amount_paid} onChange={(event) => setCustomer({ ...customer, amount_paid: event.target.value })} placeholder={`Amount paid · ${money(total)}`} />
          <textarea value={customer.notes} onChange={(event) => setCustomer({ ...customer, notes: event.target.value })} placeholder="Sale note (optional)" />
        </div>
        <div className="pos-totals"><p><span>Subtotal</span><strong>{money(subtotal)}</strong></p><p><span>Discount</span><strong>−{money(discount)}</strong></p><p className="grand"><span>Total</span><strong>{money(total)}</strong></p><p><span>Change</span><strong>{money(change)}</strong></p></div>
        <button className="pos-pay-button" disabled={busy || !lines.length} onClick={completeSale} type="button">{busy ? "Completing sale..." : `Complete Sale · ${money(total)}`}</button>
      </aside>
      <Receipt sale={receipt} settings={data.settings || {}} onClose={() => setReceipt(null)} />
      {viewProduct && <ProductQuickView product={viewProduct} onAdd={add} onClose={() => setViewProduct(null)} />}
    </div>
  );
}

function History({ data, refresh, notify }) {
  const [receipt, setReceipt] = useState(null);
  const [query, setQuery] = useState("");
  const canVoid = (data.permissions || []).includes("pos.void");
  const sales = (data.pos_sales || []).filter((sale) => `${sale.receipt_number} ${sale.customer_name} ${sale.staff_name} ${sale.payment_method}`.toLowerCase().includes(query.toLowerCase()));

  function voidSale(sale) {
    const reason = window.prompt(`Reason for voiding ${sale.receipt_number}?`);
    if (reason === null) return;
    staffApi(`/api/pos/sales/${sale.id}/void`, { method: "POST", body: JSON.stringify({ reason }) })
      .then(() => { notify(`${sale.receipt_number} voided and stock restored`, "success"); return refresh(); })
      .catch((error) => notify(error.message, "error"));
  }

  return (
    <section className="pos-page-panel">
      <div className="pos-page-heading"><div><span>Receipts & returns</span><h2>In-store Sale History</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search receipt, customer or cashier..." /></div>
      <div className="pos-history-list">
        {sales.map((sale) => <article key={sale.id}>
          <div className="pos-history-status"><span className={sale.status === "Cancelled" ? "void" : "paid"}>{sale.status === "Cancelled" ? "Voided" : "Paid"}</span><small>{sale.payment_method}</small></div>
          <div><strong>{sale.receipt_number}</strong><span>{formatDate(sale.created_at)}</span></div>
          <div><strong>{sale.customer_name || "Walk-in Customer"}</strong><span>Cashier: {sale.staff_name || "Staff"}</span></div>
          <div><strong>{money(sale.total)}</strong><span>{(sale.order_items || []).length} lines</span></div>
          <div className="pos-row-actions"><button onClick={() => setReceipt(sale)} type="button">Receipt</button>{canVoid && sale.status !== "Cancelled" && <button className="danger" onClick={() => voidSale(sale)} type="button">Void</button>}</div>
        </article>)}
        {!sales.length && <div className="pos-empty"><h3>No POS sales found</h3></div>}
      </div>
      <Receipt sale={receipt} settings={data.settings || {}} onClose={() => setReceipt(null)} />
    </section>
  );
}

function Inventory({ data }) {
  const [query, setQuery] = useState("");
  const products = (data.inventory_products || data.products || []).filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="pos-page-panel"><div className="pos-page-heading"><div><span>Shared online + store stock</span><h2>Live Inventory</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory..." /></div><div className="pos-inventory-grid">{products.map((product) => <article key={product.id}><img src={assetUrl(product.image)} alt="" /><div><strong>{product.name}</strong><span>{product.category}</span></div><div className="pos-stock-pills">{(product.product_sizes || []).map((size) => <span key={size.size}>{size.size}<b>{size.stock}</b></span>)}</div><strong className={Number(product.stock) <= 3 ? "low" : ""}>{product.stock} total</strong></article>)}</div></section>;
}

function OnlineOrders({ data }) {
  return <section className="pos-page-panel"><div className="pos-page-heading"><div><span>Website channel</span><h2>Online Orders</h2></div><strong>{(data.online_orders || []).length} recent orders</strong></div><div className="pos-history-list">{(data.online_orders || []).map((order) => <article key={order.id}><div className="pos-history-status"><span className="online">Online</span><small>{order.status}</small></div><div><strong>Order #{order.id}</strong><span>{formatDate(order.created_at)}</span></div><div><strong>{order.customer_name}</strong><span>{order.phone}</span></div><div><strong>{money(order.total)}</strong><span>{order.items || (order.order_items || []).length} lines</span></div></article>)}</div></section>;
}

function Customers({ data }) {
  const customers = data.customers || [];
  const [selected, setSelected] = useState(null);
  const topCustomer = customers.reduce((best, customer) => Number(customer.total_spent || 0) > Number(best && best.total_spent || 0) ? customer : best, null);
  return <section className="pos-page-panel">
    <div className="pos-page-heading"><div><span>Customer directory</span><h2>Registered Customers</h2></div><strong>{customers.length} accounts</strong></div>
    {topCustomer && <button className="pos-top-customer" onClick={() => setSelected(topCustomer)} type="button"><span>{String(topCustomer.name || "C").slice(0, 1).toUpperCase()}</span><div><small>Top customer</small><strong>{topCustomer.name}</strong><em>{topCustomer.email || topCustomer.phone}</em></div><div><small>Lifetime spend</small><strong>{money(topCustomer.total_spent)}</strong><em>{topCustomer.order_count || 0} orders</em></div><b>View profile</b></button>}
    <div className="pos-customer-grid">{customers.map((customer) => <button key={customer.id} onClick={() => setSelected(customer)} type="button"><span>{String(customer.name || "C").slice(0, 1).toUpperCase()}</span><div><strong>{customer.name}</strong><small>{customer.email}</small></div><div><b>{customer.order_count || 0}</b><small>orders</small></div><div><b>{money(customer.total_spent)}</b><small>spent</small></div><em>View</em></button>)}</div>
    {selected && <PosCustomerDetail customer={selected} data={data} onClose={() => setSelected(null)} />}
  </section>;
}

function PosCustomerDetail({ customer, data, onClose }) {
  const orders = [...(data.online_orders || []), ...(data.pos_sales || [])].filter((order) => String(order.customer_id) === String(customer.id)).sort((a, b) => Number(b.id) - Number(a.id));
  return <div className="pos-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${customer.name} profile`}>
    <section className="pos-customer-detail" onClick={(event) => event.stopPropagation()}>
      <button className="pos-product-view-close" onClick={onClose} type="button" aria-label="Close">×</button>
      <div className="pos-customer-detail-hero"><span>{String(customer.name || "C").slice(0, 1).toUpperCase()}</span><div><small>Customer profile</small><h2>{customer.name}</h2><p>{customer.email || "No email"}</p></div></div>
      <div className="pos-customer-detail-metrics"><div><span>Total spent</span><strong>{money(customer.total_spent)}</strong></div><div><span>Orders</span><strong>{customer.order_count || 0}</strong></div><div><span>Last order</span><strong>{customer.last_order_id ? `#${customer.last_order_id}` : "None"}</strong></div></div>
      <dl><div><dt>Phone</dt><dd>{customer.phone || "Not available"}</dd></div><div><dt>Address</dt><dd>{customer.address || "Not available"}</dd></div><div><dt>Registered</dt><dd>{formatDate(customer.created_at)}</dd></div><div><dt>Last purchase</dt><dd>{formatDate(customer.last_order_at) || "Not available"}</dd></div></dl>
      <div className="pos-customer-order-list"><h3>Recent purchases</h3>{orders.length ? orders.slice(0, 8).map((order) => <article key={`${order.source}-${order.id}`}><div><strong>{order.receipt_number || `Order #${order.id}`}</strong><span>{order.source === "pos" ? "In-store" : "Online"} · {formatDate(order.created_at)}</span></div><strong>{money(order.total)}</strong></article>) : <p>No accessible purchase records for this account.</p>}</div>
    </section>
  </div>;
}

function Reports({ data }) {
  const reports = data.reports || {};
  const [selected, setSelected] = useState(null);
  const topCustomer = (data.customers || []).reduce((best, customer) => Number(customer.total_spent || 0) > Number(best && best.total_spent || 0) ? customer : best, null);
  return <section className="pos-page-panel"><div className="pos-page-heading"><div><span>All sales channels</span><h2>Sales Report</h2></div></div><div className="pos-report-cards"><article><span>POS revenue</span><strong>{money(reports.pos_revenue)}</strong><small>{reports.pos_sales || 0} completed in-store sales</small></article><article><span>Online revenue</span><strong>{money(reports.online_revenue)}</strong><small>{reports.online_sales || 0} website orders</small></article><article className="primary"><span>Combined revenue</span><strong>{money(reports.total_revenue)}</strong><small>One shared inventory</small></article>{topCustomer && <button className="pos-report-top-customer" onClick={() => setSelected(topCustomer)} type="button"><span>Top customer</span><strong>{topCustomer.name}</strong><small>{money(topCustomer.total_spent)} · {topCustomer.order_count || 0} orders · View profile</small></button>}</div><div className="pos-movement-list"><h3>Recent stock activity</h3>{(data.inventory_movements || []).map((movement) => <div key={movement.id}><span className={Number(movement.quantity_delta) > 0 ? "in" : "out"}>{Number(movement.quantity_delta) > 0 ? "+" : ""}{movement.quantity_delta}</span><div><strong>{movement.product_name}{movement.size ? ` / ${movement.size}` : ""}</strong><small>{movement.movement_type.replaceAll("_", " ")} · {movement.performed_by_name || movement.performed_by_type}</small></div><time>{formatDate(movement.created_at)}</time></div>)}</div>{selected && <PosCustomerDetail customer={selected} data={data} onClose={() => setSelected(null)} />}</section>;
}

export default function PosPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState(emptyData);
  const [tab, setTab] = useState("sale");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  useEffect(() => {
    const stored = localStorage.getItem("staffToken") || "";
    setToken(stored);
    if (!stored) {
      staffApi("/api/public/bootstrap").then((payload) => setData((current) => ({ ...current, settings: payload.settings || {} }))).catch(() => {}).finally(() => setLoading(false));
    }
  }, []);

  function notify(text, type = "error") {
    setMessage(text);
    setMessageType(type);
    window.clearTimeout(window.__oneTenPosNotice);
    window.__oneTenPosNotice = window.setTimeout(() => setMessage(""), 5000);
  }

  function load(silent = false) {
    if (!localStorage.getItem("staffToken")) return Promise.resolve();
    if (!silent) setLoading(true);
    return staffApi("/api/staff/bootstrap").then((payload) => {
      setData({ ...emptyData, ...payload });
      const permissions = payload.permissions || [];
      const available = [["sale", "pos.sell"], ["history", "pos.history"], ["inventory", "inventory.view"], ["orders", "orders.view"], ["customers", "customers.view"], ["reports", "reports.view"]].filter(([, permission]) => permissions.includes(permission));
      if (!available.some(([id]) => id === tab) && available[0]) setTab(available[0][0]);
    }).catch((error) => {
      if (/login|required/i.test(error.message)) {
        localStorage.removeItem("staffToken");
        setToken("");
      }
      notify(error.message, "error");
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!token) return undefined;
    load();
    const interval = window.setInterval(() => load(true), 15000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  // The refresh schedule should only be recreated when the signed-in session changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function login(username, password) {
    setMessage("");
    return staffApi("/api/staff/login", { method: "POST", body: JSON.stringify({ username, password }) }).then((payload) => {
      localStorage.setItem("staffToken", payload.token);
      setToken(payload.token);
    }).catch((error) => notify(error.message, "error"));
  }

  function logout() {
    staffApi("/api/staff/logout", { method: "POST", body: "{}" }).catch(() => {}).finally(() => {
      localStorage.removeItem("staffToken");
      setToken("");
      setData((current) => ({ ...emptyData, settings: current.settings }));
    });
  }

  const permissions = data.permissions || [];
  const nav = [["sale", "New Sale", "pos.sell"], ["history", "Receipts", "pos.history"], ["inventory", "Inventory", "inventory.view"], ["orders", "Online Orders", "orders.view"], ["customers", "Customers", "customers.view"], ["reports", "Reports", "reports.view"]].filter(([, , permission]) => permissions.includes(permission));

  return <>
    <Head><title>ONE TEN POS</title><meta name="robots" content="noindex,nofollow" /><meta name="theme-color" content="#101114" /></Head>
    {!token && !loading && <Login onLogin={login} message={message} settings={data.settings || {}} />}
    {token && <main className="pos-app">
      <header className="pos-header">
        <Link href="/" className="pos-logo"><img src={assetUrl(data.settings.logo_night || data.settings.logo_image || "/assets/logo-white.png")} alt="ONE TEN" /><span>POS</span></Link>
        <nav>{nav.map(([id, label]) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>)}</nav>
        <div className="pos-staff-menu"><span>{data.staff && data.staff.name}<small>{data.staff && data.staff.role}</small></span><button onClick={() => load()} type="button">↻</button><button onClick={logout} type="button">Sign out</button></div>
      </header>
      {message && <div className={`pos-global-alert ${messageType}`}>{message}</div>}
      {loading && !data.staff ? <div className="pos-loading"><span /><p>Loading live inventory...</p></div> : <>
        {tab === "sale" && permissions.includes("pos.sell") && <SaleWorkspace data={data} refresh={() => load(true)} notify={notify} />}
        {tab === "history" && permissions.includes("pos.history") && <History data={data} refresh={() => load(true)} notify={notify} />}
        {tab === "inventory" && permissions.includes("inventory.view") && <Inventory data={data} />}
        {tab === "orders" && permissions.includes("orders.view") && <OnlineOrders data={data} />}
        {tab === "customers" && permissions.includes("customers.view") && <Customers data={data} />}
        {tab === "reports" && permissions.includes("reports.view") && <Reports data={data} />}
        {!nav.length && <div className="pos-empty denied"><h2>No access assigned</h2><p>Ask the administrator to enable at least one POS section.</p></div>}
      </>}
    </main>}
  </>;
}
