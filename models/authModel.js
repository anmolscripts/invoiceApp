const crypto = require("crypto");
const prisma = require("./prisma");

const SYSTEM_MODULES = [
  { module_key: "dashboard", module_name: "Dashboard", module_path: "/" },
  { module_key: "invoices", module_name: "Invoices", module_path: "/invoices" },
  { module_key: "clients", module_name: "Clients", module_path: "/clients" },
  { module_key: "projects", module_name: "Projects", module_path: "/projects" },
  { module_key: "settlements", module_name: "Settlements", module_path: "/settlements" },
  { module_key: "finance", module_name: "Finance", module_path: "/finance" },
  { module_key: "history", module_name: "History", module_path: "/history" },
  { module_key: "users", module_name: "Users", module_path: "/users" },
];

const hashPassword = (password) =>
  crypto.createHash("sha256").update(String(password)).digest("hex");

const createSetupToken = () => crypto.randomBytes(24).toString("hex");

const createUserHistoryEntry = async (tableName, recordId, action, payload) =>
  prisma.activityHistory.create({
    data: {
      table_name: tableName,
      record_id: Number(recordId),
      action,
      payload_json: JSON.stringify(payload || {}),
    },
  });

const getNextUserCode = async () => {
  const year = new Date().getFullYear();
  const latest = await prisma.appUser.findFirst({
    where: {
      user_code: {
        startsWith: `USER/${year}/`,
      },
    },
    orderBy: {
      user_code: "desc",
    },
    select: {
      user_code: true,
    },
  });

  const serial = Number((latest?.user_code?.split("/")[2] || "0").replace(/^0+/, "") || "0") + 1;
  return `USER/${year}/${serial}`;
};

const getModuleKeyFromPath = (pathname = "") => {
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/invoices") || pathname.startsWith("/invoiceList") || pathname.startsWith("/saveInvoice") || pathname.startsWith("/add") || pathname.startsWith("/edit") || pathname.startsWith("/convert") || pathname.startsWith("/api/search")) return "invoices";
  if (pathname.startsWith("/clients")) return "clients";
  if (pathname.startsWith("/projects") || pathname.startsWith("/api/clients/")) return "projects";
  if (pathname.startsWith("/settlements")) return "settlements";
  if (pathname.startsWith("/finance")) return "finance";
  if (pathname.startsWith("/history") || pathname.startsWith("/timeline")) return "history";
  if (pathname.startsWith("/users") || pathname.startsWith("/setup-password")) return "users";
  return "dashboard";
};

exports.hashPassword = hashPassword;
exports.SYSTEM_MODULES = SYSTEM_MODULES;
exports.getModuleKeyFromPath = getModuleKeyFromPath;

exports.ensureSystemBootstrap = async () => {
  for (const module of SYSTEM_MODULES) {
    await prisma.appModule.upsert({
      where: { module_key: module.module_key },
      update: {
        module_name: module.module_name,
        module_path: module.module_path,
        active: true,
      },
      create: module,
    });
  }

  const modules = await prisma.appModule.findMany({
    where: { active: true },
    select: { module_id: true },
  });

  const admin = await prisma.appUser.findFirst({
    where: { user_code: "USER/2026/1" },
  });

  let adminUser = admin;
  if (!adminUser) {
    adminUser = await prisma.appUser.create({
      data: {
        user_code: "USER/2026/1",
        user_name: "Super Admin",
        email: "admin@app.local",
        role: "admin",
        password_hash: hashPassword("admin"),
        must_set_password: false,
        active: true,
        created_by: "system",
      },
    });
  }

  for (const module of modules) {
    const existingLink = await prisma.userModule.findFirst({
      where: {
        app_user_id: adminUser.app_user_id,
        module_id: module.module_id,
      },
    });

    if (!existingLink) {
      await prisma.userModule.create({
        data: {
          app_user_id: adminUser.app_user_id,
          module_id: module.module_id,
        },
      });
    }
  }
};

exports.getUserForLogin = async (userCode, password) => {
  const user = await prisma.appUser.findFirst({
    where: {
      active: true,
      user_code: String(userCode || "").trim(),
    },
    include: {
      userModules: {
        include: {
          module: true,
        },
      },
    },
  });

  if (!user || !user.password_hash) return null;
  if (user.password_hash !== hashPassword(password)) return null;
  return user;
};

