import { NextResponse, type NextRequest } from "next/server";
import { homePathFor } from "@/lib/auth";

// Sends a signed-in user to the right place: agent inbox, business dashboard
// or onboarding.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(await homePathFor(), request.nextUrl.origin));
}
