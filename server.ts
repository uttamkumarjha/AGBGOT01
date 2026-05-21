import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import twilio from "twilio";
import cors from "cors";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === "production";

  console.log(`Starting server in ${isProd ? 'production' : 'development'} mode...`);

  app.use(cors());
  app.use(express.json({ limit: '64mb' }));
  app.use(express.urlencoded({ limit: '64mb', extended: true }));

  // Security Protocol Middleware
  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || 'unknown';
    
    // Log suspicious activity (placeholder for backend auto-lock)
    if (ua.includes('bot') || ua.includes('crawl')) {
      console.warn(`SECURITY WARNING: Crawler detected from ${ip}: ${ua}`);
    }
    
    // Protect API routes
    if (req.url.startsWith('/api/') && req.method !== 'GET') {
      console.log(`SECURE ACTION: ${req.method} ${req.url} by ${ip}`);
    }
    
    next();
  });

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: isProd ? 'production' : 'development',
      time: new Date().toISOString()
    });
  });

  // API Route for sending WhatsApp messages via Twilio
  app.post("/api/whatsapp", async (req, res) => {
    try {
      const { phone, message } = req.body;
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        console.warn("Twilio configuration is missing. WhatsApp feature will not work.");
        return res.status(500).json({ error: "Twilio configuration is missing." });
      }

      if (!phone || !message) {
        return res.status(400).json({ error: "Phone number and message are required." });
      }

      const client = twilio(accountSid, authToken);
      
      const twilioRes = await client.messages.create({
        body: message,
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:${phone}`
      });

      res.json({ success: true, sid: twilioRes.sid });
    } catch (err: any) {
      console.error("Twilio error:", err);
      res.status(500).json({ error: err.message || "Failed to send WhatsApp message" });
    }
  });

  // API Route for Security Audit Logs
  app.post("/api/security/log", (req, res) => {
    const { uid, email, violation } = req.body;
    console.error(`[SECURITY ALERT] IDENTITY: ${email} | UID: ${uid} | VIOLATION: ${violation}`);
    res.json({ success: true, logged: true });
  });

  // Vite middleware for development
  if (!isProd) {
    console.log("Integrating Vite development middleware...");
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR !== 'true'
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite development middleware ready.");
    } catch (error) {
      console.error("Error creating Vite server:", error);
    }
  } else {
    // Production setup
    const distPath = path.resolve("dist");
    console.log(`Production mode: serving static files from ${distPath}`);
    
    // Serve static files with extensions first
    app.use(express.static(distPath, {
      index: false // we handle index.html manually for SPA support
    }));
    
    // Catch-all route for SPA
    app.get('*', (req, res) => {
      // Skip API routes
      if (req.url.startsWith('/api/')) return;

      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error(`Index file not found: ${indexPath}`);
        res.status(404).send("Application index not found. Please build the project.");
      }
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
  });

  // Set server timeout to 600 seconds (10 minutes)
  server.timeout = 600000;
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
