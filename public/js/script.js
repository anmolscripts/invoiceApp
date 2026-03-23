import { rateConvert } from "./utility.js";

const DATA = {
  type: "",
  sitename: "",
  date: "",
  baseTotal: 0,
  taxId: 1,
  taxAmount: 0,
  roundOff: 0,
  grandTotal: 0,
  items: [],
};

const EVENT = {
  item: (item, resultBox, hsnBox, next) => {
    let timeout;
    item.addEventListener("keyup", (event) => {
      console.log(event.key);
      if (event.key === "Enter") {
        const option = resultBox.querySelector("button.active");
        if (option) {
          const name = option.getAttribute("data-name");
          if (name) item.value = name;
          const hsn = option.getAttribute("data-hsn");
          if (hsn) hsnBox.value = hsn;
        }
        resultBox.replaceChildren();
        next.focus();
        return;
      } else if (event.key === "ArrowDown") {
        const option = resultBox.querySelector("button.active");
        if (option) {
          const nextBtn = option.nextElementSibling;
          if (nextBtn) {
            option.classList.remove("active");
            nextBtn.classList.add("active");
          }
        }
        return;
      } else if (event.key === "ArrowUp") {
        const option = resultBox.querySelector("button.active");
        if (option) {
          const nextBtn = option.previousElementSibling;
          if (nextBtn) {
            option.classList.remove("active");
            nextBtn.classList.add("active");
          }
        }
        return;
      }

      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const query = item.value.trim();
        const res = await fetch(`/api/search?q=${query}`);
        const data = await res.json();
        console.log(data);
        resultBox.innerHTML = "";

        if (data.length === 0) {
          resultBox.innerHTML = "<li>No items found</li>";
          return;
        }

        data.forEach((item, i) => {
          const button = document.createElement("button");
          button.classList.add("list-group-item", "list-group-item-action");
          button.value = item.item_id;
          button.setAttribute("onclick", `setResult(${item.item_id}, this)`);
          button.setAttribute("data-name", item.item_name);
          button.setAttribute("data-hsn", item.hsn);
          if (i == 0) button.classList.add("active");
          button.textContent = `${item.item_name} (${item.hsn || "-"})`;
          resultBox.appendChild(button);
        });
      }, 300);

      console.log(
        `%cKey Up event trigger value => ${item.value}`,
        "background: yellow; padding: 5px; border-radius: 5px;",
      );
    });
  },
  amount: (item, multiple, result) => {
    item.addEventListener("keyup", (event) => {
      // Get suggestions
      const amount = Number(item.value) * Number(multiple.value);
      result.setAttribute("data-value", amount);
      result.innerText = `₹ ${rateConvert(amount.toFixed(2))}`;
      amountCalculator();
      EVENT.addRow(item);
      console.log(
        `%cKey Up event trigger value => ${item.value}`,
        "background: yellow; padding: 5px; border-radius: 5px;",
      );
    });
  },

  addRow: (item) => {
    const currentRow = item.closest("tr");
    const parent = currentRow.parentNode;
    const rows = Array.from(parent.children);
    // index (0-based), +1 for human count
    const rowNumber = rows.indexOf(currentRow) + 1;
    const totalRows = rows.length;

    if (totalRows - 2 < rowNumber) {
      const lastRow = parent.querySelector("tr:last-child");
      const newRow = lastRow.cloneNode(true);
      newRow.children[0].innerText = Number(newRow.children[0].innerText) + 1;
      parent.appendChild(newRow);
    }

    console.log(
      `%cAdd row triggered Row: ${rowNumber} / ${totalRows}`,
      "color:white;background: blue; padding: 5px; border-radius: 5px;",
    );
  },
};

const addInvoiceEvent = (tableId) => {
  console.log(
    "%cADD INVOICE EVENT START",
    "color: white; background: green; padding: 5px; border-radius: 5px;",
  );
  const invoiceTable = document.getElementById(tableId);
  if (invoiceTable) {
    const rows = invoiceTable.querySelectorAll("tr");
    if (rows.length > 0) {
      rows.forEach((row, index) => {
        if (index > 0) {
          const itemName = row.querySelector(".__ItemName");
          const HSN = row.querySelector(".__HSN");
          const qty = row.querySelector(".__Qty");
          const rate = row.querySelector(".__Rate");
          const amount = row.querySelector(".__Amount");
          const searchList = row.querySelector(".__SearchList ul");
          if (itemName && qty && rate && amount && searchList && HSN) {
            EVENT.item(itemName, searchList, HSN, qty);
            EVENT.amount(qty, rate, amount);
            EVENT.amount(rate, qty, amount);
          } else {
            console.log(
              `%cItem Name, qty, rate any Field is not present in row ${index}`,
              "color: white; background: red; padding: 5px; border-radius: 5px;",
            );
          }
        }
      });
    } else {
      console.log(
        "%cTable don`t have Rows ",
        "color: white; background: red; padding: 5px; border-radius: 5px;",
      );
    }
  } else {
    console.log(
      `%cNo Table is present with this id ${tableId}`,
      "color: white; background: red; padding: 5px; border-radius: 5px;",
    );
  }
};

