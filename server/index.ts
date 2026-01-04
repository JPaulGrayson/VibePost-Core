import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
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
console.log('📦 ESM modules loaded successfully');

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

// Function to start background services (called AFTER server is listening with delay)
async function startBackgroundServices() {
  console.log("🔄 Starting background services...");
  
  // Start Twitter Listener
  try {
    console.log("Starting Twitter Listener...");
    console.log("Twitter Listener started (MANUAL MODE ONLY).");
  } catch (error) {
    console.error("Failed to start Twitter Listener:", error);
  }

  // Start Sniper Manager (Keyword Hunter)
  try {
    console.log("🔫 Initializing Sniper Manager...");
    const { sniperManager } = await import("./services/sniper_manager");
    sniperManager.startHunting().catch(err => console.error("Sniper Manager error:", err));
  } catch (error) {
    console.error("Failed to start Sniper Manager:", error);
  }

  // Start Daily Video Scheduler (Auto-posts video slideshows at 9 AM daily)
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

  // Start Comment Tracker (Fetches replies to our posts)
  try {
    const { commentTracker } = await import("./services/comment_tracker");
    commentTracker.startCommentTracker();
  } catch (error) {
    console.error("Failed to start Comment Tracker:", error);
  }
}

// CRITICAL: Add lightweight health check BEFORE heavy routes load
// This ensures deployment health checks pass immediately
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

(async () => {
  // Create HTTP server FIRST with just the health check
  const { createServer } = await import("http");
  const server = createServer(app);
  
  const port = parseInt(process.env.PORT || '5002', 10);
  
  // Start listening IMMEDIATELY so health checks pass
  server.listen({ port, host: "0.0.0.0" }, async () => {
    console.log(`🚀 Server listening on http://0.0.0.0:${port}`);
    console.log(`✅ Health check ready - server accepting requests`);
    log(`serving on port ${port}`);
    
    // Now load heavy routes AFTER server is listening
    try {
      console.log("📦 Loading application routes...");
      const { registerRoutes } = await import("./routes");
      await registerRoutes(app);
      console.log("✅ Routes loaded successfully");
    } catch (error) {
      console.error("❌ Failed to load routes:", error);
    }
    
    // Setup vite in development, static serving in production
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
    
    // Error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error(`❌ Express error: ${message}`, err.stack);
      res.status(status).json({ message });
    });
    
    // Start background services with delay
    setTimeout(() => {
      startBackgroundServices().catch(err => {
        console.error("Error starting background services:", err);
      });
    }, 3000);
  });
})();
