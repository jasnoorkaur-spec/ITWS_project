// Shared page state, navigation, and customer/product screens.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const appShell = $("#app-shell");
const pageContent = $("#page-content");
const modalRoot = $("#modal-root");
const state = {
  user: { name: "there", email: "" },
  profile: null,
  page: "dashboard",
  customers: [],
  products: [],
  invoices: [],
  productStockFilter: "",
  invoiceEditor: false,
};
const navItems = [
  ["dashboard", "Overview", "⌂"],
  ["invoices", "Invoices", "▤"],
  ["customers", "Customers", "♙"],
  ["products", "Products", "◇"],
  ["settings", "Business settings", "⚙"],
];
const escapeHTML = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const money = (value) => formatINR(value);
const dateText = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
    : "—";
const dateISO = () => new Date().toISOString().slice(0, 10);
const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join("") || "U";
const navPath = (page, id = "") =>
  `#/${id ? `invoices/${encodeURIComponent(id)}` : page === "dashboard" ? "" : page}`;
const toast = (message, kind = "success") => {
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  $("#toast-root").append(node);
  setTimeout(() => node.remove(), 3600);
};
const showError = (error) =>
  toast(
    error instanceof AppError
      ? error.message
      : "We could not complete that action. Please try again.",
    "error",
  );
const statusBadge = (value = "Draft") => {
  const key = String(value).toLowerCase();
  return `<span class="badge ${escapeHTML(key)}">${escapeHTML(key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()))}</span>`;
};
const optionsForStates = (selected = "") =>
  `<option value="">Choose a state</option>
${INDIAN_STATES.map(
  (
    item,
  ) => `<option value="${item.code}" data-name="${escapeHTML(item.name)}" ${String(selected) === item.code ? "selected" : ""}>
  ${escapeHTML(item.name)} · ${item.code}
</option>`,
).join("")}`;
const selectedStateName = (code) =>
  INDIAN_STATES.find((item) => item.code === String(code))?.name || "";

// 4. Navigation and page rendering
function renderSidebar() {
  $("#sidebar").innerHTML = `<div class="brand">
  <span class="brand-mark">▤</span>
  <span>
    GST Desk
    <small>Billing workspace</small>
  </span>
</div>
<div class="nav-label">Workspace</div>
<nav class="nav-list">${navItems
    .map(
      ([
        id,
        label,
        icon,
      ]) => `<button class="nav-link ${state.page === id ? "active" : ""}" data-nav="${id}">
  <span class="nav-icon">${icon}</span>
  ${label}
</button>`,
    )
    .join("")}</nav>
<div class="sidebar-spacer"></div>
<div class="account-mini">
  <span class="avatar">${escapeHTML(initials(state.profile?.businessName || "Business owner"))}</span>
  <div>
    <strong>${escapeHTML(state.profile?.businessName || "Your business")}</strong>
    <small>Saved in this browser</small>
  </div>
</div>`;
  const title =
    state.page === "invoice-detail"
      ? "Invoice details"
      : navItems.find(([id]) => id === state.page)?.[1] || "Overview";
  $("#topbar").innerHTML = `<div class="topbar-main">
  <button class="mobile-menu" data-action="menu" aria-label="Open navigation">☰</button>
  <div>
    <h1>${escapeHTML(title)}</h1>
    <p>${state.profile?.businessName ? escapeHTML(state.profile.businessName) : "Set up your business profile to personalize invoices"}</p>
  </div>
</div>
<div class="topbar-actions">
  <button class="btn btn-primary" data-action="new-invoice">＋ New invoice</button>
</div>`;
}
async function startApp() {
  try {
    const result = await browserData.get("/settings/profile");
    state.profile = result.profile;
    state.user = {
      name: state.profile?.businessName || "there",
      email: state.profile?.email || "",
    };
    const route = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (route[0] === "invoices" && route[1]) {
      state.page = "invoice-detail";
      enterApp(decodeURIComponent(route[1]));
    } else {
      state.page = route[0] || "dashboard";
      if (!navItems.some(([id]) => id === state.page)) state.page = "dashboard";
      enterApp();
    }
  } catch (error) {
    showError(error);
    appShell.hidden = false;
    state.page = "dashboard";
    enterApp();
  }
}
function enterApp(id = "") {
  appShell.hidden = false;
  renderSidebar();
  navigate(state.page, id, false);
}
async function navigate(page, id = "", push = true) {
  state.page = page;
  if (push)
    history.pushState({ page, id }, "", id ? navPath(page, id) : navPath(page));
  renderSidebar();
  $("#sidebar").classList.remove("open");
  $(".mobile-overlay")?.classList.remove("show");
  try {
    if (page === "dashboard") await renderDashboard();
    else if (page === "customers") await renderCustomers();
    else if (page === "products") await renderProducts();
    else if (page === "invoices") await renderInvoices();
    else if (page === "settings") await renderSettings();
    else if (page === "invoice-detail") await renderInvoiceDetail(id);
  } catch (error) {
    showError(error);
    pageContent.innerHTML = `<div class="card empty-state">
  <h3>We couldn't load this page</h3>
  <p>${escapeHTML(error.message)}</p>
  <button class="btn btn-secondary" data-action="retry">Try again</button>
</div>`;
  }
  pageContent.focus({ preventScroll: true });
}
const heading = (title, subtitle, action = "") =>
  `<div class="page-heading">
  <div>
    <h2>${escapeHTML(title)}</h2>
    <p>${escapeHTML(subtitle)}</p>
  </div>
  ${action}
</div>`;
const emptyState = (icon, title, text, action = "") =>
  `<div class="empty-state">
  <div class="empty-icon">${icon}</div>
  <h3>${escapeHTML(title)}</h3>
  <p>${escapeHTML(text)}</p>
  ${action}
</div>`;
const tableRows = (items, render, empty) =>
  items.length
    ? items.map(render).join("")
    : `<tr><td colspan="10" class="empty-table-cell">${escapeHTML(empty)}</td></tr>`;

