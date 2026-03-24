import { rateConvert } from "./utility.js";

const DATA = {
  recordId: null,
  invoiceNumber: "",
  type: "",
  sitename: "",
  date: "",
  baseTotal: 0,
  taxId: 0,
  taxAmount: 0,
  roundOff: 0,
  grandTotal: 0,
  items: [],
};

const DOM = {};

const currency = (value) => `₹ ${rateConvert(Number(value || 0).toFixed(2))}`;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDateInput = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const getGstRate = (id) => {
  return GST.find((entry) => entry.GST_ID === Number(id)) || null;
};

const setSearchResults = (row, items) => {
  const resultBox = row.querySelector(".search-result");
  if (!resultBox) return;

  resultBox.innerHTML = "";

  if (!items.length) {
    resultBox.classList.remove("active");
    return;
  }

  items.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.name = entry.item_name;
    button.dataset.hsn = entry.hsn || "";
    button.classList.toggle("active", index === 0);
    button.textContent = `${entry.item_name} (${entry.hsn || "-"})`;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      row.querySelector(".__ItemName").value = entry.item_name;
      row.querySelector(".__HSN").value = entry.hsn || "";
      resultBox.classList.remove("active");
      row.querySelector(".__Qty").focus();
      amountCalculator();
    });
    resultBox.appendChild(button);
  });

  resultBox.classList.add("active");
};

const bindAutocomplete = (row) => {
  const itemInput = row.querySelector(".__ItemName");
  const hsnInput = row.querySelector(".__HSN");
  const qtyInput = row.querySelector(".__Qty");
  const resultBox = row.querySelector(".search-result");
  let timeout;

  itemInput.addEventListener("keydown", (event) => {
    const options = Array.from(resultBox.querySelectorAll("button"));
    const active = resultBox.querySelector("button.active");

    if (event.key === "ArrowDown") {
      if (!active && options[0]) {
        options[0].classList.add("active");
      } else if (active?.nextElementSibling) {
        active.classList.remove("active");
        active.nextElementSibling.classList.add("active");
      }
      event.preventDefault();
    }

    if (event.key === "ArrowUp") {
      if (active?.previousElementSibling) {
        active.classList.remove("active");
        active.previousElementSibling.classList.add("active");
      }
      event.preventDefault();
    }

    if (event.key === "Enter" && active) {
      itemInput.value = active.dataset.name || "";
      hsnInput.value = active.dataset.hsn || "";
      resultBox.classList.remove("active");
      qtyInput.focus();
      amountCalculator();
      event.preventDefault();
    }
  });

  itemInput.addEventListener("input", () => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const query = itemInput.value.trim();
      if (!query) {
        resultBox.classList.remove("active");
        resultBox.innerHTML = "";
        return;
      }

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const items = await response.json();
        setSearchResults(row, items);
      } catch (error) {
        console.error("Search failed:", error);
      }
    }, 250);
  });

  document.addEventListener("click", (event) => {
    if (!row.contains(event.target)) {
      resultBox.classList.remove("active");
    }
  });
};

const bindRowEvents = (row) => {
  bindAutocomplete(row);

  row.querySelectorAll(".__ItemName, .__HSN, .__Qty, .__Rate").forEach((input) => {
    input.addEventListener("input", () => amountCalculator());
  });

  row.querySelector(".js-remove-row").addEventListener("click", () => {
    const rows = DOM.rows.querySelectorAll("tr");
    if (rows.length === 1) {
      fillRow(row, {});
      amountCalculator();
      return;
    }

    row.remove();
    refreshRowNumbers();
    amountCalculator();
  });
};

const createRow = (item = {}) => {
  const row = document.createElement("tr");
  row.innerHTML = `
    <th scope="row" class="row-index"></th>
    <td>
      <div class="search-shell">
        <input type="text" class="form-control __ItemName" placeholder="Item Name" />
        <div class="search-result"></div>
      </div>
    </td>
    <td><input type="text" class="form-control __HSN" placeholder="HSN" /></td>
    <td><input type="number" class="form-control __Qty" placeholder="0" min="0" step="0.01" /></td>
    <td><input type="number" class="form-control __Rate text-end" placeholder="0.00" min="0" step="0.01" /></td>
    <td class="amount-cell __Amount" data-value="0">₹ 0.00</td>
    <td class="text-center">
      <button type="button" class="control-btn danger-soft js-remove-row" style="padding: 10px 12px;">
        <i class="bi bi-trash3"></i>
      </button>
    </td>
  `;

  DOM.rows.appendChild(row);
  fillRow(row, item);
  bindRowEvents(row);
  refreshRowNumbers();
  return row;
};

