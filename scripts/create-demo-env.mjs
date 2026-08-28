import { access, copyFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, ".env.demo.example");
const target = path.join(root, ".env");

try {
  await access(target);
  console.log("[demo] Existing .env found; leaving it unchanged.");
} catch {
  await copyFile(source, target);
  console.log("[demo] Created .env from .env.demo.example.");
}

console.log("[demo] Using local OCR, stub AI, local embeddings, and SQLite.");
