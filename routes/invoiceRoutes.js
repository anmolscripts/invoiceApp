const express = require('express');
const router = express.Router();
const invoiceModel = require('../models/invoiceModel');
const prisma = require('../models/prisma');
// Page routes
router.get('/', (req, res) => {
    invoiceModel.getAllGst((gst) => {
        res.render('index', { gst }); // ✅ object pass karo
    });
});
router.get('/add', (req, res) => {
    res.render('index');
});

router.get('/api/search', async (req, res) => {
    const search = req.query.q || '';

    try {
        const items = await prisma.item.findMany({
            where: {
                OR: [
                    { item_name: { contains: search } },
                    { hsn: { contains: search } }
                ]
            },
            take: 10
        });

        res.json(items);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// API routes
router.post('/add', (req, res) => {
    const { text } = req.body;

    invoiceModel.addNote(text, (err) => {
        res.redirect('/');
    });
});

router.get('/delete/:id', (req, res) => {
    invoiceModel.deleteNote(req.params.id, () => {
        res.redirect('/');
    });
});

module.exports = router;