import "dotenv/config";
import express from "express";
import Bull from "bull";
import { PrismaClient } from "@prisma/client";
import winston from "winston";
import cors from "cors";

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "agrospot-worker" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

// Initialize Prisma client
const prisma = new PrismaClient({
  log: [
    { level: "error", emit: "event" },
    { level: "warn", emit: "event" },
  ],
});

// Log database errors
prisma.$on("error", (e) => {
  logger.error("Database error", e);
});

// Test database connection
const testDatabase = async () => {
  try {
    const count = await prisma.quotation.count();
    logger.info("Database connection test successful", {
      quotationCount: count,
    });
  } catch (error) {
    logger.error(
      "Database connection test failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

// Configure Redis connection
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
logger.info(`Connecting to Redis at ${redisUrl.split("@")[1] || "localhost"}`); // Log without password

// Redis connection options
const redisOptions = {
  maxRetriesPerRequest: 50,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 3000);
    logger.info(`Redis retry attempt ${times} with delay ${delay}ms`);
    return delay; // Maximum 3 seconds
  },
  enableReadyCheck: false, // Helps with some connection issues
  maxReconnectAttempts: 20,
  reconnectOnError: (err: Error) => {
    logger.error("Redis connection error:", err);
    return true; // Always try to reconnect
  },
};

// Create match processing queue with enhanced options
const matchQueue = new Bull("match-processing", redisUrl, {
  redis: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// Add Redis connection event handlers
const redisClient = matchQueue.client;

redisClient.on("connect", async () => {
  logger.info("Redis client connected");

  try {
    // Test basic Redis operations
    await redisClient.set("test-key", "test-value");
    const value = await redisClient.get("test-key");
    logger.info("Redis test successful:", { value });

    // Test Bull queue operations - specify the job type as 'test-job'
    const testJob = await matchQueue.add("test-job", { test: true });
    logger.info("Added test job to queue:", { jobId: testJob.id });

    // Force process the job immediately
    logger.info("Attempting to force process the test job...");
    setTimeout(async () => {
      const job = await matchQueue.getJob(testJob.id);
      if (job) {
        logger.info("Found test job, attempting to process...", {
          jobId: job.id,
        });
        try {
          // Manually trigger processing for the test job
          const processor = await matchQueue.getWorkers();
          logger.info("Current workers:", { count: processor.length });

          // Check queue status
          const jobCounts = await matchQueue.getJobCounts();
          logger.info("Current job counts:", jobCounts);
        } catch (error) {
          logger.error(
            "Error force processing job:",
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      } else {
        logger.error("Could not find test job to force process");
      }
    }, 5000); // Wait 5 seconds before trying to force process
  } catch (error) {
    logger.error(
      "Redis test failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
});

redisClient.on("error", (err) => {
  logger.error("Redis client error:", err);
});

redisClient.on("reconnecting", () => {
  logger.info("Redis client reconnecting...");
});

// Replace the existing matchQueue.process with these handlers:

// Process handler for 'test-job' type jobs
matchQueue.process("test-job", async (job) => {
  logger.info(`Processing test job ${job.id}`, {
    jobId: job.id,
    timestamp: new Date().toISOString(),
  });

  logger.info("Test job completed successfully");
  return { success: true, test: true };
});

// Default process handler for all other jobs (no name = default)
matchQueue.process(async (job) => {
  logger.info(`Starting to process job ${job.id}`, {
    jobId: job.id,
    quotationId: job.data.quotationId,
    timestamp: new Date().toISOString(),
  });

  try {
    // Import dynamically to ensure proper initialization
    const { processMatches } = await import("./processors/match-processor");

    logger.info(`Processing matches for quotation ${job.data.quotationId}`, {
      jobId: job.id,
      processorLoaded: true,
    });

    await processMatches(job.data.quotationId, prisma, logger);

    logger.info(`Successfully completed processing for job ${job.id}`, {
      quotationId: job.data.quotationId,
      completed: true,
    });

    return { success: true };
  } catch (error) {
    logger.error(`Error processing job ${job.id}:`, {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      quotationId: job.data.quotationId,
    });
    throw error;
  }
});

// Queue event listeners
matchQueue.on("completed", (job) => {
  logger.info(`Queue job ${job.id} completed successfully`, {
    quotationId: job.data.quotationId,
    isTest: job.data.test === true,
  });
});

matchQueue.on("failed", (job, err) => {
  logger.error(`Queue job ${job.id} failed`, {
    quotationId: job.data?.quotationId,
    error: err.message,
    stack: err.stack,
  });
});

matchQueue.on("active", (job) => {
  logger.info(`Queue job ${job.id} started processing`, {
    quotationId: job.data.quotationId,
    isTest: job.data.test === true,
  });
});

// Set up API server
const app = express();
const port = process.env.PORT || 8080;
const apiKey = process.env.BACKGROUND_PROCESSING_KEY;

if (!apiKey) {
  logger.error("BACKGROUND_PROCESSING_KEY environment variable is not set!");
  process.exit(1);
}

// Parse JSON bodies
app.use(express.json());

// Simple authentication middleware with enhanced logging
const authenticate = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;
  logger.info("Auth check:", {
    hasAuthHeader: !!authHeader,
    authHeaderStart: authHeader ? authHeader.substring(0, 20) + "..." : null,
  });

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    authHeader.replace("Bearer ", "") !== apiKey
  ) {
    logger.error("Authentication failed", {
      provided: authHeader
        ? authHeader.replace("Bearer ", "").substring(0, 5) + "..."
        : "none",
      expected: apiKey.substring(0, 5) + "...",
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  logger.info("Authentication successful");
  next();
};

app.use(cors());

// API route to add job to queue
app.post("/api/process", async (req, res) => {
  console.log("Raw request received:", {
    headers: req.headers,
    body: req.body,
    ip: req.ip,
    method: req.method,
    path: req.path,
  });
  // Log raw request details before authentication
  logger.info("Received raw API request:", {
    url: req.url,
    method: req.method,
    hasAuthHeader: !!req.headers.authorization,
    bodyKeys: Object.keys(req.body),
    bodyValues: req.body,
  });

  // Check authentication manually without using middleware
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.BACKGROUND_PROCESSING_KEY;

  logger.info("Auth check details:", {
    hasAuthHeader: !!authHeader,
    expectedKeyPrefix: expectedKey
      ? expectedKey.substring(0, 5) + "..."
      : "not set",
    providedKeyPrefix: authHeader
      ? authHeader.replace("Bearer ", "").substring(0, 5) + "..."
      : "none",
    authMatch: authHeader && authHeader.replace("Bearer ", "") === expectedKey,
  });

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    authHeader.replace("Bearer ", "") !== expectedKey
  ) {
    logger.error("Authentication failed", {
      hasAuth: !!authHeader,
      startsWithBearer: authHeader ? authHeader.startsWith("Bearer ") : false,
      keyMatch: authHeader
        ? authHeader.replace("Bearer ", "") === expectedKey
        : false,
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { quotationId } = req.body;

    logger.info("Processing authenticated request:", {
      quotationId,
      timestamp: new Date().toISOString(),
    });

    if (!quotationId || typeof quotationId !== "number") {
      logger.error("Invalid quotationId received:", quotationId);
      return res.status(400).json({ error: "Invalid quotationId" });
    }

    // Check if quotation exists
    try {
      const quotation = await prisma.quotation.findUnique({
        where: { id: quotationId },
      });

      if (!quotation) {
        logger.error("Quotation not found:", quotationId);
        return res.status(404).json({ error: "Quotation not found" });
      }

      logger.info("Found quotation in database:", {
        id: quotation.id,
        status: quotation.status,
      });
    } catch (dbError) {
      logger.error("Database error when finding quotation:", {
        error: dbError instanceof Error ? dbError.message : "Unknown error",
        quotationId,
      });
      throw dbError;
    }

    // Add job to queue
    try {
      const job = await matchQueue.add({
        quotationId,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Successfully added job to queue:`, {
        jobId: job.id,
        quotationId,
      });

      // Get current queue status
      const jobCounts = await matchQueue.getJobCounts();
      logger.info("Current queue status after adding job:", jobCounts);

      return res.status(202).json({
        message: "Processing started",
        jobId: job.id,
        quotationId,
      });
    } catch (queueError) {
      logger.error("Error adding job to queue:", {
        error:
          queueError instanceof Error ? queueError.message : "Unknown error",
        stack: queueError instanceof Error ? queueError.stack : undefined,
        quotationId,
      });
      throw queueError;
    }
  } catch (error) {
    logger.error("Error in process API handler:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res.status(500).json({
      error: "Failed to process request",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Queue status endpoint
app.get("/api/queue-status", async (req, res) => {
  try {
    // Get counts for different job statuses
    const jobCounts = await matchQueue.getJobCounts();

    // Get jobs by status
    const waitingJobs = await matchQueue.getJobs(["waiting"]);
    const activeJobs = await matchQueue.getJobs(["active"]);
    const completedJobs = await matchQueue.getJobs(["completed"]);
    const failedJobs = await matchQueue.getJobs(["failed"]);

    // Get workers
    const workers = await matchQueue.getWorkers();

    return res.status(200).json({
      counts: jobCounts,
      workers: workers.length,
      jobs: {
        waiting: waitingJobs.map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
        })),
        active: activeJobs.map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
        })),
        completed: completedJobs.slice(0, 5).map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
        })),
        failed: failedJobs.slice(0, 5).map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
          failedReason: job.failedReason,
        })),
      },
    });
  } catch (error) {
    logger.error("Error getting queue status:", error);
    return res.status(500).json({
      error: "Failed to get queue status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Status check endpoint for quotations
app.get("/api/status/:quotationId", authenticate, async (req, res) => {
  try {
    const quotationId = parseInt(req.params.quotationId);

    if (isNaN(quotationId)) {
      return res.status(400).json({ error: "Invalid quotation ID" });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      select: {
        id: true,
        status: true,
        processingStatus: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { matches: true },
        },
      },
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    // Get active jobs for this quotation
    const activeJobs = await matchQueue.getJobs([
      "active",
      "waiting",
      "delayed",
    ]);
    const jobForQuotation = activeJobs.find(
      (job) => job.data.quotationId === quotationId
    );

    return res.status(200).json({
      quotation,
      processing: !!jobForQuotation,
      jobId: jobForQuotation?.id,
    });
  } catch (error) {
    logger.error(`Error getting status for quotation:`, error);
    return res.status(500).json({
      error: "Failed to get quotation status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Start server
app.listen(port, () => {
  logger.info(`Worker API running on port ${port}`);
  logger.info("Agrospot worker service started successfully");
});

// Startup routine
(async () => {
  logger.info("Starting Agrospot worker...");

  // Test database connection
  await testDatabase();

  // Clean any stalled jobs
  await matchQueue.clean(0, "delayed");
  await matchQueue.clean(0, "wait");
  await matchQueue.clean(0, "active");

  // Look for any quotations stuck in 'processing' state and requeue them
  try {
    const stuckQuotations = await prisma.quotation.findMany({
      where: {
        processingStatus: "processing",
      },
    });

    if (stuckQuotations.length > 0) {
      logger.info(
        `Found ${stuckQuotations.length} stuck quotations, requeueing...`
      );

      for (const quotation of stuckQuotations) {
        await matchQueue.add({
          quotationId: quotation.id,
          isRecovery: true,
        });

        logger.info(`Requeued quotation ${quotation.id}`);
      }
    }
  } catch (error) {
    logger.error("Failed to recover stuck quotations:", error);
  }
})();

// Add this detailed debug endpoint
// Simplified debug endpoint
app.get("/api/debug", async (req, res) => {
  try {
    // Get current environment info
    const envInfo = {
      nodeEnv: process.env.NODE_ENV,
      hasRedisUrl: !!process.env.REDIS_URL,
      hasBgProcessingKey: !!process.env.BACKGROUND_PROCESSING_KEY,
      port: process.env.PORT || 8080,
      uptime: process.uptime(),
    };

    // Get Redis client status
    const redisStatus: any = {
      connected: redisClient.status === "ready",
      status: redisClient.status,
    };

    try {
      // Test Redis connection
      const pingResult = await redisClient.ping();
      redisStatus.pingResult = pingResult;
    } catch (redisError) {
      redisStatus.error =
        redisError instanceof Error ? redisError.message : "Unknown error";
    }

    // Get Bull queue status
    const queueInfo = {
      name: matchQueue.name,
      isReady: matchQueue.isReady(),
      jobCounts: await matchQueue.getJobCounts(),
    };

    // Get worker info
    const workers = await matchQueue.getWorkers();
    const workerInfo = {
      count: workers.length,
      workers: workers.map((w) => ({ id: w.id })),
    };

    // Get jobs by status
    const waiting = await matchQueue.getJobs(["waiting"]);
    const active = await matchQueue.getJobs(["active"]);
    const completed = await matchQueue.getJobs(["completed"]);
    const failed = await matchQueue.getJobs(["failed"]);

    return res.status(200).json({
      environment: envInfo,
      redis: redisStatus,
      queue: queueInfo,
      workers: workerInfo,
      jobs: {
        waiting: waiting.slice(0, 5).map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
        })),
        active: active.slice(0, 5).map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
        })),
        completed: completed.slice(0, 5).map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
        })),
        failed: failed.slice(0, 5).map((job) => ({
          id: job.id,
          data: job.data,
          timestamp: job.timestamp,
          failedReason: job.failedReason,
        })),
      },
    });
  } catch (error) {
    logger.error("Error in debug endpoint:", error);
    return res.status(500).json({
      error: "Failed to get debug info",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Add a manual trigger endpoint for testing
app.post("/api/force-process/:quotationId", async (req, res) => {
  try {
    const quotationId = parseInt(req.params.quotationId);

    if (isNaN(quotationId)) {
      return res.status(400).json({ error: "Invalid quotation ID" });
    }

    logger.info(`Manually forcing processing for quotation ${quotationId}`);

    // Check if quotation exists
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    // Add job to queue with priority
    const job = await matchQueue.add(
      {
        quotationId,
        timestamp: new Date().toISOString(),
        isManual: true,
      },
      {
        priority: 1, // High priority
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );

    logger.info(`Manually added job ${job.id} for quotation ${quotationId}`);

    return res.status(202).json({
      message: "Manual processing started",
      jobId: job.id,
      quotationId,
    });
  } catch (error) {
    logger.error(`Error in manual process:`, error);
    return res.status(500).json({
      error: "Failed to process manually",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// In your Railway worker, add a new endpoint:
app.get("/api/cron/process-pending-quotations", async (req, res) => {
  try {
    // Find quotations with 'pending' processing status
    const pendingQuotations = await prisma.quotation.findMany({
      where: {
        processingStatus: "pending",
        createdAt: {
          // Only process quotations from last 24 hours
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      take: 10, // Process in batches
    });

    logger.info(
      `Found ${pendingQuotations.length} pending quotations to process`
    );

    for (const quotation of pendingQuotations) {
      // Add to queue for processing
      const job = await matchQueue.add({
        quotationId: quotation.id,
        timestamp: new Date().toISOString(),
        isCronJob: true,
      });

      logger.info(`Added job ${job.id} for pending quotation ${quotation.id}`);
    }

    return res.status(200).json({
      message: `Scheduled ${pendingQuotations.length} quotations for processing`,
      quotations: pendingQuotations.map((q) => q.id),
    });
  } catch (error) {
    logger.error("Error in cron job:", error);
    return res.status(500).json({
      error: "Failed to process pending quotations",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
// Public endpoint to manually process a quotation (for testing)
app.get("/api/manual-process/:quotationId", async (req, res) => {
  try {
    const quotationId = parseInt(req.params.quotationId);

    if (isNaN(quotationId)) {
      return res.status(400).json({ error: "Invalid quotation ID" });
    }

    logger.info(`Manual processing request for quotation ${quotationId}`);

    // Check if quotation exists
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    // Add job to queue
    const job = await matchQueue.add({
      quotationId,
      timestamp: new Date().toISOString(),
      isManual: true,
    });

    logger.info(`Manually added job for quotation ${quotationId}`);

    return res.status(200).json({
      message: "Processing started",
      jobId: job.id,
      quotationId,
    });
  } catch (error) {
    logger.error(`Error in manual process:`, error);
    return res.status(500).json({
      error: "Failed to process",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
// Serve a simple HTML page for testing
app.get("/manual", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Manual Processing</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        button { padding: 10px; margin: 5px; }
        input { padding: 10px; width: 100px; }
      </style>
    </head>
    <body>
      <h1>Manual Quotation Processing</h1>
      <div>
        <label>Quotation ID: <input type="number" id="quotationId" value="65"></label>
        <button onclick="processQuotation()">Process</button>
      </div>
      <div id="result" style="margin-top: 20px; padding: 10px; border: 1px solid #ccc;"></div>
      
      <script>
        async function processQuotation() {
          const id = document.getElementById('quotationId').value;
          const resultDiv = document.getElementById('result');
          
          resultDiv.innerHTML = 'Processing...';
          
          try {
            const response = await fetch(\`/api/manual-process/\${id}\`);
            const data = await response.json();
            resultDiv.innerHTML = \`<pre>\${JSON.stringify(data, null, 2)}</pre>\`;
          } catch (error) {
            resultDiv.innerHTML = \`Error: \${error.message}\`;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Export for testing
export { matchQueue, prisma, logger };
