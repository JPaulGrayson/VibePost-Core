import "dotenv/config";
// Trigger restart
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
    // console.log("🔫 Initializing Sniper Manager...");
    // sniperManager.startHunting();.catch(err => console.error("Sniper Manager error:", err));
  } catch (error) {
    console.error("Failed to start Sniper Manager:", error);
  }

  // Start Daily Postcard Scheduler (Auto-posts at 9 AM daily)
  try {
    const { startDailyPostcardScheduler } = await import("./services/daily_postcard_scheduler");
    startDailyPostcardScheduler();
  } catch (error) {
    console.error("Failed to start Daily Postcard Scheduler:", error);
  }

  // Start Thread Tour Scheduler (Auto-posts thread tours at 6 PM daily)
  try {
    const { startThreadTourScheduler } = await import("./services/thread_tour_scheduler");
    startThreadTourScheduler();
  } catch (error) {
    console.error("Failed to start Thread Tour Scheduler:", error);
  }

  // Start Auto-Publisher (Auto-posts 80+ score leads with rate limiting)
  try {
    const { autoPublisher } = await import("./services/auto_publisher");
    autoPublisher.start();
  } catch (error) {
    console.error("Failed to start Auto-Publisher:", error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
  const port = process.env.PORT || 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    // reusePort: true, // Not supported on macOS
  }, () => {
    log(`serving on port ${port}`);
  });
})();
