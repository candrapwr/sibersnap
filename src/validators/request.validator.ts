import { z } from "zod";

export const requestSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "URL must use http or https"
    })
});

export const scrapeRequestSchema = requestSchema.extend({
  includeLink: z.boolean().default(false)
});

export const screenshotRequestSchema = requestSchema.extend({
  json: z.boolean().default(false),
  compress: z.boolean().default(false),
  quality: z.number().int().min(1).max(100).default(75)
});
