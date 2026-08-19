import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  addTempRestriction,
  deleteTempRestriction,
  serializePrefsForClient,
} from "@/lib/services";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (!body.label || !body.endsOn || !body.startsOn) {
    return NextResponse.json({ error: "label, startsOn, endsOn required" }, { status: 400 });
  }
  addTempRestriction(session.user.id, {
    label: String(body.label),
    avoidTags: Array.isArray(body.avoidTags) ? body.avoidTags.map(String) : [],
    startsOn: String(body.startsOn),
    endsOn: String(body.endsOn),
    reason: body.reason ? String(body.reason) : "",
  });
  return NextResponse.json({ prefs: serializePrefsForClient(session.user.id) });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteTempRestriction(session.user.id, id);
  return NextResponse.json({ prefs: serializePrefsForClient(session.user.id) });
}
