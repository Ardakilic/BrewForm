# BrewForm Coding Plan — Deno Deploy Readiness

This document details every code change required to make BrewForm deployable to Deno Deploy while preserving full local development capabilities. All commands use Deno-native tooling (`deno run`, `deno task`, `deno install`) — no `npx` or `npm run`.

---

## Architecture Overview (Target State)

```
Production:
  brewform.cc          → Deno Deploy Static Site (React SPA)
  api.brewform.cc      → Deno Deploy Dynamic App (Hono API)
  └─ Prisma Postgres   → Managed PostgreSQL (via Prisma Accelerate)
  └─ Deno KV           → Managed edge cache
  └─ S3-compatible     → Object storage for photos (R2, B2, Garage, etc.)

Local:
  localhost:5173       → Vite dev server (React SPA)
  localhost:8000       → Deno API server
  └─ Docker PostgreSQL → Local database
  └─ Deno KV (file)    → Local cache
  └─ Garage S3         → Local object storage (optional: local filesystem)
  └─ Mailpit           → Local SMTP
```

---

## 1. Prisma Dual-Mode Setup

### Problem
`@prisma/client` downloads a native binary query engine. Deno Deploy's serverless isolates cannot execute arbitrary binaries. The Prisma edge client (generated with `runtime = "deno"`) uses an HTTP-based query engine that connects via Prisma Accelerate.

### Solution
Maintain two Prisma client generators in `schema.prisma` and conditionally import at runtime.

### Files Changed

#### `packages/db/prisma/schema.prisma`
Add a second generator block **below** the existing one:

```prisma
generator client {
  provider = "prisma-client-js"
}

generator clientDeno {
  provider = "prisma-client"
  runtime  = "deno"
  output   = "../generated/prisma"
}
```

> Keep `prisma-client-js` for local development (binary engine). Add `prisma-client` with `runtime = "deno"` for Deno Deploy.

#### `packages/db/package.json`
Add dependency:
```json
{
  "dependencies": {
    "@brewform/shared": "*",
    "@prisma/client": "^6.19.3",
    "@prisma/extension-accelerate": "^1.0.0"
  }
}
```

#### `packages/db/src/index.ts`
Replace the entire file with conditional loading:

```typescript
// deno-lint-ignore-file no-explicit-any
let prisma: any;

if (Deno.env.get("DENO_DEPLOY")) {
  const mod = await import("../generated/prisma/client.ts");
  const { withAccelerate } = await import("npm:@prisma/extension-accelerate");
  const PrismaClient = mod.PrismaClient;
  prisma = new PrismaClient({
    datasources: {
      db: { url: Deno.env.get("DATABASE_URL") },
    },
  }).$extends(withAccelerate());
} else {
  const mod = await import("@prisma/client");
  const PrismaClient = (mod as any).PrismaClient;
  const globalForPrisma = globalThis as unknown as { prisma: any };
  prisma = globalForPrisma.prisma || new PrismaClient({
    datasources: {
      db: { url: Deno.env.get("DATABASE_URL") },
    },
  });
  if (Deno.env.get("APP_ENV") !== "production") {
    globalForPrisma.prisma = prisma;
  }
}

export { prisma };
export default prisma;
```

#### Root `deno.json` (tasks section, add if not present)
```json
{
  "tasks": {
    "db:generate": "deno run -A npm:prisma@^6.19.3 generate --schema=packages/db/prisma/schema.prisma",
    "db:migrate": "deno run -A npm:prisma@^6.19.3 migrate deploy --schema=packages/db/prisma/schema.prisma",
    "db:push": "deno run -A npm:prisma@^6.19.3 db push --schema=packages/db/prisma/schema.prisma",
    "db:studio": "deno run -A npm:prisma@^6.19.3 studio --schema=packages/db/prisma/schema.prisma"
  }
}
```

### Local Dev Verification
```bash
deno task db:generate
# Verify both node_modules/.prisma and packages/db/generated/prisma exist
deno check apps/api/src/main.ts
```

---

