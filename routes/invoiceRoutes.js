const express = require("express");
const router = express.Router();
const invoiceModel = require("../models/invoiceModel");
const prisma = require("../models/prisma");
const { rateConvert, formatDate } = require("../utils/utility");

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "admin") {
    req.setAuthCookie();
    return res.redirect("/");
  }

  res.status(401).render("login", {
    error: "Invalid username or password",
  });
});

router.post("/logout", (req, res) => {
  req.clearAuthCookie();
  res.redirect("/login");
});

router.get("/logout", (req, res) => {
  req.clearAuthCookie();
  res.redirect("/login");
});

// Page routes
router.get("/", async (req, res) => {
  try {
    const invoice = await prisma.invoice.findMany({
      orderBy: { invoice_id: "desc" },
      include: {
        gst: true,
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    const stats = invoice.reduce(
      (acc, entry) => {
        const type = (entry.invoice_type || "Record").toLowerCase();

        acc.totalRecords += 1;
        acc.totalValue += Number(entry.grand_total || 0);

        if (type === "invoice") acc.invoiceCount += 1;
        if (type === "quotation") acc.quotationCount += 1;

        return acc;
      },
      {
        totalRecords: 0,
        invoiceCount: 0,
        quotationCount: 0,
        totalValue: 0,
      }
    );

    res.render("list", { invoice, stats, rateConvert, formatDate });
  } catch (error) {
    console.error("Error loading invoice list:", error);
    res.status(500).send("Unable to load invoice list");
  }
});

router.get("/invoiceList", (req, res) => {
  res.redirect("/");
});

router.get("/edit/:id", async (req, res) => {
  const id = req.params.id;

  const invoice = await prisma.invoice.findUnique({
    where: { invoice_id: Number(id) },
    include: {
      gst: true,
      items: {
        include: {
          item: true,
        },
      },
    },
  });

  invoiceModel.getAllGst((gst) => {
    res.render("index", { invoice, gst });
  });
});

router.get("/add", (req, res) => {
  invoiceModel.getAllGst((gst) => {
    res.render("index", { gst, invoice: null });
  });
});

router.get("/convert/:id", (req, res) => {
  invoiceModel.convertQuotationToInvoice(req.params.id, (err, result) => {
    if (err) {
      console.error("Error converting quotation:", err);
      return res.status(500).send("Failed to convert quotation into invoice");
    }

    res.redirect(`/edit/${result.invoiceId}`);
  });
});

router.get("/api/search", async (req, res) => {
  const search = req.query.q || "";

  try {
    const items = await prisma.item.findMany({
      where: {
        OR: [
          { item_name: { contains: search } },
          { hsn: { contains: search } },
        ],
      },
      take: 10,
    });

    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// API routes
router.post("/saveInvoice", (req, res) => {
  const { formData } = req.body;

  invoiceModel.saveInvoice(formData, (err, result) => {
    if (err) {
      console.error("Error saving invoice:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to save invoice",
      });
    }

    res.json({
      success: true,
      message: result.mode === "update" ? "Invoice updated successfully" : "Invoice saved successfully",
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      mode: result.mode,
    });
  });
});

router.get("/delete/:id", (req, res) => {
  invoiceModel.deleteNote(req.params.id, () => {
    res.redirect("/");
  });
});

module.exports = router;
