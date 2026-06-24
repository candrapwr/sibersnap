import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import morgan from "morgan";
import sharp from "sharp";
import { captureFullPageScreenshot, scrapePageText } from "./services/puppeteer.service.js";
import { scrapeRequestSchema, screenshotRequestSchema } from "./validators/request.validator.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("combined"));
  app.use((req, res, next) => {
    const startedAt = Date.now();

    res.on("close", () => {
      if (!res.writableEnded) {
        console.error({
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.originalUrl,
          targetUrl: typeof req.body?.url === "string" ? req.body.url : undefined,
          message: "Client connection closed before the response completed",
          durationMs: Date.now() - startedAt
        });
      }
    });

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "SiberSnap" });
  });

  app.post("/api/screenshot", async (req, res, next) => {
    try {
      const input = screenshotRequestSchema.parse(req.body);
      const image = await captureFullPageScreenshot(input.url);
      const originalBuffer = Buffer.from(image);
      const buffer = input.compress
        ? await sharp(originalBuffer).webp({ quality: input.quality }).toBuffer()
        : originalBuffer;
      const mimeType = input.compress ? "image/webp" : "image/png";
      const extension = input.compress ? "webp" : "png";

      if (input.json) {
        res.json({
          url: input.url,
          mimeType,
          encoding: "base64",
          compressed: input.compress,
          quality: input.compress ? input.quality : undefined,
          size: buffer.length,
          image: buffer.toString("base64")
        });
        return;
      }

      res
        .status(200)
        .set({
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename="sibersnap-screenshot.${extension}"`,
          "Content-Length": buffer.length.toString()
        })
        .send(buffer);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scrape", async (req, res, next) => {
    try {
      const input = scrapeRequestSchema.parse(req.body);
      const data = await scrapePageText(input.url, input.includeLink);

      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    const status = typeof error?.status === "number" ? error.status : 500;
    const message = error?.issues ? "Invalid request payload" : error?.message || "Internal server error";

    console.error({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      targetUrl: typeof req.body?.url === "string" ? req.body.url : undefined,
      status,
      message,
      stack: error instanceof Error ? error.stack : undefined,
      details: error?.issues ?? undefined
    });

    res.status(status).json({
      error: message,
      details: error?.issues ?? undefined
    });
  };

  app.use(errorHandler);

  return app;
}
