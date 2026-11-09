// Invoice editor, invoice details, and payment actions.

async function renderInvoices(filters = {}) {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== "" && v != null),
  );
  const data = await browserData.get(`/invoices?${params}`);
  state.invoices = data.invoices || [];
  pageContent.innerHTML = `${heading("Invoices", "Search saved invoices and keep payment status current.", '<button class="btn btn-primary" data-action="new-invoice">＋ New invoice</button>')}
<section class="card">
  <div class="toolbar">
    <input
      data-filter="search"
      placeholder="Invoice number or customer"
      value="${escapeHTML(filters.search || "")}"
    />
    <select data-filter="paymentStatus">
      <option value="">All payment statuses</option>
      <option value="paid" ${filters.paymentStatus === "paid" ? "selected" : ""}>Paid</option>
      <option value="unpaid" ${filters.paymentStatus === "unpaid" ? "selected" : ""}>Unpaid</option>
      <option value="partially_paid" ${filters.paymentStatus === "partially_paid" ? "selected" : ""}>Partially paid</option>
    </select>
    <input data-filter="from" type="date" aria-label="From date" value="${escapeHTML(filters.from || "")}" />
    <input data-filter="to" type="date" aria-label="To date" value="${escapeHTML(filters.to || "")}" />
    <input
      data-filter="minAmount"
      type="number"
      min="0"
      placeholder="Min ₹"
      value="${escapeHTML(filters.minAmount || "")}"
    />
    <input
      data-filter="maxAmount"
      type="number"
      min="0"
      placeholder="Max ₹"
      value="${escapeHTML(filters.maxAmount || "")}"
    />
    <button class="btn btn-secondary" data-action="download-csv">Export CSV</button>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Date</th>
          <th>Total</th>
          <th>Invoice status</th>
          <th>Payment</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${tableRows(
        state.invoices,
        (i) => `<tr>
  <td class="strong">${escapeHTML(i.invoiceNumber)}</td>
  <td>${escapeHTML(i.customerName || "Walk-in customer")}</td>
  <td>${dateText(i.invoiceDate)}</td>
  <td>${money(i.grandTotal)}</td>
  <td>${statusBadge(i.status)}</td>
  <td>${statusBadge(i.paymentStatus)}</td>
  <td>
    <div class="table-actions">
      <button class="btn btn-secondary btn-small" data-view-invoice="${escapeHTML(i.id)}">
        View
      </button>
      <button
        class="btn btn-secondary btn-small"
        data-invoice-action="pdf"
        data-id="${escapeHTML(i.id)}"
      >
        PDF
      </button>
    </div>
  </td>
</tr>`,
        "No invoices match these filters.",
      )}</tbody>
    </table>
  </div>
  ${state.invoices.length ? "" : emptyState("▤", "No invoices yet", "Saved invoices will appear here. You can filter by customer, date, amount and payment status.", '<button class="btn btn-primary" data-action="new-invoice">Create invoice</button>')}
</section>`;
}
function currentInvoiceFilters() {
  const out = {};
  $$("[data-filter]").forEach((el) => (out[el.dataset.filter] = el.value));
  return out;
}
let filterTimer;
async function applyFilters() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(
    () => renderInvoices(currentInvoiceFilters()).catch(showError),
    220,
  );
}