## 2. Pre-compile MJML Email Templates

### Problem
`mjml` and `node:fs` are not available on Deno Deploy. Email templates are currently loaded from `.mjml` files at runtime.

### Solution
Build-time compilation: convert all `.mjml` templates to TypeScript modules exporting template functions. Run once during setup and after any template edit.

### Templates to Compile
- `apps/api/src/templates/email/welcome.mjml`
- `apps/api/src/templates/email/reset-password.mjml`
- `apps/api/src/templates/email/new-follower.mjml`
- `apps/api/src/templates/email/recipe-liked.mjml`
- `apps/api/src/templates/email/recipe-commented.mjml`
- `apps/api/src/templates/email/followed-user-posted.mjml`

### Files Changed / Created

#### `apps/api/scripts/build-email-templates.ts` (NEW)
```typescript
/**
 * Build script: compiles all .mjml templates to TypeScript modules.
 * Run with: deno run -A apps/api/scripts/build-email-templates.ts
 * Re-run whenever a .mjml template is modified.
 */
import { dirname, join } from "jsr:@std/path@^1.0.0";
import { ensureDir } from "jsr:@std/fs@^1.0.0";

// MJML must be available as a build-time dependency via npm:
const { default: mjml2html } = await import("npm:mjml@^4.15.0");

const templateDir = join(dirname(import.meta.url), "..", "src", "templates", "email");
const outputDir = join(dirname(import.meta.url), "..", "src", "templates", "email", "generated");

await ensureDir(outputDir);

for await (const entry of Deno.readDir(templateDir)) {
  if (!entry.name.endsWith(".mjml")) continue;

  const name = entry.name.replace(".mjml", "");
  const mjmlPath = join(templateDir, entry.name);
  const mjmlContent = await Deno.readTextFile(mjmlPath);

  const { html } = mjml2html(mjmlContent, { minify: true });

  // Convert {{var}} placeholders to ${vars.var} template literals
  const templateLiteral = html.replace(/\{\{(\w+)\}\}/g, "${vars.$1}");

  const tsContent = `// Auto-generated from ${entry.name}
// Do not edit manually. Run: deno run -A apps/api/scripts/build-email-templates.ts

export interface ${toPascalCase(name)}Vars {
  // Add specific fields by inspecting the template
  [key: string]: string;
}

export function ${toCamelCase(name)}Template(vars: ${toPascalCase(name)}Vars): string {
  return \`${templateLiteral}\`;
}
`;

  await Deno.writeTextFile(join(outputDir, `${name}.ts`), tsContent);
}

function toPascalCase(s: string) {
  return s.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join("");
}
function toCamelCase(s: string) {
  const pc = toPascalCase(s);
  return pc[0].toLowerCase() + pc.slice(1);
}

console.log("Email templates compiled successfully.");
```

#### `apps/api/src/modules/auth/email.ts`
Replace runtime MJML + `node:fs` with generated templates:

```typescript
import { config } from "../../config/index.ts";
import { createLogger } from "../../utils/logger/index.ts";
import { welcomeTemplate } from "../../templates/email/generated/welcome.ts";
import { resetPasswordTemplate } from "../../templates/email/generated/reset-password.ts";
import nodemailer from "npm:nodemailer@^7.0.0";

const logger = createLogger("email");

function createTransporter() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  logger.info({ to, subject }, "Sending email");
  if (config.APP_ENV === "test") {
    logger.info({ to, subject }, "Email skipped (test environment)");
    return;
  }
  try {
    const transporter = createTransporter();
    await transporter.sendMail({ from: config.EMAIL_FROM, to, subject, html });
    logger.info({ to, subject }, "Email sent successfully");
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
    throw err;
  }
}

export async function sendWelcomeEmail(to: string, username: string) {
  const html = welcomeTemplate({ username, app_name: "BrewForm" });
  await sendEmail(to, "Welcome to BrewForm!", html);
}