async function renderDashboard() {
  const data = await browserData.get("/dashboard");
  state.profile = data.profile || state.profile;

  const stats = data.stats || {};
  const recentInvoices = data.recentInvoices || [];
  const statCards = [
    ["Invoices", stats.invoiceCount ?? 0, "▤"],
    ["Customers", stats.customerCount ?? 0, "♙"],
    ["Products", stats.productCount ?? 0, "◇"],
  ];

  const setupNotice = state.profile?.businessName
    ? ""
    : `<div class="notice">
  <div>
    <strong>Set up your business profile</strong>
    Add your business name, address and state to start issuing GST invoices.
    <button class="text-button" data-nav="settings">Open business settings →</button>
  </div>
</div>`;

  const statsMarkup = statCards
    .map(
      ([label, value, icon]) => `<article class="stat-card">
  <div class="stat-label">
    ${label}
    <span>${icon}</span>
  </div>
  <div class="stat-value">${value}</div>
</article>`,
    )
    .join("");

  const quickActions = `<section class="card">
  <div class="card-heading">
    <div>
      <h3>Quick actions</h3>
      <p>Keep your business moving</p>
    </div>
  </div>
  <div class="quick-actions">
    <button class="quick-action" data-action="new-invoice">
      <span class="quick-icon">＋</span>
      <span>
        <strong>Create new invoice</strong>
        <small>Start a GST invoice</small>
      </span>
    </button>
    <button class="quick-action" data-action="add-customer">
      <span class="quick-icon">♙</span>
      <span>
        <strong>Add customer</strong>
        <small>Save billing details once</small>
      </span>
    </button>
    <button class="quick-action" data-action="add-product">
      <span class="quick-icon">◇</span>
      <span>
        <strong>Add product</strong>
        <small>Keep your item list ready</small>
      </span>
    </button>
    <button class="quick-action" data-nav="invoices">
      <span class="quick-icon">▤</span>
      <span>
        <strong>View all invoices</strong>
        <small>Search and update payments</small>
      </span>
    </button>
  </div>
</section>`;

  const invoiceRows = tableRows(
    recentInvoices,
    (invoice) => `<tr>
  <td class="strong">${escapeHTML(invoice.invoiceNumber)}</td>
  <td>${escapeHTML(invoice.customerName || "Walk-in customer")}</td>
  <td>${dateText(invoice.invoiceDate)}</td>
  <td>${money(invoice.grandTotal)}</td>
  <td>${statusBadge(invoice.paymentStatus)}</td>
  <td><button class="text-button" data-view-invoice="${escapeHTML(invoice.id)}">View</button></td>
</tr>`,
    "No invoices yet — your saved invoices will appear here.",
  );

  pageContent.innerHTML = `${setupNotice} ${heading(`Good day, ${state.user?.name?.split(" ")[0] || "there"}`, "Here is your business at a glance.")}
<div class="stats-grid">${statsMarkup}</div>
${quickActions}
<section class="card space-top-16">
  <div class="card-heading">
    <div>
      <h3>Recent invoices</h3>
      <p>Your latest saved invoices</p>
    </div>
    <button class="text-button" data-nav="invoices">View all</button>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Date</th>
          <th>Amount</th>
          <th>Payment</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${invoiceRows}</tbody>
    </table>
  </div>
  ${recentInvoices.length ? "" : emptyState("▤", "No invoices yet", "Create an invoice to see your saved activity here.", '<button class="btn btn-primary" data-action="new-invoice">Create first invoice</button>')}
</section>`;
}

