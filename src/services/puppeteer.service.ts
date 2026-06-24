import * as cheerio from "cheerio";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { config } from "../config.js";

puppeteer.use(StealthPlugin());

const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
];

type ScrapeEngine = "light" | "puppeteer";

type ScrapeResult = {
  url: string;
  engine: ScrapeEngine;
  title: string;
  description: string;
  headings: string[];
  text: string;
  links?: Array<{
    text: string;
    href: string;
  }>;
};

export async function captureFullPageScreenshot(url: string) {
  return withPage(url, async (page) => {
    await preparePageForCapture(page);

    return page.screenshot({
      type: "png",
      fullPage: true,
      optimizeForSpeed: false
    });
  });
}

export async function scrapePageText(url: string, includeLink = false): Promise<ScrapeResult> {
  const lightResult = await scrapePageTextLight(url, includeLink).catch(() => undefined);

  if (lightResult && isUsefulScrapeResult(lightResult)) {
    return lightResult;
  }

  return scrapePageTextWithBrowser(url, includeLink);
}

async function scrapePageTextLight(url: string, includeLink: boolean): Promise<ScrapeResult> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(Math.min(config.requestTimeoutMs, 15000)),
    headers: {
      "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] ?? defaultUserAgent,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Upgrade-Insecure-Requests": "1"
    }
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
    throw new Error("Light scrape unavailable");
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
  const blockedSelectors = "script, style, noscript, svg, canvas, iframe, nav, footer";

  $(blockedSelectors).remove();

  const textChunks: string[] = [];

  $("body")
    .find("*")
    .addBack()
    .contents()
    .each((_, node) => {
      if (node.type === "text") {
        const value = normalize(node.data);
        if (value) {
          textChunks.push(value);
        }
      }
    });

  const result: ScrapeResult = {
    url: response.url,
    engine: "light",
    title: normalize($("title").first().text()),
    description: normalize($("meta[name='description']").attr("content")),
    headings: $("h1, h2, h3")
      .map((_, element) => normalize($(element).text()))
      .get()
      .filter(Boolean),
    text: normalize(textChunks.join(" "))
  };

  if (includeLink) {
    const pageHostname = normalizeHostname(new URL(response.url).hostname);
    const seenLinks = new Set<string>();

    result.links = $("a[href]")
      .toArray()
      .flatMap((element) => {
        try {
          const linkUrl = new URL($(element).attr("href") ?? "", response.url);

          if (
            !["http:", "https:"].includes(linkUrl.protocol) ||
            normalizeHostname(linkUrl.hostname) !== pageHostname
          ) {
            return [];
          }

          linkUrl.hash = "";

          if (seenLinks.has(linkUrl.href)) {
            return [];
          }

          seenLinks.add(linkUrl.href);

          return [{
            text: normalize($(element).text()),
            href: linkUrl.href
          }];
        } catch {
          return [];
        }
      });
  }

  return result;
}

