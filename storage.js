// GST calculations, browser storage helpers, and defaults.

// 1. Browser storage and default business settings
const STORAGE_KEY = "gstdesk.browser-data.v1";
const DEFAULT_PROFILE = {
  businessName: "",
  address: "",
  gstin: "",
  state: "",
  stateCode: "",
  contactNumber: "",
  email: "",
  bankDetails: { bankName: "", bankAccount: "", bankIfsc: "" },
  invoicePrefix: "INV",
  defaultPaymentTerms: 0,
  defaultNotes: "",
  logoUrl: "",
};
const GST_RATES = [0, 5, 12, 18, 28];
const INDIAN_STATES = [
  ["Jammu and Kashmir", "01"],
  ["Himachal Pradesh", "02"],
  ["Punjab", "03"],
  ["Chandigarh", "04"],
  ["Uttarakhand", "05"],
  ["Haryana", "06"],
  ["Delhi", "07"],
  ["Rajasthan", "08"],
  ["Uttar Pradesh", "09"],
  ["Bihar", "10"],
  ["Sikkim", "11"],
  ["Arunachal Pradesh", "12"],
  ["Nagaland", "13"],
  ["Manipur", "14"],
  ["Mizoram", "15"],
  ["Tripura", "16"],
  ["Meghalaya", "17"],
  ["Assam", "18"],
  ["West Bengal", "19"],
  ["Jharkhand", "20"],
  ["Odisha", "21"],
  ["Chhattisgarh", "22"],
  ["Madhya Pradesh", "23"],
  ["Gujarat", "24"],
  ["Dadra and Nagar Haveli and Daman and Diu", "26"],
  ["Maharashtra", "27"],
  ["Karnataka", "29"],
  ["Goa", "30"],
  ["Lakshadweep", "31"],
  ["Kerala", "32"],
  ["Tamil Nadu", "33"],
  ["Puducherry", "34"],
  ["Andaman and Nicobar Islands", "35"],
  ["Telangana", "36"],
  ["Andhra Pradesh", "37"],
  ["Ladakh", "38"],
  ["Other Territory", "97"],
].map(([name, code]) => ({ name, code }));

class AppError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.data = data;
  }
}
const formatINR = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const toCents = (value) =>
  Number.isFinite(Number(value ?? 0))
    ? Math.round((Number(value ?? 0) + Number.EPSILON) * 100)
    : 0;
const fromCents = (cents) => Number((Number(cents || 0) / 100).toFixed(2));


// 2. GST calculation helpers

