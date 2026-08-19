import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import type { MealType, StructuredMenu } from "./types";

const execFileAsync = promisify(execFile);

type PythonPipelineResult = {
  ok: boolean;
  source?: string;
  duplicate?: boolean;
  ingestion_id?: number;
  validation?: {
    status: string;
    headings_found: number;
    headings_expected: number;
    items_found: number;
    warnings?: string[];
  };
  menu?: StructuredMenu;
  error?: string;
};

function parseResult(stdout: string): PythonPipelineResult {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines.at(-1);
  if (!lastLine) throw new Error("Python menu pipeline returned no output.");
  try {
    return JSON.parse(lastLine) as PythonPipelineResult;
  } catch {
    throw new Error("Python menu pipeline returned invalid JSON.");
  }
}

export async function extractMenuWithPython(options: {
  imagePath: string;
  date: string;
  meal: Exclude<MealType, "other">;
}) {
  const python = process.env.PYTHON_EXECUTABLE?.trim() || "python";
  const script = path.join(process.cwd(), "scripts", "process_menu_for_web.py");
  const timeout = Number(process.env.PYTHON_PIPELINE_TIMEOUT_MS || 120_000);

  try {
    const { stdout } = await execFileAsync(
      python,
      [
        script,
        "--image",
        path.resolve(options.imagePath),
        "--date",
        options.date,
        "--meal",
        options.meal,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OCR_PROVIDER:
            process.env.OCR_PROVIDER?.trim() || "document_intelligence",
        },
        timeout: Number.isFinite(timeout) ? timeout : 120_000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      }
    );
    const result = parseResult(stdout);
    if (!result.ok || !result.menu) {
      throw new Error(result.error || "Menu extraction failed.");
    }
    return {
      menu: result.menu,
      source: result.source || "python_pipeline",
      duplicate: Boolean(result.duplicate),
      ingestionId: result.ingestion_id,
      validation: result.validation,
    };
  } catch (error) {
    const stdout =
      typeof error === "object" && error && "stdout" in error
        ? String(error.stdout || "")
        : "";
    if (stdout) {
      const result = parseResult(stdout);
      if (result.error) throw new Error(result.error);
    }
    throw new Error(
      error instanceof Error
        ? `Python menu pipeline failed: ${error.message}`
        : "Python menu pipeline failed."
    );
  }
}