exports.getUserById = async (id) =>
  prisma.appUser.findUnique({
    where: { app_user_id: Number(id) },
    include: {
      userModules: {
        include: {
          module: true,
        },
      },
    },
  });

exports.getUsersList = async () =>
  prisma.appUser.findMany({
    where: { active: true },
    orderBy: { updated_at: "desc" },
    include: {
      userModules: {
        include: {
          module: true,
        },
      },
    },
  });

exports.getModulesList = async () =>
  prisma.appModule.findMany({
    where: { active: true },
    orderBy: { module_name: "asc" },
  });

exports.saveUser = async (payload, actorUserCode) => {
  const moduleIds = Array.isArray(payload.module_ids)
    ? payload.module_ids
    : payload.module_ids
      ? [payload.module_ids]
      : [];
  const userCode = payload.app_user_id ? null : await getNextUserCode();
  const setupToken = createSetupToken();

  const result = await prisma.$transaction(async (tx) => {
    const userData = {
      user_name: String(payload.user_name || "").trim(),
      phone_number: payload.phone_number?.trim() || null,
      email: payload.email?.trim() || null,
      dob: payload.dob ? new Date(payload.dob) : null,
      father_name: payload.father_name?.trim() || null,
      designation: payload.designation?.trim() || null,
      address: payload.address?.trim() || null,
      role: payload.role || "viewer",
      updated_by: actorUserCode || "system",
      active: true,
    };

    if (!userData.user_name) {
      throw new Error("User name is required");
    }

    let user;
    if (payload.app_user_id) {
      user = await tx.appUser.update({
        where: { app_user_id: Number(payload.app_user_id) },
        data: userData,
      });

      await tx.userModule.deleteMany({
        where: { app_user_id: user.app_user_id },
      });
    } else {
      user = await tx.appUser.create({
        data: {
          ...userData,
          user_code: userCode,
          created_by: actorUserCode || "system",
          must_set_password: true,
        },
      });
    }

    if (moduleIds.length) {
      for (const moduleId of moduleIds) {
        await tx.userModule.create({
          data: {
            app_user_id: user.app_user_id,
            module_id: Number(moduleId),
          },
        });
      }
    }

    await tx.passwordSetupToken.create({
      data: {
        app_user_id: user.app_user_id,
        token: setupToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { user, token: setupToken };
  }, { timeout: 20000 });

  await createUserHistoryEntry("AppUser", result.user.app_user_id, payload.app_user_id ? "UPDATE" : "INSERT", {
    user_name: result.user.user_name,
    email: result.user.email,
    role: result.user.role,
    module_ids: moduleIds.map(Number),
    updated_fields: {
      ...result.user,
      password_hash: undefined,
    },
  });

  return result;
};

exports.getSetupToken = async (token) =>
  prisma.passwordSetupToken.findFirst({
    where: {
      token,
      used_at: null,
      expires_at: {
        gt: new Date(),
      },
    },
    include: {
      appUser: true,
    },
  });

exports.completePasswordSetup = async (token, password) => {
  const user = await prisma.$transaction(async (tx) => {
    const setupToken = await tx.passwordSetupToken.findFirst({
      where: {
        token,
        used_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
      include: {
        appUser: true,
      },
    });

    if (!setupToken) {
      throw new Error("Invalid or expired setup link");
    }

    await tx.appUser.update({
      where: { app_user_id: setupToken.app_user_id },
      data: {
        password_hash: hashPassword(password),
        must_set_password: false,
      },
    });

    await tx.passwordSetupToken.update({
      where: {
        password_setup_token_id: setupToken.password_setup_token_id,
      },
      data: {
        used_at: new Date(),
      },
    });

    return setupToken.appUser;
  });
  await createUserHistoryEntry("AppUser", user.app_user_id, "PASSWORD_SET", {
    user_code: user.user_code,
    must_set_password: false,
  });
  return user;
};

exports.canAccessModule = (user, moduleKey) => {
  if (!user) return false;
  if (String(user.role || "").toLowerCase() === "admin") return true;
  return user.userModules?.some((entry) => entry.module?.module_key === moduleKey);
};

exports.canDelete = (user) => String(user?.role || "").toLowerCase() === "admin";
exports.canEdit = (user) => ["admin", "editor"].includes(String(user?.role || "").toLowerCase());
exports.canCreate = exports.canEdit;
