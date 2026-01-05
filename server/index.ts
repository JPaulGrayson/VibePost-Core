import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// ============================================
// GLOBAL ERROR HANDLERS - Prevent server crashes
// ============================================
process.on('uncaughtException', (error: Error) => {
  console.error('🚨 UNCAUGHT EXCEPTION (server continues running):');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
  // Server continues running - do not exit
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('🚨 UNHANDLED PROMISE REJECTION (server continues running):');
  console.error('   Reason:', reason);
  // Server continues running - do not exit
});

console.log('🛡️ Global error handlers installed - server will not crash on errors');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

import { twitterListener } from "./services/twitter_listener";

// ...

(async () => {
  const server = await registerRoutes(app);

  // Start Twitter Listener
  try {
    console.log("Starting Twitter Listener...");
    // Don't await this, let it run in background
    // twitterListener.startPolling().catch(err => console.error("Twitter Listener error:", err));
    console.log("Twitter Listener started (MANUAL MODE ONLY).");
  } catch (error) {
    console.error("Failed to start Twitter Listener:", error);
  }

  // Start Sniper Manager (Keyword Hunter)
  try {
    // Start the Sniper Manager (Background Tweet Hunter)
    // Start the Sniper Manager (Background Tweet Hunter)
    console.log("🔫 Initializing Sniper Manager...");
    const { sniperManager } = await import("./services/sniper_manager");
    sniperManager.startHunting().catch(err => console.error("Sniper Manager error:", err));
  } catch (error) {
    console.error("Failed to start Sniper Manager:", error);
  }

  // Start Daily Video Scheduler (Auto-posts video slideshows at 9 AM daily)
  // Replaces both Daily Postcard and Thread Tour schedulers
  try {
    const { startDailyVideoScheduler } = await import("./services/daily_video_scheduler");
    startDailyVideoScheduler();
  } catch (error) {
    console.error("Failed to start Daily Video Scheduler:", error);
  }

  // Start Auto-Publisher (Auto-posts 80+ score leads with rate limiting)
  try {
    const { autoPublisher } = await import("./services/auto_publisher");
    autoPublisher.start();
  } catch (error) {
    console.error("Failed to start Auto-Publisher:", error);
  }

  // Start Analytics Sync Service (Updates metrics every 2 hours)
  try {
    const { analyticsSync } = await import("./services/analytics_sync");
    analyticsSync.start();
    console.log("📊 Analytics Sync Service started (every 2 hours)");
  } catch (error) {
    console.error("Failed to start Analytics Sync:", error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log the error but DON'T re-throw (prevents crashes)
    console.error(`❌ Express error: ${message}`, err.stack);
    res.status(status).json({ message });
    // Note: Removed 'throw err' which was crashing the server!
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5002
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = process.env.PORT || 5002;
  server.listen({
    port,
    host: "0.0.0.0",
    // reusePort: true, // Not supported on macOS
  }, () => {
    log(`serving on port ${port}`);
  });
})();
