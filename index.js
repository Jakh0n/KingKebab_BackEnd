const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

// Load environment variables FIRST, before any other modules
// Explicitly specify the path to ensure .env is loaded from backend directory
dotenv.config({ path: path.join(__dirname, ".env") });

// Verify critical environment variables are loaded
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn(
    "⚠️ WARNING: TELEGRAM_BOT_TOKEN not found (notifications bot)",
  );
}
if (!process.env.TELEGRAM_MINI_APP_BOT_TOKEN) {
  console.warn(
    "⚠️ WARNING: TELEGRAM_MINI_APP_BOT_TOKEN not found (Mini App auth bot)",
  );
}

const authRoutes = require("./routes/auth");
const timeRoutes = require("./routes/time");
const profileRoutes = require("./routes/profile");
const telegramRoutes = require("./routes/telegram");
const miniAppBotRoutes = require("./routes/miniAppBot");
const {
  setupMiniAppBotProfile,
  setupMiniAppWebhook,
  resolvePublicBackendUrl,
} = require("./services/miniAppBotService");

const app = express();

// Security middleware — allow Telegram Mini App WebView framing of API health pages if any
app.use(
  helmet({
    frameguard: false,
    contentSecurityPolicy: false,
  }),
);
app.use(express.json());

// Serve static files for uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Mini App bot webhook — before rate limiter (Telegram retries)
app.use("/api/telegram-miniapp", miniAppBotRoutes);

// CORS configuration
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      "http://localhost:3000",
      "https://shift.kingkebaborder.co.kr",
      "https://www.kingkebab.co.kr",
      "https://kingkebab.co.kr",
      "https://kingtime.vercel.app",
    ].filter(Boolean),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
  }),
);

// Rate limiting - general
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP
});
app.use(limiter);

// Stricter rate limiting for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 requests per IP for sensitive operations
  message: "Too many requests from this IP, please try again later.",
});

// Apply strict rate limiting to sensitive routes
app.use("/api/auth/create-admin", strictLimiter);
app.use("/api/auth/telegram", strictLimiter);
app.use("/api/auth/telegram/link", strictLimiter);
app.use("/api/auth/telegram/attach", strictLimiter);
app.use("/api/telegram", strictLimiter);
app.use("/api/users", strictLimiter);

// MongoDB connection with retry logic
const connectWithRetry = () => {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("MongoDB connected successfully");
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      console.log("Retrying in 5 seconds...");
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

// Error handling middlewares
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

app.use("/api/auth", authRoutes);
app.use("/api/time", timeRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/notify", require("./routes/notify"));
app.use("/api/users", require("./routes/users"));
app.use("/api/announcements", require("./routes/announcements"));
app.use("/api/branches", require("./routes/branches"));
app.use("/api/schedules", require("./routes/schedules"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    await setupMiniAppBotProfile();
    const publicUrl = resolvePublicBackendUrl();
    if (publicUrl) {
      await setupMiniAppWebhook(publicUrl);
    } else {
      console.warn(
        "⚠️ BACKEND_PUBLIC_URL / RENDER_EXTERNAL_URL not set — Mini App /start webhook skipped",
      );
    }
  } catch (error) {
    console.error("Mini App bot boot setup error:", error.message);
  }
});
