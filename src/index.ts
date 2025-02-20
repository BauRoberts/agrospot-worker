import "dotenv/config";
import express from "express";
import Bull from "bull";
import { PrismaClient } from "@prisma/client";
import winston from "winston";

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
redisClient.on("connect", () => {
  logger.info("Redis client connected");
});

redisClient.on("error", (err) => {
  logger.error("Redis client error:", err);
});

redisClient.on("reconnecting", () => {
  logger.info("Redis client reconnecting...");
});

// Process match jobs using our processor
matchQueue.process(async (job) => {
  logger.info(`Processing job ${job.id} for quotation ${job.data.quotationId}`);
  try {
    // Import dynamically to ensure proper initialization
    const { processMatches } = await import("./processors/match-processor");
    await processMatches(job.data.quotationId, prisma, logger);
    logger.info(`Successfully completed job ${job.id}`);
    return { success: true };
  } catch (error) {
    logger.error(`Error processing job ${job.id}:`, error);
    throw error; // Rethrow to let Bull handle retry logic
  }
});

// Global error handlers
matchQueue.on("failed", (job, err) => {
  logger.error(`Job ${job.id} failed with error:`, err);
});

matchQueue.on("completed", (job) => {
  logger.info(`Job ${job.id} completed successfully`);
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

// Simple authentication middleware
const authenticate = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    authHeader.replace("Bearer ", "") !== apiKey
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};

// API route to add job to queue
app.post("/api/process", authenticate, async (req, res) => {
  try {
    const { quotationId } = req.body;

    if (!quotationId || typeof quotationId !== "number") {
      return res.status(400).json({ error: "Invalid quotationId" });
    }

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
    });

    logger.info(`Added job ${job.id} to process quotation ${quotationId}`);

    return res.status(202).json({
      message: "Processing started",
      jobId: job.id,
      quotationId,
    });
  } catch (error) {
    logger.error("Error adding job to queue:", error);
    return res.status(500).json({
      error: "Failed to process request",
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

// Export for testing
export { matchQueue, prisma, logger };
