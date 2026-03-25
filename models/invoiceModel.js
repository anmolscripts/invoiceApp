const prisma = require("./prisma");

const invoiceInclude = {
  gst: true,
  client: true,
  project: {
    include: {
      client: true,
    },
  },
  items: {
    include: {
      item: true,
    },
    orderBy: {
      invoice_item_id: "asc",
    },
  },
  settlements: {
    include: {
      documents: true,
    },
    orderBy: {
      settlement_date: "desc",
    },
  },
};

const clientDashboardInclude = {
  projects: {
    where: { active: true },
    include: {
      _count: {
        select: {
          invoices: {
            where: { active: true },
          },
        },
      },
    },
    orderBy: {
      updated_at: "desc",
    },
  },
  invoices: {
    where: { active: true },
    include: {
      gst: true,
      project: true,
      items: {
        include: {
          item: true,
        },
      },
      settlements: {
        include: {
          documents: true,
        },
      },
    },
    orderBy: {
      invoice_date: "desc",
    },
  },
};

const projectDashboardInclude = {
  client: true,
  invoices: {
    where: { active: true },
    include: {
      gst: true,
      items: {
        include: {
          item: true,
        },
      },
      settlements: {
        include: {
          documents: true,
        },
      },
    },
    orderBy: {
      invoice_date: "desc",
    },
  },
  settlements: {
    where: { active: true },
    include: {
      documents: true,
      invoice: true,
    },
    orderBy: {
      settlement_date: "desc",
    },
  },
};

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

const toDate = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const parseTags = (value = "") =>
  String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const getInvoicePrefix = (type = "") => {
  const normalized = String(type).trim().toLowerCase();
  if (normalized === "quotation") return "QUOT";
  if (normalized === "debit note") return "DEBIT";
  if (normalized === "credit note") return "CREDIT";
  return "INVO";
};

const getCodeConfig = (type) => {
  if (type === "client") {
    return {
      model: "client",
      field: "client_no",
      prefix: "CLIE",
    };
  }

  return {
    model: "project",
    field: "project_no",
    prefix: "PROJ",
  };
};

const nextPeriodicDate = (project, fromDate = new Date()) => {
  const baseDate = toDate(project.last_billed_at) || toDate(project.billing_cycle_anchor_date) || toDate(project.start_date) || fromDate;
  const nextDate = new Date(baseDate);
  const cycleType = String(project.billing_cycle_type || "").toLowerCase();

  if (cycleType === "monthly") {
    nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  }

  if (cycleType === "quarterly") {
    nextDate.setMonth(nextDate.getMonth() + 3);
    return nextDate;
  }

  if (cycleType === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return nextDate;
  }

  if (cycleType === "custom" && Number(project.billing_cycle_interval_days || 0) > 0) {
    nextDate.setDate(nextDate.getDate() + Number(project.billing_cycle_interval_days));
    return nextDate;
  }

  return null;
};

const calculatePendingAmount = (invoice) => {
  const settled = Number(invoice.settle_amount || 0);
  const grand = Number(invoice.grand_total || 0);
  return Number((grand - settled).toFixed(2));
};

const isInvoiceSettled = (invoice) => calculatePendingAmount(invoice) <= 0;

const createHistoryEntry = async (tx, tableName, recordId, action, payload = {}, links = {}) =>
  tx.activityHistory.create({
    data: {
      table_name: tableName,
      record_id: Number(recordId),
      action,
      payload_json: JSON.stringify(payload),
      invoice_id: links.invoice_id || null,
      project_id: links.project_id || null,
      settlement_id: links.settlement_id || null,
    },
  });

const getNextRunningCode = async (type) => {
  const { model, field, prefix } = getCodeConfig(type);
  const year = new Date().getFullYear();
  const startsWith = `${prefix}/${year}/`;

  const latest = await prisma[model].findFirst({
    where: {
      [field]: {
        startsWith,
      },
    },
    orderBy: {
      [field]: "desc",
    },
    select: {
      [field]: true,
    },
  });

  const current = latest?.[field] || "";
  const serial = Number((current.split("/")[2] || "0").replace(/^0+/, "") || "0") + 1;
  return `${prefix}/${year}/${String(serial).padStart(4, "0")}`;
};

