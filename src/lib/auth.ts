import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

export const BUSINESS_COOKIE = "velora_business";

// cache(): layouts and pages in one request share a single lookup.
export const getAuthContext = cache(async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAgent: false, businessIds: [] as string[] };

  const [agent, members] = await Promise.all([
    supabase.from("platform_agents").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("business_members").select("business_id").eq("user_id", user.id),
  ]);
  return {
    supabase,
    user,
    isAgent: Boolean(agent.data),
    businessIds: (members.data ?? []).map((m) => m.business_id as string),
  };
});

/** Where a signed-in user should land. */
export async function homePathFor(): Promise<string> {
  const ctx = await getAuthContext();
  if (!ctx.user) return "/login";
  if (ctx.isAgent) return "/agent";
  if (ctx.businessIds.length) return "/dashboard";
  return "/onboarding";
}

/** For business dashboard pages: requires sign-in and a business. */
export const requireBusiness = cache(async function requireBusiness() {
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.businessIds.length) redirect("/onboarding");

  const jar = await cookies();
  const preferred = jar.get(BUSINESS_COOKIE)?.value;
  const businessId =
    preferred && ctx.businessIds.includes(preferred) ? preferred : ctx.businessIds[0];

  const { data, error } = await ctx.supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();
  if (error || !data) redirect("/onboarding");

  return { ...ctx, user: ctx.user, business: data as Business };
});

/** For the agent workspace: requires a platform agent. */
export async function requireAgent() {
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login?next=/agent");
  if (!ctx.isAgent) redirect(ctx.businessIds.length ? "/dashboard" : "/onboarding");
  return { ...ctx, user: ctx.user };
}
