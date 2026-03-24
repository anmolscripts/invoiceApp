const db = require("./db");

exports.getAllGst = (callback) => {
  db.all("SELECT * FROM Gst ORDER BY GST_ID DESC", [], (err, rows) => {
    if (err) {
      console.error(err);
      return callback([]);
    }
    callback(rows);
  });
};

exports.getAllInvoice = (callback) => {
  db.all("SELECT * FROM Invoice ORDER BY invoice_id DESC", [], (err, rows) => {
    if (err) {
      console.error(err);
      return callback([]);
    }
    callback(rows);
  });
};

const runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const normalizeItems = (items = []) =>
  items
    .filter((item) => item && item.item && Number(item.qty) && Number(item.rate))
    .map((item) => ({
      item: String(item.item).trim(),
      hsn: item.hsn ? String(item.hsn).trim() : null,
      qty: Number(item.qty),
      rate: Number(item.rate),
      amount: Number(item.amount || Number(item.qty) * Number(item.rate)),
    }));

const toDbDate = (dateValue) => new Date(dateValue || Date.now()).toISOString();

const toDbNow = () => new Date().toISOString();

const getPrefixByType = (type = "") => {
  const normalizedType = String(type).trim().toLowerCase();
  return normalizedType === "quotation" ? "QUOT" : "INVO";
};

const getNextInvoiceNumber = async (type, year) => {
  const prefix = getPrefixByType(type);
  const rows = await allAsync(
    `SELECT invoice_number FROM Invoice
     WHERE invoice_number LIKE ?
     ORDER BY invoice_id DESC`,
    [`%/${year}/%`]
  );

  let nextNumber = 1;

  rows.forEach((row) => {
    const current = parseInt(String(row.invoice_number || "").split("/")[2], 10);
    if (!Number.isNaN(current) && current >= nextNumber) {
      nextNumber = current + 1;
    }
  });

  return `${prefix}/${year}/${String(nextNumber).padStart(4, "0")}`;
};

const findOrCreateItem = async (entry) => {
  const existingItem = await getAsync(
    `SELECT item_id FROM Item
     WHERE (hsn = ? AND ? IS NOT NULL AND ? != '')
        OR item_name = ?
     ORDER BY item_id DESC
     LIMIT 1`,
    [entry.hsn, entry.hsn, entry.hsn, entry.item]
  );

  if (existingItem?.item_id) return existingItem.item_id;

  const result = await runAsync(
    `INSERT INTO Item (item_name, hsn, created_at, updated_at, active)
     VALUES (?, ?, ?, ?, 1)`,
    [entry.item, entry.hsn, toDbNow(), toDbNow()]
  );

  return result.lastID;
};