function isUsefulScrapeResult(result: ScrapeResult) {
  const lowerText = result.text.toLowerCase();

  if (result.text.length < 80) {
    return false;
  }

  return ![
    "enable javascript",
    "checking your browser",
    "verify you are human",
    "access denied",
    "attention required",
    "cloudflare"
  ].some((marker) => lowerText.includes(marker));
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

async function scrapePageTextWithBrowser(url: string, includeLink = false): Promise<ScrapeResult> {
  return withPage(url, async (page) => {
    await preparePageForCapture(page);

    return page.evaluate(`(() => {
      const includeLink = ${JSON.stringify(includeLink)};
      const normalize = (value) => value?.replace(/\\s+/g, " ").trim() ?? "";
      const title = normalize(document.title);
      const description = normalize(document.querySelector("meta[name='description']")?.content);
      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((element) => normalize(element.textContent))
        .filter(Boolean);
      const blockedSelectors = "script, style, noscript, svg, canvas, iframe, nav, footer";
      const bodyClone = document.body?.cloneNode(true);

      if (bodyClone instanceof HTMLElement) {
        bodyClone.querySelectorAll(blockedSelectors).forEach((element) => element.remove());
      }

      const extractText = (root) => {
        if (!(root instanceof HTMLElement)) {
          return normalize(document.body?.innerText);
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const chunks = [];
        let node = walker.nextNode();

        while (node) {
          const value = normalize(node.nodeValue);
          if (value) {
            chunks.push(value);
          }
          node = walker.nextNode();
        }

        return normalize(chunks.join(" "));
      };
      const text = extractText(bodyClone);
      const result = {
        url: location.href,
        engine: "puppeteer",
        title,
        description,
        headings,
        text
      };

      if (includeLink) {
        const normalizeHostname = (hostname) => hostname.toLowerCase().replace(/^www\\./, "");
        const pageHostname = normalizeHostname(location.hostname);
        const seenLinks = new Set();

        result.links = Array.from(document.querySelectorAll("a[href]"))
          .flatMap((anchor) => {
            try {
              const linkUrl = new URL(anchor.href, location.href);

              if (
                !["http:", "https:"].includes(linkUrl.protocol) ||
                normalizeHostname(linkUrl.hostname) !== pageHostname
              ) {
                return [];
              }

              linkUrl.hash = "";

              if (seenLinks.has(linkUrl.href)) {
                return [];
              }

              seenLinks.add(linkUrl.href);

              return [{
                text: normalize(anchor.textContent),
                href: linkUrl.href
              }];
            } catch {
              return [];
            }
          });
      }

      return result;
    })()`) as Promise<ScrapeResult>;
  });
}

async function withPage<T>(url: string, callback: (page: Page) => Promise<T>): Promise<T> {
  let browser: Browser | undefined;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await configureNaturalPage(page);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.requestTimeoutMs
    });
    await waitForPageSettled(page);

    return await callback(page);
  } finally {
    await browser?.close();
  }
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: config.puppeteerHeadless,
    dumpio: config.puppeteerDebug,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1366,768",
      "--lang=en-US,en;q=0.9"
    ]
  });
}

async function configureNaturalPage(page: Page) {
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)] ?? defaultUserAgent;

  await page.setUserAgent(userAgent);
  await page.setViewport({
    width: 1366 + Math.floor(Math.random() * 120),
    height: 768 + Math.floor(Math.random() * 120),
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: true,
    isMobile: false
  });
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Upgrade-Insecure-Requests": "1"
  });
  await page.evaluateOnNewDocument(`(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"]
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5]
    });
  })()`);
}

async function waitForPageSettled(page: Page) {
  await page.waitForNetworkIdle({
    idleTime: 1000,
    timeout: Math.min(config.requestTimeoutMs, 10000)
  }).catch(() => undefined);

  await delay(1000);
  await autoScroll(page);
  await waitForFontsAndImages(page);
  await delay(500);
}

async function preparePageForCapture(page: Page) {
  await page.evaluate(`(() => {
    document.querySelectorAll("video").forEach((video) => video.pause());
    document.querySelectorAll("[data-cookiebanner], [aria-label*='cookie' i], [id*='cookie' i], [class*='cookie' i]").forEach((element) => {
      const style = window.getComputedStyle(element);
      if (style.position === "fixed" || style.position === "sticky") {
        element.style.display = "none";
      }
    });
  })()`);
}

async function autoScroll(page: Page) {
  await page.evaluate(`(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      let steps = 0;
      const distance = 350;
      const maxSteps = 100;
      const startedAt = Date.now();
      const maxDurationMs = 12000;
      const timer = window.setInterval(() => {
        const maxHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        window.scrollBy(0, distance);
        totalHeight += distance;
        steps += 1;

        if (totalHeight >= maxHeight || steps >= maxSteps || Date.now() - startedAt >= maxDurationMs) {
          window.clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  })()`);
}

async function waitForFontsAndImages(page: Page) {
  await page.evaluate(`(async () => {
    const timeout = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    await Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      timeout(5000)
    ]);

    const images = Array.from(document.images).filter((image) => !image.complete);

    await Promise.race([
      Promise.all(
        images.map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            })
        )
      ),
      timeout(8000)
    ]);
  })()`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
