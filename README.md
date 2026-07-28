<div align="center">

# 📸 SiberSnap

**API Node.js untuk tangkap screenshot halaman penuh & ekstrak teks dari halaman web.**

Dibangun dengan TypeScript, Express, Puppeteer, Cheerio, dan Sharp. Scraping ringan dengan fallback otomatis ke browser headless untuk halaman dinamis/terproteksi.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-server-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Puppeteer](https://img.shields.io/badge/Puppeteer-headless-40B5A4?logo=puppeteer&logoColor=white)](https://pptr.dev/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-berkontribusi)
[![Status](https://img.shields.io/badge/status-aktif_maintained-success.svg)](#-status)
[![Stars](https://img.shields.io/github/stars/candrapwr/sibersnap?style=social&label=Star)](https://github.com/candrapwr/sibersnap/stargazers)

</div>

---

> 🌐 Bagian dari **Ekosistem Siber** — dibangun & dirawat oleh **dataSiberLab**.

SiberSnap is a Node.js API for capturing full-page website screenshots and extracting text content from web pages. It is built with TypeScript, Express, Puppeteer, Cheerio, and Sharp.

## Features

- Full-page website screenshots
- PNG file responses by default
- Optional JSON responses with Base64-encoded images
- Optional WebP image compression with configurable quality
- Lightweight scraping with Fetch and Cheerio
- Automatic Puppeteer fallback for dynamic or protected pages
- Dynamic content, font, image, and network-idle handling
- Bot-detection evasion using `puppeteer-extra` and the stealth plugin
- Optional internal-link extraction
- External, duplicate, invalid, and fragment-only links are excluded
- Request validation with Zod

## Requirements

- Node.js 20 or newer
- npm
- A system capable of running Chromium

## Installation

```bash
git clone <repository-url>
cd sibersnap
npm install
cp .env.example .env
```

## Configuration

```env
PORT=3000
NODE_ENV=development
REQUEST_TIMEOUT_MS=90000
PUPPETEER_HEADLESS=true
PUPPETEER_DEBUG=false
```

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Application environment |
| `REQUEST_TIMEOUT_MS` | `90000` | Page navigation and loading timeout |
| `PUPPETEER_HEADLESS` | `true` | Run Chromium without a visible window |
| `PUPPETEER_DEBUG` | `false` | Forward Chromium process output to server logs |

## Running the Project

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

Type checking:

```bash
npm run typecheck
```

The API is available at `http://localhost:3000` by default.

## Ubuntu Screenshot Troubleshooting

Enable detailed Chromium output in `.env`:

```env
NODE_ENV=production
PUPPETEER_HEADLESS=true
PUPPETEER_DEBUG=true
```

Rebuild and restart the application:

```bash
npm run build
npm start
```

View logs based on the process manager:

```bash
pm2 logs sibersnap --lines 200
```

```bash
journalctl -u sibersnap -n 200 -f
```

```bash
docker logs --tail 200 -f <container-name>
```

Install the Puppeteer browser and required Ubuntu system dependencies:

```bash
sudo npx puppeteer browsers install chrome --install-deps
```

Test the screenshot endpoint directly and save both headers and response:

```bash
curl -v \
  -X POST http://127.0.0.1:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","json":true}'
```

Set `PUPPETEER_DEBUG=false` again after troubleshooting to reduce production log volume.

## API Endpoints

### Health Check

```http
GET /health
```

Response:

```json
{
  "status": "ok",
  "service": "SiberSnap"
}
```

### Full-Page Screenshot

```http
POST /api/screenshot
Content-Type: application/json
```

Request parameters:

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | string | required | HTTP or HTTPS page URL |
| `json` | boolean | `false` | Return JSON with Base64 instead of an image file |
| `compress` | boolean | `false` | Convert the image to compressed WebP |
| `quality` | integer | `75` | WebP quality from `1` to `100` |

PNG file response:

```json
{
  "url": "https://example.com"
}
```

Compressed WebP file response:

```json
{
  "url": "https://example.com",
  "compress": true,
  "quality": 75
}
```

JSON Base64 response:

```json
{
  "url": "https://example.com",
  "json": true,
  "compress": true,
  "quality": 75
}
```

Example response:

```json
{
  "url": "https://example.com",
  "mimeType": "image/webp",
  "encoding": "base64",
  "compressed": true,
  "quality": 75,
  "size": 7682,
  "image": "UklGR..."
}
```

### Web Scraping

```http
POST /api/scrape
Content-Type: application/json
```

Request parameters:

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | string | required | HTTP or HTTPS page URL |
| `includeLink` | boolean | `false` | Include links from the same hostname |

Request:

```json
{
  "url": "https://example.com",
  "includeLink": true
}
```

Example response:

```json
{
  "url": "https://example.com/",
  "engine": "light",
  "title": "Example Domain",
  "description": "",
  "headings": [
    "Example Domain"
  ],
  "text": "Example Domain This domain is for use in illustrative examples.",
  "links": [
    {
      "text": "Documentation",
      "href": "https://example.com/docs"
    }
  ]
}
```

The scraper first uses Fetch and Cheerio for lower resource usage. If the page requires JavaScript, returns insufficient content, or appears to contain an anti-bot challenge, SiberSnap retries the request using Puppeteer.

When `includeLink` is enabled:

- Only HTTP and HTTPS links from the same hostname are returned.
- `www.example.com` and `example.com` are treated as the same hostname.
- URL fragments such as `#section` are removed.
- Duplicate, external, invalid, `mailto:`, `tel:`, and `javascript:` links are excluded.

## Postman

Import `SiberSnap.postman_collection.json` into Postman. The collection includes requests for:

- Health checks
- Web scraping
- Screenshot file responses
- Screenshot JSON and Base64 responses

The default `baseUrl` collection variable is:

```text
http://localhost:3000
```

## Project Structure

```text
src/
|-- app.ts
|-- config.ts
|-- server.ts
|-- services/
|   `-- puppeteer.service.ts
`-- validators/
    `-- request.validator.ts
```

## Responsible Use

Use SiberSnap only on websites you are authorized to access and scrape. Follow applicable laws, website terms, robots policies, rate limits, privacy requirements, and copyright restrictions.

## License

SiberSnap is licensed under the **MIT License**. See [LICENSE](./LICENSE).

Copyright (c) 2026 dataSiberLab

---

## 🤝 Berkontribusi

Kontribusi diterima!

1. Fork & clone repo
2. `npm install && npm run dev`
3. Buat perubahanmu, lalu buka PR

Untuk perubahan besar, silakan buka [issue](https://github.com/candrapwr/sibersnap/issues) dulu untuk berdiskusi.

---

## 📬 Kontak & Komunitas

<div align="center">

**Dibuat dengan ❤️ oleh [dataSiberLab](https://datasiber.com)** sebagai bagian dari ekosistem Siber.

📧 **Kontak:** [candrapwr@datasiber.com](mailto:candrapwr@datasiber.com)
🌐 **Website:** [datasiber.com](https://datasiber.com)

SiberSnap berguna? ⭐ Star repo-nya dan bagikan ke sesama builder!

</div>

<!-- repo: sibersnap · dataSiberLab · 2026 -->
