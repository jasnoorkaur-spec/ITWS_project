// Event listeners and application startup.

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    const handler = form.dataset.submit;
    if (handler === "customer") return await saveCustomer(form, values);
    if (handler === "product") return await saveProduct(form, values);
    if (handler === "profile") return await saveProfile(form, values);
    if (handler === "invoice") return await saveInvoiceFromEditor();
    if (handler === "payment") return await savePayment(form, values);
  } catch (error) {
    showError(error);
  }
}
async function handleClick(event) {
  const target = event.target.closest(
    "[data-action],[data-nav],[data-view-invoice],[data-edit-customer],[data-edit-product],[data-view-product],[data-remove-customer],[data-remove-product],[data-customer-history],[data-invoice-action]",
  );
  if (!target) return;
  if (target.dataset.nav) {
    event.preventDefault();
    return navigate(target.dataset.nav);
  }
  if (target.dataset.viewInvoice) {
    closeModal();
    return navigate("invoice-detail", target.dataset.viewInvoice);
  }
  if (target.dataset.editCustomer)
    return editCustomer(target.dataset.editCustomer);
  if (target.dataset.editProduct)
    return editProduct(target.dataset.editProduct);
  if (target.dataset.viewProduct)
    return showProductDetails(target.dataset.viewProduct);
  if (target.dataset.removeCustomer)
    return removeCustomer(target.dataset.removeCustomer);
  if (target.dataset.removeProduct)
    return removeProduct(target.dataset.removeProduct);
  if (target.dataset.customerHistory)
    return showCustomerHistory(target.dataset.customerHistory);
  if (target.dataset.invoiceAction)
    return invoiceAction(target.dataset.invoiceAction, target.dataset.id);
  const action = target.dataset.action;

  if (action === "new-invoice") return openInvoiceEditor();
  if (action === "add-customer") return editCustomer("new");
  if (action === "add-product") return editProduct("new");
  if (action === "close-modal") {
    if (target === event.target || target.closest("[data-modal-content]")) {
      if (!target.closest("[data-modal-content]") || target.closest("button"))
        closeModal();
    }
    return;
  }
  if (action === "menu") {
    const open = $("#sidebar").classList.toggle("open");
    $(".mobile-overlay")?.classList.toggle("show", open);
    return;
  }
  if (action === "retry") return navigate(state.page);
  if (action === "preview-invoice") return previewInvoice();
  if (action === "add-line") return addInvoiceLine();
  if (action === "remove-line") {
    const row = target.closest(".invoice-line");
    if ($$(".invoice-line").length <= 1) {
      row
        ?.querySelectorAll("input")
        .forEach(
          (field) =>
            (field.value =
              field.dataset.lineField === "quantity"
                ? "1"
                : field.dataset.lineField === "unit"
                  ? "pcs"
                  : ""),
        );
      if (row) row.querySelector('[data-line-field="productId"]').value = "";
      if (row) row.querySelector('[data-line-field="gstRate"]').value = "0";
    } else row?.remove();
    recalculateEditor();
    return;
  }
  if (action === "save-invoice") return saveInvoiceFromEditor();
  if (action === "download-pdf") return downloadInvoicePdf(target.dataset.id);
  if (action === "print-invoice") {
    window.print();
    return;
  }
  if (action === "download-csv") return downloadCsv();
  if (action === "upload-logo") return $("#logo-file")?.click();
  if (action === "remove-logo") return removeLogo();
}
let searchTimer;
document.addEventListener("submit", handleSubmit);
document.addEventListener("click", handleClick);
async function refreshSearch(selector, position, render) {
  try {
    await render();
    const input = $(selector);
    if (input) {
      input.focus();
      if (Number.isInteger(position) && input.setSelectionRange)
        input.setSelectionRange(position, position);
    }
  } catch (error) {
    showError(error);
  }
}
document.addEventListener("input", (event) => {
  if (event.target.matches('[data-filter="search"]')) {
    const input = event.target,
      position = input.selectionStart;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
      () =>
        refreshSearch('[data-filter="search"]', position, () =>
          renderInvoices(currentInvoiceFilters()),
        ),
      250,
    );
  }
  if (event.target.matches('[data-search="customers"]')) {
    const value = event.target.value,
      position = event.target.selectionStart;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
      () =>
        refreshSearch('[data-search="customers"]', position, () =>
          renderCustomers(value),
        ),
      250,
    );
  }
  if (event.target.matches('[data-search="products"]')) {
    const value = event.target.value,
      position = event.target.selectionStart;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
      () =>
        refreshSearch('[data-search="products"]', position, () =>
          renderProducts(value),
        ),
      250,
    );
  }
  if ($("#invoice-form") && event.target.closest("#invoice-form"))
    recalculateEditor();
});
document.addEventListener("change", (event) => {
  if (event.target.id === "inv-customer") syncCustomerSelection();
  if (event.target.id === "cust-type")
    $("#cust-gstin").required = event.target.value === "registered";
  if (event.target.id === "inv-cust-type")
    $("#inv-cust-gstin").required = event.target.value === "registered";
  if (event.target.id === "inv-type") syncDocumentType();
  if (event.target.matches('[data-line-field="productId"]'))
    syncProductSelection(event.target);
  if (event.target.matches('[data-filter="stock"]')) {
    state.productStockFilter = event.target.value;
    renderProducts($('[data-search="products"]')?.value || "").catch(showError);
    return;
  }
  if (
    ["paymentStatus", "from", "to", "minAmount", "maxAmount"].includes(
      event.target.dataset.filter,
    )
  )
    renderInvoices(currentInvoiceFilters()).catch(showError);
  if (event.target.matches("[data-payment-status]"))
    updatePaymentStatus(event.target.dataset.paymentStatus, event.target.value);

  if (event.target.id === "logo-file") uploadLogo(event.target.files?.[0]);
  if ($("#invoice-form") && event.target.closest("#invoice-form"))
    recalculateEditor();
});
window.addEventListener("popstate", () => {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "invoices" && parts[1])
    navigate("invoice-detail", decodeURIComponent(parts[1]), false);
  else
    navigate(
      navItems.some(([page]) => page === (parts[0] || "dashboard"))
        ? parts[0] || "dashboard"
        : "dashboard",
      "",
      false,
    );
});

async function renderInvoiceRowsFromFilters() {
  return renderInvoices(currentInvoiceFilters());
}
function openModal(title, content, wide = false) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal">
  <section
    class="modal ${wide ? "wide" : ""}"
    role="dialog"
    aria-modal="true"
    aria-label="${escapeHTML(title)}"
    data-modal-content
  >
    <div class="modal-heading">
      <div><h2>${escapeHTML(title)}</h2></div>
      <button class="icon-btn" data-action="close-modal" aria-label="Close">×</button>
    </div>
    ${content}
  </section>
</div>`;
}
function closeModal() {
  modalRoot.innerHTML = "";
}
startApp();