function calculateLine(item, intraState) {
  const quantityMilli = Math.round(
    (Number(item.quantity || 0) + Number.EPSILON) * 1000,
  );
  const unitPriceCents = toCents(item.unitPrice ?? item.price);
  const grossCents = Math.round((quantityMilli * unitPriceCents) / 1000);
  const discountCents = Math.min(
    grossCents,
    Math.max(0, toCents(item.discount)),
  );
  const taxableCents = Math.max(0, grossCents - discountCents);
  const gstCents = Math.round(
    (taxableCents * Math.round(Number(item.gstRate || 0) * 100)) / 10000,
  );
  const cgstCents = intraState ? Math.floor(gstCents / 2) : 0;
  const sgstCents = intraState ? gstCents - cgstCents : 0;
  const igstCents = intraState ? 0 : gstCents;
  return {
    quantity: Number((quantityMilli / 1000).toFixed(3)),
    unitPrice: fromCents(unitPriceCents),
    discount: fromCents(discountCents),
    taxable: fromCents(taxableCents),
    gstAmount: fromCents(gstCents),
    cgst: fromCents(cgstCents),
    sgst: fromCents(sgstCents),
    igst: fromCents(igstCents),
    total: fromCents(taxableCents + gstCents),
    _cents: {
      gross: grossCents,
      discount: discountCents,
      taxable: taxableCents,
      gst: gstCents,
      cgst: cgstCents,
      sgst: sgstCents,
      igst: igstCents,
      total: taxableCents + gstCents,
    },
  };
}
function calculateInvoice(items = [], options = {}) {
  const intraState = Boolean(options.intraState);
  const lines = items.map((item) => ({
    ...item,
    ...calculateLine(item, intraState),
  }));
  const sums = lines.reduce(
    (acc, line) => {
      for (const key of [
        "gross",
        "discount",
        "taxable",
        "gst",
        "cgst",
        "sgst",
        "igst",
      ])
        acc[key] += line._cents[key];
      return acc;
    },
    { gross: 0, discount: 0, taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0 },
  );
  const charges = toCents(options.otherCharges),
    roundOff = toCents(options.roundOff);
  const additionalDiscount = Math.min(
    Math.max(0, toCents(options.additionalDiscount)),
    Math.max(0, sums.taxable + sums.gst + charges + roundOff),
  );
  return {
    lines,
    intraState,
    subtotal: fromCents(sums.gross),
    totalDiscount: fromCents(sums.discount + additionalDiscount),
    taxableValue: fromCents(sums.taxable),
    totalGst: fromCents(sums.gst),
    cgst: fromCents(sums.cgst),
    sgst: fromCents(sums.sgst),
    igst: fromCents(sums.igst),
    otherCharges: fromCents(charges),
    additionalDiscount: fromCents(additionalDiscount),
    roundOff: fromCents(roundOff),
    grandTotal: fromCents(
      sums.taxable + sums.gst + charges - additionalDiscount + roundOff,
    ),
  };
}
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `gst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
const freshStore = () => ({
  version: 1,
  profile: {
    ...DEFAULT_PROFILE,
    bankDetails: { ...DEFAULT_PROFILE.bankDetails },
  },
  customers: [],
  products: [],
  invoices: [],
  payments: [],
  auditEvents: [],
  nextInvoiceNumber: 1,
});
function readStore() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new AppError(
      "Browser storage is unavailable. Open this page in a browser that allows local storage.",
    );
  }
  if (!raw) return freshStore();
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw new AppError(
      "The saved browser data could not be read. Do not clear site data until you have recovered a backup.",
    );
  }
  return {
    ...freshStore(),
    ...saved,
    profile: {
      ...DEFAULT_PROFILE,
      ...(saved.profile || {}),
      bankDetails: {
        ...DEFAULT_PROFILE.bankDetails,
        ...(saved.profile?.bankDetails || {}),
      },
    },
    customers: Array.isArray(saved.customers) ? saved.customers : [],
    products: Array.isArray(saved.products) ? saved.products : [],
    invoices: Array.isArray(saved.invoices) ? saved.invoices : [],
    payments: Array.isArray(saved.payments) ? saved.payments : [],
    auditEvents: Array.isArray(saved.auditEvents) ? saved.auditEvents : [],
  };
}
function writeStore(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (error) {
    throw new AppError(
      error?.name === "QuotaExceededError"
        ? "Browser storage is full. Remove a large logo or export your records before continuing."
        : "Could not save to this browser. Check browser storage permissions and available space.",
    );
  }
}
function recordAudit(db, type, entityId, action, details = {}) {
  db.auditEvents.push({
    id: makeId(),
    type,
    entityId,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}
const numeric = (value) => Number(value || 0);
const gstinValid = (value) =>
  !value || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(value);
const publicInvoice = (invoice) => ({
  id: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  invoiceDate: invoice.invoiceDate,
  dueDate: invoice.dueDate,
  customerName: invoice.customerSnapshot?.name || "Walk-in customer",
  customerId: invoice.customerId,
  status: invoice.status,
  paymentStatus: invoice.paymentStatus,
  grandTotal: numeric(invoice.grandTotal),
  totalGst: numeric(invoice.totalGst),
  amountPaid: numeric(invoice.amountPaid),
  subtotal: numeric(invoice.subtotal),
  taxableValue: numeric(invoice.taxableValue),
});
const sortInvoices = (rows) =>
  [...rows].sort(
    (a, b) =>
      String(b.invoiceDate).localeCompare(String(a.invoiceDate)) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
const stamp = () => new Date().toISOString();
function getLocalRoute(path) {
  const url = new URL(path, location.href);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  return { url, parts };
}

