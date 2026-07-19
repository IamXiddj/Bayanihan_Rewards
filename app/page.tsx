import Link from "next/link";
import {
  HandHeart,
  ShieldCheck,
  Sparkles,
  Users,
  Megaphone,
  Trophy,
  Wallet,
  ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    icon: HandHeart,
    title: "Join a campaign",
    body: "Connect your Freighter wallet and join any active civic campaign from an LGU, school, or NGO.",
  },
  {
    icon: ShieldCheck,
    title: "Get verified",
    body: "The organizer confirms your participation on-chain once the activity is done.",
  },
  {
    icon: Sparkles,
    title: "Claim your BAYANI",
    body: "Claim your reward straight to your wallet — a transparent, on-chain payout, no cash handling.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto max-w-2xl text-center mb-10">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-medium text-slate mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          Stellar Testnet
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight">
          Bayanihan Rewards
        </h1>
        <p className="mt-3 text-sm md:text-base text-slate max-w-lg mx-auto">
          Transparent, on-chain civic reward campaigns for Philippine communities — built on
          Stellar. LGUs, schools, and NGOs run campaigns; citizens join, get verified, and
          claim real BAYANI rewards.
        </p>
      </header>

      <div className="woven-divider w-full max-w-2xl mx-auto mb-10" />

      {/* Role entry points */}
      <section className="mx-auto max-w-2xl grid gap-4 sm:grid-cols-2 mb-12">
        <Link
          href="/campaigns"
          className="group rounded-2xl border border-line bg-paper-raised p-6 transition-colors hover:border-maroon/40"
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-maroon/10">
            <Users className="h-5 w-5 text-maroon" />
          </div>
          <h2 className="font-display text-lg font-medium mb-1">I&apos;m a citizen</h2>
          <p className="text-sm text-slate mb-4">
            Browse active campaigns, join one, and track your rewards.
          </p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-maroon">
            Browse campaigns
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/organizer"
          className="group rounded-2xl border border-line bg-paper-raised p-6 transition-colors hover:border-forest/40"
        >
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-forest/10">
            <Megaphone className="h-5 w-5 text-forest" />
          </div>
          <h2 className="font-display text-lg font-medium mb-1">I&apos;m an organizer</h2>
          <p className="text-sm text-slate mb-4">
            Register your LGU, school, or NGO and launch a reward campaign.
          </p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest">
            Go to organizer tools
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-2xl mb-12">
        <h2 className="text-center font-display text-xl font-medium mb-6">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-line bg-paper-raised p-5 text-center"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gold/15">
                <step.icon className="h-5 w-5 text-gold" />
              </div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate">
                Step {i + 1}
              </p>
              <h3 className="font-display text-base font-medium mb-1">{step.title}</h3>
              <p className="text-xs text-slate leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="woven-divider w-full max-w-2xl mx-auto mb-10" />

      {/* Secondary links */}
      <section className="mx-auto max-w-2xl grid gap-3 sm:grid-cols-3">
        <Link
          href="/leaderboard"
          className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-4 py-3 transition-colors hover:bg-paper"
        >
          <Trophy className="h-4 w-4 text-gold shrink-0" />
          <span className="text-sm font-medium">Leaderboard</span>
        </Link>
        <Link
          href="/analytics"
          className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-4 py-3 transition-colors hover:bg-paper"
        >
          <Sparkles className="h-4 w-4 text-maroon shrink-0" />
          <span className="text-sm font-medium">Analytics</span>
        </Link>
        <Link
          href="/wallet"
          className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-4 py-3 transition-colors hover:bg-paper"
        >
          <Wallet className="h-4 w-4 text-slate shrink-0" />
          <span className="text-sm font-medium">Wallet sandbox</span>
        </Link>
      </section>

      <footer className="w-full max-w-2xl mx-auto text-center mt-10">
        <p className="text-xs text-slate">
          Testnet only — these tokens have no real-world value.
        </p>
      </footer>
    </main>
  );
}
