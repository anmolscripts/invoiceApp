const { PrismaClient } = require('@prisma/client');
const { PrismaLibSql } = require('@prisma/adapter-libsql');

// 👇 adapter create
const adapter = new PrismaLibSql({
    url: "file:./prisma/invoice.db"
});

// 👇 pass adapter
const prisma = new PrismaClient({
    adapter
});
async function main() {

    // Create Items
    const item1 = await prisma.item.create({
        data: {
            item_name: "Laptop",
            hsn: "8471",
            created_by: "admin"
        }
    });

    const item2 = await prisma.item.create({
        data: {
            item_name: "Mouse",
            hsn: "8471",
            created_by: "admin"
        }
    });

    await prisma.gst.createMany({
    data: [
        {
            GST_DESCRIPTION: '12% IGST',
            SGST_RATE: 0,
            CGST_RATE: 0,
            IGST_RATE: 12,
            created_by: 'admin'
        },
        {
            GST_DESCRIPTION: '28% IGST',
            SGST_RATE: 0,
            CGST_RATE: 0,
            IGST_RATE: 28,
            created_by: 'admin'
        },
        {
            GST_DESCRIPTION: '5% IGST',
            SGST_RATE: 0,
            CGST_RATE: 0,
            IGST_RATE: 5,
            created_by: 'admin'
        }
    ]
});

    // Create Invoice with items
    await prisma.invoice.create({
        data: {
            invoice_number: "INV-001",
            client_name: "Test Client",
            client_address: "India",
            phone_number: "9999999999",
            invoice_date: new Date(),
            amount: 1200,
            grand_total: 1200,
            settle: "N",
            created_by: "admin",

            items: {
                create: [
                    {
                        item_id: item1.item_id,
                        qty: 1,
                        rate: 1000,
                        amount: 1000,
                        created_by: "admin"
                    },
                    {
                        item_id: item2.item_id,
                        qty: 2,
                        rate: 100,
                        amount: 200,
                        created_by: "admin"
                    }
                ]
            }
        }
    });

    console.log("✅ Seed data inserted");
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });