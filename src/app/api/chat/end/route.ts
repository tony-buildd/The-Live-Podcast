import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // MVP: no memory persistence on conversation end.
  // Memory building is deferred to a future iteration.
  return NextResponse.json({ message: "ok" }, { status: 200 });
}
