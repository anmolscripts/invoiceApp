# Invoice, Client, Project, Finance App

Production-oriented Express + EJS + Prisma application for:

- invoices, quotations, debit notes, and credit notes
- client and project management
- settlements and finance tracking
- role/module based user access
- activity history and record timelines

## Tech Stack

- Node.js
- Express
- EJS
- Prisma
- SQLite by default

## Default Super Admin

After first start, the app bootstraps a super admin automatically:

- User ID: `USER/2026/1`
- Password: `admin`

## Quick Start

1. Install packages

```bash
npm install
```

2. Make sure `.env` contains:

```env
DATABASE_URL="file:./prisma/invoice.db"
PORT=3000
```

3. Generate Prisma client

```bash
npm run prisma:generate
```

4. Sync schema to database

```bash
npm run prisma:push
```

5. Start the app

```bash
npm start
```

## Main Commands

```bash
npm start
npm run dev
npm run prisma:generate
npm run prisma:push
npm run seed
```

## Database Notes

The shipped code runs on SQLite by default through:

```env
DATABASE_URL="file:./prisma/invoice.db"
```

Current runtime is wired to SQLite with the Prisma LibSQL adapter in `models/prisma.js`.

### To move to MySQL or PostgreSQL

You can keep the application structure and Prisma models, but you will also need to update the Prisma client runtime adapter, not only the schema.

Typical steps:

1. Change the Prisma datasource provider in `prisma/schema.prisma`
2. Update `prisma.config.ts` datasource URL
3. Replace the SQLite adapter in `models/prisma.js` with the adapter/runtime setup for your target database
4. Run Prisma generate and schema sync again

### Example: MySQL

1. Update `prisma/schema.prisma`

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

2. Update `prisma.config.ts` datasource URL or your environment loading strategy

```env
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE_NAME"
```

3. Run:

```bash
npm run prisma:generate
npm run prisma:push
```

### Example: PostgreSQL

1. Update `prisma/schema.prisma`

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. Update `prisma.config.ts` datasource URL or your environment loading strategy

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE_NAME?schema=public"
```

3. Run:

```bash
npm run prisma:generate
npm run prisma:push
```

### Important

If you stay on SQLite, the app runs as-is.
If you change provider, also change the runtime adapter/client wiring in `models/prisma.js`.

## Access Model

Users support:

- `admin`: full view, add, edit, delete, user management
- `editor`: view, add, edit
- `viewer`: view only

Module access is assigned per user. A user only sees and accesses the modules assigned to them.

## Password Setup Flow

When an admin creates a user:

- user ID is auto-generated like `USER/2026/2`
- a password setup link is generated
- user opens the link
- user sets password
- user can then log in

## Soft Delete Rule

Delete operations do not remove data physically.

- records are marked with `active = false`
- all frontend fetches should use active records only
- timelines and history preserve the full audit trail

## Timeline and History

- `/history` shows recent system activity
- `/timeline/:table/:id` shows full timeline for one record

## Recommended Production Next Steps

- move auth secret into environment variables
- replace SHA256 password hashing with bcrypt/argon2
- add CSRF protection
- add request validation layer
- move file/document storage to object storage if attachments grow large
- add Prisma migrations for versioned deployment