export async function sendPasswordResetEmail(to: string, token: string, username: string) {
  const baseUrl = config.APP_ENV === "production" ? "https://brewform.cc" : "http://localhost:5173";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const html = resetPasswordTemplate({ username, reset_url: resetUrl, app_name: "BrewForm" });
  await sendEmail(to, "Reset your BrewForm password", html);
}
```

#### `apps/api/src/utils/notify/index.ts`
Apply the same pattern: import generated templates, remove `node:fs`, `node:path`, and `mjml`.

#### `apps/api/package.json`
Remove `mjml` from `dependencies`. It is now a **dev-only** build-time tool.

### Local Dev Verification
```bash
deno run -A apps/api/scripts/build-email-templates.ts
# Verify 6 files created in apps/api/src/templates/email/generated/
deno check apps/api/src/modules/auth/email.ts
```

---

## 3. File Uploads — S3-Compatible Storage with Local Fallback

### Problem
`Deno.writeFile("./uploads/...")` writes to ephemeral storage on Deno Deploy. Photos are lost on cold starts.

### Solution
Abstract storage behind a driver interface. Support `local` (filesystem) for dev and `s3` (any S3-compatible API) for production.

### Files Changed / Created

#### `apps/api/src/config/env.ts`
Add to schema:
```typescript
STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
S3_ENDPOINT: z.string().optional(),
S3_REGION: z.string().default("auto"),
S3_BUCKET: z.string().optional(),
S3_ACCESS_KEY: z.string().optional(),
S3_SECRET_KEY: z.string().optional(),
S3_PUBLIC_URL: z.string().optional(),
```

Keep existing `UPLOAD_DIR`, `UPLOAD_MAX_SIZE_BYTES`, `UPLOAD_ALLOWED_TYPES` — they still apply for validation and local storage.

#### `apps/api/src/utils/storage/types.ts` (NEW)
```typescript
export interface StorageDriver {
  save(data: Uint8Array, filename: string): Promise<string>; // returns public URL
  delete(filename: string): Promise<void>;
}
```

#### `apps/api/src/utils/storage/local.ts` (NEW)
```typescript
import { config } from "../../config/index.ts";
import type { StorageDriver } from "./types.ts";

