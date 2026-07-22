/* eslint-disable @next/next/no-img-element */
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
  report_orders: [],
  inventory_movements: [],
  notifications: [],
  notification_unread: 0,
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

function salesChannel(order) {
  return order && order.sales_channel || (order && order.source === "pos" ? "store" : "website");
}

function salesChannelLabel(value) {
  return value === "external_online" ? "Online Outside Website" : value === "store" ? "In-store" : "Website";
}

function customerReportKey(order) {
  if (order && order.customer_id) return `customer:${order.customer_id}`;
  const phone = String(order && order.phone || "").replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  return `name:${String(order && order.customer_name || "Walk-in Customer").trim().toLowerCase()}`;
}

function preferredCustomerChannel(customer) {
  const channels = [["website", Number(customer && customer.website_orders || 0)], ["external_online", Number(customer && customer.external_online_orders || 0)], ["store", Number(customer && customer.store_orders || 0)]].sort((a, b) => b[1] - a[1]);
  return channels[0] && channels[0][1] > 0 ? channels[0][0] : "website";
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

let posAudioContext = null;

function unlockPosAudio() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!posAudioContext) posAudioContext = new AudioContextClass();
  if (posAudioContext.state === "suspended") posAudioContext.resume().catch(() => {});
  return posAudioContext;
}

function playPosOrderRing() {
  const context = unlockPosAudio();
  if (!context) return;
  const schedule = () => {
    const startAt = context.currentTime + 0.02;
    [[0, 880, .24], [.32, 660, .24], [.7, 880, .34]].forEach(([offset, frequency, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + offset + .025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + duration + .03);
    });
  };
  if (context.state === "running") schedule();
  else context.resume().then(schedule).catch(() => {});
}

