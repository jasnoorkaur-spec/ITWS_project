// Business profile settings and local logo handling.

async function renderSettings() {
  const data = await browserData.get("/settings/profile");
  state.profile = data.profile;
  const p = data.profile || {};
  const bank = p.bankDetails || {};
  pageContent.innerHTML = `${heading("Business settings", "These details appear on your invoices.")}
<div class="dashboard-columns">
  <section class="card">
    <div class="card-heading">
      <div>
        <h3>Business profile</h3>
        <p>Use your registered business details for accurate tax invoices.</p>
      </div>
    </div>
    <form id="profile-form" data-submit="profile">
      <div class="form-grid">
        <div class="form-field full">
          <label for="biz-name">Business name *</label>
          <input id="biz-name" name="businessName" value="${escapeHTML(p.businessName || "")}" required />
        </div>
        <div class="form-field full">
          <label for="biz-address">Business address</label>
          <textarea id="biz-address" name="address">${escapeHTML(p.address || "")}</textarea>
        </div>
        <div class="form-field">
          <label for="biz-gstin">GSTIN</label>
          <input id="biz-gstin" name="gstin" maxlength="15" value="${escapeHTML(p.gstin || "")}" />
        </div>
        <div class="form-field">
          <label for="biz-state">State *</label>
          <select id="biz-state" name="stateCode" required>
            ${optionsForStates(p.stateCode)}
          </select>
        </div>
        <div class="form-field">
          <label for="biz-phone">Contact number</label>
          <input id="biz-phone" name="contactNumber" value="${escapeHTML(p.contactNumber || "")}" />
        </div>
        <div class="form-field">
          <label for="biz-email">Email address</label>
          <input id="biz-email" name="email" type="email" value="${escapeHTML(p.email || "")}" />
        </div>
        <div class="form-field">
          <label for="biz-bank-name">Bank name</label>
          <input id="biz-bank-name" name="bankName" value="${escapeHTML(bank.bankName || "")}" />
        </div>
        <div class="form-field">
          <label for="biz-bank-account">Bank account</label>
          <input id="biz-bank-account" name="bankAccount" value="${escapeHTML(bank.bankAccount || "")}" />
        </div>
        <div class="form-field">
          <label for="biz-ifsc">IFSC code</label>
          <input id="biz-ifsc" name="bankIfsc" value="${escapeHTML(bank.bankIfsc || "")}" />
        </div>
        <div class="form-field">
          <label for="biz-prefix">Invoice prefix *</label>
          <input id="biz-prefix" name="invoicePrefix" value="${escapeHTML(p.invoicePrefix || "INV")}" required />
        </div>
        <div class="form-field">
          <label for="biz-terms">Default payment terms (days)</label>
          <input
            id="biz-terms"
            name="defaultPaymentTerms"
            type="number"
            min="0"
            max="365"
            value="${escapeHTML(p.defaultPaymentTerms ?? 0)}"
          />
        </div>
        <div class="form-field full">
          <label for="biz-notes">Default invoice notes / terms</label>
          <textarea id="biz-notes" name="defaultNotes">${escapeHTML(p.defaultNotes || "")}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">Save business profile</button>
      </div>
    </form>
    <hr class="section-divider" />
    <div class="security-row">
      <div>
        <strong>Business logo</strong>
        <p>
          PNG, JPG or WebP. Maximum 2 MB. Stored in this browser and used in invoice preview and
          PDF.
        </p>
      </div>
      <div>
        <input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden />
        <button class="btn btn-secondary btn-small" type="button" data-action="upload-logo">
          Upload logo
        </button>
      </div>
    </div>
    ${
      p.logoUrl
        ? `<div class="logo-preview">
  <img src="${escapeHTML(p.logoUrl)}" alt="Current business logo" class="logo-preview-image" />
  <button class="btn btn-danger btn-small" data-action="remove-logo">Remove logo</button>
</div>`
        : ""
    }
  </section>
</div>`;
}
async function saveProfile(form, values) {
  const code = values.stateCode || "";
  values.stateCode = code;
  values.state = selectedStateName(code);
  values.defaultPaymentTerms = Number(values.defaultPaymentTerms || 0);
  const result = await browserData.save("/settings/profile", values);
  state.profile = result.profile;
  state.user = {
    name: state.profile.businessName || "there",
    email: state.profile.email || "",
  };
  toast("Business profile saved.");
  await renderSettings();
  renderSidebar();
}
async function uploadLogo(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024)
    return toast("Choose an image smaller than 2 MB.", "error");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return toast("Choose a PNG, JPG or WebP image.", "error");
  try {
    const reader = new FileReader();
    reader.onerror = () => toast("Could not read this image file.", "error");
    reader.onload = async () => {
      try {
        await browserData.saveLogo(String(reader.result || ""));
        toast("Business logo saved in this browser.");
        await renderSettings();
      } catch (error) {
        showError(error);
      }
    };
    reader.readAsDataURL(file);
  } catch (error) {
    showError(error);
  }
}
async function removeLogo() {
  if (!confirm("Remove the business logo saved in this browser?")) return;
  try {
    await browserData.saveLogo("");
    toast("Logo removed.");
    await renderSettings();
  } catch (error) {
    showError(error);
  }
}
