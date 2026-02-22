// ──────────────────────────────────────────────
// CraftChain — Public Landing / Home Page
// ──────────────────────────────────────────────
// Pure presentational — no auth state, no API calls.
// ──────────────────────────────────────────────

import { Link } from "react-router-dom";

const FEATURES = [
  {
    icon: "🌳",
    title: "Dependency Tracking",
    desc: "Automatically maps every crafting dependency so your team knows exactly what raw materials are needed.",
  },
  {
    icon: "👥",
    title: "Real-time Collaboration",
    desc: "Invite teammates, assign roles, and track who's gathering what — all in one shared workspace.",
  },
  {
    icon: "📊",
    title: "Contribution Tracking",
    desc: "See each member's contributions with live progress bars and percentage breakdowns.",
  },
  {
    icon: "⛏",
    title: "Minecraft Integration",
    desc: "Built-in recipe database with auto-fill from minecraft-data. No more wiki tab-switching.",
  },
];

export default function HomePage() {
  return (
    <div className="home-page">
      {/* ── Navigation Bar ──────────────────────── */}
      <nav className="home-nav">
        <div className="home-nav-inner">
          <Link to="/" className="home-nav-logo">
            <span className="home-nav-logo-icon">⛏</span>
            <span className="home-nav-logo-text">CraftChain</span>
          </Link>
          <div className="home-nav-links">
            <a href="#about" className="home-nav-link">About</a>
            <a href="#features" className="home-nav-link">Features</a>
            <Link to="/login" className="home-nav-link">Log In</Link>
            <Link to="/signup" className="btn btn-primary btn-sm home-nav-cta">
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ────────────────────────── */}
      <section className="home-hero">
        <div className="home-hero-particles" aria-hidden="true">
          <span className="particle p1">⬛</span>
          <span className="particle p2">🟫</span>
          <span className="particle p3">🟩</span>
          <span className="particle p4">💎</span>
          <span className="particle p5">⬛</span>
        </div>
        <div className="home-hero-content">
          <h1 className="home-hero-title">
            <span className="home-hero-icon">⛏</span> CraftChain
          </h1>
          <p className="home-hero-tagline">Collaborative Minecraft Crafting</p>
          <p className="home-hero-desc">
            Track crafting dependencies, coordinate with your team, and build
            epic projects together. No more spreadsheets — just craft.
          </p>
          <div className="home-hero-actions">
            <Link to="/signup" className="btn btn-primary home-hero-btn">
              🚀 Get Started
            </Link>
            <Link to="/login" className="btn btn-secondary home-hero-btn">
              🔑 Log In
            </Link>
          </div>
        </div>
        <div className="home-hero-glow" aria-hidden="true" />
      </section>

      {/* ── About Section ───────────────────────── */}
      <section className="home-about" id="about">
        <div className="home-section-inner">
          <h2 className="home-section-title">What is CraftChain?</h2>
          <div className="home-about-grid">
            <div className="home-about-card">
              <span className="home-about-card-icon">🏗️</span>
              <h3>Plan Big Builds</h3>
              <p>
                Define a target item — like a Beacon or Ender Chest — and
                CraftChain breaks it into every sub-component and raw material
                your team needs to gather.
              </p>
            </div>
            <div className="home-about-card">
              <span className="home-about-card-icon">🤝</span>
              <h3>Work as a Team</h3>
              <p>
                Create projects, invite members, and assign gathering tasks.
                Everyone sees real-time progress so nothing gets double-farmed.
              </p>
            </div>
            <div className="home-about-card">
              <span className="home-about-card-icon">📈</span>
              <h3>Track Everything</h3>
              <p>
                Contribution logs, dependency trees, and progress bars keep your
                entire team on the same page from first log to final craft.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ────────────────────── */}
      <section className="home-features" id="features">
        <div className="home-section-inner">
          <h2 className="home-section-title">Features</h2>
          <div className="home-features-grid">
            {FEATURES.map((f) => (
              <div className="home-feature-card" key={f.title}>
                <span className="home-feature-icon">{f.icon}</span>
                <h3 className="home-feature-title">{f.title}</h3>
                <p className="home-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────── */}
      <section className="home-cta-banner">
        <div className="home-section-inner">
          <h2 className="home-cta-title">Ready to start crafting?</h2>
          <p className="home-cta-desc">
            Join CraftChain and coordinate your next Minecraft megaproject.
          </p>
          <Link to="/signup" className="btn btn-primary home-hero-btn">
            ⛏ Create Free Account
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────── */}
      <footer className="home-footer">
        <div className="home-footer-inner">
          <span className="home-footer-brand">⛏ CraftChain</span>
          <span className="home-footer-sep">·</span>
          <span className="home-footer-text">Made for Hackathons</span>
          <span className="home-footer-sep">·</span>
          <span className="home-footer-text">
            © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