const getNextInvoiceNumber = async (type, invoiceDate) => {
  const year = new Date(invoiceDate).getFullYear();
  const prefix = getInvoicePrefix(type);
  const latest = await prisma.invoice.findFirst({
    where: {
      invoice_number: {
        startsWith: `${prefix}/${year}/`,
      },
    },
    orderBy: {
      invoice_number: "desc",
    },
    select: {
      invoice_number: true,
    },
  });

  const serial = Number((latest?.invoice_number?.split("/")[2] || "0").replace(/^0+/, "") || "0") + 1;
  return `${prefix}/${year}/${String(serial).padStart(4, "0")}`;
};

const findOrCreateItem = async (tx, entry) => {
  const existingItem = await tx.item.findFirst({
    where: {
      OR: [
        entry.hsn
          ? {
              AND: [{ hsn: entry.hsn }, { item_name: entry.item }],
            }
          : undefined,
        { item_name: entry.item },
      ].filter(Boolean),
    },
    orderBy: {
      item_id: "desc",
    },
  });

  if (existingItem?.item_id) return existingItem.item_id;

  const createdItem = await tx.item.create({
    data: {
      item_name: entry.item,
      hsn: entry.hsn,
      active: true,
    },
  });

  await createHistoryEntry(tx, "Item", createdItem.item_id, "INSERT", createdItem);
  return createdItem.item_id;
};

const buildDashboardStats = (records = []) =>
  records.reduce(
    (acc, entry) => {
      const type = String(entry.invoice_type || "Record").toLowerCase();
      const grandTotal = Number(entry.grand_total || 0);

      acc.totalRecords += 1;
      acc.totalValue += grandTotal;

      if (type === "invoice") {
        acc.invoiceCount += 1;
        acc.invoiceValue += grandTotal;
      }

      if (type === "quotation") {
        acc.quotationCount += 1;
        acc.quotationValue += grandTotal;
      }

      if (type === "debit note") {
        acc.debitNoteCount += 1;
      }

      if (type === "credit note") {
        acc.creditNoteCount += 1;
      }

      return acc;
    },
    {
      totalRecords: 0,
      totalValue: 0,
      invoiceCount: 0,
      invoiceValue: 0,
      quotationCount: 0,
      quotationValue: 0,
      debitNoteCount: 0,
      creditNoteCount: 0,
    }
  );

const enrichInvoiceFinancials = (invoice) => ({
  ...invoice,
  settle_amount: Number(invoice.settle_amount || 0),
  pending_amount:
    invoice.pending_amount !== null && invoice.pending_amount !== undefined
      ? Number(invoice.pending_amount)
      : calculatePendingAmount(invoice),
});

const persistSettlementDocuments = (settlementId, documents = []) => {
  return documents.map((document) => ({
    settlement_id: settlementId,
    file_name: document.name || `attachment-${Date.now()}`,
    file_path: null,
    file_data: document.content || null,
    mime_type: document.type || null,
  }));
};

const getBillingDueProjects = async () => {
  const today = new Date();
  const projects = await prisma.project.findMany({
    where: { active: true },
    include: {
      client: true,
      invoices: {
        where: { active: true },
        orderBy: { invoice_date: "desc" },
        take: 1,
      },
    },
    orderBy: { updated_at: "desc" },
  });

  const dueProjects = [];

  for (const project of projects) {
    const cycleType = String(project.billing_cycle_type || "").toLowerCase();
    const nextDate = toDate(project.billing_cycle_next_date) || nextPeriodicDate(project);
    const isProjectDoneDue =
      cycleType === "project done" &&
      String(project.status || "").toLowerCase() === "completed" &&
      !project.invoices.some((invoice) => String(invoice.invoice_type || "").toLowerCase() === "invoice");

    const isPeriodicDue =
      ["monthly", "quarterly", "yearly", "custom"].includes(cycleType) &&
      nextDate &&
      nextDate <= today;

    if (isProjectDoneDue || isPeriodicDue) {
      dueProjects.push({
        ...project,
        billing_due_date: isProjectDoneDue ? today : nextDate,
      });
    }
  }

  return dueProjects;
};

exports.getFormLookups = async () => {
  const [gst, clients] = await Promise.all([
    prisma.gst.findMany({
      where: { active: true },
      orderBy: { GST_ID: "desc" },
    }),
    prisma.client.findMany({
      where: { active: true },
      orderBy: { client_name: "asc" },
      select: {
        client_id: true,
        client_name: true,
        client_no: true,
        phone_number: true,
        billing_address: true,
      },
    }),
  ]);

  return { gst, clients };
};

