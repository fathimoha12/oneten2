const { useEffect, useState } = React;

const API_BASE_URL = (document.querySelector('meta[name="one-ten-api-base"]')?.content || window.API_BASE_URL || localStorage.getItem("API_BASE_URL") || "").replace(/\/$/, "");

function apiUrl(path) {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}

function adminApi(path, options = {}) {
  const token = localStorage.getItem("adminToken");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  if (typeof options.body === "string" && options.body.length > 4_000_000) {
    return Promise.reject(new Error("Upload is too large. Use fewer images or smaller photos, then try again."));
  }

  if (typeof fetch === "function") {
    return fetch(apiUrl(path), { ...options, headers }).then(async (response) => {
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    });
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method || "GET", apiUrl(path), true);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.onload = () => {
      let data = {};
      try {
        data = request.responseText ? JSON.parse(request.responseText) : {};
      } catch {
        data = {};
      }
      if (request.status >= 200 && request.status < 300) resolve(data);
      else reject(new Error(data.error || "Request failed"));
    };
    request.onerror = () => reject(new Error("Request failed"));
    request.send(options.body || null);
  });
}

function getProductImages(product) {
  const images = Array.isArray(product && product.images) ? product.images : [];
  const merged = [product && product.image, ...images].filter(Boolean);
  const clean = [];
  merged.forEach((image) => {
    if (!clean.includes(image)) clean.push(image);
  });
  return clean.length ? clean : ["assets/ai-products.png"];
}

