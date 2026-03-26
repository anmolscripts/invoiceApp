const express = require("express");
const router = express.Router();
const invoiceModel = require("../models/invoiceModel");
const authModel = require("../models/authModel");
const { rateConvert, formatDate } = require("../utils/utility");

const buildInvoiceStats = (invoice = []) =>
  invoice.reduce(
    (acc, entry) => {
      const type = String(entry.invoice_type || "Record").toLowerCase();
      acc.totalRecords += 1;
      acc.totalValue += Number(entry.grand_total || 0);
      if (type === "invoice") acc.invoiceCount += 1;
      if (type === "quotation") acc.quotationCount += 1;
      if (type === "debit note") acc.debitNoteCount += 1;
      if (type === "credit note") acc.creditNoteCount += 1;
      return acc;
    },
    {
      totalRecords: 0,
      invoiceCount: 0,
      quotationCount: 0,
      debitNoteCount: 0,
      creditNoteCount: 0,
      totalValue: 0,
    }
  );

const ensureAdmin = (req, res, next) => {
  if (String(req.currentUser?.role || "").toLowerCase() !== "admin") {
    return res.status(403).send("Admin access required");
  }
  next();
};

const ensureEditor = (req, res, next) => {
  if (!authModel.canEdit(req.currentUser)) {
    return res.status(403).send("Edit permission required");
  }
  next();
};

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await authModel.getUserForLogin(username, password);

    if (!user) {
      return res.status(401).render("login", {
        error: "Invalid user ID or password",
      });
    }

    req.setAuthCookie(user.app_user_id);
    res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).render("login", {
      error: "Unable to process login",
    });
  }
});

router.get("/setup-password/:token", async (req, res) => {
  const setupToken = await authModel.getSetupToken(req.params.token);
  if (!setupToken) return res.status(404).send("Setup link is invalid or expired");
  res.render("users/setup-password", { token: req.params.token, user: setupToken.appUser, error: null });
});

router.post("/setup-password/:token", async (req, res) => {
  try {
    const { password, confirm_password } = req.body;
    if (!password || password !== confirm_password) {
      const setupToken = await authModel.getSetupToken(req.params.token);
      return res.status(400).render("users/setup-password", {
        token: req.params.token,
        user: setupToken?.appUser || null,
        error: "Passwords do not match",
      });
    }

    await authModel.completePasswordSetup(req.params.token, password);
    res.redirect("/login");
  } catch (error) {
    console.error("Password setup error:", error);
    res.status(500).send(error.message || "Unable to set password");
  }
});

router.post("/logout", (req, res) => {
  req.clearAuthCookie();
  res.redirect("/login");
});

router.get("/logout", (req, res) => {
  req.clearAuthCookie();
  res.redirect("/login");
});