async function renderCustomers(search = "") {
  const data = await browserData.get(
    `/customers?search=${encodeURIComponent(search)}`,
  );
  state.customers = data.customers || [];
  pageContent.innerHTML = `${heading("Customers", "Keep billing details ready for the next invoice.", '<button class="btn btn-primary" data-action="add-customer">＋ Add customer</button>')}
<section class="card">
  <div class="toolbar">
    <input
      data-search="customers"
      placeholder="Search by name, mobile or GSTIN"
      value="${escapeHTML(search)}"
      aria-label="Search customers"
    />
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Mobile</th>
          <th>GSTIN</th>
          <th>State</th>
          <th>Invoices</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${tableRows(
        state.customers,
        (c) => `<tr>
  <td class="strong">${escapeHTML(c.name)}</td>
  <td>${escapeHTML(c.mobile)}</td>
  <td>${escapeHTML(c.gstin || "Unregistered")}</td>
  <td>${escapeHTML(c.state || "—")}</td>
  <td>${Number(c.invoiceCount || 0)}</td>
  <td>
    <div class="table-actions">
      <button class="btn btn-secondary btn-small" data-customer-history="${escapeHTML(c.id)}">
        History
      </button>
      <button class="btn btn-secondary btn-small" data-edit-customer="${escapeHTML(c.id)}">
        Edit
      </button>
      <button class="btn btn-danger btn-small" data-remove-customer="${escapeHTML(c.id)}">
        Delete
      </button>
    </div>
  </td>
</tr>`,
        "No customers found. Add your first customer to begin.",
      )}</tbody>
    </table>
  </div>
  ${state.customers.length ? "" : emptyState("♙", "No customers yet", "Save a customer once and their billing details are ready for every invoice.", '<button class="btn btn-primary" data-action="add-customer">Add first customer</button>')}
</section>`;
}
async function editCustomer(id = "new") {
  const c =
    id === "new"
      ? {}
      : state.customers.find((row) => row.id === id) ||
        ((await browserData.get("/customers")).customers || []).find(
          (row) => row.id === id,
        ) ||
        {};
  const fields = `<form id="customer-form" data-submit="customer" data-id="${escapeHTML(c.id || "")}">
  <div class="form-grid">
    <div class="form-field full">
      <label for="cust-name">Customer name *</label>
      <input id="cust-name" name="name" value="${escapeHTML(c.name || "")}" required maxlength="180" />
    </div>
    <div class="form-field">
      <label for="cust-mobile">Mobile number *</label>
      <input id="cust-mobile" name="mobile" type="tel" value="${escapeHTML(c.mobile || "")}" required />
    </div>
    <div class="form-field">
      <label for="cust-email">Email address</label>
      <input id="cust-email" name="email" type="email" value="${escapeHTML(c.email || "")}" />
    </div>
    <div class="form-field full">
      <label for="cust-address">Billing address</label>
      <textarea id="cust-address" name="address">${escapeHTML(c.address || "")}</textarea>
    </div>
    <div class="form-field">
      <label for="cust-state">State</label>
      <select id="cust-state" name="stateCode">
        ${optionsForStates(c.stateCode)}
      </select>
    </div>
    <div class="form-field">
      <label for="cust-gstin">GSTIN</label>
      <input
        id="cust-gstin"
        name="gstin"
        value="${escapeHTML(c.gstin || "")}"
        maxlength="15"
        placeholder="15-character GSTIN"
        ${c.customerType === "registered" ? "required" : ""}
      />
    </div>
    <div class="form-field">
      <label for="cust-type">Customer type</label>
      <select id="cust-type" name="customerType">
        <option value="unregistered" ${c.customerType !== "registered" ? "selected" : ""}>Unregistered</option>
        <option value="registered" ${c.customerType === "registered" ? "selected" : ""}>Registered</option>
      </select>
    </div>
  </div>
  <p class="hint">State code is used to calculate CGST/SGST or IGST automatically.</p>
  <div class="form-actions">
    <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" type="submit">${id === "new" ? "Add customer" : "Save changes"}</button>
  </div>
</form>`;
  openModal(id === "new" ? "Add customer" : "Edit customer", fields);
}
async function saveCustomer(form, values) {
  const code = values.stateCode || "";
  values.stateCode = code;
  values.state = selectedStateName(code);
  const id = form.dataset.id;
  if (id) await browserData.save(`/customers/${id}`, values);
  else await browserData.add("/customers", values);
  closeModal();
  toast(id ? "Customer updated." : "Customer added.");
  await renderCustomers();
}
async function removeCustomer(id) {
  if (
    !confirm(
      "Delete this customer? Saved invoices will keep their original billing details.",
    )
  )
    return;
  try {
    await browserData.remove(`/customers/${id}`);
    toast("Customer deleted.");
    await renderCustomers();
  } catch (error) {
    showError(error);
  }
}
async function showCustomerHistory(id) {
  try {
    const customer = state.customers.find((row) => row.id === id);
    const data = await browserData.get("/invoices");
    const rows = (data.invoices || []).filter(
      (invoice) => invoice.customerId === id,
    );
    const details = customer
      ? `<div class="detail-list space-bottom-18">
  <div>
    <span>Mobile</span>
    <strong>${escapeHTML(customer.mobile || "—")}</strong>
  </div>
  <div>
    <span>Email</span>
    <strong>${escapeHTML(customer.email || "—")}</strong>
  </div>
  <div>
    <span>Billing address</span>
    <strong>${escapeHTML(customer.address || "—")}</strong>
  </div>
  <div>
    <span>State</span>
    <strong>${escapeHTML(customer.state || "—")}${customer.stateCode ? ` · ${escapeHTML(customer.stateCode)}` : ""}</strong>
  </div>
  <div>
    <span>Customer type</span>
    <strong>${escapeHTML(customer.customerType || "unregistered")}</strong>
  </div>
  <div>
    <span>GSTIN</span>
    <strong>${escapeHTML(customer.gstin || "—")}</strong>
  </div>
</div>`
      : "";
    const history = rows.length
      ? `<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Invoice</th>
        <th>Date</th>
        <th>Amount</th>
        <th>Status</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${rows
      .map(
        (invoice) => `<tr>
  <td class="strong">${escapeHTML(invoice.invoiceNumber)}</td>
  <td>${dateText(invoice.invoiceDate)}</td>
  <td>${money(invoice.grandTotal)}</td>
  <td>${statusBadge(invoice.paymentStatus)}</td>
  <td><button class="text-button" data-view-invoice="${escapeHTML(invoice.id)}">View</button></td>
</tr>`,
      )
      .join("")}</tbody>
  </table>
</div>`
      : emptyState(
          "▤",
          "No invoices yet",
          "Invoices for this customer will show here.",
        );
    openModal(
      `${customer?.name || "Customer"} · details & invoice history`,
      `${details}${history}`,
    );
  } catch (error) {
    showError(error);
  }
}

