function booleanFromEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: numberFromEnv(process.env.PORT, 3000),
  requestTimeoutMs: numberFromEnv(process.env.REQUEST_TIMEOUT_MS, 90000),
  puppeteerHeadless: booleanFromEnv(process.env.PUPPETEER_HEADLESS, true),
  puppeteerDebug: booleanFromEnv(process.env.PUPPETEER_DEBUG, false)
};