router.get("/", async (req, res) => {
  try {
    const dashboard = await invoiceModel.getDashboardData();
    res.render("dashboard", {
      ...dashboard,
      rateConvert,
      formatDate,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send("Unable to load dashboard");
  }
});

router.get("/invoices", async (req, res) => {
  try {
    const invoice = await invoiceModel.getInvoiceList();
    const stats = buildInvoiceStats(invoice);
    res.render("list", { invoice, stats, rateConvert, formatDate });
  } catch (error) {
    console.error("Error loading invoice list:", error);
    res.status(500).send("Unable to load invoice list");
  }
});

router.get("/invoiceList", (req, res) => {
  res.redirect("/invoices");
});

router.get("/add", ensureEditor, async (req, res) => {
  try {
    const lookups = await invoiceModel.getFormLookups();
    res.render("index", { ...lookups, invoice: null, projects: [] });
  } catch (error) {
    console.error("Error loading invoice form:", error);
    res.status(500).send("Unable to load invoice form");
  }
});

router.get("/edit/:id", ensureEditor, async (req, res) => {
  try {
    const [invoice, lookups] = await Promise.all([
      invoiceModel.getInvoiceById(req.params.id),
      invoiceModel.getFormLookups(),
    ]);

    if (!invoice) return res.status(404).send("Invoice not found");

    const projects = invoice.client_id
      ? await invoiceModel.getProjectsByClient(invoice.client_id)
      : invoice.project_id
        ? await invoiceModel.getProjectsByClient(invoice.project.client_id)
        : [];

    res.render("index", { ...lookups, invoice, projects });
  } catch (error) {
    console.error("Error loading invoice:", error);
    res.status(500).send("Unable to load invoice");
  }
});

router.get("/convert/:id", ensureEditor, async (req, res) => {
  try {
    const result = await invoiceModel.convertQuotationToInvoice(req.params.id, req.currentUser?.user_code);
    res.redirect(`/edit/${result.invoiceId}`);
  } catch (error) {
    console.error("Error converting quotation:", error);
    res.status(500).send("Failed to convert quotation into invoice");
  }
});

router.get("/clients", async (req, res) => {
  try {
    const clients = await invoiceModel.getClientsList();
    const stats = clients.reduce(
      (acc, client) => {
        acc.totalClients += 1;
        acc.totalProjects += client._count.projects;
        acc.totalInvoices += client._count.invoices;
        return acc;
      },
      { totalClients: 0, totalProjects: 0, totalInvoices: 0 }
    );

    res.render("clients/list", { clients, stats });
  } catch (error) {
    console.error("Error loading clients:", error);
    res.status(500).send("Unable to load clients");
  }
});

router.get("/clients/add", ensureEditor, (req, res) => {
  res.render("clients/form", { client: null });
});

router.get("/clients/edit/:id", ensureEditor, async (req, res) => {
  try {
    const client = await invoiceModel.getClientById(req.params.id);
    if (!client) return res.status(404).send("Client not found");
    res.render("clients/form", { client });
  } catch (error) {
    console.error("Error loading client:", error);
    res.status(500).send("Unable to load client");
  }
});

router.post("/clients/save", ensureEditor, async (req, res) => {
  try {
    const client = await invoiceModel.saveClient(req.body, req.currentUser?.user_code);
    res.redirect(`/clients/${client.client_id}`);
  } catch (error) {
    console.error("Error saving client:", error);
    res.status(500).send(error.message || "Unable to save client");
  }
});

router.get("/clients/:id", async (req, res) => {
  try {
    const result = await invoiceModel.getClientDashboard(req.params.id);
    if (!result) return res.status(404).send("Client not found");
    res.render("clients/dashboard", {
      client: result.client,
      stats: result.stats,
      rateConvert,
      formatDate,
    });
  } catch (error) {
    console.error("Error loading client dashboard:", error);
    res.status(500).send("Unable to load client dashboard");
  }
});

router.get("/projects", async (req, res) => {
  try {
    const projects = await invoiceModel.getProjectsList();
    const stats = projects.reduce(
      (acc, project) => {
        acc.totalProjects += 1;
        if (String(project.status || "").toLowerCase() === "active") acc.activeProjects += 1;
        acc.totalInvoices += project._count.invoices;
        return acc;
      },
      { totalProjects: 0, activeProjects: 0, totalInvoices: 0 }
    );

    res.render("projects/list", { projects, stats, rateConvert });
  } catch (error) {
    console.error("Error loading projects:", error);
    res.status(500).send("Unable to load projects");
  }
});

router.get("/projects/add", ensureEditor, async (req, res) => {
  try {
    const { clients } = await invoiceModel.getFormLookups();
    res.render("projects/form", { project: null, clients });
  } catch (error) {
    console.error("Error loading project form:", error);
    res.status(500).send("Unable to load project form");
  }
});

router.get("/projects/edit/:id", ensureEditor, async (req, res) => {
  try {
    const [{ clients }, project] = await Promise.all([
      invoiceModel.getFormLookups(),
      invoiceModel.getProjectById(req.params.id),
    ]);

    if (!project) return res.status(404).send("Project not found");
    res.render("projects/form", { project, clients });
  } catch (error) {
    console.error("Error loading project:", error);
    res.status(500).send("Unable to load project");
  }
});

router.post("/projects/save", ensureEditor, async (req, res) => {
  try {
    const project = await invoiceModel.saveProject(req.body, req.currentUser?.user_code);
    res.redirect(`/projects/${project.project_id}`);
  } catch (error) {
    console.error("Error saving project:", error);
    res.status(500).send(error.message || "Unable to save project");
  }
});

router.get("/projects/:id", async (req, res) => {
  try {
    const result = await invoiceModel.getProjectDashboard(req.params.id);
    if (!result) return res.status(404).send("Project not found");
    res.render("projects/dashboard", {
      project: result.project,
      stats: result.stats,
      rateConvert,
      formatDate,
    });
  } catch (error) {
    console.error("Error loading project dashboard:", error);
    res.status(500).send("Unable to load project dashboard");
  }
});

router.get("/settlements", async (req, res) => {
  try {
    const invoices = await invoiceModel.getSettlementsDashboard();
    res.render("settlements/list", { invoices, rateConvert, formatDate });
  } catch (error) {
    console.error("Error loading settlements:", error);
    res.status(500).send("Unable to load settlements");
  }
});

router.get("/settlements/:invoiceId", ensureEditor, async (req, res) => {
  try {
    const invoice = await invoiceModel.getSettlementInvoice(req.params.invoiceId);
    if (!invoice) return res.status(404).send("Invoice not found");
    res.render("settlements/form", { invoice, rateConvert, formatDate });
  } catch (error) {
    console.error("Error loading settlement invoice:", error);
    res.status(500).send("Unable to load settlement invoice");
  }
});

router.post("/settlements/save", ensureEditor, async (req, res) => {
  try {
    await invoiceModel.saveSettlement(req.body, req.currentUser?.user_code);
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving settlement:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Unable to save settlement",
    });
  }
});

