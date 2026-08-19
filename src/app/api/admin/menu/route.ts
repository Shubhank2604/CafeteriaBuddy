import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { auth } from "@/lib/auth";
import { processMenuImage } from "@/lib/services";
import { todayISO } from "@/lib/utils";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!session.user.isAdmin) {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { session };
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;
  const session = gate.session!;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const date = String(form.get("date") || todayISO());
    const meal = String(form.get("meal") || "lunch");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const maxBytes = 8 * 1024 * 1024; // 8 MB
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "Image too large (max 8 MB)." },
        { status: 400 }
      );
    }
    if (
      !["image/jpeg", "image/png"].includes(file.type) &&
      !/\.(jpe?g|png)$/i.test(file.name)
    ) {
      return NextResponse.json(
        { error: "Please upload a JPEG or PNG image." },
        { status: 400 }
      );
    }
    if (meal !== "breakfast" && meal !== "lunch") {
      return NextResponse.json(
        { error: "Meal must be breakfast or lunch." },
        { status: 400 }
      );
    }

    // Sanitize date to prevent path traversal in filenames
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
    const buf = Buffer.from(await file.arrayBuffer());
    const rawExt = path.extname(file.name).toLowerCase();
    const ext = [".png", ".jpg", ".jpeg"].includes(rawExt)
      ? rawExt
      : ".png";
    const dateFolder = safeDate.replaceAll("-", "");
    const filename = `${meal}${ext}`;

    // Save under Images/ (project root) and public/uploads for browser serving
    const imagesDir = path.join(process.cwd(), "images", dateFolder);
    const uploadsDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "menus",
      dateFolder
    );
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });

    const imagesPath = path.join(imagesDir, filename);
    const diskPath = path.join(uploadsDir, filename);
    fs.writeFileSync(imagesPath, buf);
    fs.writeFileSync(diskPath, buf);

    const publicPath = `/uploads/menus/${dateFolder}/${filename}`;
    const result = await processMenuImage({
      imagePath: imagesPath,
      date: safeDate,
      createdBy: session.user.id,
      meal,
    });

    // Store public path + wipe everyone's cached match for this menu
    // so each employee gets a fresh personal board on next open
    const { getDb, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    getDb()
      .update(schema.menuDays)
      .set({ sourceImagePath: publicPath })
      .where(eq(schema.menuDays.id, result.menuDayId))
      .run();
    getDb()
      .delete(schema.matchResults)
      .where(eq(schema.matchResults.menuDayId, result.menuDayId))
      .run();

    return NextResponse.json({
      ok: true,
      menuDayId: result.menuDayId,
      source: result.source,
      model: "model" in result ? result.model : undefined,
      menu: result.menu,
      validation: "validation" in result ? result.validation : undefined,
      duplicate: "duplicate" in result ? result.duplicate : undefined,
      imagePath: publicPath,
      savedTo: [
        `images/${dateFolder}/${filename}`,
        `public/uploads/menus/${dateFolder}/${filename}`,
      ],
      matchesInvalidated: true,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