const fillRow = (row, item) => {
  row.querySelector(".__ItemName").value = item.item || item.item_name || item?.item?.item_name || "";
  row.querySelector(".__HSN").value = item.hsn || item?.item?.hsn || "";
  row.querySelector(".__Qty").value = item.qty ?? "";
  row.querySelector(".__Rate").value = item.rate ?? "";

  const amount = Number(item.amount || (Number(item.qty || 0) * Number(item.rate || 0)));
  row.querySelector(".__Amount").dataset.value = amount;
  row.querySelector(".__Amount").textContent = currency(amount);
};

const refreshRowNumbers = () => {
  DOM.rows.querySelectorAll("tr").forEach((row, index) => {
    row.querySelector(".row-index").textContent = String(index + 1).padStart(2, "0");
  });
};

function amountCalculator() {
  const rows = Array.from(DOM.rows.querySelectorAll("tr"));
  let total = 0;
  const items = [];

  rows.forEach((row) => {
    const itemName = row.querySelector(".__ItemName").value.trim();
    const hsn = row.querySelector(".__HSN").value.trim();
    const qty = Number(row.querySelector(".__Qty").value || 0);
    const rate = Number(row.querySelector(".__Rate").value || 0);
    const amount = Number((qty * rate).toFixed(2));
    const amountCell = row.querySelector(".__Amount");

    amountCell.dataset.value = amount;
    amountCell.textContent = currency(amount);
    total += amount;

    if (itemName && qty > 0 && rate > 0) {
      items.push({
        item: itemName,
        hsn,
        qty,
        rate,
        amount,
      });
    }
  });

  DATA.items = items;
  DATA.baseTotal = Number(total.toFixed(2));

  const gstData = getGstRate(DOM.gst.value);
  const taxAmount = gstData
    ? (((gstData.SGST_RATE + gstData.CGST_RATE + gstData.IGST_RATE) / 100) * total)
    : 0;
  const afterTaxAmount = total + taxAmount;
  const roundOffInput = Number(DOM.roundOff.value || 0);
  const grandTotal = afterTaxAmount - roundOffInput;

  DATA.taxId = Number(DOM.gst.value || 0);
  DATA.taxAmount = Number(taxAmount.toFixed(2));
  DATA.roundOff = Number((-roundOffInput).toFixed(2));
  DATA.grandTotal = Number(grandTotal.toFixed(2));
  DATA.type = DOM.type.value;
  DATA.sitename = DOM.site.value.trim();
  DATA.date = DOM.date.value;

  DOM.total.textContent = currency(total);
  DOM.totalTax.textContent = currency(taxAmount);
  DOM.afterTax.textContent = currency(afterTaxAmount);
  DOM.roundOffAmount.textContent = currency(-roundOffInput);
  DOM.grandTotal.textContent = currency(grandTotal);
  DOM.metricGrandTotal.textContent = currency(grandTotal);
  DOM.metricItems.textContent = String(items.length);
  DOM.docTypeBadge.textContent = DOM.type.value || "Invoice Type";
  DOM.headerDateLabel.textContent = DOM.date.value || "Select date";
  if (DATA.invoiceNumber) {
    DOM.headerNumberLabel.textContent = DATA.invoiceNumber;
  }
}

const hydrateInvoice = () => {
  if (!INVOICE_DATA) {
    createRow();
    amountCalculator();
    return;
  }

  DATA.recordId = INVOICE_DATA.invoice_id;
  DATA.invoiceNumber = INVOICE_DATA.invoice_number || "";

  DOM.type.value = INVOICE_DATA.invoice_type || "";
  DOM.site.value = INVOICE_DATA.client_name || "";
  DOM.date.value = formatDateInput(INVOICE_DATA.invoice_date);
  DOM.gst.value = String(INVOICE_DATA.gst_id || GST[0]?.GST_ID || "");
  DOM.roundOff.value = Math.abs(Number(INVOICE_DATA.round_off || 0));

  DOM.metricMode.textContent = "Edit";
  DOM.metricNumber.textContent = INVOICE_DATA.invoice_number || "Auto";
  DOM.headerNumberLabel.textContent = INVOICE_DATA.invoice_number || "Will generate after save";

  const items = INVOICE_DATA.items || [];
  if (items.length) {
    items.forEach((entry) => {
      createRow({
        item: entry.item?.item_name || "",
        hsn: entry.item?.hsn || "",
        qty: entry.qty,
        rate: entry.rate,
        amount: entry.amount,
      });
    });
  } else {
    createRow();
  }

  amountCalculator();
};

