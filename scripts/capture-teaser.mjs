/**
 * Capture real MealWorks UI screenshots + interactive walkthrough video.
 * Usage: node scripts/capture-teaser.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "teaser", "real");
const shotsDir = path.join(outDir, "shots");
fs.mkdirSync(shotsDir, { recursive: true });

const BASE = process.env.APP_URL || "http://localhost:3000";
const EMP_EMAIL = process.env.TEASER_EMAIL || `teaser${Date.now()}@example.com`;
const EMP_PASS = process.env.TEASER_PASS || `teaser-${Date.now()}-Aa1!`;
const EMP_NAME = "Teaser Demo";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "cafe.admin@example.com";
const ADMIN_PASS = process.env.ADMIN_PASSWORD?.trim();

if (!ADMIN_PASS) {
  throw new Error("ADMIN_PASSWORD is required to capture the admin walkthrough.");
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", name);
  return file;
}

async function ensureEmployee(page) {
  // Try register; if exists, login
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#name", EMP_NAME);
  await page.fill("#email", EMP_EMAIL);
  await page.fill("#password", EMP_PASS);
  await Promise.all([
    page.waitForURL(/\/(continue|onboarding|today)/, { timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(800);

  // If still on register with error, login
  if (page.url().includes("/register")) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", EMP_EMAIL);
    await page.fill("#password", EMP_PASS);
    await Promise.all([
      page.waitForURL(/\/(continue|onboarding|today)/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
  }

  // Land via continue if needed
  if (page.url().includes("/continue") || page.url() === `${BASE}/`) {
    await page.goto(`${BASE}/continue`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(500);

  // Skip onboarding if present
  if (page.url().includes("/onboarding")) {
    const skip = page.getByRole("button", { name: /skip/i });
    if (await skip.count()) {
      await skip.click();
      await page.waitForTimeout(1500);
    } else {
      // quick path through if no skip visible
      await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: path.join(outDir, "raw-video"),
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();

  // —— 1) Landing (logged out) ——
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "01-landing");

  // —— 2) Login screen ——
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, "02-login");

  // —— Interactive: register / login employee ——
  await ensureEmployee(page);
  await page.waitForTimeout(1000);

  // Prefer today
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000); // match load
  await shot(page, "03-today");

  // Filter Good / Skip chips if present
  const goodChip = page.locator(".chip", { hasText: /Good/i }).first();
  if (await goodChip.count()) {
    await goodChip.click();
    await page.waitForTimeout(400);
    await shot(page, "04-today-good");
  }
  const skipChip = page.locator(".chip", { hasText: /Skip/i }).first();
  if (await skipChip.count()) {
    await skipChip.click();
    await page.waitForTimeout(400);
    await shot(page, "05-today-skip");
  }
  const allChip = page.locator(".chip", { hasText: /^All$/i }).first();
  if (await allChip.count()) {
    await allChip.click();
    await page.waitForTimeout(300);
  }

  // Plate carousel next if present
  const nextPlate = page.getByRole("button", { name: /next plate/i });
  if (await nextPlate.count()) {
    await nextPlate.click();
    await page.waitForTimeout(500);
    await shot(page, "06-plate-carousel");
    await nextPlate.click();
    await page.waitForTimeout(500);
  }

  // Menu
  await page.goto(`${BASE}/menu`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "07-menu");
  const saladChip = page.locator(".chip", { hasText: /^Salad$/i }).first();
  if (await saladChip.count()) {
    await saladChip.click();
    await page.waitForTimeout(500);
    await shot(page, "08-menu-salad");
  }

  // Preferences
  await page.goto(`${BASE}/preferences`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "09-preferences");

  // Settings
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "10-settings");

  // Admin walkthrough
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // sign out first via signOut if session exists - just credentials login as admin
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASS);
  await Promise.all([
    page.waitForURL(/\/(continue|admin|today)/, { timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "11-admin");

  // Back to employee today for closing frame
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMP_EMAIL);
  await page.fill("#password", EMP_PASS);
  await Promise.all([
    page.waitForURL(/\/(continue|today|onboarding)/, { timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot(page, "12-today-close");

  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  // Save meta
  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    JSON.stringify(
      {
        email: EMP_EMAIL,
        shots: fs.readdirSync(shotsDir).sort(),
        rawVideo: videoPath || null,
      },
      null,
      2
    )
  );
  console.log("done", { shotsDir, videoPath, email: EMP_EMAIL });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