exports.getProjectsByClient = async (clientId) =>
  prisma.project.findMany({
    where: {
      active: true,
      client_id: Number(clientId),
    },
    orderBy: { project_name: "asc" },
    include: {
      client: {
        select: {
          client_id: true,
          client_name: true,
          phone_number: true,
          billing_address: true,
        },
      },
    },
  });

exports.getDashboardData = async () => {
  const [clients, projects, invoices, dueProjects] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      orderBy: { updated_at: "desc" },
      take: 5,
      include: {
        _count: {
          select: {
            projects: {
              where: { active: true },
            },
            invoices: {
              where: { active: true },
            },
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { active: true },
      orderBy: { updated_at: "desc" },
      take: 5,
      include: {
        client: true,
        _count: {
          select: {
            invoices: {
              where: { active: true },
            },
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: { active: true },
      orderBy: { invoice_date: "desc" },
      take: 5,
      include: {
        client: true,
        project: true,
      },
    }),
    getBillingDueProjects(),
  ]);

  const allInvoices = await prisma.invoice.findMany({
    where: { active: true },
    include: {
      client: true,
      project: true,
      settlements: true,
    },
  });

  return {
    clients,
    projects,
    invoices,
    dueProjects,
    stats: {
      totalClients: await prisma.client.count({ where: { active: true } }),
      totalProjects: await prisma.project.count({ where: { active: true } }),
      totalInvoices: allInvoices.filter((entry) => String(entry.invoice_type || "").toLowerCase() === "invoice").length,
      totalQuotations: allInvoices.filter((entry) => String(entry.invoice_type || "").toLowerCase() === "quotation").length,
      totalBusiness: allInvoices.reduce((sum, entry) => sum + Number(entry.grand_total || 0), 0),
    },
  };
};

exports.getInvoiceList = async () =>
  (await prisma.invoice.findMany({
    where: { active: true },
    orderBy: { invoice_id: "desc" },
    include: invoiceInclude,
  })).map(enrichInvoiceFinancials);

exports.getInvoiceById = async (id) => {
  const invoice = await prisma.invoice.findUnique({
    where: { invoice_id: Number(id) },
    include: invoiceInclude,
  });
  return invoice ? enrichInvoiceFinancials(invoice) : null;
};

exports.searchItems = async (search = "") =>
  prisma.item.findMany({
    where: {
      active: true,
      OR: [{ item_name: { contains: search } }, { hsn: { contains: search } }],
    },
    take: 10,
    orderBy: { item_name: "asc" },
  });

exports.saveInvoice = async (formData, actorUserCode = "system") => {
  const normalizedItems = normalizeItems(formData.items);
  const invoiceDate = toDate(formData.date) || new Date();
  const type = String(formData.type || "").trim();
  const clientId = formData.clientId ? Number(formData.clientId) : null;
  const projectId = formData.projectId ? Number(formData.projectId) : null;
  const invoiceNumber = formData.recordId ? null : await getNextInvoiceNumber(type, invoiceDate);

  if (!type || !clientId || !projectId || !normalizedItems.length) {
    throw new Error("Invoice type, client, project, and items are required");
  }

  return prisma.$transaction(
    async (tx) => {
      const project = await tx.project.findUnique({
        where: { project_id: projectId },
        include: { client: true },
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const client = project.client || (await tx.client.findUnique({ where: { client_id: clientId } }));
      if (!client) {
        throw new Error("Client not found");
      }

      const snapshotName = project.project_name || client.client_name;
      const snapshotAddress = project.site_address || client.billing_address || null;
      const snapshotPhone = client.phone_number || null;
      const paidAmount = Number(formData.settleAmount || 0);
      const grandTotal = Number(formData.grandTotal || 0);

      const invoicePayload = {
        invoice_type: type,
        tags: parseTags(formData.tags || "").join(", "),
        client_id: client.client_id,
        project_id: project.project_id,
        client_name: snapshotName,
        client_address: snapshotAddress,
        phone_number: snapshotPhone,
        invoice_date: invoiceDate,
        gst_id: formData.taxId ? Number(formData.taxId) : null,
        amount: Number(formData.baseTotal || 0),
        round_off: Number(formData.roundOff || 0),
        grand_total: grandTotal,
        settle: paidAmount >= grandTotal && grandTotal > 0 ? "settled" : String(formData.settle || "pending"),
        settle_amount: paidAmount,
        pending_amount: Number((grandTotal - paidAmount).toFixed(2)),
        updated_by: actorUserCode,
        active: true,
      };

      let invoice;
      let mode;

      if (formData.recordId) {
        const existing = await tx.invoice.findUnique({
          where: { invoice_id: Number(formData.recordId) },
        });

        if (!existing) {
          throw new Error("Invoice not found");
        }

        invoice = await tx.invoice.update({
          where: { invoice_id: Number(formData.recordId) },
          data: invoicePayload,
        });

        await tx.invoiceItem.deleteMany({
          where: { invoice_id: invoice.invoice_id },
        });

        await createHistoryEntry(tx, "Invoice", invoice.invoice_id, "UPDATE", {
          updated_fields: invoicePayload,
        }, {
          invoice_id: invoice.invoice_id,
          project_id: invoice.project_id,
        });

        mode = "update";
      } else {
        invoice = await tx.invoice.create({
          data: {
            ...invoicePayload,
            invoice_number: invoiceNumber,
            created_by: actorUserCode,
          },
        });

        await createHistoryEntry(tx, "Invoice", invoice.invoice_id, "INSERT", invoice, {
          invoice_id: invoice.invoice_id,
          project_id: invoice.project_id,
        });

        mode = "create";
      }

      const invoiceItemsData = [];
      for (const entry of normalizedItems) {
        const itemId = await findOrCreateItem(tx, entry);
        invoiceItemsData.push({
          item_id: itemId,
          invoice_id: invoice.invoice_id,
          qty: entry.qty,
          rate: entry.rate,
          amount: entry.amount,
          active: true,
        });
      }

      if (invoiceItemsData.length) {
        await tx.invoiceItem.createMany({
          data: invoiceItemsData,
        });
      }

      const nextBillingDate = nextPeriodicDate(project, invoiceDate);
      if (nextBillingDate || String(project.billing_cycle_type || "").toLowerCase() === "project done") {
        await tx.project.update({
          where: { project_id: project.project_id },
          data: {
            last_billed_at: invoiceDate,
            billing_cycle_next_date:
              String(project.billing_cycle_type || "").toLowerCase() === "project done"
                ? null
                : nextBillingDate,
          },
        });
      }

      return {
        invoiceId: invoice.invoice_id,
        invoiceNumber: invoice.invoice_number,
        mode,
      };
    },
    { timeout: 20000 }
  );
};

exports.convertQuotationToInvoice = async (quotationId, actorUserCode = "system") => {
  const quotation = await prisma.invoice.findUnique({
    where: { invoice_id: Number(quotationId) },
    include: {
      items: true,
    },
  });

  if (!quotation) {
    throw new Error("Quotation not found");
  }

  if (String(quotation.invoice_type || "").toLowerCase() !== "quotation") {
    throw new Error("Only quotations can be converted");
  }

  const invoiceNumber = await getNextInvoiceNumber("Invoice", quotation.invoice_date);

  return prisma.$transaction(
    async (tx) => {
      const createdInvoice = await tx.invoice.create({
        data: {
          invoice_number: invoiceNumber,
          invoice_type: "Invoice",
          tags: quotation.tags,
          client_id: quotation.client_id,
          project_id: quotation.project_id,
          client_name: quotation.client_name,
          client_address: quotation.client_address,
          phone_number: quotation.phone_number,
          invoice_date: quotation.invoice_date,
          gst_id: quotation.gst_id,
          amount: quotation.amount,
          round_off: quotation.round_off,
          grand_total: quotation.grand_total,
          settle: "pending",
          settle_amount: quotation.settle_amount,
          pending_amount: quotation.grand_total,
          created_by: actorUserCode,
          updated_by: actorUserCode,
          active: true,
        },
      });

      if (quotation.items.length) {
        await tx.invoiceItem.createMany({
          data: quotation.items.map((entry) => ({
            item_id: entry.item_id,
            invoice_id: createdInvoice.invoice_id,
            qty: entry.qty,
            rate: entry.rate,
            amount: entry.amount,
            active: true,
          })),
        });
      }

      await createHistoryEntry(tx, "Invoice", createdInvoice.invoice_id, "INSERT", createdInvoice, {
        invoice_id: createdInvoice.invoice_id,
        project_id: createdInvoice.project_id,
      });

      return {
        invoiceId: createdInvoice.invoice_id,
        invoiceNumber,
      };
    },
    { timeout: 20000 }
  );
};

exports.deleteInvoice = async (id, actorUserCode = "system") =>
  prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.update({
      where: { invoice_id: Number(id) },
      data: { active: false, updated_by: actorUserCode },
    });

    await createHistoryEntry(tx, "Invoice", invoice.invoice_id, "DELETE", invoice, {
      invoice_id: invoice.invoice_id,
      project_id: invoice.project_id,
    });

    return invoice;
  });

exports.getClientsList = async () =>
  prisma.client.findMany({
    where: { active: true },
    orderBy: { updated_at: "desc" },
    include: {
      _count: {
        select: {
          projects: {
            where: { active: true },
          },
          invoices: {
            where: { active: true },
          },
        },
      },
      projects: {
        where: { active: true },
        select: {
          project_id: true,
          project_name: true,
          status: true,
          project_no: true,
        },
        take: 3,
        orderBy: { updated_at: "desc" },
      },
    },
  });

exports.getClientById = async (id) =>
  prisma.client.findUnique({
    where: { client_id: Number(id) },
  });

exports.saveClient = async (payload, actorUserCode = "system") => {
  const data = {
    client_name: String(payload.client_name || "").trim(),
    contact_person: payload.contact_person?.trim() || null,
    email: payload.email?.trim() || null,
    phone_number: payload.phone_number?.trim() || null,
    alternate_phone: payload.alternate_phone?.trim() || null,
    gstin: payload.gstin?.trim() || null,
    billing_address: payload.billing_address?.trim() || null,
    shipping_address: payload.shipping_address?.trim() || null,
    city: payload.city?.trim() || null,
    state: payload.state?.trim() || null,
    country: payload.country?.trim() || null,
    postal_code: payload.postal_code?.trim() || null,
    notes: payload.notes?.trim() || null,
    active: true,
  };

  if (!data.client_name) {
    throw new Error("Client name is required");
  }

  return prisma.$transaction(async (tx) => {
    if (payload.client_id) {
      const client = await tx.client.update({
        where: { client_id: Number(payload.client_id) },
        data: {
          ...data,
          updated_by: actorUserCode,
        },
      });

      await createHistoryEntry(tx, "Client", client.client_id, "UPDATE", {
        updated_fields: data,
      });
      return client;
    }

    const client_no = await getNextRunningCode("client");
    const client = await tx.client.create({
      data: {
        ...data,
        client_no,
        client_code: client_no,
        created_by: actorUserCode,
        updated_by: actorUserCode,
      },
    });

    await createHistoryEntry(tx, "Client", client.client_id, "INSERT", client);
    return client;
  });
};

exports.getClientDashboard = async (id) => {
  const client = await prisma.client.findUnique({
    where: { client_id: Number(id) },
    include: clientDashboardInclude,
  });

  if (!client) return null;

  return {
    client: {
      ...client,
      invoices: client.invoices.map(enrichInvoiceFinancials),
    },
    stats: buildDashboardStats(client.invoices),
  };
};

exports.getProjectsList = async () =>
  prisma.project.findMany({
    where: { active: true },
    orderBy: { updated_at: "desc" },
    include: {
      client: true,
      _count: {
        select: {
          invoices: {
            where: { active: true },
          },
        },
      },
    },
  });

exports.getProjectById = async (id) =>
  prisma.project.findUnique({
    where: { project_id: Number(id) },
    include: {
      client: true,
    },
  });

exports.saveProject = async (payload, actorUserCode = "system") => {
  const billingCycleType = payload.billing_cycle_type || "Monthly";
  const billingCycleAnchorDate = toDate(payload.billing_cycle_anchor_date) || toDate(payload.start_date) || new Date();
  const data = {
    client_id: Number(payload.client_id),
    project_name: String(payload.project_name || "").trim(),
    project_type: payload.project_type?.trim() || null,
    status: payload.status?.trim() || "Active",
    billing_cycle_type: billingCycleType,
    billing_cycle_interval_days:
      billingCycleType === "Custom" ? Number(payload.billing_cycle_interval_days || 0) || null : null,
    billing_cycle_custom_value:
      billingCycleType === "Custom" ? Number(payload.billing_cycle_custom_value || 0) || null : null,
    billing_cycle_custom_unit: billingCycleType === "Custom" ? payload.billing_cycle_custom_unit?.trim() || null : null,
    billing_cycle_anchor_date: billingCycleAnchorDate,
    billing_cycle_next_date:
      String(billingCycleType).toLowerCase() === "project done" ? null : nextPeriodicDate({
        billing_cycle_type: billingCycleType,
        billing_cycle_interval_days: payload.billing_cycle_interval_days,
        start_date: billingCycleAnchorDate,
        billing_cycle_anchor_date: billingCycleAnchorDate,
      }, billingCycleAnchorDate),
    billing_cycle_notes: payload.billing_cycle_notes?.trim() || null,
    site_address: payload.site_address?.trim() || null,
    city: payload.city?.trim() || null,
    state: payload.state?.trim() || null,
    country: payload.country?.trim() || null,
    postal_code: payload.postal_code?.trim() || null,
    start_date: toDate(payload.start_date),
    end_date: toDate(payload.end_date),
    budget: payload.budget ? Number(payload.budget) : null,
    description: payload.description?.trim() || null,
    active: true,
  };

  if (!data.client_id || !data.project_name) {
    throw new Error("Client and project name are required");
  }

  return prisma.$transaction(async (tx) => {
    if (payload.project_id) {
      const project = await tx.project.update({
        where: { project_id: Number(payload.project_id) },
        data: {
          ...data,
          updated_by: actorUserCode,
        },
      });

      await createHistoryEntry(tx, "Project", project.project_id, "UPDATE", {
        updated_fields: data,
      }, {
        project_id: project.project_id,
      });

      return project;
    }

    const project_no = await getNextRunningCode("project");
    const project = await tx.project.create({
      data: {
        ...data,
        project_no,
        project_code: project_no,
        created_by: actorUserCode,
        updated_by: actorUserCode,
      },
    });

    await createHistoryEntry(tx, "Project", project.project_id, "INSERT", project, {
      project_id: project.project_id,
    });

    return project;
  });
};

exports.getProjectDashboard = async (id) => {
  const project = await prisma.project.findUnique({
    where: { project_id: Number(id) },
    include: projectDashboardInclude,
  });

  if (!project) return null;

  return {
    project: {
      ...project,
      invoices: project.invoices.map(enrichInvoiceFinancials),
    },
    stats: buildDashboardStats(project.invoices),
  };
};

exports.getSettlementsDashboard = async () =>
  (await prisma.invoice.findMany({
    where: {
      active: true,
      invoice_type: {
        in: ["Invoice", "Debit Note", "Credit Note"],
      },
    },
    include: invoiceInclude,
    orderBy: {
      invoice_date: "desc",
    },
  })).map(enrichInvoiceFinancials);

exports.getSettlementInvoice = async (invoiceId) => {
  const invoice = await prisma.invoice.findUnique({
    where: { invoice_id: Number(invoiceId) },
    include: invoiceInclude,
  });

  return invoice ? enrichInvoiceFinancials(invoice) : null;
};

exports.saveSettlement = async (payload, actorUserCode = "system") => {
  const invoiceId = Number(payload.invoice_id);
  const amount = Number(payload.amount || 0);
  const documents = Array.isArray(payload.documents) ? payload.documents : [];

  if (!invoiceId || !amount || !payload.payment_mode) {
    throw new Error("Invoice, amount, and payment mode are required");
  }

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { invoice_id: invoiceId },
      include: {
        project: true,
      },
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const settlement = await tx.settlement.create({
      data: {
        invoice_id: invoice.invoice_id,
        project_id: invoice.project_id,
        settlement_date: toDate(payload.settlement_date) || new Date(),
        amount,
        payment_mode: String(payload.payment_mode).trim(),
        remark: payload.remark?.trim() || null,
        created_by: actorUserCode,
        updated_by: actorUserCode,
        active: true,
      },
    });

    const files = persistSettlementDocuments(settlement.settlement_id, documents);
    if (files.length) {
      await tx.settlementDocument.createMany({
        data: files,
      });
    }

    const nextSettleAmount = Number((Number(invoice.settle_amount || 0) + amount).toFixed(2));
    const nextPendingAmount = Number((Number(invoice.grand_total || 0) - nextSettleAmount).toFixed(2));
    const updatedInvoice = await tx.invoice.update({
      where: { invoice_id: invoice.invoice_id },
      data: {
        settle_amount: nextSettleAmount,
        pending_amount: nextPendingAmount,
        settle: nextPendingAmount <= 0 ? "settled" : "partial",
        updated_by: actorUserCode,
      },
    });

    await createHistoryEntry(tx, "Settlement", settlement.settlement_id, "INSERT", settlement, {
      invoice_id: invoice.invoice_id,
      project_id: invoice.project_id,
      settlement_id: settlement.settlement_id,
    });

    await createHistoryEntry(
      tx,
      "Invoice",
      updatedInvoice.invoice_id,
      "SETTLEMENT_UPDATE",
      {
        settle_amount: updatedInvoice.settle_amount,
        pending_amount: updatedInvoice.pending_amount,
        settle: updatedInvoice.settle,
      },
      {
        invoice_id: updatedInvoice.invoice_id,
        project_id: updatedInvoice.project_id,
        settlement_id: settlement.settlement_id,
      }
    );

    return settlement;
  });
};

