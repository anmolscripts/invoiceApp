const crypto = require("crypto");
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const invoiceRoutes = require("./routes/invoiceRoutes");
const authModel = require("./models/authModel");

const app = express();

const AUTH_COOKIE = "invoice_admin_auth";
const AUTH_SECRET = "invoice-admin-secret";

const signSession = (value) =>
  crypto.createHmac("sha256", AUTH_SECRET).update(value).digest("hex");

const createSessionToken = (userId) => {
  const payload = `${userId}|${Date.now()}`;
  const signature = signSession(payload);
  return `${payload}|${signature}`;
};

const parseCookies = (cookieHeader = "") =>
  cookieHeader.split(";").reduce((acc, cookie) => {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});

const parseSession = (token = "") => {
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [userId, timestamp, signature] = parts;
  if (!userId || !timestamp || !signature) return null;
  return signSession(`${userId}|${timestamp}`) === signature
    ? { userId: Number(userId) }
    : null;
};

const setAuthCookie = (res, userId) => {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=${encodeURIComponent(createSessionToken(userId))}; Path=/; HttpOnly; SameSite=Lax`
  );
};

const clearAuthCookie = (res) => {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
};

const isProtectedRoute = (pathname) => {
  if (pathname === "/login") return false;
  if (pathname.startsWith("/setup-password")) return false;
  if (pathname === "/logout") return false;
  if (pathname.startsWith("/css/")) return false;
  if (pathname.startsWith("/js/")) return false;
  if (pathname.startsWith("/img/")) return false;
  return true;
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json({ limit: "35mb" }));
app.use(bodyParser.json({ limit: "35mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "35mb" }));
app.use(express.static("public"));

app.use(async (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const session = parseSession(cookies[AUTH_COOKIE]);
  req.currentUser = session?.userId ? await authModel.getUserById(session.userId) : null;
  req.isAuthenticated = Boolean(req.currentUser);
  req.setAuthCookie = (userId) => setAuthCookie(res, userId);
  req.clearAuthCookie = () => clearAuthCookie(res);

  res.locals.currentUser = req.currentUser;
  res.locals.canDelete = authModel.canDelete(req.currentUser);
  res.locals.canEdit = authModel.canEdit(req.currentUser);
  res.locals.canCreate = authModel.canCreate(req.currentUser);

  if (!req.isAuthenticated && isProtectedRoute(req.path)) {
    return res.redirect("/login");
  }

  if (req.isAuthenticated && req.path === "/login" && req.method === "GET") {
    return res.redirect("/");
  }

  if (req.isAuthenticated && isProtectedRoute(req.path)) {
    const moduleKey = authModel.getModuleKeyFromPath(req.path);
    if (!authModel.canAccessModule(req.currentUser, moduleKey)) {
      return res.status(403).send("You do not have access to this module");
    }
  }

  next();
});

app.use("/", invoiceRoutes);

const PORT = Number(process.env.PORT || 3000);

async function start() {
  await authModel.ensureSystemBootstrap();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Unable to start server:", error);
  process.exit(1);
});