function Login({ onLogin, message, settings }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(event) {
    event.preventDefault();
    unlockPosAudio();
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
            <div><dt>Channel</dt><dd>{salesChannelLabel(salesChannel(sale))}</dd></div>
            <div><dt>Branch</dt><dd>{sale.branch || (sale.source === "pos" ? "Main Branch" : "Online Store")}</dd></div>
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
  const [customer, setCustomer] = useState({ id: "", name: "", phone: "", branch: "", sales_channel: "store", payment_method: "Cash", discount: "0", amount_paid: "", notes: "" });
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
  const branches = Array.isArray(data.settings && data.settings.branches) && data.settings.branches.length ? data.settings.branches : ["Main Branch"];

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
        branch: customer.branch || branches[0],
        sales_channel: customer.sales_channel,
        payment_method: customer.payment_method,
        discount,
        amount_paid: paid,
        notes: customer.notes,
      }),
    }).then((payload) => {
      setReceipt(payload.sale);
      setCart([]);
      setCustomer({ id: "", name: "", phone: "", branch: branches[0], sales_channel: "store", payment_method: "Cash", discount: "0", amount_paid: "", notes: "" });
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
          <div className="pos-sale-context"><label><span>Sales channel</span><select value={customer.sales_channel} onChange={(event) => setCustomer({ ...customer, sales_channel: event.target.value })}><option value="store">In-store / customer visited</option><option value="external_online">Online outside website</option></select></label><label><span>Branch</span><select value={customer.branch || branches[0]} onChange={(event) => setCustomer({ ...customer, branch: event.target.value })}>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label></div>
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
  const sales = (data.pos_sales || []).filter((sale) => `${sale.receipt_number} ${sale.customer_name} ${sale.staff_name} ${sale.payment_method} ${sale.branch || ""} ${salesChannelLabel(salesChannel(sale))}`.toLowerCase().includes(query.toLowerCase()));

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
          <div className="pos-history-status"><span className={sale.status === "Cancelled" ? "void" : "paid"}>{sale.status === "Cancelled" ? "Voided" : "Paid"}</span><small>{salesChannelLabel(salesChannel(sale))} · {sale.branch || "Main Branch"}</small></div>
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

function OnlineOrders({ data, refresh, notify }) {
  const [busyOrder, setBusyOrder] = useState(null);
  const canManage = (data.permissions || []).includes("orders.manage");

  function updateStatus(order, status) {
    setBusyOrder(order.id);
    staffApi(`/api/staff/orders/${order.id}/status`, { method: "PUT", body: JSON.stringify({ status }) })
      .then(() => {
        notify(`Order #${order.id} updated to ${status}. The customer was notified.`, "success");
        return refresh();
      })
      .catch((error) => notify(error.message, "error"))
      .finally(() => setBusyOrder(null));
  }

  return <section className="pos-page-panel"><div className="pos-page-heading"><div><span>Website channel</span><h2>Online Orders</h2></div><strong>{(data.online_orders || []).length} recent orders</strong></div><div className="pos-history-list">{(data.online_orders || []).map((order) => <article key={order.id}><div className="pos-history-status"><span className="online">Online</span><small>{order.status}</small></div><div><strong>Order #{order.id}</strong><span>{formatDate(order.created_at)}</span></div><div><strong>{order.customer_name}</strong><span>{order.phone}</span></div><div><strong>{money(order.total)}</strong><span>{order.items || (order.order_items || []).length} lines</span></div>{canManage && <div className="pos-row-actions pos-order-status-action"><select aria-label={`Update order ${order.id} status`} disabled={busyOrder === order.id || order.status === "Cancelled"} onChange={(event) => updateStatus(order, event.target.value)} value={order.status}>{["Processing", "Approved", "Packed", "Delivered", ...(order.status === "Cancelled" ? ["Cancelled"] : [])].map((status) => <option key={status}>{status}</option>)}</select></div>}</article>)}</div></section>;
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
      <div className="pos-customer-detail-metrics"><div><span>Total spent</span><strong>{money(customer.total_spent)}</strong></div><div><span>Orders</span><strong>{customer.order_count || 0}</strong></div><div><span>Last order</span><strong>{customer.last_order_id ? `#${customer.last_order_id}` : "None"}</strong></div><div><span>Preferred channel</span><strong>{salesChannelLabel(preferredCustomerChannel(customer))}</strong></div></div>
      <dl><div><dt>Phone</dt><dd>{customer.phone || "Not available"}</dd></div><div><dt>Address</dt><dd>{customer.address || "Not available"}</dd></div><div><dt>Registered</dt><dd>{formatDate(customer.created_at)}</dd></div><div><dt>Last purchase</dt><dd>{formatDate(customer.last_order_at) || "Not available"}</dd></div></dl>
      <div className="pos-customer-order-list"><h3>Recent purchases</h3>{orders.length ? orders.slice(0, 8).map((order) => <article key={`${order.source}-${order.id}`}><div><strong>{order.receipt_number || `Order #${order.id}`}</strong><span>{salesChannelLabel(salesChannel(order))} · {order.branch || (order.source === "pos" ? "Main Branch" : "Online Store")} · {formatDate(order.created_at)}</span></div><strong>{money(order.total)}</strong></article>) : <p>No accessible purchase records for this account.</p>}</div>
    </section>
  </div>;
}

function Reports({ data }) {
  const [period, setPeriod] = useState("month");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const allOrders = (data.report_orders || []).filter((order) => order.status !== "Cancelled");
  const customerOptions = [...new Map(allOrders.map((order) => [customerReportKey(order), { key: customerReportKey(order), name: order.customer_name || "Walk-in Customer", phone: order.phone || "" }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const branches = [...new Set(allOrders.map((order) => order.branch || (order.source === "pos" ? "Main Branch" : "Online Store")))].sort();
  const nowDate = new Date();
  const cutoff = new Date(nowDate);
  if (period === "day") cutoff.setHours(cutoff.getHours() - 24);
  if (period === "week") cutoff.setDate(cutoff.getDate() - 7);
  if (period === "month") cutoff.setDate(cutoff.getDate() - 30);
  if (period === "year") cutoff.setFullYear(cutoff.getFullYear() - 1);
  const filteredOrders = allOrders.filter((order) => {
    const orderDate = new Date(order.created_at);
    const dateMatch = period === "all" || (!Number.isNaN(orderDate.getTime()) && orderDate >= cutoff);
    const customerMatch = customerFilter === "all" || customerReportKey(order) === customerFilter;
    const orderBranch = order.branch || (order.source === "pos" ? "Main Branch" : "Online Store");
    const branchMatch = branchFilter === "all" || orderBranch === branchFilter;
    const channelMatch = channelFilter === "all" || salesChannel(order) === channelFilter;
    return dateMatch && customerMatch && branchMatch && channelMatch;
  });

  const totalItems = filteredOrders.reduce((sum, order) => sum + (order.order_items || []).reduce((itemSum, item) => itemSum + Math.max(0, Number(item.qty || 0)), 0), 0);
  const totalDiscount = filteredOrders.reduce((sum, order) => sum + Number(order.discount || 0), 0);
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const productMap = new Map();
  const customerMap = new Map();
  const branchMap = new Map();
  const channelTotals = { website: { orders: 0, items: 0, total: 0 }, external_online: { orders: 0, items: 0, total: 0 }, store: { orders: 0, items: 0, total: 0 } };

  filteredOrders.forEach((order) => {
    const orderItems = (order.order_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.qty || 0)), 0);
    const channel = salesChannel(order);
    const channelRow = channelTotals[channel] || channelTotals.website;
    channelRow.orders += 1;
    channelRow.items += orderItems;
    channelRow.total += Number(order.total || 0);
    (order.order_items || []).forEach((item) => {
      const key = String(item.product_id || item.product_name || "Unknown");
      const row = productMap.get(key) || { name: item.product_name || "Unknown product", qty: 0, revenue: 0 };
      row.qty += Math.max(0, Number(item.qty || 0));
      row.revenue += Math.max(0, Number(item.qty || 0)) * Number(item.price || 0);
      productMap.set(key, row);
    });
    const customerKey = customerReportKey(order);
    const customer = customerMap.get(customerKey) || { key: customerKey, name: order.customer_name || "Walk-in Customer", phone: order.phone || "", orders: 0, items: 0, discount: 0, total: 0, channels: { website: 0, external_online: 0, store: 0 } };
    customer.orders += 1;
    customer.items += orderItems;
    customer.discount += Number(order.discount || 0);
    customer.total += Number(order.total || 0);
    customer.channels[channel] = Number(customer.channels[channel] || 0) + 1;
    customerMap.set(customerKey, customer);
    const branchName = order.branch || (order.source === "pos" ? "Main Branch" : "Online Store");
    const branch = branchMap.get(branchName) || { name: branchName, orders: 0, items: 0, discount: 0, total: 0 };
    branch.orders += 1;
    branch.items += orderItems;
    branch.discount += Number(order.discount || 0);
    branch.total += Number(order.total || 0);
    branchMap.set(branchName, branch);
  });

  const productRows = [...productMap.values()].sort((a, b) => b.qty - a.qty);
  const customerRows = [...customerMap.values()].map((customer) => {
    const preferred = Object.entries(customer.channels).sort((a, b) => b[1] - a[1])[0];
    return { ...customer, preferred_channel: preferred && preferred[1] > 0 ? preferred[0] : "website" };
  }).sort((a, b) => b.total - a.total);
  const branchRows = [...branchMap.values()].sort((a, b) => b.total - a.total);
  const periodLabels = { day: "Last 24 hours", week: "Last 7 days", month: "Last 30 days", year: "Last 12 months", all: "All time" };
  const selectedCustomer = customerOptions.find((item) => item.key === customerFilter);

  function printReport() {
    const style = document.createElement("style");
    style.id = "one-ten-report-page";
    style.textContent = "@page { size: A4 landscape; margin: 10mm; }";
    document.head.appendChild(style);
    document.body.classList.add("printing-report");
    const finish = () => {
      document.body.classList.remove("printing-report");
      document.getElementById("one-ten-report-page")?.remove();
    };
    window.addEventListener("afterprint", finish, { once: true });
    window.print();
    window.setTimeout(finish, 1500);
  }

  return <section className="pos-page-panel pos-report-page">
    <div className="pos-page-heading"><div><span>Printable sales intelligence</span><h2>Sales Report</h2></div><button className="pos-print-report" onClick={printReport} type="button">Print Report</button></div>
    <div className="pos-report-filters no-print">
      <label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">Last 24 hours</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option><option value="year">Last 12 months</option><option value="all">All time</option></select></label>
      <label><span>Customer</span><select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}><option value="all">All customers</option>{customerOptions.map((customer) => <option key={customer.key} value={customer.key}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select></label>
      <label><span>Branch</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="all">All branches</option>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label>
      <label><span>Channel</span><select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="all">All channels</option><option value="website">Website</option><option value="external_online">Online outside website</option><option value="store">In-store</option></select></label>
    </div>
    <div className="pos-report-print">
      <header className="pos-print-heading"><div><strong>ONE TEN</strong><span>Sales Report</span></div><p>{periodLabels[period]} · {selectedCustomer ? selectedCustomer.name : "All customers"} · {branchFilter === "all" ? "All branches" : branchFilter} · {channelFilter === "all" ? "All channels" : salesChannelLabel(channelFilter)}</p><small>Generated {formatDate(new Date().toISOString())}</small></header>
      <div className="pos-report-cards detailed"><article><span>Orders</span><strong>{filteredOrders.length}</strong><small>Completed sales</small></article><article><span>Products sold</span><strong>{totalItems}</strong><small>Total item quantity</small></article><article><span>Total discounts</span><strong>{money(totalDiscount)}</strong><small>Discounts given</small></article><article className="primary"><span>Net revenue</span><strong>{money(totalRevenue)}</strong><small>After discounts</small></article></div>
      <div className="pos-channel-report">{Object.entries(channelTotals).map(([channel, totals]) => <article key={channel}><span>{salesChannelLabel(channel)}</span><strong>{money(totals.total)}</strong><small>{totals.orders} orders · {totals.items} products</small></article>)}</div>
      <ReportTable title="Products sold" empty="No products were sold for this filter." headers={["Product", "Quantity", "Gross value"]} rows={productRows.map((row) => [row.name, row.qty, money(row.revenue)])} />
      <ReportTable title="Customer-by-customer" empty="No customer sales for this filter." headers={["Customer", "Orders", "Products", "Discount", "Net sales", "Preferred channel"]} rows={customerRows.map((row) => [row.name, row.orders, row.items, money(row.discount), money(row.total), salesChannelLabel(row.preferred_channel)])} />
      <ReportTable title="Branch-by-branch" empty="No branch sales for this filter." headers={["Branch", "Orders", "Products", "Discount", "Net sales"]} rows={branchRows.map((row) => [row.name, row.orders, row.items, money(row.discount), money(row.total)])} />
    </div>
  </section>;
}

function ReportTable({ title, empty, headers, rows }) {
  return <section className="pos-report-table"><h3>{title}</h3>{rows.length ? <div><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${title}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <p>{empty}</p>}</section>;
}

function PosNotificationCenter({ data, refresh, onOpenOrders }) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState({ notifications: data.notifications || [], unread: Number(data.notification_unread || 0) });
  const [incoming, setIncoming] = useState(null);
  const [silencedId, setSilencedId] = useState("");
  const ringTimer = useRef(null);
  const notifications = live.notifications;
  const unread = live.unread;
  const incomingId = incoming ? String(incoming.id) : "";

  function loadNotifications() {
    return staffApi("/api/staff/notifications").then((payload) => {
      setLive({ notifications: payload.notifications || [], unread: Number(payload.unread || 0) });
      return payload;
    });
  }

  useEffect(() => {
    setLive({ notifications: data.notifications || [], unread: Number(data.notification_unread || 0) });
  }, [data.notifications, data.notification_unread]);

  useEffect(() => {
    let active = true;
    const poll = () => loadNotifications().catch(() => {});
    poll();
    const interval = window.setInterval(() => { if (active) poll(); }, 5000);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  // The lightweight notification poll is tied only to the signed-in staff account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.staff && data.staff.id]);

  useEffect(() => {
    const latest = notifications.find((notification) => !notification.read_at && notification.notification_type === "new_online_order");
    if (!latest || !data.staff || typeof window === "undefined") {
      setIncoming(null);
      return;
    }
    setIncoming((current) => current && String(current.id) === String(latest.id) ? current : latest);
    setSilencedId((current) => current === String(latest.id) ? current : "");
    const key = `oneTenStaffLastNotification:${data.staff.id}`;
    if (localStorage.getItem(key) === String(latest.id)) return;
    localStorage.setItem(key, String(latest.id));
    if ("Notification" in window && window.Notification.permission === "granted") {
      new window.Notification(latest.title, { body: latest.message, tag: `one-ten-staff-${latest.id}`, icon: "/icons/icon-192.png" });
    }
  }, [notifications, data.staff]);

  useEffect(() => {
    const unlock = () => unlockPosAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    window.clearInterval(ringTimer.current);
    ringTimer.current = null;
    if (!incomingId || silencedId === incomingId) return undefined;
    playPosOrderRing();
    ringTimer.current = window.setInterval(playPosOrderRing, 2100);
    return () => {
      window.clearInterval(ringTimer.current);
      ringTimer.current = null;
    };
  }, [incomingId, silencedId]);

  function markRead(id) {
    return staffApi("/api/staff/notifications/read", { method: "POST", body: JSON.stringify(id ? { id } : {}) }).then(loadNotifications);
  }

  function openNotification(notification) {
    setOpen(false);
    setIncoming(null);
    window.clearInterval(ringTimer.current);
    markRead(notification.id).then(() => refresh()).finally(onOpenOrders);
  }

  function dismissIncoming() {
    if (!incoming) return;
    const id = incoming.id;
    setIncoming(null);
    window.clearInterval(ringTimer.current);
    markRead(id).catch(() => {});
  }

  function enableBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    window.Notification.requestPermission();
  }

  return <div className="notification-center pos-notification-center">
    <button className="notification-bell" onClick={() => { unlockPosAudio(); setOpen((current) => !current); }} type="button" aria-label={`${unread} unread order notifications`} aria-expanded={open}>
      <span aria-hidden="true">🔔</span>{unread > 0 && <strong>{unread > 99 ? "99+" : unread}</strong>}
    </button>
    {open && <div className="notification-panel">
      <div className="notification-panel-head"><div><span>Online orders</span><strong>Notifications</strong></div>{unread > 0 && <button onClick={() => markRead()} type="button">Mark all read</button>}</div>
      {typeof window !== "undefined" && "Notification" in window && window.Notification.permission !== "granted" && <button className="notification-enable" onClick={enableBrowserNotifications} type="button">Enable screen alerts</button>}
      <div className="notification-list">{notifications.length ? notifications.map((notification) => <button className={`notification-item ${notification.read_at ? "" : "unread"}`} key={notification.id} onClick={() => openNotification(notification)} type="button"><span className="notification-dot" /><span><strong>{notification.title}</strong><small>{notification.message}</small><em>{formatDate(notification.created_at)}</em></span></button>) : <p className="notification-empty">No online-order notifications yet.</p>}</div>
    </div>}
    {incoming && <div className="pos-incoming-call-backdrop" role="alertdialog" aria-modal="true" aria-label={`Incoming ${incoming.title}`}>
      <section className="pos-incoming-call-card">
        <button className={`pos-call-sound ${silencedId === incomingId ? "muted" : ""}`} onClick={() => setSilencedId(silencedId === incomingId ? "" : incomingId)} type="button">{silencedId === incomingId ? "🔇 Sound off" : "🔊 Ringing"}</button>
        <div className="pos-call-pulse" aria-hidden="true"><span>🛍️</span></div>
        <p>Incoming online order</p>
        <h2>{incoming.title}</h2>
        <strong>{incoming.message}</strong>
        <small>{formatDate(incoming.created_at)}</small>
        <div className="pos-call-actions">
          <button className="dismiss" onClick={dismissIncoming} type="button"><span>×</span>Dismiss</button>
          <button className="answer" onClick={() => openNotification(incoming)} type="button"><span>✓</span>Open Order</button>
        </div>
        <em>The alert continues until this order is opened or dismissed.</em>
      </section>
    </div>}
  </div>;
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
    <Head><title>ONE TEN POS</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" /><meta name="robots" content="noindex,nofollow" /><meta name="theme-color" content="#101114" /></Head>
    {!token && !loading && <Login onLogin={login} message={message} settings={data.settings || {}} />}
    {token && <main className="pos-app">
      <header className="pos-header">
        <Link href="/" className="pos-logo"><img src={assetUrl(data.settings.logo_night || data.settings.logo_image || "/assets/logo-white.png")} alt="ONE TEN" /><span>POS</span></Link>
        <nav>{nav.map(([id, label]) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>)}</nav>
        {permissions.includes("orders.view") && <PosNotificationCenter data={data} refresh={() => load(true)} onOpenOrders={() => setTab("orders")} />}
        <div className="pos-staff-menu"><span>{data.staff && data.staff.name}<small>{data.staff && data.staff.role}</small></span><button onClick={() => load()} type="button">↻</button><button onClick={logout} type="button">Sign out</button></div>
      </header>
      {message && <div className={`pos-global-alert ${messageType}`}>{message}</div>}
      {loading && !data.staff ? <div className="pos-loading"><span /><p>Loading live inventory...</p></div> : <>
        {tab === "sale" && permissions.includes("pos.sell") && <SaleWorkspace data={data} refresh={() => load(true)} notify={notify} />}
        {tab === "history" && permissions.includes("pos.history") && <History data={data} refresh={() => load(true)} notify={notify} />}
        {tab === "inventory" && permissions.includes("inventory.view") && <Inventory data={data} />}
        {tab === "orders" && permissions.includes("orders.view") && <OnlineOrders data={data} refresh={() => load(true)} notify={notify} />}
        {tab === "customers" && permissions.includes("customers.view") && <Customers data={data} />}
        {tab === "reports" && permissions.includes("reports.view") && <Reports data={data} />}
        {!nav.length && <div className="pos-empty denied"><h2>No access assigned</h2><p>Ask the administrator to enable at least one POS section.</p></div>}
      </>}
    </main>}
  </>;
}