const insertInvoiceItems = async (invoiceId, items) => {
  for (const entry of items) {
    const itemId = await findOrCreateItem(entry);

    await runAsync(
      `INSERT INTO InvoiceItem (item_id, invoice_id, qty, rate, amount, created_at, updated_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [itemId, invoiceId, entry.qty, entry.rate, entry.amount, toDbNow(), toDbNow()]
    );
  }
};

exports.saveInvoice = async (formData, callback) => {
  const {
    recordId,
    type,
    sitename,
    date,
    baseTotal,
    taxId,
    roundOff,
    grandTotal,
    items,
  } = formData;

  const normalizedItems = normalizeItems(items);
  const invoiceDate = toDbDate(date);
  const now = toDbNow();

  try {
    await runAsync("BEGIN TRANSACTION");

    if (recordId) {
      const existing = await getAsync(
        "SELECT invoice_id, invoice_number FROM Invoice WHERE invoice_id = ?",
        [Number(recordId)]
      );

      if (!existing) {
        throw new Error("Invoice not found");
      }

      await runAsync(
        `UPDATE Invoice
         SET invoice_type = ?, client_name = ?, invoice_date = ?, gst_id = ?, amount = ?, round_off = ?, grand_total = ?, updated_at = ?
         WHERE invoice_id = ?`,
        [
          type,
          sitename,
          invoiceDate,
          taxId ? Number(taxId) : null,
          Number(baseTotal || 0),
          Number(roundOff || 0),
          Number(grandTotal || 0),
          now,
          Number(recordId),
        ]
      );

      await runAsync("DELETE FROM InvoiceItem WHERE invoice_id = ?", [Number(recordId)]);
      await insertInvoiceItems(Number(recordId), normalizedItems);
      await runAsync("COMMIT");

      return callback(null, {
        invoiceId: Number(recordId),
        invoiceNumber: existing.invoice_number,
        mode: "update",
      });
    }

    const year = new Date(invoiceDate).getFullYear();
    const invoiceNumber = await getNextInvoiceNumber(type, year);
    const createdInvoice = await runAsync(
      `INSERT INTO Invoice (
        invoice_number, invoice_type, client_name, invoice_date, gst_id,
        amount, round_off, grand_total, settle, created_at, updated_at, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        invoiceNumber,
        type,
        sitename,
        invoiceDate,
        taxId ? Number(taxId) : null,
        Number(baseTotal || 0),
        Number(roundOff || 0),
        Number(grandTotal || 0),
        "pending",
        now,
        now,
      ]
    );

    await insertInvoiceItems(createdInvoice.lastID, normalizedItems);
    await runAsync("COMMIT");

    callback(null, {
      invoiceId: createdInvoice.lastID,
      invoiceNumber,
      mode: "create",
    });
  } catch (err) {
    try {
      await runAsync("ROLLBACK");
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR:", rollbackError);
    }
    console.error("SAVE INVOICE ERROR:", err);
    callback(err);
  }
};

exports.addNote = (text, callback) => {
  db.run("INSERT INTO notes (text) VALUES (?)", [text], function (err) {
    callback(err, { id: this.lastID, text });
  });
};

exports.deleteNote = (id, callback) => {
  db.run("DELETE FROM notes WHERE id = ?", [id], callback);
};

exports.searchItems = (search, callback) => {
  const query = `
    SELECT * FROM Item
    WHERE item_name LIKE ?
    ORDER BY item_id DESC
  `;

  db.all(query, [`%${search}%`], callback);
};

exports.convertQuotationToInvoice = async (quotationId, callback) => {
  try {
    const quotation = await getAsync(
      `SELECT * FROM Invoice WHERE invoice_id = ?`,
      [Number(quotationId)]
    );

    if (!quotation) {
      throw new Error("Quotation not found");
    }

    if (String(quotation.invoice_type || "").toLowerCase() !== "quotation") {
      throw new Error("Only quotations can be converted");
    }

    const items = await allAsync(
      `SELECT ii.qty, ii.rate, ii.amount, it.item_name AS item, it.hsn
       FROM InvoiceItem ii
       INNER JOIN Item it ON it.item_id = ii.item_id
       WHERE ii.invoice_id = ?
       ORDER BY ii.invoice_item_id ASC`,
      [Number(quotationId)]
    );

    const year = new Date(quotation.invoice_date).getFullYear();
    const invoiceNumber = await getNextInvoiceNumber("Invoice", year);
    const now = toDbNow();

    await runAsync("BEGIN TRANSACTION");

    const createdInvoice = await runAsync(
      `INSERT INTO Invoice (
        invoice_number, invoice_type, client_name, client_address, phone_number, invoice_date, gst_id,
        amount, round_off, grand_total, settle, settle_amount, pending_amount, created_at, updated_at, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        invoiceNumber,
        "Invoice",
        quotation.client_name,
        quotation.client_address,
        quotation.phone_number,
        quotation.invoice_date,
        quotation.gst_id,
        quotation.amount,
        quotation.round_off,
        quotation.grand_total,
        "pending",
        quotation.settle_amount,
        quotation.pending_amount,
        now,
        now,
      ]
    );

    await insertInvoiceItems(createdInvoice.lastID, normalizeItems(items));
    await runAsync("COMMIT");

    callback(null, {
      invoiceId: createdInvoice.lastID,
      invoiceNumber,
    });
  } catch (error) {
    try {
      await runAsync("ROLLBACK");
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR:", rollbackError);
    }
    console.error("CONVERT QUOTATION ERROR:", error);
    callback(error);
  }
};