async function renderProducts(search = "") {
  const data = await browserData.get(
    `/products?search=${encodeURIComponent(search)}`,
  );
  state.products = data.products || [];
  const productRows =
    state.productStockFilter === "low"
      ? state.products.filter((p) => Number(p.stock) <= 5)
      : state.products;
  pageContent.innerHTML = `${heading("Products & inventory", "Maintain the items you sell and their GST rates.", '<button class="btn btn-primary" data-action="add-product">＋ Add product</button>')}
<section class="card">
  <div class="toolbar">
    <input
      data-search="products"
      placeholder="Search by product or HSN/SAC"
      value="${escapeHTML(search)}"
      aria-label="Search products"
    />
    <select data-filter="stock">
      <option value="">All stock levels</option>
      <option value="low" ${state.productStockFilter === "low" ? "selected" : ""}>Low stock (5 or less)</option>
    </select>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Product</th>
          <th>HSN/SAC</th>
          <th>Price</th>
          <th>GST</th>
          <th>Unit</th>
          <th>Available stock</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${tableRows(
        productRows,
        (p) => `<tr>
  <td class="strong">${escapeHTML(p.name)}${p.description ? `<div class="hint">${escapeHTML(p.description)}</div>` : ""}</td>
  <td>${escapeHTML(p.hsn || "—")}</td>
  <td>${money(p.price)}</td>
  <td>${Number(p.gstRate)}%</td>
  <td>${escapeHTML(p.unit)}</td>
  <td>${Number(p.stock)} ${escapeHTML(p.unit)} ${Number(p.stock) <= 5 ? '<span class="badge pending">Low</span>' : ""}</td>
  <td>
    <div class="table-actions">
      <button class="btn btn-secondary btn-small" data-view-product="${escapeHTML(p.id)}">
        View
      </button>
      <button class="btn btn-secondary btn-small" data-edit-product="${escapeHTML(p.id)}">
        Edit
      </button>
      <button class="btn btn-danger btn-small" data-remove-product="${escapeHTML(p.id)}">
        Delete
      </button>
    </div>
  </td>
</tr>`,
        "No products found. Add your first item to use it in an invoice.",
      )}</tbody>
    </table>
  </div>
  ${productRows.length ? "" : emptyState("◇", "No products yet", "Add the products you sell. Their price, HSN and GST rate will fill in automatically on invoices.", '<button class="btn btn-primary" data-action="add-product">Add first product</button>')}
</section>`;
}
async function showProductDetails(id) {
  if (!state.products.length)
    state.products = (await browserData.get("/products")).products || [];
  const product = state.products.find((row) => row.id === id);
  if (!product) return toast("Product not found.", "error");
  openModal(
    product.name,
    `<div class="detail-list">
  <div>
    <span>Description</span>
    <strong>${escapeHTML(product.description || "—")}</strong>
  </div>
  <div>
    <span>HSN/SAC</span>
    <strong>${escapeHTML(product.hsn || "—")}</strong>
  </div>
  <div>
    <span>Price</span>
    <strong>${money(product.price)}</strong>
  </div>
  <div>
    <span>GST rate</span>
    <strong>${Number(product.gstRate)}%</strong>
  </div>
  <div>
    <span>Unit</span>
    <strong>${escapeHTML(product.unit)}</strong>
  </div>
  <div>
    <span>Available stock</span>
    <strong>${Number(product.stock)} ${escapeHTML(product.unit)}</strong>
  </div>
</div>`,
  );
}
async function editProduct(id = "new") {
  if (!state.products.length && id !== "new")
    state.products = (await browserData.get("/products")).products || [];
  const p =
    id === "new" ? {} : state.products.find((row) => row.id === id) || {};
  const content = `<form id="product-form" data-submit="product" data-id="${escapeHTML(p.id || "")}">
  <div class="form-grid">
    <div class="form-field full">
      <label for="prod-name">Product name *</label>
      <input id="prod-name" name="name" value="${escapeHTML(p.name || "")}" required maxlength="180" />
    </div>
    <div class="form-field full">
      <label for="prod-desc">Description</label>
      <textarea id="prod-desc" name="description">${escapeHTML(p.description || "")}</textarea>
    </div>
    <div class="form-field">
      <label for="prod-hsn">HSN/SAC code</label>
      <input id="prod-hsn" name="hsn" value="${escapeHTML(p.hsn || "")}" />
    </div>
    <div class="form-field">
      <label for="prod-price">Price per unit (₹) *</label>
      <input
        id="prod-price"
        name="price"
        type="number"
        min="0"
        step="0.01"
        value="${escapeHTML(p.price ?? "")}"
        required
      />
    </div>
    <div class="form-field">
      <label for="prod-gst">GST rate *</label>
      <select id="prod-gst" name="gstRate" required>
        ${GST_RATES.map((rate) => `<option value="${rate}" ${Number(p.gstRate || 0) === rate ? "selected" : ""}>${rate}%</option>`).join("")}
      </select>
    </div>
    <div class="form-field">
      <label for="prod-unit">Unit *</label>
      <input id="prod-unit" name="unit" value="${escapeHTML(p.unit || "pcs")}" required />
    </div>
    <div class="form-field">
      <label for="prod-stock">Available stock *</label>
      <input
        id="prod-stock"
        name="stock"
        type="number"
        min="0"
        step="0.001"
        value="${escapeHTML(p.stock ?? "0")}"
        required
      />
    </div>
  </div>
  <div class="form-actions">
    <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" type="submit">${id === "new" ? "Add product" : "Save changes"}</button>
  </div>
</form>`;
  openModal(id === "new" ? "Add product" : "Edit product", content);
}
async function saveProduct(form, values) {
  const id = form.dataset.id;
  if (id) await browserData.save(`/products/${id}`, values);
  else await browserData.add("/products", values);
  closeModal();
  toast(id ? "Product updated." : "Product added.");
  await renderProducts();
}
async function removeProduct(id) {
  if (
    !confirm(
      "Delete this product? Saved invoices keep their original item details.",
    )
  )
    return;
  try {
    await browserData.remove(`/products/${id}`);
    toast("Product deleted.");
    await renderProducts();
  } catch (error) {
    showError(error);
  }
}