exports.getFinanceDashboard = async (filters = {}) => {
  const where = {
    active: true,
  };

  if (filters.client_id) {
    where.client_id = Number(filters.client_id);
  }

  if (filters.project_id) {
    where.project_id = Number(filters.project_id);
  }

  if (filters.invoice_type) {
    where.invoice_type = filters.invoice_type;
  }

  if (filters.status) {
    where.settle = filters.status;
  }

  if (filters.tag) {
    where.tags = {
      contains: filters.tag,
    };
  }

  const invoices = (await prisma.invoice.findMany({
    where,
    include: {
      client: true,
      project: true,
      settlements: true,
      gst: true,
    },
    orderBy: {
      invoice_date: "desc",
    },
  })).map(enrichInvoiceFinancials);

  const clients = await prisma.client.findMany({
    where: { active: true },
    orderBy: { client_name: "asc" },
  });

  const projects = await prisma.project.findMany({
    where: { active: true },
    orderBy: { project_name: "asc" },
  });

  const businessByClient = invoices.reduce((acc, invoice) => {
    const key = invoice.client?.client_name || "Unassigned";
    acc[key] = (acc[key] || 0) + Number(invoice.grand_total || 0);
    return acc;
  }, {});

  return {
    invoices,
    clients,
    projects,
    filters,
    stats: {
      totalInvoices: invoices.length,
      totalValue: invoices.reduce((sum, invoice) => sum + Number(invoice.grand_total || 0), 0),
      totalSettled: invoices.reduce((sum, invoice) => sum + Number(invoice.settle_amount || 0), 0),
      totalPending: invoices.reduce((sum, invoice) => sum + Number(invoice.pending_amount || 0), 0),
      uniqueClients: new Set(invoices.map((invoice) => invoice.client_id).filter(Boolean)).size,
      businessByClient,
    },
  };
};