function renderItemLine(index, item = {}) {
  return `<tr class="invoice-line">
  <td>
    <select class="line-product" data-line-field="productId">
      <option value="">Select product or enter manually</option>
      ${state.products.map((p) => `<option value="${escapeHTML(p.id)}" ${item.productId === p.id ? "selected" : ""}>${escapeHTML(p.name)}</option>`).join("")}
    </select>
    <input
      data-line-field="name"
      value="${escapeHTML(item.name || "")}"
      placeholder="Item name"
      aria-label="Item name"
      required
      class="space-top-6"
    />
    <input
      data-line-field="unit"
      value="${escapeHTML(item.unit || "pcs")}"
      placeholder="Unit"
      aria-label="Unit"
      required
      class="space-top-6"
    />
  </td>
  <td>
    <input
      data-line-field="hsn"
      value="${escapeHTML(item.hsn || "")}"
      placeholder="HSN"
      aria-label="HSN/SAC"
    />
  </td>
  <td>
    <input
      data-line-field="quantity"
      type="number"
      min="0.001"
      step="0.001"
      required
      value="${escapeHTML(item.quantity ?? 1)}"
      aria-label="Quantity"
    />
  </td>
  <td>
    <input
      data-line-field="unitPrice"
      type="number"
      min="0"
      step="0.01"
      required
      value="${escapeHTML(item.unitPrice ?? 0)}"
      aria-label="Price per unit"
    />
  </td>
  <td>
    <input
      data-line-field="discount"
      type="number"
      min="0"
      step="0.01"
      value="${escapeHTML(item.discount ?? 0)}"
      aria-label="Discount"
    />
  </td>
  <td>
    <select data-line-field="gstRate" aria-label="GST rate" ${$("#inv-type")?.value === "bill_of_supply" ? "disabled" : ""}>
      ${GST_RATES.map((rate) => `<option value="${rate}" ${Number(item.gstRate || 0) === rate ? "selected" : ""}>${rate}%</option>`).join("")}
    </select>
  </td>
  <td data-line-taxable>${money(0)}</td>
  <td data-line-gst>${money(0)}</td>
  <td data-line-total>${money(0)}</td>
  <td>
    <button type="button" class="icon-btn" data-action="remove-line" aria-label="Remove item">
      ×
    </button>
  </td>
</tr>`;
}
async function openInvoiceEditor() {
  try {
    const [customerData, productData] = await Promise.all([
      browserData.get("/customers"),
      browserData.get("/products"),
    ]);
    state.customers = customerData.customers || [];
    state.products = productData.products || [];
    state.invoiceEditor = true;
    const today = dateISO();
    const due = new Date();
    due.setDate(
      due.getDate() + Number(state.profile?.defaultPaymentTerms || 0),
    );
    const dueDate = state.profile?.defaultPaymentTerms
      ? due.toISOString().slice(0, 10)
      : "";
    const customerOptions = state.customers
      .map(
        (c) =>
          `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)} · ${escapeHTML(c.mobile)}</option>`,
      )
      .join("");
    pageContent.innerHTML = `${heading("Create invoice", "Add a customer and items. Review the GST split before saving.", '<button class="btn btn-secondary" data-nav="invoices">Cancel</button>')}
<form id="invoice-form" data-submit="invoice">
  <div class="split-layout">
    <div>
      <section class="card space-bottom-16">
        <div class="card-heading">
          <div>
            <h3>Customer details</h3>
            <p>Tax split follows the business and customer state codes.</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-field full">
            <label for="inv-customer">Saved customer (optional)</label>
            <select id="inv-customer" name="customerId">
              <option value="">Enter customer details for this invoice</option>
              ${customerOptions}
            </select>
          </div>
          <div class="form-field">
            <label for="inv-cust-name">Customer name *</label>
            <input id="inv-cust-name" required />
          </div>
          <div class="form-field">
            <label for="inv-cust-mobile">Mobile</label>
            <input id="inv-cust-mobile" type="tel" />
          </div>
          <div class="form-field">
            <label for="inv-cust-email">Email</label>
            <input id="inv-cust-email" type="email" />
          </div>
          <div class="form-field">
            <label for="inv-cust-gstin">Customer GSTIN</label>
            <input id="inv-cust-gstin" maxlength="15" />
          </div>
          <div class="form-field full">
            <label for="inv-cust-address">Billing address</label>
            <textarea id="inv-cust-address"></textarea>
          </div>
          <div class="form-field">
            <label for="inv-cust-state">Customer state *</label>
            <select id="inv-cust-state" required>
              ${optionsForStates()}
            </select>
          </div>
          <div class="form-field">
            <label for="inv-cust-type">Customer type</label>
            <select id="inv-cust-type">
              <option value="unregistered">Unregistered</option>
              <option value="registered">Registered</option>
            </select>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-heading">
          <div>
            <h3>Items</h3>
            <p>Choose a product to fill its saved HSN, price and GST rate.</p>
          </div>
          <button type="button" class="btn btn-secondary btn-small" data-action="add-line">
            ＋ Add item
          </button>
        </div>
        <div class="table-wrap">
          <table class="line-editor">
            <thead>
              <tr>
                <th>Product / description</th>
                <th>HSN/SAC</th>
                <th>Qty</th>
                <th>Price (₹)</th>
                <th>Discount (₹)</th>
                <th>GST</th>
                <th>Taxable</th>
                <th>GST amount</th>
                <th>Line total</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="invoice-lines">${renderItemLine(0, { quantity: 1 })}</tbody>
          </table>
        </div>
        ${
          state.products.length
            ? ""
            : `<div class="notice space-top-14">
  <div>
    <strong>No saved products</strong>
    Add products first, or enter item details manually in the row.
  </div>
  <button class="btn btn-secondary btn-small" type="button" data-action="add-product">
    Add product
  </button>
</div>`
        }
      </section>
      <section class="card space-top-16">
        <div class="card-heading">
          <div><h3>Invoice details</h3></div>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="inv-date">Invoice date *</label>
            <input id="inv-date" type="date" value="${today}" required />
          </div>
          <div class="form-field">
            <label for="inv-due">Due date</label>
            <input id="inv-due" type="date" value="${dueDate}" />
          </div>
          <div class="form-field">
            <label for="inv-type">Document type</label>
            <select id="inv-type">
              <option value="tax_invoice">Tax Invoice</option>
              <option value="bill_of_supply">Bill of Supply</option>
            </select>
          </div>
          <div class="form-field">
            <label for="inv-place">Place of supply</label>
            <input id="inv-place" value="" />
          </div>
          <div class="form-field">
            <label for="inv-charges">Additional charges (₹)</label>
            <input id="inv-charges" type="number" min="0" step="0.01" value="0" />
          </div>
          <div class="form-field">
            <label for="inv-discount">Additional discount (₹)</label>
            <input id="inv-discount" type="number" min="0" step="0.01" value="0" />
          </div>
          <div class="form-field">
            <label for="inv-round">Round-off (₹)</label>
            <input id="inv-round" type="number" min="-1" max="1" step="0.01" value="0" />
          </div>
          <div class="form-field full">
            <label for="inv-notes">Invoice notes</label>
            <textarea id="inv-notes">${escapeHTML(state.profile?.defaultNotes || "")}</textarea>
          </div>
          <div class="form-field full">
            <label for="inv-terms">Terms and conditions</label>
            <textarea id="inv-terms">${escapeHTML(state.profile?.defaultNotes || "")}</textarea>
          </div>
        </div>
      </section>
    </div>
    <aside class="card totals-panel">
      <div class="card-heading">
        <div>
          <h3>GST summary</h3>
          <p id="gst-mode-label">Select customer state for tax split</p>
        </div>
      </div>
      <div id="invoice-totals"></div>
      <div class="form-actions stacked-actions">
        <button type="button" class="btn btn-secondary" data-action="preview-invoice">
          Preview invoice
        </button>
        <button class="btn btn-primary" type="submit">Save draft</button>
      </div>
      <p class="hint">
        You can finalize the invoice after reviewing the saved draft. Product stock updates only
        when finalized.
      </p>
    </aside>
  </div>
</form>`;
    recalculateEditor();
  } catch (error) {
    showError(error);
  }
}
function readInvoiceLines() {
  return $$(".invoice-line").map((row) => ({
    productId: row.querySelector('[data-line-field="productId"]').value,
    name: row.querySelector('[data-line-field="name"]').value,
    hsn: row.querySelector('[data-line-field="hsn"]').value,
    quantity: Number(
      row.querySelector('[data-line-field="quantity"]').value || 0,
    ),
    unit:
      row.querySelector('[data-line-field="unit"]').value ||
      row.dataset.unit ||
      "pcs",
    unitPrice: Number(
      row.querySelector('[data-line-field="unitPrice"]').value || 0,
    ),
    discount: Number(
      row.querySelector('[data-line-field="discount"]').value || 0,
    ),
    gstRate: Number(
      row.querySelector('[data-line-field="gstRate"]').value || 0,
    ),
  }));
}
function readCustomerForm() {
  const code = $("#inv-cust-state")?.value || "";
  const id = $("#inv-customer")?.value || "";
  return {
    customerId: id,
    customer: {
      name: $("#inv-cust-name")?.value || "",
      mobile: $("#inv-cust-mobile")?.value || "",
      email: $("#inv-cust-email")?.value || "",
      address: $("#inv-cust-address")?.value || "",
      state: selectedStateName(code),
      stateCode: code,
      gstin: $("#inv-cust-gstin")?.value || "",
      customerType: $("#inv-cust-type")?.value || "unregistered",
    },
  };
}
function buildInvoicePayload() {
  const cust = readCustomerForm();
  return {
    ...cust,
    invoiceDate: $("#inv-date")?.value || dateISO(),
    dueDate: $("#inv-due")?.value || "",
    docType: $("#inv-type")?.value || "tax_invoice",
    placeOfSupply:
      $("#inv-place")?.value || selectedStateName(cust.customer.stateCode),
    otherCharges: Number($("#inv-charges")?.value || 0),
    additionalDiscount: Number($("#inv-discount")?.value || 0),
    roundOff: Number($("#inv-round")?.value || 0),
    notes: $("#inv-notes")?.value || "",
    terms: $("#inv-terms")?.value || "",
    items: readInvoiceLines(),
  };
}
function recalculateEditor() {
  if (!$("#invoice-form")) return;
  const payload = buildInvoicePayload();
  const intra = Boolean(
    state.profile?.stateCode &&
      payload.customer.stateCode &&
      String(state.profile.stateCode) === String(payload.customer.stateCode),
  );
  const totals = calculateInvoice(payload.items, {
    intraState: intra,
    otherCharges: payload.otherCharges,
    additionalDiscount: payload.additionalDiscount,
    roundOff: payload.roundOff,
  });
  $$(".invoice-line").forEach((row, index) => {
    const line = totals.lines[index];
    const taxable = row.querySelector("[data-line-taxable]");
    const gst = row.querySelector("[data-line-gst]");
    const total = row.querySelector("[data-line-total]");
    if (taxable) taxable.textContent = money(line?.taxable || 0);
    if (gst) gst.textContent = money(line?.gstAmount || 0);
    if (total) total.textContent = money(line?.total || 0);
  });
  $("#gst-mode-label").textContent =
    $("#inv-type")?.value === "bill_of_supply"
      ? "Bill of Supply · no GST charged"
      : payload.customer.stateCode
        ? `${intra ? "Intra-state · CGST + SGST" : "Inter-state · IGST"}`
        : "Select customer state for tax split";
  $("#invoice-totals").innerHTML = `<div class="totals-row">
  <span>Subtotal</span>
  <strong>${money(totals.subtotal)}</strong>
</div>
<div class="totals-row">
  <span>Item discounts</span>
  <strong>− ${money(totals.totalDiscount - totals.additionalDiscount)}</strong>
</div>
<div class="totals-row">
  <span>Taxable value</span>
  <strong>${money(totals.taxableValue)}</strong>
</div>
${
  intra
    ? `<div class="totals-row">
  <span>CGST</span>
  <strong>${money(totals.cgst)}</strong>
</div>
<div class="totals-row">
  <span>SGST</span>
  <strong>${money(totals.sgst)}</strong>
</div>`
    : `<div class="totals-row">
  <span>IGST</span>
  <strong>${money(totals.igst)}</strong>
</div>`
}
<div class="totals-row">
  <span>Other charges</span>
  <strong>${money(totals.otherCharges)}</strong>
</div>
<div class="totals-row">
  <span>Additional discount</span>
  <strong>− ${money(totals.additionalDiscount)}</strong>
</div>
<div class="totals-row">
  <span>Round-off</span>
  <strong>${money(totals.roundOff)}</strong>
</div>
<div class="totals-row grand">
  <span>Grand total</span>
  <strong>${money(totals.grandTotal)}</strong>
</div>`;
}
function syncCustomerSelection() {
  const id = $("#inv-customer")?.value;
  const customer = state.customers.find((row) => row.id === id);
  if (!customer) return;
  $("#inv-cust-name").value = customer.name || "";
  $("#inv-cust-mobile").value = customer.mobile || "";
  $("#inv-cust-email").value = customer.email || "";
  $("#inv-cust-address").value = customer.address || "";
  $("#inv-cust-state").value = customer.stateCode || "";
  $("#inv-cust-gstin").value = customer.gstin || "";
  $("#inv-cust-type").value = customer.customerType || "unregistered";
  $("#inv-cust-gstin").required = $("#inv-cust-type").value === "registered";
  if (!$("#inv-place").value) $("#inv-place").value = customer.state || "";
  recalculateEditor();
}
function syncProductSelection(select) {
  const product = state.products.find((row) => row.id === select.value);
  if (!product) return;
  const row = select.closest(".invoice-line");
  row.querySelector('[data-line-field="name"]').value = product.name;
  row.querySelector('[data-line-field="hsn"]').value = product.hsn || "";
  row.querySelector('[data-line-field="unitPrice"]').value = product.price;
  row.querySelector('[data-line-field="gstRate"]').value =
    $("#inv-type")?.value === "bill_of_supply"
      ? "0"
      : String(Number(product.gstRate));
  row.querySelector('[data-line-field="unit"]').value = product.unit || "pcs";
  row.dataset.unit = product.unit || "pcs";
  row.dataset.description = product.description || "";
  recalculateEditor();
}
function addInvoiceLine() {
  const body = $("#invoice-lines");
  if (!body) return;
  body.insertAdjacentHTML(
    "beforeend",
    renderItemLine($$(".invoice-line").length, { quantity: 1 }),
  );
  syncDocumentType();
}
function syncDocumentType() {
  const bill = $("#inv-type")?.value === "bill_of_supply";
  $$('.invoice-line [data-line-field="gstRate"]').forEach((field) => {
    field.disabled = bill;
    if (bill) field.value = "0";
  });
  recalculateEditor();
}
function previewInvoice() {
  const payload = buildInvoicePayload();
  if (!payload.customer.name || !payload.customer.stateCode)
    return toast("Enter the customer name and state to preview GST.", "error");
  if (!payload.items.some((item) => item.name && item.quantity > 0))
    return toast("Add at least one item before previewing.", "error");
  const intra =
    String(state.profile?.stateCode) === String(payload.customer.stateCode);
  const totals = calculateInvoice(payload.items, {
    intraState: intra,
    otherCharges: payload.otherCharges,
    additionalDiscount: payload.additionalDiscount,
    roundOff: payload.roundOff,
  });
  const business = {
    businessName: state.profile?.businessName || "Your business",
    address: state.profile?.address || "",
    gstin: state.profile?.gstin || "",
    state: state.profile?.state || "",
    stateCode: state.profile?.stateCode || "",
    contactNumber: state.profile?.contactNumber || "",
    email: state.profile?.email || "",
    bankDetails: state.profile?.bankDetails || {},
    logoUrl: state.profile?.logoUrl || "",
  };
  openModal(
    "Invoice preview",
    `${renderInvoiceDocument({ invoiceNumber: "Assigned when saved", invoiceDate: payload.invoiceDate, dueDate: payload.dueDate, placeOfSupply: payload.placeOfSupply, docType: payload.docType, paymentStatus: "unpaid", notes: payload.notes, terms: payload.terms, ...totals, business, customer: payload.customer }, totals.lines)}
<div class="form-actions no-print">
  <button class="btn btn-secondary" type="button" data-action="close-modal">Keep editing</button>
  <button class="btn btn-primary" type="button" data-action="save-invoice">Save draft</button>
</div>`,
    true,
  );
}
async function saveInvoiceFromEditor() {
  const form = $("#invoice-form");
  if (!form) return;
  const payload = buildInvoicePayload();
  if (!form.reportValidity()) return;
  try {
    const result = await browserData.add("/invoices", payload);
    state.invoiceEditor = false;
    closeModal();
    toast(`Draft ${result.invoiceNumber} saved.`);
    await navigate("invoice-detail", result.id);
  } catch (error) {
    showError(error);
  }
}

function amountWords(value) {
  const number = Math.round(Number(value || 0) * 100) / 100;
  const rupees = Math.floor(number),
    paise = Math.round((number - rupees) * 100);
  const one = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const two = (n) =>
    n < 20
      ? one[n]
      : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${one[n % 10]}` : ""}`;
  const three = (n) =>
    `${n >= 100 ? `${one[Math.floor(n / 100)]} Hundred${n % 100 ? " " : ""}` : ""}${n % 100 ? two(n % 100) : ""}`.trim();
  let rest = rupees;
  const parts = [];
  for (const [div, label] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ]) {
    const group = Math.floor(rest / div);
    if (group) parts.push(`${two(group)} ${label}`);
    rest %= div;
  }
  if (rest) parts.push(three(rest));
  return `${parts.join(" ") || "Zero"} Rupees${paise ? ` and ${two(paise)} Paise` : ""} Only`;
}
// 5. Invoice preview, printing, and PDF export
function renderInvoiceDocument(invoice, items = []) {
  const business = invoice.business || {};
  const customer = invoice.customer || {};
  const intra = Boolean(invoice.intraState);
  const lines = items
    .map(
      (item, index) =>
        `<tr>
  <td>${index + 1}. ${escapeHTML(item.name)}${item.description ? `<div class="hint">${escapeHTML(item.description)}</div>` : ""}</td>
  <td>${escapeHTML(item.hsn || "—")}</td>
  <td>${Number(item.quantity)} ${escapeHTML(item.unit || "")}</td>
  <td>${money(item.unitPrice)}</td>
  <td>${money(item.discount || 0)}</td>
  <td>${money(item.taxable)}</td>
  <td>${Number(item.gstRate)}%</td>
  <td>${money(item.gstAmount || 0)}</td>
  <td>${money(item.total)}</td>
</tr>`,
    )
    .join("");
  const cgst = Number(
    invoice.cgst || items.reduce((n, item) => n + Number(item.cgst || 0), 0),
  );
  const sgst = Number(
    invoice.sgst || items.reduce((n, item) => n + Number(item.sgst || 0), 0),
  );
  const igst = Number(
    invoice.igst || items.reduce((n, item) => n + Number(item.igst || 0), 0),
  );
  const bank = business.bankDetails || {};
  return `<article class="document">
  <div class="doc-header">
    <div>
      ${business.logoUrl ? `<img class="doc-logo" src="${escapeHTML(business.logoUrl)}" alt="Business logo" />` : ""}
      <h2>${escapeHTML(business.businessName || "Business name")}</h2>
      <p class="small-copy">
        ${escapeHTML(business.address || "Business address")}
        <br />
        ${escapeHTML(business.state || "")}${business.stateCode ? ` · State code ${escapeHTML(business.stateCode)}` : ""}
        <br />
        ${
          business.gstin
            ? `GSTIN: ${escapeHTML(business.gstin)}
<br />`
            : ""
        }${escapeHTML(business.contactNumber || "")}${business.email ? ` · ${escapeHTML(business.email)}` : ""}
      </p>
    </div>
    <div class="align-right">
      <span class="badge">${invoice.docType === "bill_of_supply" ? "BILL OF SUPPLY" : "TAX INVOICE"}</span>
      <p class="invoice-number-line">
        <strong>Invoice no.</strong>
        ${escapeHTML(invoice.invoiceNumber || "")}
      </p>
      <p class="invoice-meta-line">
        <strong>Date:</strong>
        ${dateText(invoice.invoiceDate)}
      </p>
      ${
        invoice.dueDate
          ? `<p class="invoice-meta-line">
  <strong>Due:</strong>
  ${dateText(invoice.dueDate)}
</p>`
          : ""
      }
      <p class="invoice-meta-line">
        <strong>Payment:</strong>
        ${escapeHTML(String(invoice.paymentStatus || "unpaid").replaceAll("_", " "))}
      </p>
    </div>
  </div>
  <div class="doc-section doc-grid">
    <div>
      <h4>Bill to</h4>
      <p>
        <strong>${escapeHTML(customer.name || "Customer")}</strong>
        <br />
        ${escapeHTML(customer.address || "")}${
          customer.state
            ? `<br />
${escapeHTML(customer.state)}${customer.stateCode ? ` · ${escapeHTML(customer.stateCode)}` : ""}`
            : ""
        }${
          customer.gstin
            ? `<br />
GSTIN: ${escapeHTML(customer.gstin)}`
            : ""
        }${
          customer.mobile
            ? `<br />
Mobile: ${escapeHTML(customer.mobile)}`
            : ""
        }${
          customer.email
            ? `<br />
${escapeHTML(customer.email)}`
            : ""
        }
      </p>
    </div>
    <div>
      <h4>Supply details</h4>
      <p>
        Place of supply: ${escapeHTML(invoice.placeOfSupply || customer.state || "—")}
        <br />
        Tax treatment: ${invoice.docType === "bill_of_supply" ? "No GST charged · Bill of Supply" : intra ? "Intra-state · CGST + SGST" : "Inter-state · IGST"}
      </p>
    </div>
  </div>
  <div class="table-wrap">
    <table class="doc-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>HSN/SAC</th>
          <th>Qty</th>
          <th>Unit price</th>
          <th>Discount</th>
          <th>Taxable</th>
          <th>GST rate</th>
          <th>GST amount</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${lines || '<tr><td colspan="9">No line items.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="doc-totals">
    <div class="totals-row">
      <span>Subtotal</span>
      <strong>${money(invoice.subtotal || 0)}</strong>
    </div>
    <div class="totals-row">
      <span>Total discount</span>
      <strong>− ${money(invoice.totalDiscount || 0)}</strong>
    </div>
    <div class="totals-row">
      <span>Taxable value</span>
      <strong>${money(invoice.taxableValue || 0)}</strong>
    </div>
    ${
      intra
        ? `<div class="totals-row">
  <span>CGST</span>
  <strong>${money(cgst)}</strong>
</div>
<div class="totals-row">
  <span>SGST</span>
  <strong>${money(sgst)}</strong>
</div>`
        : `<div class="totals-row">
  <span>IGST</span>
  <strong>${money(igst)}</strong>
</div>`
    }
    <div class="totals-row">
      <span>Other charges</span>
      <strong>${money(invoice.otherCharges || 0)}</strong>
    </div>
    <div class="totals-row">
      <span>Round-off</span>
      <strong>${money(invoice.roundOff || 0)}</strong>
    </div>
    <div class="totals-row grand">
      <span>Amount payable</span>
      <strong>${money(invoice.grandTotal || 0)}</strong>
    </div>
  </div>
  <div class="doc-amount-words">
    <strong>Amount in words:</strong>
    ${escapeHTML(amountWords(invoice.grandTotal || 0))}
  </div>
  ${
    invoice.notes
      ? `<div class="doc-section">
  <strong class="small-copy">Notes</strong>
  <p class="small-copy">${escapeHTML(invoice.notes)}</p>
</div>`
      : ""
  }${
    invoice.terms
      ? `<div class="doc-section">
  <strong class="small-copy">Terms and conditions</strong>
  <p class="small-copy preserve-lines">${escapeHTML(invoice.terms)}</p>
</div>`
      : ""
  }${
    bank.bankName || bank.bankAccount
      ? `<div class="doc-section">
  <strong class="small-copy">Bank details</strong>
  <p class="small-copy">${escapeHTML(bank.bankName || "")}${bank.bankAccount ? ` · ${escapeHTML(bank.bankAccount)}` : ""}${bank.bankIfsc ? ` · IFSC ${escapeHTML(bank.bankIfsc)}` : ""}</p>
</div>`
      : ""
  }
  <div class="doc-footer">
    <div>Thank you for your business.</div>
    <div class="signature-line">Authorized signature</div>
  </div>
</article>`;
}
async function renderInvoiceDetail(id) {
  const data = await browserData.get(`/invoices/${encodeURIComponent(id)}`);
  const invoice = data.invoice;
  const items = data.items || [];
  state.currentInvoice = invoice;
  state.currentInvoiceItems = items;
  const buttons = `<div class="table-actions no-print">
  <button class="btn btn-secondary" data-action="download-pdf" data-id="${escapeHTML(id)}">
    Download PDF
  </button>
  <button class="btn btn-secondary" data-action="print-invoice">Print</button>
  ${
    invoice.status === "draft"
      ? `<button class="btn btn-primary" data-invoice-action="finalize" data-id="${escapeHTML(id)}">
  Finalize invoice
</button>`
      : ""
  }${
    invoice.status !== "cancelled"
      ? `<button class="btn btn-danger" data-invoice-action="cancel" data-id="${escapeHTML(id)}">
  Cancel invoice
</button>`
      : ""
  }${
    invoice.status === "finalized"
      ? `<button class="btn btn-secondary" data-invoice-action="payment" data-id="${escapeHTML(id)}">
  Record payment
</button>
<select aria-label="Update payment status" data-payment-status="${escapeHTML(id)}">
  <option value="">Payment status</option>
  <option value="paid">Paid</option>
  <option value="partially_paid">Partially paid</option>
  <option value="unpaid">Unpaid</option>
</select>`
      : ""
  }
</div>`;
  pageContent.innerHTML = `${heading(invoice.invoiceNumber, `Invoice date ${dateText(invoice.invoiceDate)} · ${String(invoice.status).replaceAll("_", " ")}`, `<button class="btn btn-secondary" data-nav="invoices">← Back to invoices</button>`)}
<div class="card invoice-detail-toolbar">
  <div>
    ${statusBadge(invoice.status)} ${statusBadge(invoice.paymentStatus)}
    <span class="hint space-left-8">${money(invoice.grandTotal)} total · ${money(invoice.amountPaid)} paid</span>
  </div>
  ${buttons}
</div>
${renderInvoiceDocument(invoice, items)}`;
}
async function invoiceAction(action, id) {
  if (action === "pdf") return downloadInvoicePdf(id);
  if (action === "finalize") {
    if (
      !confirm(
        "Finalize this invoice? This will update inventory and prevent draft editing.",
      )
    )
      return;
    try {
      await browserData.add(`/invoices/${id}/finalize`, {});
      toast("Invoice finalized.");
      await renderInvoiceDetail(id);
    } catch (error) {
      showError(error);
    }
    return;
  }
  if (action === "cancel") {
    if (
      !confirm(
        "Cancel this invoice? The action will be recorded in the audit history.",
      )
    )
      return;
    try {
      await browserData.add(`/invoices/${id}/cancel`, {});
      toast("Invoice cancelled.");
      await renderInvoiceDetail(id);
    } catch (error) {
      showError(error);
    }
    return;
  }
  if (action === "payment") return openPaymentForm(id);
}
function openPaymentForm(id) {
  const invoice = state.currentInvoice;
  const due = Math.max(
    0,
    Number(invoice?.grandTotal || 0) - Number(invoice?.amountPaid || 0),
  );
  openModal(
    "Record a payment",
    `<form id="payment-form" data-submit="payment" data-id="${escapeHTML(id)}">
  <div class="notice">
    <div>
      <strong>Outstanding balance</strong>
      ${money(due)}
    </div>
  </div>
  <div class="form-grid">
    <div class="form-field">
      <label for="pay-amount">Amount received (₹) *</label>
      <input
        id="pay-amount"
        name="amount"
        type="number"
        min="0.01"
        max="${due.toFixed(2)}"
        step="0.01"
        value="${due.toFixed(2)}"
        required
      />
    </div>
    <div class="form-field">
      <label for="pay-method">Payment method</label>
      <select id="pay-method" name="method">
        <option>Bank transfer</option>
        <option>UPI</option>
        <option>Cash</option>
        <option>Card</option>
        <option>Cheque</option>
        <option>Other</option>
      </select>
    </div>
    <div class="form-field full">
      <label for="pay-note">Note</label>
      <input id="pay-note" name="note" />
    </div>
  </div>
  <div class="form-actions">
    <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" type="submit">Save payment</button>
  </div>
</form>`,
  );
}
async function savePayment(form, values) {
  await browserData.add(`/invoices/${form.dataset.id}/payments`, {
    ...values,
    amount: Number(values.amount),
  });
  closeModal();
  toast("Payment recorded.");
  await renderInvoiceDetail(form.dataset.id);
}
async function updatePaymentStatus(id, status) {
  if (!status) return;
  try {
    if (status === "partially_paid") return openPaymentForm(id);
    await browserData.update(`/invoices/${id}/payment-status`, { status });
    toast("Payment status updated.");
    await renderInvoiceDetail(id);
  } catch (error) {
    showError(error);
  }
}
