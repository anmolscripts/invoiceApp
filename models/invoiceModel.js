const db = require('./db');
const prisma = require('../models/prisma');
exports.getAllGst = (callback) => {
    db.all('SELECT * FROM gst ORDER BY GST_ID DESC', [], (err, rows) => {
        if (err) {
            console.error(err);
            return callback([]);
        }
        callback(rows);
    });
};

exports.saveInvoice = async (formData, callback) => {
    try {
        const {
            type,
            sitename,
            date,
            baseTotal,
            taxId,
            roundOff,
            grandTotal,
            items
        } = formData;

        const year = new Date().getFullYear();

        // 1️⃣ Generate invoice number
        const lastInvoice = await prisma.invoice.findFirst({
            where: {
                invoice_number: {
                    startsWith: `invoice/${year}/`
                }
            },
            orderBy: {
                invoice_id: 'desc'
            }
        });

        let nextNumber = 1;

        if (lastInvoice) {
            const last = parseInt(lastInvoice.invoice_number.split('/')[2]);
            nextNumber = last + 1;
        }

        const invoiceNumber = `invoice/${year}/${String(nextNumber).padStart(4, '0')}`;

        // 2️⃣ Create invoice
        const invoice = await prisma.invoice.create({
            data: {
                invoice_number: invoiceNumber,
                invoice_type: type,
                client_name: sitename,
                invoice_date: new Date(date),
                gst_id: taxId,
                amount: baseTotal,
                round_off: roundOff,
                grand_total: grandTotal,
                settle: "pending"
            }
        });

        // 3️⃣ Process items
        for (const item of items) {

            // 🔍 Check if item exists (HSN based)
            let existingItem = await prisma.item.findFirst({
                where: {
                    OR: [
                        { hsn: item.hsn },
                        { item_name: item.item }
                    ]
                }
            });

            // ➕ If not exist → insert
            if (!existingItem) {
                existingItem = await prisma.item.create({
                    data: {
                        item_name: item.item,
                        hsn: item.hsn
                    }
                });
            }

            // 4️⃣ Insert into invoice_items
            await prisma.invoiceItem.create({
                data: {
                    invoice_id: invoiceNumber,
                    item_id: existingItem.item_id,
                    qty: item.qty,
                    rate: item.rate,
                    amount: item.amount
                }
            });
        }

        callback(null, {
            invoiceId: invoice.invoice_id,
            invoiceNumber
        });

    } catch (err) {
        console.error("SAVE INVOICE ERROR:", err);
        callback(err);
    }
};

exports.addNote = (text, callback) => {
    db.run('INSERT INTO notes (text) VALUES (?)', [text], function (err) {
        callback(err, { id: this.lastID, text });
    });
};

exports.deleteNote = (id, callback) => {
    db.run('DELETE FROM notes WHERE id = ?', [id], callback);
};

exports.searchItems = (search, callback) => {
    const query = `
        SELECT * FROM item 
        WHERE item_name LIKE ?
        ORDER BY id DESC
    `;

    db.all(query, [`%${search}%`], callback);
};