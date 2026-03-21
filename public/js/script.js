import { rateConvert } from "./utility.js";

const EVENT = {
  item: (item, resultBox,hsnBox,next) => {
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
      } 
      else if(event.key === 'ArrowDown') {
        const option = resultBox.querySelector("button.active");
        if (option) {
          const nextBtn = option.nextElementSibling;
          if(nextBtn) {
            option.classList.remove('active');
            nextBtn.classList.add('active');
          }
        }
        return;
      }

      else if(event.key === 'ArrowUp') {
        const option = resultBox.querySelector("button.active");
        if (option) {
          const nextBtn = option.previousElementSibling;
          if(nextBtn) {
            option.classList.remove('active');
            nextBtn.classList.add('active');
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
      result.innerText = `₹ ${rateConvert((Number(item.value) * Number(multiple.value)).toFixed(2))}`;
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
            EVENT.item(itemName, searchList, HSN,qty);
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

document.addEventListener("DOMContentLoaded", () => {
  addInvoiceEvent("invoiceTable");
});
