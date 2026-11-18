"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BUSINESS_COOKIE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: string;
}

export async function createBusiness(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Enter your business name." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_business", {
    p_name: name.slice(0, 120),
    p_website_url: String(form.get("website_url") ?? "").trim() || null,
    p_country: String(form.get("country") ?? "").trim() || null,
    p_timezone: String(form.get("timezone") ?? "UTC"),
    p_currency: String(form.get("currency") ?? "USD"),
  });
  if (error) return { error: error.message };

  (await cookies()).set(BUSINESS_COOKIE, data as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/dashboard");
}
