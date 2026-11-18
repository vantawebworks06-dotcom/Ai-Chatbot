import { cn } from "@/lib/utils";

/** Velora mark: two geometric strokes meeting in a V, the right one in violet for AI. */
export function VeloraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-7 w-7", className)}>
      <rect width="32" height="32" rx="8" fill="#0f172a" />
      <path d="M8.5 9.5 L14.2 23 a2 2 0 0 0 3.6 0 L19 20.2 L13.6 9.5 Z" fill="#2563eb" />
      <path d="M18.4 9.5 h5.1 L19.9 17.6 L17.3 12.6 Z" fill="#8b5cf6" />
    </svg>
  );
}

export function VeloraLogo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const mark = size === "lg" ? "h-9 w-9" : size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-[15px]" : "text-lg";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <VeloraMark className={mark} />
      <span className={cn("font-semibold tracking-tight text-ink", text)}>Velora</span>
    </span>
  );
}
