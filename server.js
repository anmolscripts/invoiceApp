const crypto = require("crypto");
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const invoiceRoutes = require("./routes/invoiceRoutes");

const app = express();

const AUTH_COOKIE = "invoice_admin_auth";
const AUTH_SECRET = "invoice-admin-secret";

const signSession = (value) =>
  crypto.createHmac("sha256", AUTH_SECRET).update(value).digest("hex");

const createSessionToken = () => {
  const payload = `admin|${Date.now()}`;
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

const isValidSession = (token = "") => {
  const parts = token.split("|");
  if (parts.length !== 3) return false;
  const [user, timestamp, signature] = parts;
  if (user !== "admin" || !timestamp || !signature) return false;
  return signSession(`${user}|${timestamp}`) === signature;
};

const setAuthCookie = (res) => {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=${encodeURIComponent(createSessionToken())}; Path=/; HttpOnly; SameSite=Lax`
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
  if (pathname === "/logout") return false;
  if (pathname.startsWith("/css/")) return false;
  if (pathname.startsWith("/js/")) return false;
  if (pathname.startsWith("/img/")) return false;
  return true;
};

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || "");
  req.isAuthenticated = isValidSession(cookies[AUTH_COOKIE]);
  req.setAuthCookie = () => setAuthCookie(res);
  req.clearAuthCookie = () => clearAuthCookie(res);

  if (!req.isAuthenticated && isProtectedRoute(req.path)) {
    return res.redirect("/login");
  }

  if (req.isAuthenticated && req.path === "/login" && req.method === "GET") {
    return res.redirect("/");
  }

  next();
});

// Routes
app.use("/", invoiceRoutes);

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