exports.getActivityHistory = async (limit = 100) =>
  prisma.activityHistory.findMany({
    orderBy: {
      created_at: "desc",
    },
    take: Number(limit),
  });

const HISTORY_CONFIG = {
  Client: {
    model: "client",
    idField: "client_id",
    labelField: "client_name",
    fields: ["client_no", "client_name", "contact_person", "email", "phone_number", "billing_address", "city", "state", "country", "gstin"],
  },
  Project: {
    model: "project",
    idField: "project_id",
    labelField: "project_name",
    fields: ["project_no", "project_name", "project_type", "status", "site_address", "city", "state", "country", "billing_cycle_type"],
  },
  Invoice: {
    model: "invoice",
    idField: "invoice_id",
    labelField: "invoice_number",
    fields: ["invoice_number", "invoice_type", "client_name", "client_address", "phone_number", "tags", "settle"],
  },
  Settlement: {
    model: "settlement",
    idField: "settlement_id",
    labelField: "payment_mode",
    fields: ["payment_mode", "remark", "created_by"],
  },
  AppUser: {
    model: "appUser",
    idField: "app_user_id",
    labelField: "user_name",
    fields: ["user_code", "user_name", "phone_number", "email", "father_name", "designation", "role"],
  },
};

exports.getHistorySearchConfig = () => HISTORY_CONFIG;

exports.searchHistoryRecords = async ({ entity, field, operator, value }) => {
  const config = HISTORY_CONFIG[entity];
  if (!config || !config.fields.includes(field)) return [];

  const normalizedValue = String(value || "").trim();
  const where = {
    active: true,
  };

  if (operator === "equals") where[field] = normalizedValue;
  if (operator === "contains") where[field] = { contains: normalizedValue };
  if (operator === "not") where.NOT = { [field]: normalizedValue };
  if (operator === "gt") where[field] = Number.isNaN(Number(normalizedValue)) ? undefined : { gt: Number(normalizedValue) };
  if (operator === "lt") where[field] = Number.isNaN(Number(normalizedValue)) ? undefined : { lt: Number(normalizedValue) };

  const rows = await prisma[config.model].findMany({
    where,
    take: 50,
    orderBy: {
      updated_at: "desc",
    },
  });

  return rows.map((row) => ({
    entity,
    recordId: row[config.idField],
    title: row[config.labelField] || `${entity} #${row[config.idField]}`,
    subtitle: config.fields
      .filter((entry) => entry !== config.labelField)
      .slice(0, 3)
      .map((entry) => `${entry}: ${row[entry] ?? "-"}`)
      .join(" | "),
  }));
};

exports.getRecordTimeline = async (tableName, recordId) => {
  const normalizedTable = String(tableName || "").trim();
  const id = Number(recordId);
  let history = [];

  if (normalizedTable === "Project") {
    const invoices = await prisma.invoice.findMany({
      where: { project_id: id },
      select: { invoice_id: true },
    });
    const settlements = await prisma.settlement.findMany({
      where: { project_id: id },
      select: { settlement_id: true },
    });

    history = await prisma.activityHistory.findMany({
      where: {
        OR: [
          { table_name: "Project", record_id: id },
          { project_id: id },
          { table_name: "Invoice", record_id: { in: invoices.map((entry) => entry.invoice_id) } },
          { table_name: "Settlement", record_id: { in: settlements.map((entry) => entry.settlement_id) } },
        ],
      },
      orderBy: { created_at: "asc" },
    });
  } else if (normalizedTable === "Client") {
    const projects = await prisma.project.findMany({
      where: { client_id: id },
      select: { project_id: true },
    });
    const invoices = await prisma.invoice.findMany({
      where: { client_id: id },
      select: { invoice_id: true },
    });
    const settlements = await prisma.settlement.findMany({
      where: { invoice_id: { in: invoices.map((entry) => entry.invoice_id) } },
      select: { settlement_id: true },
    });

    history = await prisma.activityHistory.findMany({
      where: {
        OR: [
          { table_name: "Client", record_id: id },
          { table_name: "Project", record_id: { in: projects.map((entry) => entry.project_id) } },
          { table_name: "Invoice", record_id: { in: invoices.map((entry) => entry.invoice_id) } },
          { table_name: "Settlement", record_id: { in: settlements.map((entry) => entry.settlement_id) } },
        ],
      },
      orderBy: { created_at: "asc" },
    });
  } else if (normalizedTable === "Invoice") {
    const settlements = await prisma.settlement.findMany({
      where: { invoice_id: id },
      select: { settlement_id: true },
    });

    history = await prisma.activityHistory.findMany({
      where: {
        OR: [
          { table_name: "Invoice", record_id: id },
          { invoice_id: id },
          { table_name: "Settlement", record_id: { in: settlements.map((entry) => entry.settlement_id) } },
        ],
      },
      orderBy: { created_at: "asc" },
    });
  } else if (normalizedTable === "Settlement" || normalizedTable === "AppUser") {
    history = await prisma.activityHistory.findMany({
      where: {
        table_name: normalizedTable,
        record_id: id,
      },
      orderBy: { created_at: "asc" },
    });
  } else {
    history = await prisma.activityHistory.findMany({
      where: {
        table_name: normalizedTable,
        record_id: id,
      },
      orderBy: { created_at: "asc" },
    });
  }

  return {
    tableName: normalizedTable,
    recordId: id,
    history,
  };
};