export class LocalStorageDriver implements StorageDriver {
  async save(data: Uint8Array, filename: string): Promise<string> {
    const dir = config.UPLOAD_DIR;
    await Deno.mkdir(dir, { recursive: true });
    const path = `${dir}/${filename}`;
    await Deno.writeFile(path, data);
    return `/uploads/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    try {
      await Deno.remove(`${config.UPLOAD_DIR}/${filename}`);
    } catch { /* ignore */ }
  }
}
```

#### `apps/api/src/utils/storage/s3.ts` (NEW)
Implement AWS Signature V4 in pure TypeScript using Web Crypto API (available in Deno):

```typescript
import { config } from "../../config/index.ts";
import type { StorageDriver } from "./types.ts";

export class S3StorageDriver implements StorageDriver {
  private endpoint: string;
  private region: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;
  private publicUrl: string;

  constructor() {
    this.endpoint = config.S3_ENDPOINT!;
    this.region = config.S3_REGION;
    this.bucket = config.S3_BUCKET!;
    this.accessKey = config.S3_ACCESS_KEY!;
    this.secretKey = config.S3_SECRET_KEY!;
    this.publicUrl = config.S3_PUBLIC_URL!;
  }

  async save(data: Uint8Array, filename: string): Promise<string> {
    const key = `${this.bucket}/${filename}`;
    const url = `${this.endpoint}/${key}`;
    const headers = await this.signRequest("PUT", url, data);
    const res = await fetch(url, { method: "PUT", headers, body: data });
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`);
    return `${this.publicUrl}/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    const key = `${this.bucket}/${filename}`;
    const url = `${this.endpoint}/${key}`;
    const headers = await this.signRequest("DELETE", url);
    await fetch(url, { method: "DELETE", headers });
  }

  private async signRequest(method: string, url: string, body?: Uint8Array): Promise<Headers> {
    // AWS Signature V4 implementation using Web Crypto API
    // ~100 lines: parse URL, create canonical request, derive signing key, HMAC-SHA256
    // See AWS docs or existing Deno S3 libraries for reference implementation
    return new Headers();
  }
}
```

> The signing implementation should be complete and tested. Alternatively, use `jsr:@std/crypto` for HMAC if needed.

#### `apps/api/src/utils/storage/index.ts` (NEW)
```typescript
import { config } from "../../config/index.ts";
import { LocalStorageDriver } from "./local.ts";
import { S3StorageDriver } from "./s3.ts";
import type { StorageDriver } from "./types.ts";

export function createStorageDriver(): StorageDriver {
  switch (config.STORAGE_DRIVER) {
    case "s3":
      return new S3StorageDriver();
    case "local":
    default:
      return new LocalStorageDriver();
  }
}

export type { StorageDriver };
```

#### `apps/api/src/utils/upload/index.ts`
Refactor to use the storage driver:

```typescript
import { config } from "../../config/index.ts";
import { createStorageDriver } from "../storage/index.ts";

const driver = createStorageDriver();

export function getPublicUrl(filename: string): string {
  if (config.STORAGE_DRIVER === "local") {
    return `/uploads/${filename}`;
  }
  return `${config.S3_PUBLIC_URL}/${filename}`;
}

export async function saveUploadedFile(data: Uint8Array, filename: string): Promise<string> {
  return driver.save(data, filename);
}

export async function saveThumbnail(
  thumbnailBytes: Uint8Array | null,
  originalFilename: string,
  fallbackUrl: string,
  _size: string = "medium",
): Promise<string> {
  if (!thumbnailBytes || thumbnailBytes.length === 0) {
    return fallbackUrl;
  }
  const filename = generateThumbnailFilename(originalFilename, _size);
  await driver.save(thumbnailBytes, filename);
  return getPublicUrl(filename);
}

// Keep: validateImageUpload, generateFilename, generateThumbnailFilename, getThumbnailSizes
// Remove: ensureUploadDir (handled by driver), node:fs dependency
```

#### `apps/api/src/modules/photo/service.ts`
No changes needed if `upload/index.ts` interface is preserved.

#### `apps/api/src/routes/index.ts`
If `/uploads/*` static serving exists, add conditional: only mount when `STORAGE_DRIVER === "local"`. For S3, files are served directly from the object storage public URL.

### Local Dev Verification
```bash
# Test local driver (default)
deno task dev
curl -X POST -F "file=@test.jpg" http://localhost:8000/api/v1/photos
# Verify file exists in ./uploads

# Test with Garage (see Section 4)
# Set STORAGE_DRIVER=s3 and Garage credentials in .env
curl -X POST -F "file=@test.jpg" http://localhost:8000/api/v1/photos
# Verify via awscli: aws --endpoint-url=http://localhost:3900 s3 ls s3://brewform-uploads
```

---

## 4. Local S3 Development with Garage

### Problem
Developers need to test S3 uploads locally without using a cloud provider.

### Solution
Add [Garage](https://garagehq.deuxfleurs.fr) to `compose.yml` as a single-node S3-compatible object store.

### Files Changed

#### `compose.yml`
Add service:

```yaml
  garage:
    image: dxflrs/garage:v2.3.0
    ports:
      - "3900:3900"  # S3 API
      - "3902:3902"  # Web gateway
    environment:
      - GARAGE_DEFAULT_ACCESS_KEY=GK$(openssl rand -hex 16)
      - GARAGE_DEFAULT_SECRET_KEY=$(openssl rand -hex 32)
      - GARAGE_DEFAULT_BUCKET=brewform-uploads
    command: /garage server --single-node --default-bucket
    volumes:
      - garage_data:/tmp/data
      - garage_meta:/tmp/meta

volumes:
  postgres_data:
  garage_data:
  garage_meta:
```

#### `.env.example`
Add Garage defaults:
```
STORAGE_DRIVER=local

# S3-compatible storage (used when STORAGE_DRIVER=s3)
S3_ENDPOINT=http://localhost:3900
S3_REGION=garage
S3_BUCKET=brewform-uploads
S3_ACCESS_KEY=GK<your-generated-key>
S3_SECRET_KEY=<your-generated-secret>
S3_PUBLIC_URL=http://localhost:3902/brewform-uploads
```

### Post-Setup (One-Time)
After `docker compose up -d garage`, copy the generated credentials from container logs or env to `.env`.

### Local Dev Verification
```bash
docker compose up -d garage
source ~/.awsrc  # or set AWS env vars manually
aws --endpoint-url=http://localhost:3900 s3 ls
aws --endpoint-url=http://localhost:3900 s3 ls s3://brewform-uploads
```

---

## 5. Background Jobs — `Deno.cron()` for Local and Production

### Problem
`setInterval`-based jobs do not run on Deno Deploy because isolates sleep between requests.

### Solution
Replace the job scheduler with `Deno.cron()`. This API is available in both Deno CLI (v1.38+) and Deno Deploy.

### Files Changed

#### `apps/api/src/utils/jobs/index.ts`
Replace entirely:

```typescript
/**
 * Cron-based job scheduling using Deno.cron().
 * Works in both Deno CLI (local dev) and Deno Deploy (production).
 */
import { createLogger } from "../logger/index.ts";

const log = createLogger("jobs");

export type CronHandler = () => Promise<void>;

export interface CronJob {
  name: string;
  schedule: string;
  handler: CronHandler;
}

const jobs: CronJob[] = [];

export function registerJob(job: CronJob): void {
  jobs.push(job);
}

export function startCronJobs(): void {
  for (const job of jobs) {
    log.info({ job: job.name, schedule: job.schedule }, "Registering cron job");
    Deno.cron(job.name, job.schedule, async () => {
      try {
        await job.handler();
      } catch (err) {
        log.error({ err, job: job.name }, "Cron job failed");
      }
    });
  }
}

export function stopCronJobs(): void {
  // Deno.cron() jobs are managed by the runtime; no manual stop needed.
  // In local dev with Deno CLI, jobs terminate when the process exits.
  log.info("Cron jobs stopping (process exit)");
}
```

#### `apps/api/src/main.ts`
Replace job initialization:

```typescript
import { registerJob, startCronJobs } from "./utils/jobs/index.ts";

// Register jobs before starting server
registerJob({
  name: "evaluate-badges",
  schedule: "0 * * * *", // hourly
  handler: async () => {
    const { evaluateAllBadges } = await import("./modules/badge/service.ts");
    await evaluateAllBadges();
  },
});

registerJob({
  name: "refresh-popular-cache",
  schedule: "0 */6 * * *", // every 6 hours
  handler: async () => {
    const { refreshPopularRecipes } = await import("./modules/search/service.ts");
    await refreshPopularRecipes();
  },
});

startCronJobs();
```

Remove all references to `startJobs()`, `stopJobs()`, and `setInterval`.

### Local Dev Verification
```bash
deno run --allow-all apps/api/src/main.ts
# Check console output for "Registering cron job" logs
# Temporarily change schedule to "*/1 * * * *" to verify execution
```

---

## 6. Signal Handling — Conditional for Deno Deploy

### Problem
`Deno.addSignalListener("SIGTERM", ...)` is unnecessary on Deno Deploy (stateless isolates) and may cause issues.

### Solution
Gate signal handlers behind `!Deno.env.get("DENO_DEPLOY")`.

### File Changed

#### `apps/api/src/main.ts`
```typescript
if (!Deno.env.get("DENO_DEPLOY")) {
  Deno.addSignalListener("SIGTERM", shutdown);
  Deno.addSignalListener("SIGINT", shutdown);
}
```

---

## 7. Frontend Static Site Config

### Problem
Frontend currently relies on GitHub Pages `404.html` trick for SPA routing. Deno Deploy static sites support native SPA mode.

### Solution
Add `deno.json` with static site configuration to `apps/web/`.

### Files Changed / Created

#### `apps/web/deno.json` (NEW)
```json
{
  "deploy": {
    "install": "deno install",
    "build": "deno task build",
    "runtime": {
      "type": "static",
      "cwd": "./dist",
      "spa": true
    }
  }
}
```

#### `apps/web/vite.config.ts`
Ensure `VITE_API_URL` is read correctly. The existing config uses `Deno.env.get()` which is fine. Keep as-is or wrap:

```typescript
const apiUrl = typeof Deno !== "undefined"
  ? (Deno.env.get("VITE_API_URL") || "/api/v1")
  : "/api/v1";

define: {
  "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
}
```

> Note: `typeof Deno` check is defensive; in Vite build context Deno global is available when running via Deno.

#### `apps/web/package.json` scripts
Ensure build script works:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

#### Remove `apps/web/404.html`
No longer needed because Deno Deploy static sites handle SPA routing via `spa: true`.

### Local Dev Verification
```bash
cd apps/web
deno task build
# Verify dist/ exists with index.html and assets
```

---

## 8. API Entry Point Refactor

### Problem
Explicit `Deno.serve({ port: 8000 }, ...)` fails on Deno Deploy where the platform assigns the port.

### Solution
Auto-detect Deno Deploy and omit port binding.

### File Changed

#### `apps/api/src/main.ts`
```typescript
const server = Deno.env.get("DENO_DEPLOY")
  ? Deno.serve(app.fetch)
  : Deno.serve({ port: config.APP_PORT }, app.fetch);

if (!Deno.env.get("DENO_DEPLOY")) {
  logger.info(`BrewForm API running on http://localhost:${config.APP_PORT}`);
}
```

---

## 9. Logger — Remove `pino-pretty` from Production

### Problem
`pino-pretty` is a dev dependency that may not work on Deno Deploy.

### Solution
Keep `pino` but only enable `pino-pretty` transport in development. The current code already does this. Verify and keep as-is.

### File (verify)
#### `apps/api/src/utils/logger/index.ts`
Ensure transport is conditional:
```typescript
transport: config.APP_ENV === "development"
  ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
  : undefined,
```

> `pino` itself works fine on Deno Deploy. Only the pretty transport is dev-only.

---

## 10. Environment Variables & Config

### File Changed

#### `apps/api/src/config/env.ts`
Add new variables (as documented in Section 3). Full updated schema:

```typescript
const envSchema = z.object({
  APP_PORT: z.coerce.number().default(8000),
  APP_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1),
  DATABASE_PROVIDER: z.enum(["postgresql", "mysql", "sqlite"]).default("postgresql"),

  CACHE_DRIVER: z.enum(["deno-kv", "memory"]).default("deno-kv"),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),

  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://localhost:8000"),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_SECURE: z.coerce.boolean().default(false),
  EMAIL_FROM: z.string().default("noreply@brewform.local"),

  OPENAPI_ENABLED: z.coerce.boolean().default(true),

  // Storage
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  // Retained for local driver
  UPLOAD_DIR: z.string().default("./uploads"),
  UPLOAD_MAX_SIZE_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  UPLOAD_ALLOWED_TYPES: z.string().default("image/jpeg,image/png,image/webp"),

  APP_URL: z.string().default("http://localhost:8000"),

  ADMIN_EMAIL: z.string().default("admin@brewform.local"),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("admin123456"),
});
```

#### `.env.example`
Add all new variables with local defaults (see Section 4 for Garage defaults).

---

## 11. QR Code Module

### Problem
`qrcode` npm package generates PNG buffers using Node.js canvas/Sharp bindings which may fail on Deno Deploy.

### Solution
The current implementation uses `QRCode.toBuffer()` and `QRCode.toString()`. These are pure JS and likely work. However, verify that `qrcode` does not attempt to load native addons.

If issues arise, replace with a Deno-compatible QR library (e.g., `jsr:@deno/qrcode` or a pure JS alternative).

### Local Dev Verification
```bash
curl http://localhost:8000/api/v1/qrcode/recipe/test-slug.png
# Should return PNG bytes
```

---

## 12. Remove Node-Specific Imports

### Files to Audit
Search and replace all `node:` imports in `apps/api/src/`:

```bash
grep -r "from 'node:" apps/api/src/
grep -r "from \"node:" apps/api/src/
```

### Known Offenders (post-email refactor)
- `apps/api/src/modules/auth/email.ts` — `node:fs`, `node:path` (fixed in Section 2)
- `apps/api/src/utils/notify/index.ts` — `node:fs`, `node:path` (fixed in Section 2)
- `apps/api/src/utils/upload/index.ts` — no longer uses `node:fs` after Section 3

### Replacements
| Node Import | Deno Standard Equivalent |
|---|---|
| `node:fs` | `Deno.readFile`, `Deno.writeFile`, `Deno.readDir`, `Deno.mkdir` |
| `node:path` | `jsr:@std/path` |
| `node:crypto` | Web Crypto API (`crypto.subtle`) |

### Local Dev Verification
```bash
deno lint apps/api/src/
# Should report no `no-node-globals` or node import issues
```

---

## 13. CI/CD Pipeline Update

### File Changed

#### `.github/workflows/ci.yml`
Replace all `npm install` with `deno install`. Replace `npx` with `deno run -A npm:<pkg>`.

Updated workflow skeleton:

```yaml
name: CI & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Install dependencies
        run: deno install
      - name: Generate Prisma clients
        run: deno task db:generate
      - name: Build email templates
        run: deno run -A apps/api/scripts/build-email-templates.ts
      - name: Format check
        run: deno fmt --check apps/ packages/
      - name: Lint
        run: deno lint apps/ packages/
      - name: Type check
        run: deno check --unstable-sloppy-imports apps/api/src/main.ts

  test:
    runs-on: ubuntu-latest
    needs: quality
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: brewform
          POSTGRES_PASSWORD: brewform
          POSTGRES_DB: brewform_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://brewform:brewform@localhost:5432/brewform_test
      JWT_SECRET: test-secret-for-ci-only-minimum-16-chars
      CACHE_DRIVER: memory
      APP_ENV: test
      APP_PORT: 8000
      CORS_ALLOWED_ORIGINS: http://localhost:5173
      STORAGE_DRIVER: local
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Install dependencies
        run: deno install
      - name: Generate Prisma clients
        run: deno task db:generate
      - name: Build email templates
        run: deno run -A apps/api/scripts/build-email-templates.ts
      - name: Run migrations
        run: deno task db:migrate
      - name: Seed database
        run: deno run --allow-all packages/db/prisma/seed.ts
      - name: Run tests
        run: deno test --unstable-sloppy-imports --no-check --allow-all --coverage=coverage/ apps/api/src/ packages/shared/src/
      - name: Generate coverage
        run: deno coverage coverage/ --lcov > coverage/lcov.info
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  # Deno Deploy handles deployment automatically via GitHub integration.
  # No manual deploy steps needed in CI.
```

> GitHub Pages deployment is removed. Deno Deploy's GitHub integration auto-deploys on push.

---

## 14. deno.json Tasks (Root)

### File Changed

#### Root `deno.json`
Ensure tasks cover all workflows:

```json
{
  "tasks": {
    "dev": "docker compose up -d && deno run --allow-all --watch apps/api/src/main.ts",
    "dev:web": "cd apps/web && deno task dev",
    "db:generate": "deno run -A npm:prisma@^6.19.3 generate --schema=packages/db/prisma/schema.prisma",
    "db:migrate": "deno run -A npm:prisma@^6.19.3 migrate deploy --schema=packages/db/prisma/schema.prisma",
    "db:push": "deno run -A npm:prisma@^6.19.3 db push --schema=packages/db/prisma/schema.prisma",
    "db:studio": "deno run -A npm:prisma@^6.19.3 studio --schema=packages/db/prisma/schema.prisma",
    "db:seed": "deno run --allow-all packages/db/prisma/seed.ts",
    "db:setup": "deno run --allow-all apps/api/src/setup.ts",
    "email:build": "deno run -A apps/api/scripts/build-email-templates.ts",
    "lint": "deno lint apps/ packages/",
    "fmt": "deno fmt apps/ packages/",
    "check": "deno check --unstable-sloppy-imports apps/api/src/main.ts",
    "test": "deno test --unstable-sloppy-imports --no-check --allow-all apps/api/src/ packages/shared/src/",
    "test:coverage": "deno test --unstable-sloppy-imports --no-check --allow-all --coverage=coverage/ apps/api/src/ packages/shared/src/ && deno coverage coverage/"
  }
}
```

---

## 15. Dependency Cleanup

### `apps/api/package.json`
Remove after refactor:
- `mjml` (build-time only, not runtime)

Keep:
- `pino`, `pino-pretty` (dev-only transport)
- `bcryptjs`, `qrcode`, `nodemailer` (runtime, verify compatibility)

### Verify with Deno
```bash
deno install
deno check apps/api/src/main.ts
```

---

## 16. Local Dev Feature Parity Checklist

After all changes, verify every feature works locally:

| Feature | Local Command | Verification |
|---|---|---|
| API server | `deno task dev` | `curl http://localhost:8000/health` |
| Frontend dev | `cd apps/web && deno task dev` | `http://localhost:5173` |
| Database | `docker compose up -d postgres` | pgAdmin at `localhost:5050` |
| Migrations | `deno task db:migrate` | Schema updated in Postgres |
| Seed | `deno task db:seed` | Admin user created |
| Admin setup | `deno task db:setup` | Admin exists, idempotent |
| Email (SMTP) | `docker compose up -d mailpit` | Mailpit UI at `localhost:8025` |
| File upload (local) | `STORAGE_DRIVER=local` (default) | Files in `./uploads` |
| File upload (S3/Garage) | `STORAGE_DRIVER=s3` + Garage env | `aws s3 ls` shows files |
| Cache | `CACHE_DRIVER=deno-kv` or `memory` | KV ops succeed |
| Cron jobs | Start API, check logs | `"Registering cron job"` appears |
| QR codes | `curl .../qrcode/...` | PNG/SVG returned |
| Auth (register/login) | API calls | JWT tokens issued |
| Photo upload | Form POST to `/api/v1/photos` | URL returned, photo viewable |

---

## Summary of New Files

| File | Purpose |
|---|---|
| `apps/api/scripts/build-email-templates.ts` | Build-time MJML → TS compiler |
| `apps/api/src/templates/email/generated/*.ts` | Generated template functions (6 files) |
| `apps/api/src/utils/storage/types.ts` | Storage driver interface |
| `apps/api/src/utils/storage/local.ts` | Local filesystem driver |
| `apps/api/src/utils/storage/s3.ts` | S3-compatible driver (AWS SigV4) |
| `apps/api/src/utils/storage/index.ts` | Driver factory |
| `apps/web/deno.json` | Deno Deploy static site config |

## Summary of Modified Files

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Add `clientDeno` generator |
| `packages/db/src/index.ts` | Conditional import: edge vs binary client |
| `packages/db/package.json` | Add `@prisma/extension-accelerate` |
| `apps/api/src/config/env.ts` | Add S3/storage env vars |
| `apps/api/src/utils/upload/index.ts` | Use storage driver abstraction |
| `apps/api/src/utils/jobs/index.ts` | Replace `setInterval` with `Deno.cron()` |
| `apps/api/src/modules/auth/email.ts` | Use pre-compiled templates |
| `apps/api/src/utils/notify/index.ts` | Use pre-compiled templates |
| `apps/api/src/main.ts` | Conditional port, cron, signals |
| `apps/api/src/routes/index.ts` | Conditionally serve `/uploads` static |
| `apps/web/vite.config.ts` | Minor Deno env safety |
| `.env.example` | Add storage and Garage vars |
| `compose.yml` | Add Garage service |
| `.github/workflows/ci.yml` | Deno-native commands, remove GH Pages |
| `deno.json` (root) | Add comprehensive tasks |