router.get("/finance", async (req, res) => {
  try {
    const finance = await invoiceModel.getFinanceDashboard(req.query || {});
    res.render("finance/dashboard", { ...finance, rateConvert, formatDate });
  } catch (error) {
    console.error("Error loading finance dashboard:", error);
    res.status(500).send("Unable to load finance dashboard");
  }
});

router.get("/history", async (req, res) => {
  try {
    const config = invoiceModel.getHistorySearchConfig();
    const filters = {
      entity: req.query.entity || "",
      field: req.query.field || "",
      operator: req.query.operator || "contains",
      value: req.query.value || "",
    };

    const [history, searchResults] = await Promise.all([
      invoiceModel.getActivityHistory(150),
      filters.entity && filters.field && filters.value
        ? invoiceModel.searchHistoryRecords(filters)
        : Promise.resolve([]),
    ]);

    res.render("history/list", {
      history,
      searchResults,
      historyConfig: config,
      filters,
      formatDate,
    });
  } catch (error) {
    console.error("Error loading history:", error);
    res.status(500).send("Unable to load history");
  }
});

router.get("/timeline/:table/:id", async (req, res) => {
  try {
    const result = await invoiceModel.getRecordTimeline(req.params.table, req.params.id);
    res.render("history/timeline", { ...result, formatDate });
  } catch (error) {
    console.error("Error loading timeline:", error);
    res.status(500).send(error.message || "Unable to load timeline");
  }
});

router.get("/users", ensureAdmin, async (req, res) => {
  const [users, modules] = await Promise.all([
    authModel.getUsersList(),
    authModel.getModulesList(),
  ]);
  res.render("users/list", { users, modules });
});

router.get("/users/add", ensureAdmin, async (req, res) => {
  const modules = await authModel.getModulesList();
  res.render("users/form", { user: null, modules, setupLink: null });
});

router.get("/users/edit/:id", ensureAdmin, async (req, res) => {
  const [user, modules] = await Promise.all([
    authModel.getUserById(req.params.id),
    authModel.getModulesList(),
  ]);
  if (!user) return res.status(404).send("User not found");
  res.render("users/form", { user, modules, setupLink: null });
});

router.post("/users/save", ensureAdmin, async (req, res) => {
  try {
    const result = await authModel.saveUser(req.body, req.currentUser?.user_code);
    const setupLink = `${req.protocol}://${req.get("host")}/setup-password/${result.token}`;
    const modules = await authModel.getModulesList();
    const user = await authModel.getUserById(result.user.app_user_id);
    res.render("users/form", { user, modules, setupLink });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).send(error.message || "Unable to save user");
  }
});

router.get("/api/search", async (req, res) => {
  try {
    const items = await invoiceModel.searchItems(req.query.q || "");
    res.json(items);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/api/clients/:id/projects", async (req, res) => {
  try {
    const projects = await invoiceModel.getProjectsByClient(req.params.id);
    res.json(projects);
  } catch (error) {
    console.error("Client projects API error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/saveInvoice", async (req, res) => {
  try {
    const result = await invoiceModel.saveInvoice(req.body.formData || {}, req.currentUser?.user_code);
    res.json({
      success: true,
      message: result.mode === "update" ? "Invoice updated successfully" : "Invoice saved successfully",
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      mode: result.mode,
    });
  } catch (error) {
    console.error("Error saving invoice:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to save invoice",
    });
  }
});

router.get("/delete/:id", async (req, res) => {
  try {
    if (!authModel.canDelete(req.currentUser)) {
      return res.status(403).send("Delete permission required");
    }
    await invoiceModel.deleteInvoice(req.params.id, req.currentUser?.user_code);
    res.redirect("/invoices");
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).send("Unable to delete invoice");
  }
});

module.exports = router;