function panelImageInfo(value) {
  const source = String(value || "");
  const match = source.match(/#panel=([1-4])$/);
  if (!match) return null;
  const panel = Number(match[1]);
  return {
    source: source.replace(/#panel=[1-4]$/, ""),
    x: (panel - 1) % 2,
    y: Math.floor((panel - 1) / 2),
  };
}

function ProductVisual({ src, alt, className = "", style = {}, loading = "lazy", decoding = "async" }) {
  const panel = panelImageInfo(src);
  if (!panel) return React.createElement("img", { src, alt, className, style, loading, decoding });
  return React.createElement("span", {
    "aria-label": alt,
    className: `panel-image ${className}`.trim(),
    role: "img",
    style: { ...style, "--panel-x": panel.x, "--panel-y": panel.y },
  }, React.createElement("img", { alt: "", decoding, loading, src: panel.source }));
}

function readImageFiles(files, options = {}) {
  const maxSize = options.maxSize || 1000;
  const quality = options.quality || 0.72;
  return Promise.all(Array.from(files || []).map((file) => resizeImageFile(file, maxSize, quality)));
}

function resizeImageFile(file, maxSize, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const original = reader.result;
      if (!file.type.startsWith("image/") || file.size < 450_000) {
        resolve(original);
        return;
      }
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => resolve(original);
      image.src = original;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

const defaultInformationLinks = [
  { label: "About Us", href: "#/about" },
  { label: "Contact Us", href: "#/contact" },
  { label: "Shop Grid", href: "#/shop" },
];

const defaultDepartmentLinks = [
  { label: "Shirts", href: "#/shop" },
  { label: "Accessories", href: "#/shop" },
  { label: "Admin Login", href: "/admin" },
];

function cleanLinks(value, fallback) {
  const rows = Array.isArray(value) && value.length ? value : fallback;
  return rows.map((link) => ({ label: link.label || "", href: link.href || "" }));
}

const emptyProduct = {
  category_id: "",
  name: "",
  price: "5",
  old_price: "",
  badge: "New",
  rating: "4.8",
  stock: "10",
  product_sizes: [{ size: "ONE SIZE", stock: 10 }],
  image: "assets/ai-products.png",
  images: [],
  crop: "center",
  description: "",
  ai_type: "top",
  ai_images: [],
  ai_prompts: [],
  active: true,
};

const commonSizes = ["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "40", "42", "One Size"];

function normalizeProductSizes(value, fallbackStock) {
  const clean = {};
  (Array.isArray(value) ? value : []).forEach((item) => {
    const size = String(item && item.size || "").trim().toUpperCase();
    const stock = Math.max(0, Number(item && item.stock) || 0);
    if (size) clean[size] = (clean[size] || 0) + stock;
  });
  const rows = Object.entries(clean).map(([size, stock]) => ({ size, stock }));
  if (rows.length) return rows;
  return fallbackStock !== undefined && fallbackStock !== null
    ? [{ size: "ONE SIZE", stock: Math.max(0, Number(fallbackStock) || 0) }]
    : [];
}

function formatAdminDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function customerInitials(name) {
  return String(name || "Customer").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C";
}

function preferredCustomerChannel(customer) {
  const channels = [
    ["website", Number(customer && customer.website_orders || 0)],
    ["external_online", Number(customer && customer.external_online_orders || 0)],
    ["store", Number(customer && customer.store_orders || 0)],
  ].sort((a, b) => b[1] - a[1]);
  const key = channels[0] && channels[0][1] > 0 ? channels[0][0] : "website";
  return key === "external_online" ? "Online outside website" : key === "store" ? "In-store" : "Website";
}

const aiProductTypes = [
  ["top", "Shirt / upper garment"],
  ["pants", "Pants / lower garment"],
  ["outfit", "Full outfit / suit / tracksuit"],
  ["shoes", "Shoes / footwear"],
  ["watch", "Watch / jewelry"],
  ["accessory", "Cap / bag / accessory"],
];

const emptyCategory = { name: "", description: "", price_mode: "range", sort_order: "0" };
const emptyAd = {
  title: "",
  subtitle: "",
  button_text: "Shop Now",
  link: "#/shop",
  image: "assets/ai-hero.png",
  active: true,
  sort_order: "0",
};

function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("oneTenTheme");
    if (stored === "day" || stored === "night") return stored;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
  });
  const [username, setUsername] = useState("onetenadmin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [data, setData] = useState({ products: [], categories: [], ads: [], orders: [], customers: [], subscribers: [], staff: [], permission_catalog: [], notifications: [], notification_unread: 0, dashboard: {}, settings: {}, admin: {} });

  useEffect(() => {
    if (token) refresh();
  }, [token]);

  useEffect(() => {
    if (!token) {
      adminApi("/api/public/bootstrap")
        .then((payload) => setData((current) => ({ ...current, settings: payload.settings || {} })))
        .catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const interval = window.setInterval(() => refresh(), 15000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [token]);

  function login(event) {
    event.preventDefault();
    adminApi("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) })
      .then((payload) => {
        localStorage.setItem("adminToken", payload.token);
        setToken(payload.token);
        setMessage("Admin login successful");
      })
      .catch((error) => setMessage(error.message));
  }

  function logout() {
    localStorage.removeItem("adminToken");
    setToken("");
  }

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "night" ? "day" : "night";
      localStorage.setItem("oneTenTheme", next);
      return next;
    });
  }

  function refresh() {
    adminApi("/api/admin/bootstrap").then(setData).catch((error) => {
      setMessage(error.message);
      if (error.message.includes("Admin")) logout();
    });
  }

  function openCustomer(customerId) {
    if (!customerId) return;
    setSelectedCustomerId(customerId);
    setTab("customers");
  }

  if (!token) {
    return React.createElement("div", { className: `admin-login-page admin-theme-${theme}` },
      React.createElement("form", { className: "admin-login-card", onSubmit: login },
        React.createElement("button", { "aria-label": theme === "night" ? "Switch to light mode" : "Switch to dark mode", className: "backoffice-theme-toggle admin-login-theme-toggle", onClick: toggleTheme, title: theme === "night" ? "Light mode" : "Dark mode", type: "button" }, theme === "night" ? "\u2600" : "\u263e"),
        React.createElement("img", { src: data.settings.logo_day || data.settings.logo_image || "assets/logo-red.png", alt: "ONE TEN" }),
        React.createElement("h1", null, "Admin Login"),
        React.createElement("p", null, "Enter your private admin credentials."),
        message && React.createElement("div", { className: "admin-message" }, message),
        React.createElement("input", { value: username, onChange: (event) => setUsername(event.target.value), placeholder: "Username" }),
        React.createElement("input", { value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Password", type: "password" }),
        React.createElement("button", { type: "submit" }, "Sign In"),
        React.createElement("a", { href: "/" }, "Back to public website")
      )
    );
  }

  return React.createElement("div", { className: `admin-shell admin-theme-${theme}` },
    React.createElement("aside", { className: "admin-sidebar" },
      React.createElement("img", { src: data.settings.logo_day || data.settings.logo_image || "assets/logo-red.png", alt: "ONE TEN" }),
      [["dashboard", "Dashboard"], ["products", "Products"], ["catalog", "Catalog Tools"], ["categories", "Categories"], ["ads", "Landing Ads"], ["about", "About Us"], ["settings", "Logo/Contact/Footer"], ["staff", "Staff & POS Access"], ["subscribers", "Subscribers"], ["customers", "Customers"], ["orders", "Orders"], ["security", "Security"]].map(([id, label]) =>
        React.createElement("button", { className: tab === id ? "active" : "", key: id, onClick: () => setTab(id), type: "button" }, label)
      ),
      React.createElement("a", { href: "/pos" }, "Open POS"),
      React.createElement("a", { href: "/" }, "Public Website"),
      React.createElement("button", { type: "button", onClick: logout }, "Logout")
    ),
    React.createElement("main", { className: "admin-main" },
      React.createElement("div", { className: "admin-top" },
        React.createElement("div", null, React.createElement("p", { className: "eyebrow" }, "ONE TEN SQL Admin"), React.createElement("h1", null, tab === "dashboard" ? "Good Morning" : tab.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))),
        React.createElement("div", { className: "admin-top-search" }, React.createElement("input", { placeholder: "Search anything" })),
        React.createElement(AdminNotificationCenter, { data, onOpenOrders: () => setTab("orders"), refresh }),
        React.createElement("button", { "aria-label": theme === "night" ? "Switch to light mode" : "Switch to dark mode", className: "backoffice-theme-toggle", onClick: toggleTheme, title: theme === "night" ? "Light mode" : "Dark mode", type: "button" }, theme === "night" ? "\u2600" : "\u263e"),
        React.createElement("button", { onClick: refresh, type: "button" }, "Refresh")
      ),
      React.createElement("div", { className: "admin-stats" },
        React.createElement(Stat, { label: "Products", value: data.dashboard.products || 0 }),
        React.createElement(Stat, { label: "Categories", value: data.dashboard.categories || 0 }),
        React.createElement(Stat, { label: "Ads", value: data.dashboard.ads || 0 }),
        React.createElement(Stat, { label: "Orders", value: data.dashboard.orders || 0 }),
        React.createElement(Stat, { label: "Customers", value: data.dashboard.customers || 0 }),
        React.createElement(Stat, { label: "Subscribers", value: data.dashboard.subscribers || 0 }),
        React.createElement(Stat, { label: "Revenue", value: `$${Number(data.dashboard.revenue || 0).toFixed(2)}` }),
        React.createElement(Stat, { label: "POS Revenue", value: `$${Number(data.dashboard.posRevenue || 0).toFixed(2)}` }),
        React.createElement(Stat, { label: "Active Staff", value: data.dashboard.staff || 0 }),
        React.createElement(Stat, { label: "Low Stock", value: data.dashboard.lowStock || 0 })
      ),
      message && React.createElement("div", { className: "admin-message" }, message),
      tab === "dashboard" && React.createElement(DashboardHome, { data, setTab, onOpenCustomer: openCustomer }),
      tab === "products" && React.createElement(ProductsAdmin, { data, refresh, setMessage }),
      tab === "catalog" && React.createElement(CatalogTools, { data, refresh, setMessage }),
      tab === "categories" && React.createElement(CategoriesAdmin, { data, refresh, setMessage }),
      tab === "ads" && React.createElement(AdsAdmin, { data, refresh, setMessage }),
      tab === "about" && React.createElement(AboutAdmin, { data, refresh, setMessage }),
      tab === "settings" && React.createElement(SettingsAdmin, { data, refresh, setMessage }),
      tab === "staff" && React.createElement(StaffAdmin, { data, refresh, setMessage }),
      tab === "subscribers" && React.createElement(SubscribersAdmin, { data }),
      tab === "customers" && React.createElement(CustomersAdmin, { data, selectedCustomerId, onSelectCustomer: setSelectedCustomerId }),
      tab === "orders" && React.createElement(OrdersAdmin, { data, refresh, setMessage, onOpenCustomer: openCustomer }),
      tab === "security" && React.createElement(SecurityAdmin, { data, refresh, setMessage })
    )
  );
}

function Stat({ label, value }) {
  return React.createElement("div", { className: "stat" }, React.createElement("span", null, label), React.createElement("strong", null, value));
}

function AdminNotificationCenter({ data, refresh, onOpenOrders }) {
  const [open, setOpen] = useState(false);
  const notifications = data.notifications || [];
  const unread = Number(data.notification_unread || 0);

  useEffect(() => {
    const latest = notifications.find((notification) => !notification.read_at);
    if (!latest || !data.admin || !data.admin.id) return;
    const key = `oneTenAdminLastNotification:${data.admin.id}`;
    if (localStorage.getItem(key) === String(latest.id)) return;
    localStorage.setItem(key, String(latest.id));
    if ("Notification" in window && window.Notification.permission === "granted") {
      new window.Notification(latest.title, { body: latest.message, tag: `one-ten-admin-${latest.id}`, icon: "/icons/icon-192.png" });
    }
  }, [notifications, data.admin]);

  function markRead(id) {
    return adminApi("/api/admin/notifications/read", { method: "POST", body: JSON.stringify(id ? { id } : {}) }).then(() => refresh());
  }

  function openNotification(notification) {
    setOpen(false);
    markRead(notification.id).finally(onOpenOrders);
  }

  function enableBrowserNotifications() {
    if (!("Notification" in window)) return;
    window.Notification.requestPermission();
  }

  return React.createElement("div", { className: "notification-center admin-notification-center" },
    React.createElement("button", { "aria-expanded": open, "aria-label": `${unread} unread order notifications`, className: "notification-bell", onClick: () => setOpen((current) => !current), type: "button" }, React.createElement("span", { "aria-hidden": "true" }, "🔔"), unread > 0 && React.createElement("strong", null, unread > 99 ? "99+" : unread)),
    open && React.createElement("div", { className: "notification-panel" },
      React.createElement("div", { className: "notification-panel-head" }, React.createElement("div", null, React.createElement("span", null, "Website channel"), React.createElement("strong", null, "New orders")), unread > 0 && React.createElement("button", { onClick: () => markRead(), type: "button" }, "Mark all read")),
      "Notification" in window && window.Notification.permission !== "granted" && React.createElement("button", { className: "notification-enable", onClick: enableBrowserNotifications, type: "button" }, "Enable screen alerts"),
      React.createElement("div", { className: "notification-list" }, notifications.length ? notifications.map((notification) => React.createElement("button", { className: `notification-item ${notification.read_at ? "" : "unread"}`, key: notification.id, onClick: () => openNotification(notification), type: "button" }, React.createElement("span", { className: "notification-dot" }), React.createElement("span", null, React.createElement("strong", null, notification.title), React.createElement("small", null, notification.message), React.createElement("em", null, formatAdminDate(notification.created_at))))) : React.createElement("p", { className: "notification-empty" }, "No online-order notifications yet."))
    )
  );
}

function DashboardHome({ data, setTab, onOpenCustomer }) {
  const products = data.products || [];
  const orders = data.orders || [];
  const activeCount = products.filter((product) => Number(product.active) === 1 && Number(product.stock || 0) > 0).length;
  const inactiveCount = products.length - activeCount;
  const lowStock = products.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 3).length;
  const recentOrders = orders.slice(0, 5);
  const activePercent = products.length ? Math.round((activeCount / products.length) * 100) : 0;
  const topCustomer = (data.customers || []).reduce((best, customer) => Number(customer.total_spent || 0) > Number(best && best.total_spent || 0) ? customer : best, null);

  return React.createElement("section", { className: "admin-dashboard" },
    React.createElement("div", { className: "dashboard-hero-card" },
      React.createElement("div", null,
        React.createElement("span", null, "ONE TEN Control"),
        React.createElement("h2", null, "Manage products, orders, ads and AI fashion assets from one clean dashboard."),
        React.createElement("p", null, `${activeCount} public products, ${inactiveCount} hidden products, ${lowStock} low-stock alerts.`)
      ),
      React.createElement("button", { onClick: () => setTab("products"), type: "button" }, "Add Product")
    ),
    React.createElement("div", { className: "dashboard-panels" },
      React.createElement("article", { className: "dashboard-panel performance-card" },
        React.createElement("div", { className: "panel-head" }, React.createElement("strong", null, "Product Performance"), React.createElement("span", null, `${activePercent}% active`)),
        React.createElement("div", { className: "progress-ring", style: { "--value": `${activePercent}%` } }, React.createElement("strong", null, `${activePercent}%`)),
        React.createElement("div", { className: "mini-bars" },
          React.createElement("span", { style: { "--h": "42%" } }),
          React.createElement("span", { style: { "--h": "68%" } }),
          React.createElement("span", { style: { "--h": "54%" } }),
          React.createElement("span", { style: { "--h": "82%" } }),
          React.createElement("span", { style: { "--h": "61%" } })
        )
      ),
      React.createElement("article", { className: "dashboard-panel" },
        React.createElement("div", { className: "panel-head" }, React.createElement("strong", null, "Quick Actions"), React.createElement("span", null, "Admin tools")),
        React.createElement("div", { className: "quick-actions" },
          [["products", "Products"], ["catalog", "Catalog Tools"], ["orders", "Orders"], ["ads", "Landing Ads"]].map(([id, label]) =>
            React.createElement("button", { key: id, onClick: () => setTab(id), type: "button" }, label)
          )
        )
      ),
      React.createElement("article", { className: "dashboard-panel" },
        React.createElement("div", { className: "panel-head" }, React.createElement("strong", null, "Recent Orders"), React.createElement("span", null, `${orders.length} total`)),
        React.createElement("div", { className: "recent-list" },
          recentOrders.length ? recentOrders.map((order) => React.createElement("div", { key: order.id },
            React.createElement("span", null, `#${order.id} ${order.customer_name || "Customer"}`),
            React.createElement("strong", null, `$${Number(order.total || 0).toFixed(2)}`)
          )) : React.createElement("p", null, "No orders yet")
        )
      ),
      React.createElement("article", { className: "dashboard-panel top-customer-card" },
        React.createElement("div", { className: "panel-head" }, React.createElement("strong", null, "Top Customer"), React.createElement("span", null, "Highest total spend")),
        topCustomer ? React.createElement(React.Fragment, null,
          React.createElement("div", { className: "top-customer-main" },
            React.createElement("span", { className: "customer-avatar large" }, customerInitials(topCustomer.name)),
            React.createElement("div", null, React.createElement("strong", null, topCustomer.name), React.createElement("span", null, topCustomer.email || "No email"), React.createElement("small", null, topCustomer.phone || "No phone yet"))
          ),
          React.createElement("div", { className: "top-customer-metrics" },
            React.createElement("div", null, React.createElement("span", null, "Total spent"), React.createElement("strong", null, `$${Number(topCustomer.total_spent || 0).toFixed(2)}`)),
            React.createElement("div", null, React.createElement("span", null, "Orders"), React.createElement("strong", null, Number(topCustomer.order_count || 0)))
          ),
          React.createElement("button", { className: "top-customer-view", onClick: () => onOpenCustomer(topCustomer.id), type: "button" }, "View Customer Profile")
        ) : React.createElement("p", null, "Customer purchase data will appear here after the first order.")
      )
    )
  );
}

function CatalogTools({ data, refresh, setMessage }) {
  const [busy, setBusy] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const seeded = Number(data.dashboard && data.dashboard.seededProducts || 0);

  function runCatalogAction(action, path, method) {
    setBusy(action);
    adminApi(path, { method, body: method === "POST" ? JSON.stringify({}) : undefined })
      .then((payload) => {
        setMessage(payload.message || "Catalog updated");
        setConfirmClear(false);
        refresh();
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setBusy(""));
  }

  return React.createElement("section", { className: "catalog-tools" },
    React.createElement("header", { className: "catalog-tools-head" },
      React.createElement("div", null, React.createElement("span", null, "ONE TEN AI inventory"), React.createElement("h2", null, "Catalog Control Center"), React.createElement("p", null, "Install or clear the full product catalog in one controlled action.")),
      React.createElement("a", { className: "catalog-sql-link", href: "/supabase_catalog_seed_40.sql", target: "_blank" }, "Open SQL Seed")
    ),
    React.createElement("div", { className: "catalog-metrics" },
      React.createElement("div", null, React.createElement("span", null, "AI products ready"), React.createElement("strong", null, "40")),
      React.createElement("div", null, React.createElement("span", null, "Catalog categories"), React.createElement("strong", null, "9")),
      React.createElement("div", null, React.createElement("span", null, "Landing ads"), React.createElement("strong", null, "4")),
      React.createElement("div", null, React.createElement("span", null, "Installed seed products"), React.createElement("strong", null, seeded))
    ),
    React.createElement("div", { className: "catalog-actions" },
      React.createElement("article", { className: "catalog-action primary-action" },
        React.createElement("span", { className: "catalog-action-number" }, "01"),
        React.createElement("h3", null, seeded ? "Refresh AI Catalog" : "Install AI Catalog"),
        React.createElement("p", null, "Adds 40 products with four-view galleries, stock by size, nine categories and four landing ads. Existing manually added products stay untouched."),
        React.createElement("button", { disabled: !!busy, onClick: () => runCatalogAction("install", "/api/admin/catalog/install", "POST"), type: "button" }, busy === "install" ? "Installing..." : seeded ? "Refresh 40 Products" : "Install 40 Products")
      ),
      React.createElement("article", { className: "catalog-action" },
        React.createElement("span", { className: "catalog-action-number" }, "02"),
        React.createElement("h3", null, "Clear AI Seed"),
        React.createElement("p", null, "Removes only products and landing ads installed by the AI catalog tool. Manual products and order history remain safe."),
        React.createElement("button", { className: "catalog-secondary", disabled: !!busy || seeded === 0, onClick: () => runCatalogAction("seed", "/api/admin/catalog/seed", "DELETE"), type: "button" }, busy === "seed" ? "Clearing..." : "Clear AI Seed")
      ),
      React.createElement("article", { className: "catalog-action danger-action" },
        React.createElement("span", { className: "catalog-action-number" }, "03"),
        React.createElement("h3", null, "Clear All Products"),
        React.createElement("p", null, "Removes every product in one action while preserving customer and order history snapshots."),
        !confirmClear ? React.createElement("button", { className: "catalog-danger", disabled: !!busy || !(data.products || []).length, onClick: () => setConfirmClear(true), type: "button" }, "Clear All Products") : React.createElement("div", { className: "catalog-confirm" },
          React.createElement("strong", null, `Remove all ${(data.products || []).length} products?`),
          React.createElement("button", { className: "catalog-danger", disabled: !!busy, onClick: () => runCatalogAction("all", "/api/admin/catalog/products", "DELETE"), type: "button" }, busy === "all" ? "Clearing..." : "Yes, Clear Everything"),
          React.createElement("button", { className: "catalog-cancel", disabled: !!busy, onClick: () => setConfirmClear(false), type: "button" }, "Cancel")
        )
      )
    )
  );
}

function ProductsAdmin({ data, refresh, setMessage }) {
  const [form, setForm] = useState(emptyProduct);
  const [editing, setEditing] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productView, setProductView] = useState("active");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);

  function save(event) {
    event.preventDefault();
    const images = getProductImages(form);
    const productSizes = normalizeProductSizes(form.product_sizes, form.stock);
    const body = { ...form, product_sizes: productSizes, stock: productSizes.reduce((sum, item) => sum + Number(item.stock || 0), 0), image: images[0], images, category_id: form.category_id || (data.categories[0] && data.categories[0].id) || 1 };
    const path = editing ? `/api/admin/products/${editing}` : "/api/admin/products";
    adminApi(path, { method: editing ? "PUT" : "POST", body: JSON.stringify(body) })
      .then(() => {
        setMessage(editing ? "Product updated" : "Product added");
        setEditing(null);
        setForm(emptyProduct);
        setFormOpen(false);
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  function edit(product) {
    setSelectedProductId(null);
    setEditing(product.id);
    setForm({ ...emptyProduct, ...product, product_sizes: normalizeProductSizes(product.product_sizes, product.stock), image: getProductImages(product)[0], images: getProductImages(product), old_price: product.old_price || "", category_id: product.category_id || "", ai_images: Array.isArray(product.ai_images) ? product.ai_images : [], ai_prompts: Array.isArray(product.ai_prompts) ? product.ai_prompts : [], ai_type: product.ai_type || "top" });
    setFormOpen(true);
  }

  function startAddProduct() {
    setEditing(null);
    setForm(emptyProduct);
    setFormOpen(true);
  }

  function remove(id) {
    adminApi(`/api/admin/products/${id}`, { method: "DELETE" }).then(refresh).catch((error) => setMessage(error.message));
  }

  function chooseFile(event) {
    const selected = Array.from(event.target.files || []).slice(0, 5);
    if ((event.target.files || []).length > 5) setMessage("Only the first 5 product images were added to keep upload fast");
    readImageFiles(selected, { maxSize: 900, quality: 0.7 }).then((uploaded) => {
      if (!uploaded.length) return;
      setForm((current) => {
        const base = Array.isArray(current.images) && current.images.length ? getProductImages(current) : (current.image && current.image !== "assets/ai-products.png" ? [current.image] : []);
        const images = [...base, ...uploaded].filter(Boolean).slice(0, 5);
        const clean = images.filter((image, index) => images.indexOf(image) === index);
        return { ...current, image: clean[0], images: clean, crop: "center" };
      });
      event.target.value = "";
    });
  }

  function removeImage(index) {
    setForm((current) => {
      const images = getProductImages(current)
        .filter((image) => image !== "assets/ai-products.png")
        .filter((_, imageIndex) => imageIndex !== index);
      const clean = images.length ? images : ["assets/ai-products.png"];
      return { ...current, image: clean[0], images: clean };
    });
  }

  function generateAiPack() {
    if (!editing) {
      setMessage("Save the product first, then generate the AI pack");
      return;
    }
    setAiBusy(true);
    adminApi(`/api/admin/products/${editing}/ai-pack`, { method: "POST", body: JSON.stringify({ ai_type: form.ai_type }) })
      .then((payload) => {
        setMessage(payload.message || "AI pack updated");
        setForm((current) => ({ ...current, ai_prompts: payload.prompts || [], ai_images: payload.images || current.ai_images || [] }));
        refresh();
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setAiBusy(false));
  }

  function updateSizeRow(index, field, value) {
    setForm((current) => {
      const rows = Array.isArray(current.product_sizes) ? current.product_sizes.slice() : [];
      rows[index] = { ...(rows[index] || { size: "", stock: 0 }), [field]: field === "stock" ? Math.max(0, Number(value) || 0) : value };
      const normalized = field === "size" ? rows : rows;
      const total = normalized.reduce((sum, item) => sum + Math.max(0, Number(item.stock) || 0), 0);
      return { ...current, product_sizes: normalized, stock: String(total) };
    });
  }

  function addSizeRow(size = "") {
    setForm((current) => {
      const rows = [...(Array.isArray(current.product_sizes) ? current.product_sizes : []), { size, stock: 1 }];
      const total = rows.reduce((sum, item) => sum + Math.max(0, Number(item.stock) || 0), 0);
      return { ...current, product_sizes: rows, stock: String(total) };
    });
  }

  function removeSizeRow(index) {
    setForm((current) => {
      const remaining = (Array.isArray(current.product_sizes) ? current.product_sizes : []).filter((_, rowIndex) => rowIndex !== index);
      const rows = remaining.length ? remaining : [{ size: "ONE SIZE", stock: 0 }];
      const total = rows.reduce((sum, item) => sum + Math.max(0, Number(item.stock) || 0), 0);
      return { ...current, product_sizes: rows, stock: String(total || 0) };
    });
  }

  const previewImages = getProductImages(form).filter((image) => image !== "assets/ai-products.png");
  const publicProducts = (data.products || []).filter((product) => Number(product.active) === 1 && Number(product.stock || 0) > 0);
  const inactiveProducts = (data.products || []).filter((product) => Number(product.active) !== 1 || Number(product.stock || 0) <= 0);
  const currentProducts = productView === "active" ? publicProducts : inactiveProducts;
  const formSizeRows = normalizeProductSizes(form.product_sizes, form.stock);
  const formSizeTotal = formSizeRows.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const normalizedQuery = productQuery.trim().toLowerCase();
  const visibleProducts = currentProducts.filter((product) => {
    if (!normalizedQuery) return true;
    const sizeSummary = normalizeProductSizes(product.product_sizes, product.stock).map((item) => `${item.size} ${item.stock}`).join(" ");
    return [product.name, product.category, product.description, product.badge, product.ai_type, sizeSummary]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
  const selectedProduct = selectedProductId ? (data.products || []).find((product) => String(product.id) === String(selectedProductId)) : null;

  function ProductCard(product) {
    const inventoryRows = normalizeProductSizes(product.product_sizes, product.stock);
    const inventoryTotal = inventoryRows.reduce((sum, item) => sum + Number(item.stock || 0), 0);
    const isPublic = Number(product.active) === 1 && inventoryTotal > 0;
    const availableSizes = inventoryRows.filter((item) => Number(item.stock || 0) > 0);
    return React.createElement("article", { className: `admin-product-card ${isPublic ? "is-public" : "is-inactive"}`, key: product.id },
      React.createElement("button", { "aria-label": `View ${product.name}`, className: "admin-product-image", onClick: () => setSelectedProductId(product.id), type: "button" },
        React.createElement(ProductVisual, { src: getProductImages(product)[0], alt: product.name, className: "admin-product-card-visual", style: { objectPosition: product.crop || "center" } }),
        product.badge && React.createElement("span", { className: "admin-product-badge" }, product.badge),
        React.createElement("span", { className: isPublic ? "admin-product-status active" : "admin-product-status inactive" }, isPublic ? "Active" : "Inactive")
      ),
      React.createElement("div", { className: "admin-product-card-body" },
        React.createElement("span", { className: "admin-product-category" }, product.category || "Uncategorized"),
        React.createElement("h3", null, product.name),
        React.createElement("div", { className: "admin-product-price" }, React.createElement("strong", null, `$${Number(product.price || 0).toFixed(2)}`), product.old_price && React.createElement("del", null, `$${Number(product.old_price).toFixed(2)}`)),
        React.createElement("div", { className: "admin-product-inventory" },
          React.createElement("span", null, `${inventoryTotal} in stock`),
          React.createElement("span", null, `${getProductImages(product).length} ${getProductImages(product).length === 1 ? "image" : "images"}`)
        ),
        React.createElement("div", { className: "admin-product-sizes" }, availableSizes.length ? availableSizes.slice(0, 5).map((item) => React.createElement("span", { key: item.size }, item.size, React.createElement("small", null, item.stock))) : React.createElement("span", { className: "sold-out" }, "Out of stock")),
        React.createElement("div", { className: "admin-product-actions" },
          React.createElement("button", { className: "view", onClick: () => setSelectedProductId(product.id), type: "button" }, "View"),
          React.createElement("button", { onClick: () => edit(product), type: "button" }, "Edit"),
          React.createElement("button", { className: "delete", onClick: () => remove(product.id), type: "button" }, "Delete")
        )
      ),
    );
  }

  return React.createElement("section", { className: `admin-grid products-workspace ${formOpen ? "form-open" : ""}` },
    React.createElement("button", { className: "product-form-fab", onClick: startAddProduct, type: "button" }, "+"),
    formOpen && React.createElement("button", { className: "product-form-backdrop", onClick: () => setFormOpen(false), type: "button", "aria-label": "Close product form" }),
    React.createElement("form", { className: `admin-form product-form-panel ${formOpen ? "open" : ""}`, onSubmit: save },
      React.createElement("div", { className: "product-form-head" },
        React.createElement("div", null, React.createElement("span", null, editing ? "Editing product" : "New product"), React.createElement("h2", null, editing ? "Edit Product" : "Add Product")),
        React.createElement("button", { className: "panel-close", onClick: () => setFormOpen(false), type: "button" }, "Close")
      ),
      React.createElement("input", { required: true, value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "Product name" }),
      React.createElement("select", { value: form.category_id, onChange: (event) => setForm({ ...form, category_id: event.target.value }) }, React.createElement("option", { value: "" }, "Choose category"), data.categories.map((cat) => React.createElement("option", { key: cat.id, value: cat.id }, cat.name))),
      React.createElement("div", { className: "two-col" }, React.createElement("input", { value: form.price, onChange: (event) => setForm({ ...form, price: event.target.value }), placeholder: "Price 1-10" }), React.createElement("input", { value: form.old_price || "", onChange: (event) => setForm({ ...form, old_price: event.target.value }), placeholder: "Old price" })),
      React.createElement("div", { className: "two-col" }, React.createElement("input", { value: form.badge || "", onChange: (event) => setForm({ ...form, badge: event.target.value }), placeholder: "Badge" }), React.createElement("input", { "aria-label": "Total stock calculated from sizes", readOnly: true, title: "Calculated from size quantities", value: formSizeTotal, placeholder: "Total stock" })),
      React.createElement("div", { className: "size-stock-builder" },
        React.createElement("div", { className: "size-stock-head" },
          React.createElement("div", null, React.createElement("strong", null, "Size Stock"), React.createElement("span", null, "Dooro size kasta iyo inta ka taalla")),
          React.createElement("button", { onClick: () => addSizeRow(), type: "button" }, "Add Size")
        ),
        React.createElement("div", { className: "quick-size-list" }, commonSizes.map((size) => React.createElement("button", { key: size, onClick: () => addSizeRow(size), type: "button" }, size))),
        formSizeRows.length > 0 && React.createElement("p", { className: "admin-size-summary" }, `Total stock from sizes: ${formSizeTotal} (${formSizeRows.map((item) => `${item.size}: ${item.stock}`).join(" / ")})`),
        (Array.isArray(form.product_sizes) && form.product_sizes.length) ? form.product_sizes.map((item, index) => React.createElement("div", { className: "size-stock-row", key: index },
          React.createElement("select", { value: item.size || "", onChange: (event) => updateSizeRow(index, "size", event.target.value) },
            React.createElement("option", { value: "" }, "Choose size"),
            commonSizes.map((size) => React.createElement("option", { key: size, value: size.toUpperCase() }, size))
          ),
          React.createElement("input", { min: "0", onChange: (event) => updateSizeRow(index, "stock", event.target.value), placeholder: "Qty", type: "number", value: item.stock }),
          React.createElement("button", { onClick: () => removeSizeRow(index), type: "button" }, "Remove")
        )) : React.createElement("p", { className: "size-stock-empty" }, "Add at least one size. Use ONE SIZE for products without size variants.")
      ),
      React.createElement("label", { className: "file-picker" }, "Choose product images",
        React.createElement("input", { accept: "image/*", multiple: true, onChange: chooseFile, type: "file" })
      ),
      previewImages.length > 0 && React.createElement("div", { className: "admin-image-preview" }, previewImages.map((image, index) => React.createElement("button", { key: `${image}-${index}`, onClick: () => removeImage(index), title: "Remove image", type: "button" }, React.createElement(ProductVisual, { src: image, alt: `Product image ${index + 1}`, className: "admin-preview-product-visual" }), React.createElement("span", null, index === 0 ? "Main" : "Alt")))),
      React.createElement("textarea", { value: form.description || "", onChange: (event) => setForm({ ...form, description: event.target.value }), placeholder: "Description" }),
      React.createElement("div", { className: "ai-product-studio" },
        React.createElement("div", { className: "ai-studio-head" },
          React.createElement("div", null, React.createElement("strong", null, "AI Product Studio"), React.createElement("span", null, "Choose how AI should advertise this product")),
          React.createElement("button", { className: !editing ? "needs-save" : "", disabled: aiBusy, onClick: generateAiPack, type: "button" }, aiBusy ? "Generating..." : editing ? "Generate AI Pack" : "Save Product First")
        ),
        React.createElement("select", { value: form.ai_type || "top", onChange: (event) => setForm({ ...form, ai_type: event.target.value }) }, aiProductTypes.map(([value, label]) => React.createElement("option", { key: value, value }, label))),
        React.createElement("p", { className: "ai-note" }, "AI pack creates 5 professional concepts: clean gray studio hero, product close-up, lifestyle, editorial, and social ad crop."),
        (form.ai_images || []).length > 0 && React.createElement("div", { className: "admin-image-preview ai-pack-preview" }, form.ai_images.map((image, index) => React.createElement("button", { key: `${image}-${index}`, type: "button" }, React.createElement(ProductVisual, { src: image, alt: `AI image ${index + 1}`, className: "admin-preview-product-visual" }), React.createElement("span", null, `AI ${index + 1}`)))),
        (form.ai_prompts || []).length > 0 && React.createElement("details", { className: "ai-prompts" }, React.createElement("summary", null, "View AI prompts"), React.createElement("ol", null, form.ai_prompts.map((prompt, index) => React.createElement("li", { key: index }, prompt))))
      ),
      React.createElement("button", { type: "submit" }, editing ? "Save Product" : "Add Product")
    ),
    React.createElement("div", { className: "admin-table product-board" },
      React.createElement("div", { className: "product-board-head" },
        React.createElement("div", null, React.createElement("span", null, "Inventory"), React.createElement("h2", null, productView === "active" ? "Active Products" : "Inactive Products")),
        React.createElement("button", { onClick: startAddProduct, type: "button" }, "Add Product")
      ),
      React.createElement("div", { className: "product-admin-toolbar" },
        React.createElement("div", { className: "product-search-box" }, React.createElement("input", { value: productQuery, onChange: (event) => setProductQuery(event.target.value), placeholder: "Search products, category, stock..." })),
        React.createElement("div", { className: "product-status-tabs" },
          React.createElement("button", { className: productView === "active" ? "active" : "", onClick: () => setProductView("active"), type: "button" }, `Active ${publicProducts.length}`),
          React.createElement("button", { className: productView === "inactive" ? "active" : "", onClick: () => setProductView("inactive"), type: "button" }, `Inactive ${inactiveProducts.length}`)
        )
      ),
      React.createElement("div", { className: `product-admin-section ${productView === "inactive" ? "inactive" : ""}` },
        React.createElement("div", { className: "product-admin-head" }, React.createElement("strong", null, productView === "active" ? "Public / active page" : "Inactive / hidden page"), React.createElement("span", null, `${visibleProducts.length} showing`)),
        React.createElement("div", { className: "admin-product-card-grid" }, visibleProducts.length ? visibleProducts.map(ProductCard) : React.createElement("div", { className: "empty-state compact" }, React.createElement("h2", null, productQuery ? "No matching products" : productView === "active" ? "No active products" : "No inactive products")))
      )
    ),
    selectedProduct && React.createElement(ProductDetailDrawer, { product: selectedProduct, onClose: () => setSelectedProductId(null), onEdit: edit })
  );
}

function ProductDetailDrawer({ product, onClose, onEdit }) {
  const images = getProductImages(product);
  const sizes = normalizeProductSizes(product.product_sizes, product.stock);
  const totalStock = sizes.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const [activeImage, setActiveImage] = useState(images[0]);
  useEffect(() => setActiveImage(images[0]), [product.id, images[0]]);
  const isPublic = Number(product.active) === 1 && totalStock > 0;

  return React.createElement(React.Fragment, null,
    React.createElement("button", { "aria-label": "Close product details", className: "admin-drawer-backdrop", onClick: onClose, type: "button" }),
    React.createElement("aside", { "aria-label": `${product.name} details`, "aria-modal": "true", className: "admin-detail-drawer product-detail-drawer", role: "dialog" },
      React.createElement("div", { className: "admin-drawer-head" },
        React.createElement("div", null, React.createElement("span", null, "Product details"), React.createElement("h2", null, product.name)),
        React.createElement("button", { "aria-label": "Close", className: "drawer-close", onClick: onClose, type: "button" }, "\u00d7")
      ),
      React.createElement("div", { className: "admin-drawer-scroll" },
        React.createElement("div", { className: "drawer-product-gallery" },
          React.createElement(ProductVisual, { className: "drawer-product-main", src: activeImage, alt: product.name, loading: "eager", style: { objectPosition: product.crop || "center" } }),
          images.length > 1 && React.createElement("div", { className: "drawer-product-thumbs" }, images.map((image, index) => React.createElement("button", { className: image === activeImage ? "active" : "", key: `${image}-${index}`, onClick: () => setActiveImage(image), type: "button" }, React.createElement(ProductVisual, { src: image, alt: `${product.name} ${index + 1}`, className: "drawer-thumb-visual" }))))
        ),
        React.createElement("div", { className: "drawer-status-line" },
          React.createElement("span", { className: isPublic ? "drawer-status active" : "drawer-status inactive" }, isPublic ? "Public / Active" : "Inactive / Hidden"),
          product.badge && React.createElement("span", { className: "drawer-badge" }, product.badge)
        ),
        React.createElement("div", { className: "drawer-metrics" },
          React.createElement("div", null, React.createElement("span", null, "Price"), React.createElement("strong", null, `$${Number(product.price || 0).toFixed(2)}`)),
          React.createElement("div", null, React.createElement("span", null, "Total stock"), React.createElement("strong", null, totalStock)),
          React.createElement("div", null, React.createElement("span", null, "Images"), React.createElement("strong", null, images.length)),
          React.createElement("div", null, React.createElement("span", null, "Rating"), React.createElement("strong", null, product.rating || "4.8"))
        ),
        React.createElement("section", { className: "drawer-section" }, React.createElement("h3", null, "Inventory by size"),
          React.createElement("div", { className: "drawer-size-grid" }, sizes.map((item) => React.createElement("div", { className: Number(item.stock || 0) > 0 ? "" : "sold-out", key: item.size }, React.createElement("strong", null, item.size), React.createElement("span", null, Number(item.stock || 0) > 0 ? `${item.stock} available` : "Sold out"))))
        ),
        React.createElement("section", { className: "drawer-section" }, React.createElement("h3", null, "Description"), React.createElement("p", null, product.description || "No product description added.")),
        React.createElement("dl", { className: "drawer-details-list" },
          React.createElement("div", null, React.createElement("dt", null, "Category"), React.createElement("dd", null, product.category || "Uncategorized")),
          React.createElement("div", null, React.createElement("dt", null, "Product ID"), React.createElement("dd", null, `#${product.id}`)),
          React.createElement("div", null, React.createElement("dt", null, "AI style"), React.createElement("dd", null, product.ai_type || "Not selected")),
          React.createElement("div", null, React.createElement("dt", null, "Created"), React.createElement("dd", null, formatAdminDate(product.created_at)))
        )
      ),
      React.createElement("div", { className: "admin-drawer-actions" },
        React.createElement("a", { href: `/product/${product.id}`, rel: "noreferrer", target: "_blank" }, "View Public"),
        React.createElement("button", { onClick: () => onEdit(product), type: "button" }, "Edit Product")
      )
    )
  );
}

function CategoriesAdmin({ data, refresh, setMessage }) {
  const [form, setForm] = useState(emptyCategory);
  const [editing, setEditing] = useState(null);

  function save(event) {
    event.preventDefault();
    const path = editing ? `/api/admin/categories/${editing}` : "/api/admin/categories";
    adminApi(path, { method: editing ? "PUT" : "POST", body: JSON.stringify(form) })
      .then(() => {
        setMessage(editing ? "Category updated" : "Category added");
        setEditing(null);
        setForm(emptyCategory);
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  return React.createElement("section", { className: "admin-grid" },
    React.createElement("form", { className: "admin-form", onSubmit: save },
      React.createElement("h2", null, editing ? "Edit Category" : "Add Category"),
      React.createElement("input", { required: true, value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "Category name" }),
      React.createElement("select", { value: form.price_mode || "range", onChange: (event) => setForm({ ...form, price_mode: event.target.value }) },
        React.createElement("option", { value: "range" }, "$1 ilaa $10"),
        React.createElement("option", { value: "max10" }, "Kaliya $10")
      ),
      React.createElement("input", { value: form.sort_order, onChange: (event) => setForm({ ...form, sort_order: event.target.value }), placeholder: "Sort order" }),
      React.createElement("textarea", { value: form.description, onChange: (event) => setForm({ ...form, description: event.target.value }), placeholder: "Description" }),
      React.createElement("button", { type: "submit" }, editing ? "Save Category" : "Add Category")
    ),
    React.createElement("div", { className: "admin-table" },
      React.createElement("h2", null, "Categories"),
      data.categories.map((cat) => React.createElement("article", { className: "order-row", key: cat.id },
        React.createElement("div", null, React.createElement("strong", null, cat.name), React.createElement("span", null, `${cat.price_mode === "max10" ? "Kaliya $10" : "$1 ilaa $10"} / ${cat.description || "No description"}`)),
        React.createElement("div", { className: "row-actions" }, React.createElement("button", { onClick: () => { setEditing(cat.id); setForm(cat); }, type: "button" }, "Edit"), React.createElement("button", { onClick: () => adminApi(`/api/admin/categories/${cat.id}`, { method: "DELETE" }).then(refresh).catch((error) => setMessage(error.message)), type: "button" }, "Delete"))
      ))
    )
  );
}

function AdsAdmin({ data, refresh, setMessage }) {
  const [form, setForm] = useState(emptyAd);
  const [editing, setEditing] = useState(null);

  function chooseFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    readImageFiles([file], { maxSize: 1200, quality: 0.72 }).then((images) => {
      if (images[0]) setForm({ ...form, image: images[0] });
      event.target.value = "";
    });
  }

  function save(event) {
    event.preventDefault();
    const path = editing ? `/api/admin/ads/${editing}` : "/api/admin/ads";
    adminApi(path, { method: editing ? "PUT" : "POST", body: JSON.stringify(form) })
      .then(() => {
        setMessage(editing ? "Ad updated" : "Ad added");
        setEditing(null);
        setForm(emptyAd);
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  return React.createElement("section", { className: "admin-grid" },
    React.createElement("form", { className: "admin-form", onSubmit: save },
      React.createElement("h2", null, editing ? "Edit Landing Post" : "Add Landing Post / Ad"),
      React.createElement("input", { required: true, value: form.title, onChange: (event) => setForm({ ...form, title: event.target.value }), placeholder: "Post title" }),
      React.createElement("textarea", { value: form.subtitle, onChange: (event) => setForm({ ...form, subtitle: event.target.value }), placeholder: "Subtitle" }),
      React.createElement("div", { className: "two-col" }, React.createElement("input", { value: form.button_text, onChange: (event) => setForm({ ...form, button_text: event.target.value }), placeholder: "Button text" }), React.createElement("input", { value: form.link, onChange: (event) => setForm({ ...form, link: event.target.value }), placeholder: "Link" })),
      React.createElement("label", { className: "file-picker" }, "Choose ad image",
        React.createElement("input", { accept: "image/*", onChange: chooseFile, type: "file" })
      ),
      React.createElement("input", { value: form.image, onChange: (event) => setForm({ ...form, image: event.target.value }), placeholder: "Image path or online URL" }),
      React.createElement("input", { value: form.sort_order, onChange: (event) => setForm({ ...form, sort_order: event.target.value }), placeholder: "Sort order" }),
      React.createElement("label", { className: "check-row" }, React.createElement("input", { checked: !!form.active, onChange: (event) => setForm({ ...form, active: event.target.checked }), type: "checkbox" }), React.createElement("span", null, "Active")),
      React.createElement("button", { type: "submit" }, editing ? "Save Post" : "Add Post")
    ),
    React.createElement("div", { className: "admin-table" },
      React.createElement("h2", null, "Landing Posts / Ads"),
      data.ads.map((ad) => React.createElement("article", { className: "admin-row", key: ad.id },
        React.createElement("img", { src: ad.image, alt: ad.title }),
        React.createElement("div", null, React.createElement("strong", null, ad.title), React.createElement("span", null, ad.subtitle)),
        React.createElement("button", { onClick: () => { setEditing(ad.id); setForm(ad); }, type: "button" }, "Edit"),
        React.createElement("button", { onClick: () => adminApi(`/api/admin/ads/${ad.id}`, { method: "DELETE" }).then(refresh).catch((error) => setMessage(error.message)), type: "button" }, "Delete")
      ))
    )
  );
}

function AboutAdmin({ data, refresh, setMessage }) {
  const settings = data.settings || {};
  const [form, setForm] = useState({
    about_eyebrow: settings.about_eyebrow || "ONE TEN story",
    about_title: settings.about_title || "Affordable men's fashion with a sharp street look.",
    about_body: settings.about_body || "ONE TEN focuses on simple, clean menswear for daily outfits. Every product stays between $1 and $10, with fast local delivery and a bold red, white, and black identity.",
    about_image: settings.about_image || "assets/ai-hero.png",
  });

  useEffect(() => {
    setForm({
      about_eyebrow: settings.about_eyebrow || "ONE TEN story",
      about_title: settings.about_title || "Affordable men's fashion with a sharp street look.",
      about_body: settings.about_body || "ONE TEN focuses on simple, clean menswear for daily outfits. Every product stays between $1 and $10, with fast local delivery and a bold red, white, and black identity.",
      about_image: settings.about_image || "assets/ai-hero.png",
    });
  }, [JSON.stringify(settings)]);

  function chooseImage(event) {
    readImageFiles(event.target.files, { maxSize: 1200, quality: 0.72 }).then((images) => {
      if (images[0]) setForm((current) => ({ ...current, about_image: images[0] }));
      event.target.value = "";
    });
  }

  function save(event) {
    event.preventDefault();
    adminApi("/api/admin/settings", { method: "PUT", body: JSON.stringify(form) })
      .then(() => {
        setMessage("About Us updated");
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  return React.createElement("section", { className: "admin-grid" },
    React.createElement("form", { className: "admin-form", onSubmit: save },
      React.createElement("h2", null, "Edit About Us"),
      React.createElement("input", { value: form.about_eyebrow, onChange: (event) => setForm({ ...form, about_eyebrow: event.target.value }), placeholder: "Small title" }),
      React.createElement("input", { value: form.about_title, onChange: (event) => setForm({ ...form, about_title: event.target.value }), placeholder: "Main headline" }),
      React.createElement("textarea", { value: form.about_body, onChange: (event) => setForm({ ...form, about_body: event.target.value }), placeholder: "About text" }),
      React.createElement("label", { className: "file-picker" }, "Choose about image",
        React.createElement("input", { accept: "image/*", onChange: chooseImage, type: "file" })
      ),
      React.createElement("input", { value: form.about_image, onChange: (event) => setForm({ ...form, about_image: event.target.value }), placeholder: "Image path or online URL" }),
      React.createElement("button", { type: "submit" }, "Save About Us")
    ),
    React.createElement("div", { className: "admin-table about-preview" },
      React.createElement("h2", null, "About Preview"),
      React.createElement("img", { src: form.about_image, alt: "About preview" }),
      React.createElement("p", { className: "eyebrow" }, form.about_eyebrow),
      React.createElement("strong", null, form.about_title),
      React.createElement("p", null, form.about_body)
    )
  );
}

function SettingsAdmin({ data, refresh, setMessage }) {
  const settings = data.settings || {};
  const [form, setForm] = useState({
    logo_image: settings.logo_image || "",
    logo_day: settings.logo_day || settings.logo_image || "",
    logo_night: settings.logo_night || "",
    footer_logo: settings.footer_logo || "",
    product_badge_logo: settings.product_badge_logo || "",
    ai_model_reference: settings.ai_model_reference || "",
    openai_api_key: "",
    footer_text: settings.footer_text || "",
    contact_title: settings.contact_title || "Get In Touch",
    phone: settings.phone || "",
    hotline: settings.hotline || "",
    whatsapp_number: settings.whatsapp_number || "0633454984",
    receipt_phone_primary: settings.receipt_phone_primary || "+252638764334",
    receipt_phone_secondary: settings.receipt_phone_secondary || "+252638764335",
    facebook_handle: settings.facebook_handle || "ONE TEN",
    tiktok_handle: settings.tiktok_handle || "ONETENBRAND",
    email: settings.email || "",
    location: settings.location || "",
    branches: (Array.isArray(settings.branches) && settings.branches.length ? settings.branches : ["Main Branch"]).join("\n"),
    information_links: cleanLinks(settings.information_links, defaultInformationLinks),
    department_links: cleanLinks(settings.department_links, defaultDepartmentLinks),
  });

  useEffect(() => {
    setForm({
      logo_image: settings.logo_image || "",
      logo_day: settings.logo_day || settings.logo_image || "",
      logo_night: settings.logo_night || "",
      footer_logo: settings.footer_logo || "",
      product_badge_logo: settings.product_badge_logo || "",
      ai_model_reference: settings.ai_model_reference || "",
      openai_api_key: "",
      footer_text: settings.footer_text || "",
      contact_title: settings.contact_title || "Get In Touch",
      phone: settings.phone || "",
      hotline: settings.hotline || "",
      whatsapp_number: settings.whatsapp_number || "0633454984",
      receipt_phone_primary: settings.receipt_phone_primary || "+252638764334",
      receipt_phone_secondary: settings.receipt_phone_secondary || "+252638764335",
      facebook_handle: settings.facebook_handle || "ONE TEN",
      tiktok_handle: settings.tiktok_handle || "ONETENBRAND",
      email: settings.email || "",
      location: settings.location || "",
      branches: (Array.isArray(settings.branches) && settings.branches.length ? settings.branches : ["Main Branch"]).join("\n"),
      information_links: cleanLinks(settings.information_links, defaultInformationLinks),
      department_links: cleanLinks(settings.department_links, defaultDepartmentLinks),
    });
  }, [JSON.stringify(settings)]);

  function updateLink(listName, index, field, value) {
    setForm((current) => {
      const links = current[listName].map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link);
      return { ...current, [listName]: links };
    });
  }

  function addLink(listName) {
    setForm((current) => ({ ...current, [listName]: [...current[listName], { label: "", href: "#/shop" }] }));
  }

  function removeLink(listName, index) {
    setForm((current) => {
      const links = current[listName].filter((_, linkIndex) => linkIndex !== index);
      return { ...current, [listName]: links.length ? links : [{ label: "", href: "#/shop" }] };
    });
  }

  function chooseLogo(field, event) {
    readImageFiles(event.target.files, { maxSize: 900, quality: 0.75 }).then((images) => {
      if (images[0]) setForm((current) => ({ ...current, [field]: images[0] }));
      event.target.value = "";
    });
  }

  function save(event) {
    event.preventDefault();
    const body = {
      logo_image: form.logo_image,
      logo_day: form.logo_day,
      logo_night: form.logo_night,
      footer_logo: form.footer_logo,
      product_badge_logo: form.product_badge_logo,
      ai_model_reference: form.ai_model_reference,
      footer_text: form.footer_text,
      contact_title: form.contact_title,
      phone: form.phone,
      hotline: form.hotline,
      whatsapp_number: form.whatsapp_number,
      receipt_phone_primary: form.receipt_phone_primary,
      receipt_phone_secondary: form.receipt_phone_secondary,
      facebook_handle: form.facebook_handle,
      tiktok_handle: form.tiktok_handle,
      email: form.email,
      location: form.location,
      branches: [...new Set(String(form.branches || "").split(/[\n,]+/).map((branch) => branch.trim()).filter(Boolean))],
      information_links: form.information_links.filter((link) => link.label.trim() && link.href.trim()),
      department_links: form.department_links.filter((link) => link.label.trim() && link.href.trim()),
    };
    if (form.openai_api_key.trim()) body.openai_api_key = form.openai_api_key.trim();
    adminApi("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) })
      .then(() => {
        setMessage("Logo, contact, hotline, and footer updated");
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  function LinkEditor({ title, listName }) {
    return React.createElement("div", { className: "link-editor" },
      React.createElement("div", { className: "link-editor-head" }, React.createElement("strong", null, title), React.createElement("button", { onClick: () => addLink(listName), type: "button" }, "Add")),
      form[listName].map((link, index) => React.createElement("div", { className: "link-row", key: index },
        React.createElement("input", { value: link.label, onChange: (event) => updateLink(listName, index, "label", event.target.value), placeholder: "Label" }),
        React.createElement("input", { value: link.href, onChange: (event) => updateLink(listName, index, "href", event.target.value), placeholder: "Link" }),
        React.createElement("button", { onClick: () => removeLink(listName, index), type: "button" }, "Remove")
      ))
    );
  }

  function LogoField({ field, label, placeholder }) {
    return React.createElement("div", { className: "logo-field" },
      React.createElement("label", { className: "file-picker" }, label,
        React.createElement("input", { accept: "image/*", onChange: (event) => chooseLogo(field, event), type: "file" })
      ),
      form[field] && React.createElement("div", { className: "logo-preview" }, React.createElement("img", { src: form[field], alt: `${label} preview` })),
      React.createElement("input", { value: form[field], onChange: (event) => setForm({ ...form, [field]: event.target.value }), placeholder })
    );
  }

  return React.createElement("section", { className: "admin-grid" },
    React.createElement("form", { className: "admin-form", onSubmit: save },
      React.createElement("h2", null, "Logo / Contact / Hotline / Footer"),
      React.createElement("div", { className: "two-col" },
        React.createElement(LogoField, { field: "logo_day", label: "Choose day logo", placeholder: "Day logo path or online URL" }),
        React.createElement(LogoField, { field: "logo_night", label: "Choose night logo", placeholder: "Night logo path or online URL" })
      ),
      React.createElement("div", { className: "two-col" },
        React.createElement(LogoField, { field: "footer_logo", label: "Choose footer logo", placeholder: "Footer logo path or online URL" }),
        React.createElement(LogoField, { field: "product_badge_logo", label: "Choose product badge logo", placeholder: "Small product badge logo path or URL" })
      ),
      React.createElement(LogoField, { field: "ai_model_reference", label: "Choose AI model reference", placeholder: "Upload the male model reference image for AI campaigns" }),
      React.createElement("div", { className: "ai-key-box" },
        React.createElement("strong", null, "OpenAI Image API"),
        React.createElement("span", null, settings.openai_api_configured ? "API key is configured. Add a new key only if you want to replace it." : "Add your API key to turn AI Pack generation into real images."),
        React.createElement("input", { value: form.openai_api_key, onChange: (event) => setForm({ ...form, openai_api_key: event.target.value }), placeholder: "OpenAI API key, hidden after save", type: "password" })
      ),
      React.createElement("input", { value: form.logo_image, onChange: (event) => setForm({ ...form, logo_image: event.target.value }), placeholder: "Old/general logo fallback path" }),
      React.createElement("input", { value: form.contact_title, onChange: (event) => setForm({ ...form, contact_title: event.target.value }), placeholder: "Contact title" }),
      React.createElement("div", { className: "two-col" },
        React.createElement("input", { value: form.phone, onChange: (event) => setForm({ ...form, phone: event.target.value }), placeholder: "Phone" }),
        React.createElement("input", { value: form.hotline, onChange: (event) => setForm({ ...form, hotline: event.target.value }), placeholder: "Hotline" })
      ),
      React.createElement("input", { value: form.whatsapp_number, onChange: (event) => setForm({ ...form, whatsapp_number: event.target.value }), placeholder: "WhatsApp order number" }),
      React.createElement("div", { className: "two-col" },
        React.createElement("input", { value: form.receipt_phone_primary, onChange: (event) => setForm({ ...form, receipt_phone_primary: event.target.value }), placeholder: "Receipt phone 1" }),
        React.createElement("input", { value: form.receipt_phone_secondary, onChange: (event) => setForm({ ...form, receipt_phone_secondary: event.target.value }), placeholder: "Receipt phone 2" })
      ),
      React.createElement("div", { className: "two-col" },
        React.createElement("input", { value: form.facebook_handle, onChange: (event) => setForm({ ...form, facebook_handle: event.target.value }), placeholder: "Receipt Facebook name" }),
        React.createElement("input", { value: form.tiktok_handle, onChange: (event) => setForm({ ...form, tiktok_handle: event.target.value }), placeholder: "Receipt TikTok name" })
      ),
      React.createElement("div", { className: "two-col" },
        React.createElement("input", { value: form.email, onChange: (event) => setForm({ ...form, email: event.target.value }), placeholder: "Email" }),
        React.createElement("input", { value: form.location, onChange: (event) => setForm({ ...form, location: event.target.value }), placeholder: "Location" })
      ),
      React.createElement("label", { className: "branch-settings-field" }, React.createElement("strong", null, "Store branches"), React.createElement("span", null, "Add one branch per line. These branches appear in the POS and printable reports."), React.createElement("textarea", { value: form.branches, onChange: (event) => setForm({ ...form, branches: event.target.value }), placeholder: "Main Branch\nSecond Branch" })),
      React.createElement("textarea", { value: form.footer_text, onChange: (event) => setForm({ ...form, footer_text: event.target.value }), placeholder: "Footer text" }),
      React.createElement(LinkEditor, { title: "Information links", listName: "information_links" }),
      React.createElement(LinkEditor, { title: "Shop departments", listName: "department_links" }),
      React.createElement("button", { type: "submit" }, "Save Settings")
    ),
    React.createElement("div", { className: "admin-table" },
      React.createElement("h2", null, "Footer Preview"),
      React.createElement("div", { className: "logo-preview" }, React.createElement("img", { src: form.footer_logo || form.logo_night || form.logo_day || "assets/logo-white.png", alt: "Footer logo preview" })),
      React.createElement("p", null, form.footer_text),
      React.createElement("p", null, `Phone: ${form.phone}`),
      React.createElement("p", null, `Hotline: ${form.hotline}`),
      React.createElement("p", null, form.email),
      React.createElement("p", null, form.location)
    )
  );
}

const fallbackStaffPermissions = [
  { key: "pos.sell", label: "Create in-store sales", group: "Point of Sale" },
  { key: "pos.history", label: "View POS sale history and receipts", group: "Point of Sale" },
  { key: "pos.void", label: "Void a POS sale and restore stock", group: "Point of Sale" },
  { key: "inventory.view", label: "View products and stock", group: "Store Access" },
  { key: "orders.view", label: "View online customer orders", group: "Store Access" },
  { key: "customers.view", label: "View registered customers", group: "Store Access" },
  { key: "reports.view", label: "View sales totals and reports", group: "Store Access" },
];

function StaffAdmin({ data, refresh, setMessage }) {
  const blank = { name: "", username: "", role: "Receptionist", password: "", active: true, permissions: ["pos.sell", "pos.history", "inventory.view"] };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const catalog = data.permission_catalog && data.permission_catalog.length ? data.permission_catalog : fallbackStaffPermissions;
  const staff = data.staff || [];

  function togglePermission(key) {
    const selected = Array.isArray(form.permissions) ? form.permissions : [];
    setForm({ ...form, permissions: selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key] });
  }

  function save(event) {
    event.preventDefault();
    const path = editing ? `/api/admin/staff/${editing}` : "/api/admin/staff";
    adminApi(path, { method: editing ? "PUT" : "POST", body: JSON.stringify(form) })
      .then(() => {
        setMessage(editing ? "Staff permissions updated" : "Staff account created");
        setEditing(null);
        setForm(blank);
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  function edit(member) {
    setEditing(member.id);
    setForm({
      name: member.name || "",
      username: member.username || "",
      role: member.role || "Receptionist",
      password: "",
      active: Number(member.active) === 1 || member.active === true,
      permissions: Array.isArray(member.permissions) ? member.permissions : [],
    });
  }

  function deactivate(member) {
    if (!window.confirm(`Deactivate ${member.name}? Their open POS sessions will be signed out.`)) return;
    adminApi(`/api/admin/staff/${member.id}`, { method: "DELETE" })
      .then(() => {
        setMessage(`${member.name} was deactivated`);
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  const groups = [...new Set(catalog.map((permission) => permission.group || "Permissions"))];
  return React.createElement("section", { className: "staff-admin-layout" },
    React.createElement("form", { className: "admin-form staff-form", onSubmit: save },
      React.createElement("div", { className: "staff-form-heading" },
        React.createElement("div", null,
          React.createElement("span", null, editing ? "Edit staff access" : "New staff account"),
          React.createElement("h2", null, editing ? "Update Receptionist / Seller" : "Register Receptionist / Seller")
        ),
        editing && React.createElement("button", { className: "secondary", onClick: () => { setEditing(null); setForm(blank); }, type: "button" }, "Cancel edit")
      ),
      React.createElement("div", { className: "staff-field-grid" },
        React.createElement("label", null, React.createElement("span", null, "Full name"), React.createElement("input", { required: true, value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "e.g. Ayaan Ahmed" })),
        React.createElement("label", null, React.createElement("span", null, "Username"), React.createElement("input", { required: true, value: form.username, onChange: (event) => setForm({ ...form, username: event.target.value.toLowerCase() }), placeholder: "ayaan.pos" })),
        React.createElement("label", null, React.createElement("span", null, "Role title"), React.createElement("select", { value: form.role, onChange: (event) => setForm({ ...form, role: event.target.value }) }, ["Receptionist", "Seller", "Cashier", "Store Manager"].map((role) => React.createElement("option", { key: role, value: role }, role)))),
        React.createElement("label", null, React.createElement("span", null, editing ? "New password (optional)" : "Temporary password"), React.createElement("input", { required: !editing, minLength: 6, type: "password", value: form.password, onChange: (event) => setForm({ ...form, password: event.target.value }), placeholder: editing ? "Leave blank to keep current" : "At least 6 characters" }))
      ),
      editing && React.createElement("label", { className: "staff-active-toggle" }, React.createElement("input", { checked: !!form.active, onChange: (event) => setForm({ ...form, active: event.target.checked }), type: "checkbox" }), React.createElement("span", null, "Account is active")),
      React.createElement("div", { className: "permission-groups" }, groups.map((group) =>
        React.createElement("fieldset", { key: group },
          React.createElement("legend", null, group),
          catalog.filter((permission) => (permission.group || "Permissions") === group).map((permission) =>
            React.createElement("label", { className: form.permissions.includes(permission.key) ? "permission-option selected" : "permission-option", key: permission.key },
              React.createElement("input", { checked: form.permissions.includes(permission.key), onChange: () => togglePermission(permission.key), type: "checkbox" }),
              React.createElement("span", null, React.createElement("strong", null, permission.label), React.createElement("small", null, permission.key))
            )
          )
        )
      )),
      React.createElement("button", { className: "staff-save", type: "submit" }, editing ? "Save Staff Access" : "Create Staff Account")
    ),
    React.createElement("div", { className: "admin-table staff-directory" },
      React.createElement("div", { className: "orders-board-head" }, React.createElement("div", null, React.createElement("span", null, "Admin controlled access"), React.createElement("h2", null, "Staff Directory")), React.createElement("strong", null, `${staff.length} accounts`)),
      staff.length ? staff.map((member) => React.createElement("article", { className: "staff-account-row", key: member.id },
        React.createElement("div", { className: "staff-avatar" }, customerInitials(member.name)),
        React.createElement("div", { className: "staff-account-main" },
          React.createElement("div", null, React.createElement("strong", null, member.name), React.createElement("span", { className: member.active ? "staff-status active" : "staff-status" }, member.active ? "Active" : "Inactive")),
          React.createElement("p", null, `${member.role || "Receptionist"} / @${member.username}`),
          React.createElement("div", { className: "staff-permission-pills" }, (member.permissions || []).map((permission) => React.createElement("span", { key: permission }, permission.replace(".", " / ")))),
          React.createElement("small", null, member.last_login_at ? `Last login ${formatAdminDate(member.last_login_at)}` : "Has not signed in yet")
        ),
        React.createElement("div", { className: "row-actions" },
          React.createElement("button", { onClick: () => edit(member), type: "button" }, "Edit"),
          member.active && React.createElement("button", { className: "danger", onClick: () => deactivate(member), type: "button" }, "Deactivate")
        )
      )) : React.createElement("div", { className: "empty-state compact" }, React.createElement("h2", null, "No staff accounts yet"), React.createElement("p", null, "Register a receptionist or seller and choose exactly what they can access."))
    )
  );
}

function SecurityAdmin({ data, refresh, setMessage }) {
  const admin = data.admin || {};
  const [form, setForm] = useState({
    username: admin.username || "onetenadmin",
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  useEffect(() => {
    setForm((current) => ({ ...current, username: admin.username || current.username || "onetenadmin" }));
  }, [admin.username]);

  function save(event) {
    event.preventDefault();
    if (form.new_password && form.new_password !== form.confirm_password) {
      setMessage("New password and confirmation do not match");
      return;
    }
    adminApi("/api/admin/profile", {
      method: "PUT",
      body: JSON.stringify({
        username: form.username,
        current_password: form.current_password,
        new_password: form.new_password,
      }),
    })
      .then(() => {
        setMessage("Admin security details updated");
        setForm((current) => ({ ...current, current_password: "", new_password: "", confirm_password: "" }));
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  return React.createElement("section", { className: "settings-grid" },
    React.createElement("form", { className: "admin-form security-form", onSubmit: save },
      React.createElement("h2", null, "Admin Security"),
      React.createElement("p", { className: "muted" }, "Change the private admin username or password. The current password is required before saving."),
      React.createElement("input", { value: form.username, onChange: (event) => setForm({ ...form, username: event.target.value }), placeholder: "Admin username" }),
      React.createElement("input", { value: form.current_password, onChange: (event) => setForm({ ...form, current_password: event.target.value }), placeholder: "Current password", type: "password", autoComplete: "current-password" }),
      React.createElement("input", { value: form.new_password, onChange: (event) => setForm({ ...form, new_password: event.target.value }), placeholder: "New password (optional)", type: "password", autoComplete: "new-password" }),
      React.createElement("input", { value: form.confirm_password, onChange: (event) => setForm({ ...form, confirm_password: event.target.value }), placeholder: "Confirm new password", type: "password", autoComplete: "new-password" }),
      React.createElement("button", { type: "submit" }, "Save Security")
    ),
    React.createElement("div", { className: "admin-table" },
      React.createElement("h2", null, "Current Admin"),
      React.createElement("article", { className: "order-row" },
        React.createElement("div", null,
          React.createElement("strong", null, admin.username || form.username || "Admin"),
          React.createElement("span", null, "Active dashboard account")
        )
      ),
      React.createElement("p", { className: "muted" }, "When the password is changed, other open admin sessions are signed out automatically.")
    )
  );
}

function SubscribersAdmin({ data }) {
  const subscribers = data.subscribers || [];
  return React.createElement("section", { className: "admin-table subscribers" },
    React.createElement("h2", null, "Newsletter Phone Numbers"),
    subscribers.length ? subscribers.map((subscriber) => React.createElement("article", { className: "order-row", key: subscriber.id },
      React.createElement("div", null,
        React.createElement("strong", null, subscriber.phone),
        React.createElement("span", null, `Subscribed: ${subscriber.created_at}`)
      ),
      React.createElement("span", { className: "subscriber-badge" }, "Active")
    )) : React.createElement("div", { className: "empty-state" }, React.createElement("h2", null, "No subscribers yet"), React.createElement("p", null, "Phone numbers will appear here after customers subscribe."))
  );
}

function CustomersAdmin({ data, selectedCustomerId, onSelectCustomer }) {
  const [query, setQuery] = useState("");
  const customers = data.customers || [];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCustomers = customers.filter((customer) => !normalizedQuery || [customer.name, customer.email, customer.phone, customer.address, customer.id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery)));
  const selectedCustomer = selectedCustomerId ? customers.find((customer) => String(customer.id) === String(selectedCustomerId)) : null;
  const customerOrders = selectedCustomer ? (data.orders || []).filter((order) => String(order.customer_id) === String(selectedCustomer.id)) : [];
  const topCustomer = customers.reduce((best, customer) => Number(customer.total_spent || 0) > Number(best && best.total_spent || 0) ? customer : best, null);

  return React.createElement("section", { className: "admin-table customer-board" },
    React.createElement("div", { className: "customer-board-head" },
      React.createElement("div", null, React.createElement("span", null, "Customer directory"), React.createElement("h2", null, "Registered Customers")),
      React.createElement("strong", null, `${customers.length} accounts`)
    ),
    topCustomer && React.createElement("button", { className: "customer-top-spotlight", onClick: () => onSelectCustomer(topCustomer.id), type: "button" },
      React.createElement("span", { className: "customer-avatar large" }, customerInitials(topCustomer.name)),
      React.createElement("div", { className: "customer-top-copy" }, React.createElement("small", null, "Top customer"), React.createElement("strong", null, topCustomer.name), React.createElement("span", null, topCustomer.email || topCustomer.phone || "Customer profile")),
      React.createElement("div", { className: "customer-top-total" }, React.createElement("small", null, "Lifetime spend"), React.createElement("strong", null, `$${Number(topCustomer.total_spent || 0).toFixed(2)}`), React.createElement("span", null, `${Number(topCustomer.order_count || 0)} orders`)),
      React.createElement("em", null, "View profile")
    ),
    React.createElement("div", { className: "customer-search" }, React.createElement("input", { onChange: (event) => setQuery(event.target.value), placeholder: "Search name, email, phone or address...", value: query })),
    React.createElement("div", { className: "customer-list" },
      visibleCustomers.length ? visibleCustomers.map((customer) => React.createElement("article", { className: "customer-row", key: customer.id, onClick: () => onSelectCustomer(customer.id), onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") onSelectCustomer(customer.id); }, role: "button", tabIndex: 0 },
        React.createElement("span", { className: "customer-avatar" }, customerInitials(customer.name)),
        React.createElement("div", { className: "customer-main" }, React.createElement("strong", null, customer.name), React.createElement("span", null, customer.email), React.createElement("small", null, `${customer.phone || "No checkout phone yet"} / Prefers ${preferredCustomerChannel(customer)}`)),
        React.createElement("div", { className: "customer-row-stat" }, React.createElement("span", null, "Orders"), React.createElement("strong", null, Number(customer.order_count || 0))),
        React.createElement("div", { className: "customer-row-stat" }, React.createElement("span", null, "Spent"), React.createElement("strong", null, `$${Number(customer.total_spent || 0).toFixed(2)}`)),
        React.createElement("span", { className: "row-open-label" }, "View details")
      )) : React.createElement("div", { className: "empty-state compact" }, React.createElement("h2", null, query ? "No matching customers" : "No customers registered yet"))
    ),
    selectedCustomer && React.createElement(CustomerDetailDrawer, { customer: selectedCustomer, orders: customerOrders, onClose: () => onSelectCustomer(null) })
  );
}

function CustomerDetailDrawer({ customer, orders, onClose }) {
  return React.createElement(React.Fragment, null,
    React.createElement("button", { "aria-label": "Close customer details", className: "admin-drawer-backdrop", onClick: onClose, type: "button" }),
    React.createElement("aside", { "aria-label": `${customer.name} details`, "aria-modal": "true", className: "admin-detail-drawer customer-detail-drawer", role: "dialog" },
      React.createElement("div", { className: "admin-drawer-head" },
        React.createElement("div", null, React.createElement("span", null, "Customer profile"), React.createElement("h2", null, customer.name)),
        React.createElement("button", { "aria-label": "Close", className: "drawer-close", onClick: onClose, type: "button" }, "\u00d7")
      ),
      React.createElement("div", { className: "admin-drawer-scroll" },
        React.createElement("div", { className: "customer-drawer-hero" }, React.createElement("span", { className: "customer-avatar large" }, customerInitials(customer.name)), React.createElement("div", null, React.createElement("strong", null, customer.name), React.createElement("span", null, customer.email), React.createElement("small", null, `Customer #${customer.id}`))),
        React.createElement("div", { className: "drawer-metrics" },
          React.createElement("div", null, React.createElement("span", null, "Orders"), React.createElement("strong", null, Number(customer.order_count || orders.length || 0))),
          React.createElement("div", null, React.createElement("span", null, "Total spent"), React.createElement("strong", null, `$${Number(customer.total_spent || 0).toFixed(2)}`)),
          React.createElement("div", null, React.createElement("span", null, "Last order"), React.createElement("strong", null, customer.last_order_id ? `#${customer.last_order_id}` : "None")),
          React.createElement("div", null, React.createElement("span", null, "Preferred channel"), React.createElement("strong", null, preferredCustomerChannel(customer)))
        ),
        React.createElement("dl", { className: "drawer-details-list" },
          React.createElement("div", null, React.createElement("dt", null, "Email"), React.createElement("dd", null, customer.email || "Not provided")),
          React.createElement("div", null, React.createElement("dt", null, "Latest phone"), React.createElement("dd", null, customer.phone || "No checkout phone yet")),
          React.createElement("div", null, React.createElement("dt", null, "Latest address"), React.createElement("dd", null, customer.address || "No delivery address yet")),
          React.createElement("div", null, React.createElement("dt", null, "Registered"), React.createElement("dd", null, formatAdminDate(customer.created_at))),
          React.createElement("div", null, React.createElement("dt", null, "Last order date"), React.createElement("dd", null, formatAdminDate(customer.last_order_at)))
        ),
        React.createElement("section", { className: "drawer-section customer-order-history" }, React.createElement("h3", null, "Complete order history"),
          orders.length ? orders.map((order) => React.createElement("article", { className: "customer-order-card", key: order.id },
            React.createElement("div", { className: "customer-order-head" }, React.createElement("strong", null, `Order #${order.id}`), React.createElement("span", { className: `order-status status-${String(order.status || "processing").toLowerCase().replace(/\s+/g, "-")}` }, order.status || "Processing")),
            React.createElement("small", null, `${formatAdminDate(order.created_at)} / $${Number(order.total || 0).toFixed(2)}`),
            React.createElement("div", { className: "customer-order-items" }, (order.order_items || []).map((item) => React.createElement("div", { key: item.id }, React.createElement(ProductVisual, { src: item.product_image || "assets/ai-products.png", alt: item.product_name, className: "customer-order-product-visual" }), React.createElement("span", null, React.createElement("strong", null, item.product_name), React.createElement("small", null, `${item.size ? `Size ${item.size} / ` : ""}Qty ${item.qty}`)))))
          )) : React.createElement("p", null, "This customer has not placed an order yet.")
        )
      )
    )
  );
}

function OrdersAdmin({ data, refresh, setMessage, onOpenCustomer }) {
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const orders = data.orders || [];
  const statusOptions = ["All", "Processing", "Approved", "Packed", "Delivered", "Cancelled"];
  const filteredOrders = statusFilter === "All" ? orders : orders.filter((order) => order.status === statusFilter);
  const selectedOrder = selectedOrderId ? orders.find((order) => String(order.id) === String(selectedOrderId)) : null;
  const selectedCustomer = selectedOrder ? (data.customers || []).find((customer) => String(customer.id) === String(selectedOrder.customer_id)) : null;

  function update(order, status) {
    return adminApi(`/api/admin/orders/${order.id}`, { method: "PUT", body: JSON.stringify({ status }) })
      .then(() => {
        setMessage(`Order #${order.id} updated to ${status}`);
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  function updateItem(item, changes) {
    return adminApi(`/api/admin/order-items/${item.id}`, { method: "PUT", body: JSON.stringify({ qty: item.qty, status: item.status || "Processing", ...changes }) })
      .then(() => {
        setMessage("Order item updated and stock synced");
        refresh();
      })
      .catch((error) => setMessage(error.message));
  }

  return React.createElement("section", { className: "admin-table orders orders-board" },
    React.createElement("div", { className: "orders-board-head" }, React.createElement("div", null, React.createElement("span", null, "Online + in-store"), React.createElement("h2", null, "Sales & Orders by Status")), React.createElement("strong", null, `${orders.length} records`)),
    React.createElement("div", { className: "order-status-filter admin-order-status-filter" }, statusOptions.map((status) => React.createElement("button", { className: statusFilter === status ? "active" : "", key: status, onClick: () => setStatusFilter(status), type: "button" }, React.createElement("span", null, status), React.createElement("strong", null, status === "All" ? orders.length : orders.filter((order) => order.status === status).length)))),
    filteredOrders.length ? filteredOrders.map((order) => React.createElement("article", { className: "order-row order-row-clickable", key: order.id, onClick: () => setSelectedOrderId(order.id), onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") setSelectedOrderId(order.id); }, role: "button", tabIndex: 0 },
      React.createElement("div", { className: "order-row-id" }, React.createElement("strong", null, order.receipt_number || `#${order.id}`), React.createElement("span", { className: `order-status status-${String(order.status || "processing").toLowerCase().replace(/\s+/g, "-")}` }, order.status || "Processing"), React.createElement("small", null, order.sales_channel === "external_online" ? "Online outside website" : order.source === "pos" ? "In-store POS" : "Website")),
      React.createElement("div", { className: "order-row-customer" }, React.createElement("strong", null, order.customer_name), React.createElement("span", null, order.phone || "No phone"), React.createElement("small", null, order.address || "No address")),
      React.createElement("div", { className: "order-row-stat" }, React.createElement("span", null, "Product lines"), React.createElement("strong", null, Number(order.items || (order.order_items || []).length))),
      React.createElement("div", { className: "order-row-stat" }, React.createElement("span", null, "Total"), React.createElement("strong", null, `$${Number(order.total || 0).toFixed(2)}`)),
      React.createElement("span", { className: "row-open-label" }, "Open order")
    )) : React.createElement("div", { className: "empty-state compact" }, React.createElement("h2", null, orders.length ? `No ${statusFilter.toLowerCase()} orders` : "No orders yet")),
    selectedOrder && React.createElement(AdminOrderDrawer, { customer: selectedCustomer, onClose: () => setSelectedOrderId(null), onOpenCustomer, onUpdateItem: updateItem, onUpdateOrder: update, order: selectedOrder })
  );
}

function AdminOrderDrawer({ order, customer, onClose, onOpenCustomer, onUpdateItem, onUpdateOrder }) {
  function cancelEntireOrder() {
    const itemCount = (order.order_items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
    if (window.confirm(`Cancel the entire order and return ${itemCount} item${itemCount === 1 ? "" : "s"} to stock?`)) onUpdateOrder(order, "Cancelled");
  }

  return React.createElement(React.Fragment, null,
    React.createElement("button", { "aria-label": "Close order details", className: "admin-drawer-backdrop", onClick: onClose, type: "button" }),
    React.createElement("aside", { "aria-label": `Order ${order.id} details`, "aria-modal": "true", className: "admin-detail-drawer order-detail-drawer", role: "dialog" },
      React.createElement("div", { className: "admin-drawer-head" },
        React.createElement("div", null, React.createElement("span", null, "Order details"), React.createElement("h2", null, `Order #${order.id}`)),
        React.createElement("button", { "aria-label": "Close", className: "drawer-close", onClick: onClose, type: "button" }, "\u00d7")
      ),
      React.createElement("div", { className: "admin-drawer-scroll" },
        React.createElement("div", { className: "order-customer-summary" }, React.createElement("span", { className: "customer-avatar" }, customerInitials(order.customer_name)), React.createElement("div", null, React.createElement("strong", null, order.customer_name), React.createElement("span", null, customer && customer.email ? customer.email : "Email unavailable"), React.createElement("small", null, order.phone || "No phone")), customer && React.createElement("button", { onClick: () => onOpenCustomer(customer.id), type: "button" }, "View customer profile")),
        React.createElement("dl", { className: "drawer-details-list" },
          React.createElement("div", null, React.createElement("dt", null, "Delivery address"), React.createElement("dd", null, order.address || "Not provided")),
          React.createElement("div", null, React.createElement("dt", null, "Placed"), React.createElement("dd", null, formatAdminDate(order.created_at))),
          React.createElement("div", null, React.createElement("dt", null, "Sales channel"), React.createElement("dd", null, order.sales_channel === "external_online" ? "Online outside website" : order.source === "pos" ? "In-store" : "Website")),
          React.createElement("div", null, React.createElement("dt", null, "Branch"), React.createElement("dd", null, order.branch || (order.source === "pos" ? "Main Branch" : "Online Store"))),
          order.receipt_number && React.createElement("div", null, React.createElement("dt", null, "Receipt"), React.createElement("dd", null, order.receipt_number)),
          React.createElement("div", null, React.createElement("dt", null, "Product lines"), React.createElement("dd", null, Number(order.items || (order.order_items || []).length))),
          React.createElement("div", null, React.createElement("dt", null, "Order total"), React.createElement("dd", null, `$${Number(order.total || 0).toFixed(2)}`))
        ),
        order.source === "pos"
          ? React.createElement("div", { className: "order-status-control" }, React.createElement("span", null, "Completed POS receipt"), order.status !== "Cancelled" ? React.createElement("button", { onClick: () => onUpdateOrder(order, "Cancelled"), type: "button" }, "Void sale and restore stock") : React.createElement("strong", null, "Voided / stock restored"))
          : order.status === "Cancelled"
            ? React.createElement("div", { className: "order-cancelled-banner" }, React.createElement("strong", null, "Entire order cancelled"), React.createElement("span", null, "All remaining quantities were returned to stock."))
            : React.createElement("div", { className: "order-cancel-control" },
              React.createElement("label", null, React.createElement("span", null, "Overall order status"), React.createElement("select", { onChange: (event) => onUpdateOrder(order, event.target.value), value: order.status || "Processing" }, ["Processing", "Approved", "Packed", "Delivered"].map((status) => React.createElement("option", { key: status }, status)))),
              React.createElement("div", null, React.createElement("strong", null, "Cancel everything"), React.createElement("span", null, "Cancels every remaining product and restores all stock.")),
              React.createElement("button", { onClick: cancelEntireOrder, type: "button" }, "Cancel Entire Order")
            ),
        React.createElement("section", { className: "drawer-section" }, React.createElement("h3", null, "Products separated by status"), React.createElement("p", null, order.source === "pos" ? "Completed POS lines are read-only. Void the receipt to restore all stock." : "Processing, approved and cancelled products are shown in separate groups below."),
          React.createElement(AdminOrderItemsByStatus, { order, onUpdateItem })
        )
      )
    )
  );
}

function AdminOrderItemsByStatus({ order, onUpdateItem }) {
  const items = order.order_items || [];
  const groups = ["Processing", "Approved", "Cancelled"]
    .map((status) => ({ status, items: items.filter((item) => (item.status || "Processing") === status) }))
    .filter((group) => group.items.length);

  return React.createElement("div", { className: "admin-order-product-groups" },
    groups.length ? groups.map((group) => React.createElement("section", { className: `admin-order-product-group status-${group.status.toLowerCase()}`, key: group.status },
      React.createElement("header", null,
        React.createElement("div", null, React.createElement("span", { className: `order-status status-${group.status.toLowerCase()}` }, group.status), React.createElement("strong", null, `${group.items.length} product line${group.items.length === 1 ? "" : "s"}`)),
        React.createElement("small", null, `${group.items.reduce((sum, item) => sum + Number(group.status === "Cancelled" ? item.requested_qty || 0 : item.qty || 0), 0)} quantity`)
      ),
      React.createElement("div", { className: "drawer-order-items" }, group.items.map((item) => order.source === "pos"
        ? React.createElement("article", { className: `drawer-order-item ${item.status === "Cancelled" ? "is-cancelled" : ""}`, key: item.id }, React.createElement(ProductVisual, { src: item.product_image || "assets/ai-products.png", alt: item.product_name, className: "drawer-order-product-visual" }), React.createElement("div", { className: "drawer-order-item-main" }, React.createElement("strong", null, item.product_name), React.createElement("span", null, `${item.size ? `Size ${item.size}` : "No size"} / $${Number(item.price || 0).toFixed(2)} each`), React.createElement("small", null, `Sold quantity ${Number(item.qty || item.requested_qty || 0)}`)))
        : React.createElement(AdminOrderItemEditor, { item, key: item.id, onSave: onUpdateItem })))
    )) : React.createElement("p", { className: "admin-order-products-empty" }, "No product lines in this order.")
  );
}

function AdminOrderItemEditor({ item, onSave }) {
  const requestedQty = Math.max(1, Number(item.requested_qty || item.qty || 1));
  const currentQty = Math.max(0, Number(item.qty || 0));
  const alreadyCancelled = Math.max(0, requestedQty - currentQty);
  const [cancelQty, setCancelQty] = useState(alreadyCancelled);
  const [status, setStatus] = useState(item.status || "Processing");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setCancelQty(Math.max(0, Math.max(1, Number(item.requested_qty || item.qty || 1)) - Math.max(0, Number(item.qty || 0))));
    setStatus(item.status || "Processing");
  }, [item.id, item.qty, item.requested_qty, item.status]);
  const remainingQty = Math.max(0, requestedQty - cancelQty);
  const nextStatus = remainingQty === 0 ? "Cancelled" : status === "Cancelled" ? "Processing" : status;
  const changed = cancelQty !== alreadyCancelled || nextStatus !== (item.status || "Processing");
  const locked = item.status === "Cancelled";

  function save() {
    if (cancelQty > alreadyCancelled && !window.confirm(`Cancel ${cancelQty - alreadyCancelled} additional unit${cancelQty - alreadyCancelled === 1 ? "" : "s"} of ${item.product_name}?`)) return;
    setSaving(true);
    Promise.resolve(onSave(item, { qty: remainingQty, status: nextStatus })).finally(() => setSaving(false));
  }

  function cancelProduct() {
    if (!window.confirm(`Cancel all ${currentQty} remaining unit${currentQty === 1 ? "" : "s"} of ${item.product_name} and return them to stock?`)) return;
    setSaving(true);
    Promise.resolve(onSave(item, { qty: 0, status: "Cancelled" })).finally(() => setSaving(false));
  }

  return React.createElement("article", { className: `drawer-order-item ${locked ? "is-cancelled" : ""}` },
    React.createElement(ProductVisual, { src: item.product_image || "assets/ai-products.png", alt: item.product_name, className: "drawer-order-product-visual" }),
    React.createElement("div", { className: "drawer-order-item-main" }, React.createElement("strong", null, item.product_name), React.createElement("span", null, `${item.size ? `Size ${item.size}` : "No size"} / $${Number(item.price || 0).toFixed(2)} each`), React.createElement("small", null, `Requested ${requestedQty} / Keeping ${remainingQty} / Cancelling ${cancelQty}`)),
    React.createElement("label", null, React.createElement("span", null, "Cancel quantity"), React.createElement("input", { disabled: locked, max: requestedQty, min: alreadyCancelled, onChange: (event) => setCancelQty(Math.min(requestedQty, Math.max(alreadyCancelled, Number(event.target.value) || 0))), type: "number", value: cancelQty })),
    React.createElement("label", null, React.createElement("span", null, "Remaining status"), React.createElement("select", { disabled: locked || remainingQty === 0, onChange: (event) => setStatus(event.target.value), value: nextStatus }, ["Processing", "Approved", ...(nextStatus === "Cancelled" ? ["Cancelled"] : [])].map((option) => React.createElement("option", { key: option }, option)))),
    React.createElement("div", { className: "line-cancel-actions" },
      React.createElement("button", { disabled: !changed || saving || locked, onClick: save, type: "button" }, saving ? "Saving..." : changed ? "Save Partial" : locked ? "Cancelled" : "Saved"),
      React.createElement("button", { className: "cancel-line", disabled: saving || locked || currentQty <= 0, onClick: cancelProduct, type: "button" }, "Cancel Product")
    )
  );
}

ReactDOM.createRoot(document.getElementById("admin-root")).render(React.createElement(AdminApp));
