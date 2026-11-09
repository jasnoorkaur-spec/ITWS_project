// Read and update customers, products, invoices, and payments in localStorage.

const browserData = {
  async get(path) {
    const { url, parts } = getLocalRoute(path),
      db = readStore(),
      route = parts.join("/");
    if (route === "settings/profile") return { profile: db.profile };
    if (route === "dashboard") {
      const finalizedInvoices = sortInvoices(
        db.invoices.filter((invoice) => invoice.status === "finalized"),
      );

      return {
        profile: db.profile,
        stats: {
          invoiceCount: finalizedInvoices.length,
          customerCount: db.customers.length,
          productCount: db.products.length,
        },
        recentInvoices: finalizedInvoices.slice(0, 6).map(publicInvoice),
      };
    }
    if (route === "customers") {
      const search = (url.searchParams.get("search") || "").toLowerCase();
      return {
        customers: [...db.customers]
          .filter(
            (c) =>
              !search ||
              [c.name, c.mobile, c.gstin].some((v) =>
                String(v || "")
                  .toLowerCase()
                  .includes(search),
              ),
          )
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .map((c) => ({
            ...c,
            invoiceCount: db.invoices.filter((i) => i.customerId === c.id)
              .length,
          })),
      };
    }
    if (route === "products") {
      const search = (url.searchParams.get("search") || "").toLowerCase();
      return {
        products: [...db.products]
          .filter(
            (p) =>
              !search ||
              [p.name, p.hsn].some((v) =>
                String(v || "")
                  .toLowerCase()
                  .includes(search),
              ),
          )
          .sort((a, b) => String(a.name).localeCompare(String(b.name))),
      };
    }
    if (route === "invoices") {
      const q = url.searchParams,
        search = (q.get("search") || "").toLowerCase();
      const rows = sortInvoices(db.invoices).filter(
        (i) =>
          (!search ||
            String(i.invoiceNumber).toLowerCase().includes(search) ||
            String(i.customerSnapshot?.name || "")
              .toLowerCase()
              .includes(search)) &&
          (!q.get("status") || i.status === q.get("status")) &&
          (!q.get("paymentStatus") ||
            i.paymentStatus === q.get("paymentStatus")) &&
          (!q.get("from") || i.invoiceDate >= q.get("from")) &&
          (!q.get("to") || i.invoiceDate <= q.get("to")) &&
          (q.get("minAmount") === null ||
            q.get("minAmount") === "" ||
            numeric(i.grandTotal) >=
              Math.max(0, numeric(q.get("minAmount")))) &&
          (q.get("maxAmount") === null ||
            q.get("maxAmount") === "" ||
            numeric(i.grandTotal) <= Math.max(0, numeric(q.get("maxAmount")))),
      );
      return { invoices: rows.map(publicInvoice) };
    }
    if (parts[0] === "invoices" && parts.length === 2) {
      const invoice = db.invoices.find((i) => i.id === parts[1]);
      if (!invoice) throw new AppError("Invoice not found.", 404);
      const { items = [], ...record } = invoice;
      return {
        invoice: {
          ...publicInvoice(invoice),
          ...record,
          business: invoice.businessSnapshot,
          customer: invoice.customerSnapshot,
        },
        items,
      };
    }
    throw new AppError("This local data view is not available.", 404);
  },
  async add(path, body = {}) {
    const { parts } = getLocalRoute(path),
      db = readStore(),
      route = parts.join("/");
    if (route === "customers") {
      if (!String(body.name || "").trim() || !String(body.mobile || "").trim())
        throw new AppError("Enter the customer name and mobile number.");
      if (!gstinValid(body.gstin)) throw new AppError("Enter a valid GSTIN.");
      const customer = {
        ...body,
        id: makeId(),
        name: String(body.name).trim(),
        gstin: String(body.gstin || "").toUpperCase(),
        email: body.email || "",
        address: body.address || "",
        createdAt: stamp(),
      };
      db.customers.push(customer);
      recordAudit(db, "customer", customer.id, "created");
      writeStore(db);
      return { customer, message: "Customer added." };
    }
    if (route === "products") {
      const rate = Number(body.gstRate),
        price = Number(body.price),
        stock = Number(body.stock);
      if (
        !String(body.name || "").trim() ||
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isFinite(stock) ||
        stock < 0 ||
        !GST_RATES.includes(rate)
      )
        throw new AppError(
          "Check the product name, price, stock and GST rate.",
        );
      const product = {
        ...body,
        id: makeId(),
        name: String(body.name).trim(),
        price,
        gstRate: rate,
        stock,
        hsn: body.hsn || "",
        description: body.description || "",
        unit: body.unit || "pcs",
        createdAt: stamp(),
      };
      db.products.push(product);
      recordAudit(db, "product", product.id, "created");
      writeStore(db);
      return { product, message: "Product added." };
    }
    if (route === "invoices") {
      const profile = db.profile;
      if (!profile.businessName || !profile.stateCode)
        throw new AppError(
          "Complete your business name and state in Business settings before creating an invoice.",
        );
      let customer = body.customer || {},
        customerId = body.customerId || null;
      if (customerId) {
        const saved = db.customers.find((c) => c.id === customerId);
        if (!saved)
          throw new AppError("The selected customer could not be found.");
        customer = saved;
      }
      if (!customer.name || !customer.stateCode)
        throw new AppError(
          "Add the customer name and state code to calculate GST correctly.",
        );
      if (customer.customerType === "registered" && !customer.gstin)
        throw new AppError("GSTIN is required for a registered customer.");
      if (!gstinValid(customer.gstin))
        throw new AppError("Enter a valid customer GSTIN.");
      if (!Array.isArray(body.items) || !body.items.length)
        throw new AppError("Add at least one item to the invoice.");
      const intraState =
        String(profile.stateCode) === String(customer.stateCode);
      const items = body.items.map((item) => {
        const product = item.productId
          ? db.products.find((p) => p.id === item.productId)
          : null;
        if (item.productId && !product)
          throw new AppError(
            "One of the selected products is no longer available.",
          );
        const source = product
          ? {
              ...item,
              name: product.name,
              hsn: product.hsn || "",
              description: product.description || "",
              unit: product.unit,
              gstRate:
                body.docType === "bill_of_supply"
                  ? 0
                  : numeric(product.gstRate),
              unitPrice: item.unitPrice ?? numeric(product.price),
            }
          : {
              ...item,
              gstRate:
                body.docType === "bill_of_supply" ? 0 : Number(item.gstRate),
            };
        if (
          !source.name ||
          !(Number(source.quantity) > 0) ||
          Number(source.unitPrice) < 0
        )
          throw new AppError(
            "Each invoice item needs a name, positive quantity and valid price.",
          );
        const { _cents, ...line } = {
          ...source,
          ...calculateLine(source, intraState),
        };
        return { ...line, id: makeId(), productId: item.productId || null };
      });
      const totals = calculateInvoice(items, {
        intraState,
        otherCharges: body.otherCharges,
        additionalDiscount: body.additionalDiscount,
        roundOff: body.roundOff,
      });
      const id = makeId(),
        year = String(
          body.invoiceDate || new Date().toISOString().slice(0, 10),
        ).slice(0, 4),
        invoiceNumber = `${profile.invoicePrefix || "INV"}-${year}-${String(db.nextInvoiceNumber).padStart(4, "0")}`;
      db.nextInvoiceNumber += 1;
      const customerSnapshot = {
        name: customer.name,
        mobile: customer.mobile || "",
        email: customer.email || "",
        address: customer.address || "",
        state: customer.state || "",
        stateCode: customer.stateCode || "",
        gstin: customer.gstin || "",
        customerType: customer.customerType || "unregistered",
      };
      const businessSnapshot = {
        businessName: profile.businessName,
        address: profile.address || "",
        gstin: profile.gstin || "",
        state: profile.state || "",
        stateCode: profile.stateCode || "",
        contactNumber: profile.contactNumber || "",
        email: profile.email || "",
        bankDetails: profile.bankDetails || {},
        logoUrl: profile.logoUrl || "",
      };
      const { lines, ...invoiceTotals } = totals;
      const invoice = {
        id,
        invoiceNumber,
        status: "draft",
        invoiceDate: body.invoiceDate || new Date().toISOString().slice(0, 10),
        dueDate: body.dueDate || null,
        placeOfSupply: body.placeOfSupply || customer.state || "",
        supplyStateCode: customer.stateCode,
        intraState,
        docType:
          body.docType === "bill_of_supply" ? "bill_of_supply" : "tax_invoice",
        customerId,
        customerSnapshot,
        businessSnapshot,
        ...invoiceTotals,
        paymentStatus: "unpaid",
        notes: body.notes || "",
        terms: body.terms || "",
        amountPaid: 0,
        items,
        payments: [],
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      db.invoices.push(invoice);
      recordAudit(db, "invoice", id, "created", {
        invoiceNumber,
        status: "draft",
      });
      writeStore(db);
      return {
        id,
        invoiceNumber,
        totals,
        status: "draft",
        message: "Invoice draft saved.",
      };
    }
    const id = parts[1],
      action = parts[2],
      invoice = db.invoices.find((i) => i.id === id);
    if (parts[0] === "invoices" && invoice && action === "finalize") {
      if (invoice.status !== "draft")
        throw new AppError("Only a draft invoice can be finalized.");
      for (const item of invoice.items) {
        if (!item.productId) continue;
        const product = db.products.find((p) => p.id === item.productId);
        if (product && numeric(product.stock) < numeric(item.quantity))
          throw new AppError(
            `Not enough stock for ${product.name}. Available: ${product.stock} ${product.unit}.`,
          );
      }
      for (const item of invoice.items) {
        if (item.productId) {
          const product = db.products.find((p) => p.id === item.productId);
          if (product)
            product.stock = Number(
              (numeric(product.stock) - numeric(item.quantity)).toFixed(3),
            );
        }
      }
      invoice.status = "finalized";
      invoice.finalizedAt = stamp();
      invoice.updatedAt = stamp();
      recordAudit(db, "invoice", id, "finalized", {
        invoiceNumber: invoice.invoiceNumber,
      });
      writeStore(db);
      return { message: "Invoice finalized." };
    }
    if (parts[0] === "invoices" && invoice && action === "cancel") {
      if (invoice.status === "cancelled")
        throw new AppError("This invoice is already cancelled.");
      const previousStatus = invoice.status;
      if (previousStatus === "finalized")
        for (const item of invoice.items) {
          if (item.productId) {
            const product = db.products.find((p) => p.id === item.productId);
            if (product)
              product.stock = Number(
                (numeric(product.stock) + numeric(item.quantity)).toFixed(3),
              );
          }
        }
      invoice.status = "cancelled";
      invoice.updatedAt = stamp();
      recordAudit(db, "invoice", id, "cancelled", {
        invoiceNumber: invoice.invoiceNumber,
        previousStatus,
      });
      writeStore(db);
      return {
        message: "Invoice cancelled. The cancellation has been recorded.",
      };
    }
    if (parts[0] === "invoices" && invoice && action === "payments") {
      if (invoice.status !== "finalized")
        throw new AppError("Finalized invoice not found.");
      const amount = Number(body.amount),
        outstanding = Math.max(
          0,
          numeric(invoice.grandTotal) - numeric(invoice.amountPaid),
        );
      if (!(amount > 0) || amount - outstanding > 0.01)
        throw new AppError(
          "Payment amount must be positive and cannot exceed the outstanding balance.",
        );
      invoice.amountPaid = Number(
        (numeric(invoice.amountPaid) + amount).toFixed(2),
      );
      invoice.paymentStatus =
        invoice.amountPaid >= numeric(invoice.grandTotal) - 0.01
          ? "paid"
          : "partially_paid";
      const payment = {
        id: makeId(),
        invoiceId: id,
        amount,
        method: body.method || "Other",
        note: body.note || "",
        createdAt: stamp(),
      };
      invoice.payments.push(payment);
      db.payments.push(payment);
      invoice.updatedAt = stamp();
      recordAudit(db, "invoice", id, "payment_recorded", {
        amount,
        method: payment.method,
        paymentStatus: invoice.paymentStatus,
      });
      writeStore(db);
      return { message: "Payment recorded." };
    }
    throw new AppError("This local data action is not available.", 404);
  },
  async save(path, body = {}) {
    const { parts } = getLocalRoute(path),
      db = readStore(),
      route = parts.join("/"),
      id = parts[1];
    if (route === "settings/profile") {
      if (!String(body.businessName || "").trim() || !body.stateCode)
        throw new AppError("Enter a business name and choose a state.");
      if (!gstinValid(body.gstin))
        throw new AppError("Enter a valid business GSTIN.");
      db.profile = {
        ...db.profile,
        ...body,
        businessName: String(body.businessName).trim(),
        gstin: String(body.gstin || "").toUpperCase(),
        bankDetails: {
          ...db.profile.bankDetails,
          bankName:
            body.bankName ??
            body.bankDetails?.bankName ??
            db.profile.bankDetails.bankName,
          bankAccount:
            body.bankAccount ??
            body.bankDetails?.bankAccount ??
            db.profile.bankDetails.bankAccount,
          bankIfsc: String(
            body.bankIfsc ??
              body.bankDetails?.bankIfsc ??
              db.profile.bankDetails.bankIfsc,
          ).toUpperCase(),
        },
      };
      writeStore(db);
      return { profile: db.profile, message: "Business profile saved." };
    }
    if (parts[0] === "customers" && id) {
      const index = db.customers.findIndex((c) => c.id === id);
      if (index < 0) throw new AppError("Customer not found.", 404);
      if (
        !String(body.name || "").trim() ||
        !String(body.mobile || "").trim() ||
        !gstinValid(body.gstin)
      )
        throw new AppError("Check the customer name, mobile number and GSTIN.");
      db.customers[index] = {
        ...db.customers[index],
        ...body,
        name: String(body.name).trim(),
        gstin: String(body.gstin || "").toUpperCase(),
        updatedAt: stamp(),
      };
      recordAudit(db, "customer", id, "updated");
      writeStore(db);
      return { message: "Customer updated." };
    }
    if (parts[0] === "products" && id) {
      const index = db.products.findIndex((p) => p.id === id);
      if (index < 0) throw new AppError("Product not found.", 404);
      const rate = Number(body.gstRate),
        price = Number(body.price),
        stock = Number(body.stock);
      if (
        !String(body.name || "").trim() ||
        !GST_RATES.includes(rate) ||
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isFinite(stock) ||
        stock < 0
      )
        throw new AppError(
          "Check the product name, price, stock and GST rate.",
        );
      db.products[index] = {
        ...db.products[index],
        ...body,
        name: String(body.name).trim(),
        price,
        gstRate: rate,
        stock,
        updatedAt: stamp(),
      };
      recordAudit(db, "product", id, "updated");
      writeStore(db);
      return { message: "Product updated." };
    }
    throw new AppError("This local data action is not available.", 404);
  },
  async update(path, body = {}) {
    const { parts } = getLocalRoute(path),
      db = readStore(),
      id = parts[1],
      invoice = db.invoices.find((i) => i.id === id);
    if (
      parts[0] !== "invoices" ||
      parts[2] !== "payment-status" ||
      !invoice ||
      invoice.status !== "finalized"
    )
      throw new AppError("Finalized invoice not found.", 404);
    const status = body.status;
    if (!["paid", "unpaid", "partially_paid"].includes(status))
      throw new AppError("Choose Paid, Unpaid or Partially Paid.");
    if (status === "partially_paid")
      throw new AppError(
        "Record a partial payment with its amount to update this status.",
      );
    if (status === "unpaid" && numeric(invoice.amountPaid) > 0)
      throw new AppError(
        "This invoice has recorded payments. Record a refund separately rather than erasing the payment history.",
      );
    if (status === "paid") {
      const outstanding = Math.max(
        0,
        numeric(invoice.grandTotal) - numeric(invoice.amountPaid),
      );
      if (outstanding > 0) {
        const payment = {
          id: makeId(),
          invoiceId: id,
          amount: outstanding,
          method: "manual_status_update",
          note: "Marked paid from invoice status control.",
          createdAt: stamp(),
        };
        invoice.payments.push(payment);
        db.payments.push(payment);
      }
      invoice.amountPaid = numeric(invoice.grandTotal);
    }
    invoice.paymentStatus = status;
    invoice.updatedAt = stamp();
    recordAudit(db, "invoice", id, "payment_status_updated", { status });
    writeStore(db);
    return { message: `Payment status set to ${status.replaceAll("_", " ")}.` };
  },
  async remove(path) {
    const { parts } = getLocalRoute(path),
      db = readStore(),
      id = parts[1];
    if (parts[0] === "customers" && id) {
      const index = db.customers.findIndex((c) => c.id === id);
      if (index < 0) throw new AppError("Customer not found.", 404);
      db.customers.splice(index, 1);
      recordAudit(db, "customer", id, "deleted");
      writeStore(db);
      return {
        message:
          "Customer deleted. Saved invoices keep their original billing details.",
      };
    }
    if (parts[0] === "products" && id) {
      const index = db.products.findIndex((p) => p.id === id);
      if (index < 0) throw new AppError("Product not found.", 404);
      db.products.splice(index, 1);
      recordAudit(db, "product", id, "deleted");
      writeStore(db);
      return {
        message: "Product deleted. Saved invoices keep their item snapshots.",
      };
    }
    throw new AppError("This local data action is not available.", 404);
  },
  async saveLogo(dataUrl) {
    const db = readStore();
    db.profile.logoUrl = dataUrl || "";
    writeStore(db);
  },
};
