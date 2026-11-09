// PDF, print, and CSV document output.

async function downloadInvoicePdf(id) {
  try {
    const data = await browserData.get(`/invoices/${encodeURIComponent(id)}`);
    const invoice = data.invoice;
    const items = data.items || [];
    const JsPDF = window.jspdf?.jsPDF;
    if (!JsPDF) {
      toast(
        "PDF tools unavailable. Choose Save as PDF in the print dialog.",
        "error",
      );
      if (state.page !== "invoice-detail" || state.currentInvoice?.id !== id)
        await navigate("invoice-detail", id);
      setTimeout(() => window.print(), 150);
      return;
    }
    const doc = new JsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const businessName = invoice.business?.businessName || "GST Invoice";
    const headingLines = doc.splitTextToSize(businessName, 130);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(headingLines, margin + 23, 20);
    doc.setFontSize(10);
    doc.text(
      invoice.docType === "bill_of_supply" ? "BILL OF SUPPLY" : "TAX INVOICE",
      pageWidth - margin,
      20,
      { align: "right" },
    );
    if (invoice.business?.logoUrl) {
      try {
        const image = await loadImage(invoice.business.logoUrl);
        doc.addImage(image, "PNG", margin, 14, 18, 18);
      } catch {}
    }
    const seller = [
      invoice.business?.address,
      invoice.business?.state
        ? `${invoice.business.state} (${invoice.business.stateCode || ""})`
        : "",
      invoice.business?.gstin ? `GSTIN: ${invoice.business.gstin}` : "",
      invoice.business?.contactNumber,
      invoice.business?.email,
    ]
      .filter(Boolean)
      .join("\n");
    const invoiceMeta = [
      `Invoice: ${invoice.invoiceNumber}`,
      `Date: ${dateText(invoice.invoiceDate)}`,
      invoice.dueDate ? `Due: ${dateText(invoice.dueDate)}` : "",
      `Status: ${String(invoice.status || "").replaceAll("_", " ")}`,
      `Payment: ${String(invoice.paymentStatus || "unpaid").replaceAll("_", " ")}`,
    ]
      .filter(Boolean)
      .join("\n");
    const firstStart = Math.max(31, 24 + headingLines.length * 7);
    doc.autoTable({
      startY: firstStart,
      body: [[seller || "Business details", invoiceMeta]],
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2,
        overflow: "linebreak",
        valign: "top",
      },
      columnStyles: { 0: { cellWidth: 111 }, 1: { cellWidth: 71 } },
      margin: { left: margin, right: margin, bottom: 16 },
    });
    const customer = invoice.customer || {};
    const billTo = [
      customer.name,
      customer.address,
      customer.state ? `${customer.state} (${customer.stateCode || ""})` : "",
      customer.gstin ? `GSTIN: ${customer.gstin}` : "",
      customer.mobile ? `Mobile: ${customer.mobile}` : "",
      customer.email,
    ]
      .filter(Boolean)
      .join("\n");
    const supply = [
      `Place of supply: ${invoice.placeOfSupply || customer.state || "—"}`,
      `Tax treatment: ${invoice.docType === "bill_of_supply" ? "No GST charged · Bill of Supply" : invoice.intraState ? "Intra-state · CGST + SGST" : "Inter-state · IGST"}`,
    ].join("\n");
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 3,
      head: [["BILL TO", "SUPPLY DETAILS"]],
      body: [[billTo || "Customer", supply]],
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 3,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: { fillColor: [239, 246, 255], textColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 111 }, 1: { cellWidth: 71 } },
      margin: { left: margin, right: margin, bottom: 16 },
    });
    const body = items.map((item, index) => [
      String(index + 1),
      item.name,
      item.hsn || "—",
      `${item.quantity} ${item.unit || ""}`.trim(),
      `INR ${Number(item.unitPrice).toFixed(2)}`,
      `INR ${Number(item.discount || 0).toFixed(2)}`,
      `INR ${Number(item.taxable).toFixed(2)}`,
      `${Number(item.gstRate)}%`,
      `INR ${Number(item.gstAmount || 0).toFixed(2)}`,
      `INR ${Number(item.total).toFixed(2)}`,
    ]);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 5,
      head: [
        [
          "#",
          "Item",
          "HSN/SAC",
          "Qty",
          "Unit price",
          "Discount",
          "Taxable",
          "GST rate",
          "GST amount",
          "Total",
        ],
      ],
      body,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 6.2,
        cellPadding: 1.7,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: { fillColor: [239, 246, 255], textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 6 },
        1: { cellWidth: 33 },
        2: { cellWidth: 16 },
        3: { cellWidth: 12 },
        4: { cellWidth: 19 },
        5: { cellWidth: 17 },
        6: { cellWidth: 19 },
        7: { cellWidth: 12 },
        8: { cellWidth: 22 },
        9: { cellWidth: 26 },
      },
      margin: { left: margin, right: margin, bottom: 16 },
      rowPageBreak: "avoid",
    });
    const totals = [
      ["Subtotal", `INR ${Number(invoice.subtotal || 0).toFixed(2)}`],
      [
        "Total discount",
        `- INR ${Number(invoice.totalDiscount || 0).toFixed(2)}`,
      ],
      ["Taxable value", `INR ${Number(invoice.taxableValue || 0).toFixed(2)}`],
      ...(invoice.intraState
        ? [
            ["CGST", `INR ${Number(invoice.cgst || 0).toFixed(2)}`],
            ["SGST", `INR ${Number(invoice.sgst || 0).toFixed(2)}`],
          ]
        : [["IGST", `INR ${Number(invoice.igst || 0).toFixed(2)}`]]),
      ["Other charges", `INR ${Number(invoice.otherCharges || 0).toFixed(2)}`],
      ["Round-off", `INR ${Number(invoice.roundOff || 0).toFixed(2)}`],
      ["Amount payable", `INR ${Number(invoice.grandTotal || 0).toFixed(2)}`],
    ];
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 5,
      body: totals,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 43 },
        1: { cellWidth: 48, halign: "right" },
      },
      margin: { left: pageWidth - margin - 43 - 48, right: margin, bottom: 16 },
      didParseCell: (hook) => {
        if (hook.row.index === totals.length - 1)
          hook.cell.styles.fontStyle = "bold";
      },
    });
    const details = [
      ["Amount in words", amountWords(invoice.grandTotal || 0)],
      [
        "Payment status",
        String(invoice.paymentStatus || "unpaid").replaceAll("_", " "),
      ],
    ];
    if (invoice.notes) details.push(["Notes", invoice.notes]);
    if (invoice.terms) details.push(["Terms and conditions", invoice.terms]);
    const bank = invoice.business?.bankDetails || {};
    if (bank.bankName || bank.bankAccount)
      details.push([
        "Bank details",
        [
          bank.bankName,
          bank.bankAccount,
          bank.bankIfsc ? `IFSC ${bank.bankIfsc}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      ]);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 4,
      body: details,
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2,
        overflow: "linebreak",
        valign: "top",
      },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: "bold" },
        1: { cellWidth: pageWidth - margin * 2 - 38 },
      },
      margin: { left: margin, right: margin, bottom: 18 },
      rowPageBreak: "auto",
    });
    let footerY = doc.lastAutoTable.finalY + 20;
    if (footerY > pageHeight - 14) {
      doc.addPage();
      footerY = 22;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Thank you for your business.", margin, footerY);
    doc.setDrawColor(100, 116, 139);
    doc.line(pageWidth - 80, footerY - 2, pageWidth - margin, footerY - 2);
    doc.setFontSize(7);
    doc.text("Authorized signature", pageWidth - 55, footerY + 3, {
      align: "center",
    });
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFontSize(7);
      doc.text(
        `Page ${page} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 7,
        { align: "right" },
      );
    }
    doc.save(
      `${String(invoice.invoiceNumber || "invoice").replace(/[^a-z0-9-_]/gi, "_")}.pdf`,
    );
  } catch (error) {
    showError(error);
  }
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = reject;
    image.src = url;
  });
}
async function downloadCsv() {
  try {
    const data = await browserData.get("/invoices");
    const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      [
        "Invoice number",
        "Date",
        "Customer",
        "Status",
        "Payment status",
        "Subtotal",
        "Taxable value",
        "GST",
        "Grand total",
      ],
      ...(data.invoices || []).map((row) => {
        return [
          row.invoiceNumber,
          row.invoiceDate,
          row.customerName,
          row.status,
          row.paymentStatus,
          row.subtotal,
          row.taxableValue,
          row.totalGst,
          row.grandTotal,
        ];
      }),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gst-invoices.csv";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showError(error);
  }
}