/*
  Warnings:

  - You are about to drop the column `tax_id` on the `Invoice` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Gst" (
    "GST_ID" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "GST_DESCRIPTION" TEXT NOT NULL,
    "SGST_RATE" REAL NOT NULL,
    "CGST_RATE" REAL NOT NULL,
    "IGST_RATE" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "invoice_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_number" TEXT NOT NULL,
    "invoice_type" TEXT,
    "client_name" TEXT NOT NULL,
    "client_address" TEXT,
    "phone_number" TEXT,
    "invoice_date" DATETIME NOT NULL,
    "gst_id" INTEGER,
    "amount" REAL NOT NULL,
    "round_off" REAL,
    "grand_total" REAL NOT NULL,
    "settle" TEXT NOT NULL,
    "settle_amount" REAL,
    "pending_amount" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Invoice_gst_id_fkey" FOREIGN KEY ("gst_id") REFERENCES "Gst" ("GST_ID") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("active", "amount", "client_address", "client_name", "created_at", "created_by", "grand_total", "invoice_date", "invoice_id", "invoice_number", "invoice_type", "pending_amount", "phone_number", "round_off", "settle", "settle_amount", "updated_at") SELECT "active", "amount", "client_address", "client_name", "created_at", "created_by", "grand_total", "invoice_date", "invoice_id", "invoice_number", "invoice_type", "pending_amount", "phone_number", "round_off", "settle", "settle_amount", "updated_at" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_invoice_number_key" ON "Invoice"("invoice_number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
