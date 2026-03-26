const path = require("path");
const { pathToFileURL } = require("url");
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");

const adapter = new PrismaLibSql({
  url: pathToFileURL(path.join(__dirname, "invoice.db")).href,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.item.deleteMany();
  await prisma.gst.deleteMany();

  const [serviceItem, installItem] = await Promise.all([
    prisma.item.create({
      data: {
        item_name: "Gas Pipeline Service",
        hsn: "9987",
        created_by: "admin",
      },
    }),
    prisma.item.create({
      data: {
        item_name: "Installation Material",
        hsn: "7306",
        created_by: "admin",
      },
    }),
  ]);

  await prisma.gst.createMany({
    data: [
      {
        GST_DESCRIPTION: "18% GST",
        SGST_RATE: 9,
        CGST_RATE: 9,
        IGST_RATE: 0,
        created_by: "admin",
      },
      {
        GST_DESCRIPTION: "12% IGST",
        SGST_RATE: 0,
        CGST_RATE: 0,
        IGST_RATE: 12,
        created_by: "admin",
      },
    ],
  });

  const gst = await prisma.gst.findFirst({
    orderBy: { GST_ID: "asc" },
  });

  const client = await prisma.client.create({
    data: {
      client_code: "CL-0001",
      client_name: "Alpha Hospital",
      contact_person: "Rahul Sharma",
      email: "alpha@example.com",
      phone_number: "9876543210",
      gstin: "07ABCDE1234F1Z5",
      billing_address: "Sector 21, Delhi",
      city: "Delhi",
      state: "Delhi",
      country: "India",
      postal_code: "110001",
      created_by: "admin",
    },
  });

  const project = await prisma.project.create({
    data: {
      project_code: "PRJ-0001",
      client_id: client.client_id,
      project_name: "ICU Gas Pipeline Upgrade",
      project_type: "Installation",
      status: "Active",
      site_address: "Alpha Hospital Campus, Delhi",
      city: "Delhi",
      state: "Delhi",
      country: "India",
      budget: 250000,
      description: "Central gas pipeline enhancement for ICU wing.",
      created_by: "admin",
    },
  });

  await prisma.invoice.create({
    data: {
      invoice_number: "QUOT/2026/0001",
      invoice_type: "Quotation",
      client_id: client.client_id,
      project_id: project.project_id,
      client_name: project.project_name,
      client_address: project.site_address,
      phone_number: client.phone_number,
      invoice_date: new Date("2026-03-25"),
      gst_id: gst?.GST_ID,
      amount: 50000,
      round_off: 0,
      grand_total: 59000,
      settle: "pending",
      created_by: "admin",
      items: {
        create: [
          {
            item_id: serviceItem.item_id,
            qty: 1,
            rate: 30000,
            amount: 30000,
            created_by: "admin",
          },
          {
            item_id: installItem.item_id,
            qty: 2,
            rate: 10000,
            amount: 20000,
            created_by: "admin",
          },
        ],
      },
    },
  });

  console.log("Seed data inserted successfully");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