async function saveInvoice() {
  amountCalculator();

  if (!DATA.type || !DATA.sitename || !DATA.date || DATA.items.length === 0) {
    Swal.fire({
      title: "Missing details",
      text: "Please fill document type, site name, date, and at least one item row.",
      icon: "warning",
    });
    return;
  }

  try {
    const response = await fetch("/saveInvoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ formData: DATA }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to save record");
    }

    DATA.recordId = result.invoiceId;
    DATA.invoiceNumber = result.invoiceNumber;
    DOM.metricNumber.textContent = result.invoiceNumber;
    DOM.headerNumberLabel.textContent = result.invoiceNumber;
    DOM.metricMode.textContent = "Edit";
    DOM.saveBtnLabel.textContent = "Update Record";

    Swal.fire({
      title: result.mode === "update" ? "Record updated successfully" : "Record saved successfully",
      text: result.invoiceNumber,
      icon: "success",
      showCancelButton: true,
      confirmButtonText: "Print",
      cancelButtonText: "Back to Register",
    }).then((action) => {
      if (action.isConfirmed) {
        makePrintable();
      } else {
        window.location.href = "/";
      }
    });
  } catch (error) {
    console.error("Save failed:", error);
    Swal.fire({
      title: "Save failed",
      text: error.message,
      icon: "error",
    });
  }
}

function replaceInput(row, selector, formatter = (value) => value) {
  const input = row.querySelector(selector);
  if (!input) return;
  const cell = input.closest("td");
  if (cell) cell.innerHTML = formatter(input.value || "");
}

function replaceField(selector, formatter = null) {
  document.querySelectorAll(selector).forEach((element) => {
    const parent = element.closest(".field-card, span, div") || element.parentNode;
    let value = "";

    if (element.tagName === "SELECT") {
      value = element.options[element.selectedIndex]?.text || "";
    } else if (element.tagName === "INPUT" && element.type === "date") {
      value = element.value || "";
    } else if (element.tagName === "INPUT") {
      value = element.value || "";
    }

    parent.innerHTML = formatter ? formatter(value) : value;
  });
}

