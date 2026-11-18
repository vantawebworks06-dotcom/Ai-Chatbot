import Link from "next/link";
import { VeloraLogo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/primitives";

const features = [
  {
    title: "Answers from your knowledge",
    body: "Add FAQs, policies, products and documents. The assistant answers only from what you provide and never invents prices or policies.",
  },
  {
    title: "Handoff that just works",
    body: "Refund requests, complaints, uncertain answers or a simple “talk to a person” move the chat to a human instantly, in the same window.",
  },
  {
    title: "A real support workspace",
    body: "A live inbox with queues, unread counts, typing indicators and search, built for handling many conversations at once.",
  },
  {
    title: "Install in one line",
    body: "Paste one script tag into any website. The widget is lightweight, isolated from your site's styles and works on every device.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <VeloraLogo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClass("ghost", "sm")}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClass("primary", "sm")}>
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-line">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgb(37_99_235/0.10),transparent)]" />
          <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-24 text-center sm:px-6 sm:pt-28">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ai" />
              AI support with a human safety net
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance text-ink sm:text-5xl">
              Intelligent support.
              <br />
              Real human connection.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-pretty text-muted sm:text-lg">
              Velora answers your customers instantly using your own knowledge, and hands the conversation to
              your team the moment a person is needed.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={buttonClass("primary", "md", "h-10 px-5")}>
                Start free
              </Link>
              <Link href="/login" className={buttonClass("secondary", "md", "h-10 px-5")}>
                Sign in to your workspace
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-px overflow-hidden px-4 py-20 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="p-5">
              <h2 className="text-[15px] font-semibold text-ink">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <VeloraLogo size="sm" />
          <span>Intelligent support. Real human connection.</span>
        </div>
      </footer>
    </div>
  );
}