function amountCalculator(id = "invoiceTable") {
  const table = document.getElementById(id);
  if (table) {
    const tbody = table.querySelector("tbody");

    let total = 0;
    if (tbody) {
      const rows = tbody.querySelectorAll("tr");
      if (rows.length > 0) {
        DATA.items = [];
        rows.forEach((row) => {
          const item = row.querySelector(".__ItemName");
          const hsn = row.querySelector(".__HSN");
          const qty = row.querySelector(".__Qty");
          const rate = row.querySelector(".__Rate");

          const amount = row.querySelector(".__Amount");
          if (amount) {
            total += amount.hasAttribute("data-value")
              ? Number(amount.getAttribute("data-value"))
              : 0;

            if (amount.hasAttribute("data-value")) {
              if (item && hsn && qty && rate) {
                DATA.items.push({
                  item: item.value,
                  hsn: hsn.value,
                  qty: Number(qty.value),
                  rate: Number(qty.value),
                  amount: Number(amount.getAttribute("data-value")),
                });
              }
            }
          }
        });
      } else {
        console.log(
          `%cNo Rows inside Tbody is present inside table with id ${id}`,
          "color: white; background: red; padding: 5px; border-radius: 5px;",
        );
      }
    } else {
      console.log(
        `%cNo Tbody is present inside table with id ${id}`,
        "color: white; background: red; padding: 5px; border-radius: 5px;",
      );
    }
    const tfoot = table.querySelector("tfoot");
    if (tfoot) {
      const totalField = tfoot.querySelector(".__Total");
      if (totalField)
        totalField.innerText = `₹ ${rateConvert(total.toFixed(2))}`;
      DATA.baseTotal = Number(total.toFixed(2));
      const gst = tfoot.querySelector(".__GST");
      const afterTax = tfoot.querySelector(".__TotalAfterTax");
      let afterTaxAmount = total;
      if (gst) {
        const gstArr = GST.filter((g) => g.GST_ID === Number(gst.value));
        let SGST_RATE = gstArr[0].SGST_RATE;
        let CGST_RATE = gstArr[0].CGST_RATE;
        let IGST_RATE = gstArr[0].IGST_RATE;
        SGST_RATE = (SGST_RATE / 100) * total;
        CGST_RATE = (CGST_RATE / 100) * total;
        IGST_RATE = (IGST_RATE / 100) * total;

        const totalTax = tfoot.querySelector(".__TotalTax");
        if (totalTax)
          totalTax.innerText = `₹ ${rateConvert((SGST_RATE + CGST_RATE + IGST_RATE).toFixed(2))}`;
        DATA.taxId = Number(gst.value);
        DATA.taxAmount = Number((SGST_RATE + CGST_RATE + IGST_RATE).toFixed(2));
        afterTaxAmount += SGST_RATE + CGST_RATE + IGST_RATE;
      }

      if (afterTax)
        afterTax.innerHTML = `₹ ${rateConvert(afterTaxAmount.toFixed(2))}`;

      let gTotal = afterTaxAmount;
      const roundoff = tfoot.querySelector(".__RoundOff");
      const roundoffAmount = tfoot.querySelector(".__RoundOffAmount");
      if (roundoff) {
        gTotal -= Number(roundoff.value);
        roundoffAmount.innerText = `₹ ${rateConvert((Number(roundoff.value) * -1).toFixed(2))}`;
        DATA.roundOff = Number((Number(roundoff.value) * -1).toFixed(2));
      }

      const grandTotal = tfoot.querySelector(".__GrandTotal");
      if (grandTotal)
        grandTotal.innerText = `₹ ${rateConvert(gTotal.toFixed(2))}`;
      DATA.grandTotal = Number(gTotal.toFixed(2));
      const invoiceType = document.querySelector(".__InvoiceType");
      const site = document.querySelector(".__SiteTitle");
      const date = document.querySelector(".__InvoiceDate");
      if (invoiceType && site && date) {
        DATA.type = invoiceType.value;
        DATA.sitename = site.value;
        DATA.date = date.value;
      }
      console.log(DATA);
    }
  } else {
    console.log(
      `%cNo Table is present with this id ${id}`,
      "color: white; background: red; padding: 5px; border-radius: 5px;",
    );
  }
}

async function SaveInvoice() {
  console.log(
    `%cInvoice Data`,
    "color: white; background: #7f22fe; padding: 5px; border-radius: 5px;",
  );

  await fetch("/saveInvoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ formData: DATA }),
  })
    .then((res) => res.json())
    .then((data) => {
      console.log(
        `%cFetch Response`,
        "color: white; background: #7f22fe; padding: 5px; border-radius: 5px;",
      );
      console.log("Response:", data);
      if (data.success) {
        Swal.fire({
          title: `Invoice Saved Successfully ${data.invoiceNumber}`,
          icon: "success",
          showCancelButton: true,
          confirmButtonText: "Print",
        }).then((result) => {
          /* Read more about isConfirmed, isDenied below */
          if (result.isConfirmed) PrintContainer('print-container', 80);
          else if (result.isDenied)
            Swal.fire("Changes are not saved", "", "info");
        });
      }
    })
    .catch((err) => {
      console.error("Error:", err);
    });

  console.log(DATA);
}

document.addEventListener("DOMContentLoaded", () => {
  addInvoiceEvent("invoiceTable");
  const gst = document.querySelector("#invoiceTable tfoot .__GST");
  if (gst) {
    gst.addEventListener("change", () => amountCalculator());
  }

  const roundoff = document.querySelector("#invoiceTable tfoot .__RoundOff");
  if (roundoff) roundoff.addEventListener("keyup", () => amountCalculator());

  const save = document.querySelector(".__SaveBtn");
  if (save) {
    save.addEventListener("click", () => SaveInvoice());
  }
  const other = document.querySelectorAll(
    ".__InvoiceType, .__SiteTitle, .__InvoiceDate",
  );
  if (other.length > 0) {
    other.forEach((o) => {
      o.addEventListener("keyup", () => amountCalculator());
      o.addEventListener("change", () => amountCalculator());
    });
  }
});