function makePrintable() {
  amountCalculator();

  const gstData = getGstRate(DATA.taxId);
  const taxRows = [];
  if (gstData) {
    const sgstAmount = (DATA.baseTotal * Number(gstData.SGST_RATE || 0)) / 100;
    const cgstAmount = (DATA.baseTotal * Number(gstData.CGST_RATE || 0)) / 100;
    const igstAmount = (DATA.baseTotal * Number(gstData.IGST_RATE || 0)) / 100;

    if (sgstAmount) taxRows.push({ label: `SGST (${gstData.SGST_RATE}%)`, value: sgstAmount });
    if (cgstAmount) taxRows.push({ label: `CGST (${gstData.CGST_RATE}%)`, value: cgstAmount });
    if (igstAmount) taxRows.push({ label: `IGST (${gstData.IGST_RATE}%)`, value: igstAmount });
  }

  const rowsMarkup = DATA.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.item)}</td>
          <td>${escapeHtml(item.hsn || "-")}</td>
          <td style="text-align:center;">${escapeHtml(item.qty)}</td>
          <td style="text-align:right;">${currency(item.rate)}</td>
          <td style="text-align:right;">${currency(item.amount)}</td>
        </tr>
      `
    )
    .join("");

  const taxMarkup = taxRows
    .map(
      (row) => `
        <div class="print-summary-line">
          <span>${escapeHtml(row.label)}</span>
          <strong>${currency(row.value)}</strong>
        </div>
      `
    )
    .join("");

  const printRoot = document.getElementById("print-template-root");
  printRoot.innerHTML = `
    <div class="print-root p-0 m-0">
      <div class="print-head">
        <div class="print-band">
          <div class="print-brand d-flex justify-content-between">
            <div class="print-logo-stack">
              <img src="/img/logo.svg" alt="Logo" />
              <div class="print-slogan">Precision Gas Pipeline Solutions for Safer, Smarter, Future-Ready Installations.</div>
            </div>
            <div class="print-brand-copy d-flex flex-column justify-content-end">
              <div><strong>Phone:</strong> 9810186087</div>
              <div><strong>Phone:</strong> 8383045705</div>
            </div>
          </div>
        </div>
        <div class="print-subline">
          Premium engineering for Multi Manifold Gas Bank, PNG, LPG Pipeline Installation, M/S, S/S, Copper, Fire Fitting and Leak Detection systems.
        </div>
      </div>

      <div class="print-meta">
      <div class="d-flex justify-content-between align-items-center">
          <h4 class=" text-secondary text-uppercase fw-bold fs-5">${escapeHtml(DATA.type || "Invoice")}</h4>
          <h4 class=" text-secondary text-uppercase fw-bold fs-5">${escapeHtml(DATA.date || "-")}</h4>
          </div>
        <div class="d-flex justify-content-between align-items-center">
        <p class="fs-5"><strong>${escapeHtml(DATA.sitename || "Client / Site Name")}</strong></p>
        <p class="fs-5"><strong>${escapeHtml(DATA.invoiceNumber || "Draft")}</strong></p>
        </div>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width:8%;">#</th>
            <th style="width:40%;">Particulars</th>
            <th style="width:14%;">HSN</th>
            <th style="width:10%;">Qty</th>
            <th style="width:14%; text-align:right;">Rate</th>
            <th style="width:14%; text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsMarkup || `<tr><td colspan="6" style="text-align:center;">No items added</td></tr>`}
        </tbody>
      </table>

      <div class="print-summary">
        <div class="print-summary-line">
          <span>Sub Total</span>
          <strong>${currency(DATA.baseTotal)}</strong>
        </div>
        ${taxMarkup}
        <div class="print-summary-line">
          <span>Total Tax</span>
          <strong>${currency(DATA.taxAmount)}</strong>
        </div>
        <div class="print-summary-line">
          <span>Round Off</span>
          <strong>${currency(DATA.roundOff)}</strong>
        </div>
        <div class="print-summary-line total">
          <span>Grand Total</span>
          <strong>${currency(DATA.grandTotal)}</strong>
        </div>
      </div>
    </div>
  `;

  PrintContainer("print-template-root", 100);
  window.onafterprint = function () {
    window.location.href = "/";
  };
}

const initDom = () => {
  DOM.rows = document.getElementById("invoiceRows");
  DOM.type = document.querySelector(".__InvoiceType");
  DOM.site = document.querySelector(".__SiteTitle");
  DOM.date = document.querySelector(".__InvoiceDate");
  DOM.gst = document.querySelector(".__GST");
  DOM.roundOff = document.querySelector(".__RoundOff");
  DOM.total = document.querySelector(".__Total");
  DOM.totalTax = document.querySelector(".__TotalTax");
  DOM.afterTax = document.querySelector(".__TotalAfterTax");
  DOM.roundOffAmount = document.querySelector(".__RoundOffAmount");
  DOM.grandTotal = document.querySelector(".__GrandTotal");
  DOM.metricGrandTotal = document.getElementById("metricGrandTotal");
  DOM.metricItems = document.getElementById("metricItems");
  DOM.metricMode = document.getElementById("metricMode");
  DOM.metricNumber = document.getElementById("metricNumber");
  DOM.docTypeBadge = document.getElementById("docTypeBadge");
  DOM.headerDateLabel = document.getElementById("headerDateLabel");
  DOM.headerNumberLabel = document.getElementById("headerNumberLabel");
  DOM.saveBtnLabel = document.getElementById("saveBtnLabel");
};

document.addEventListener("DOMContentLoaded", () => {
  initDom();

  if (GST.length && !INVOICE_DATA) {
    DOM.gst.value = String(GST[0].GST_ID);
  }

  hydrateInvoice();

  document.getElementById("addRowBtn").addEventListener("click", () => {
    createRow();
  });

  document.querySelector(".__SaveBtn").addEventListener("click", saveInvoice);
  document.getElementById("printBtn").addEventListener("click", () => {
    amountCalculator();
    makePrintable();
  });

  [DOM.type, DOM.site, DOM.date, DOM.gst, DOM.roundOff].forEach((element) => {
    element.addEventListener("input", amountCalculator);
    element.addEventListener("change", amountCalculator);
  });
});
