const { sendHtml } = require("../lib/http");

function renderHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProofView | Live Tracking</title>
    <link rel="icon" type="image/svg+xml" href="/brand/mascot.svg" />
    <link rel="alternate icon" type="image/png" href="/brand/mascot.png" />
    <style>
      :root {
        --bg-top: #071120;
        --bg-mid: #10233d;
        --bg-bottom: #2e6cb6;
        --panel: rgba(8, 18, 34, 0.72);
        --panel-border: rgba(255, 255, 255, 0.1);
        --text: #f4f8ff;
        --muted: #c8d8ef;
        --accent: #73e0ff;
        --accent-soft: rgba(115, 224, 255, 0.16);
        --shadow: 0 28px 64px rgba(2, 10, 21, 0.34);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        min-height: 100%;
        margin: 0;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(115, 224, 255, 0.18), transparent 28%),
          radial-gradient(circle at right center, rgba(66, 133, 244, 0.16), transparent 24%),
          linear-gradient(160deg, var(--bg-top) 0%, var(--bg-mid) 44%, var(--bg-bottom) 100%);
      }

      body {
        display: flex;
        justify-content: center;
        padding: 24px;
      }

      .page {
        width: min(1120px, 100%);
        display: flex;
        flex-direction: column;
        gap: 28px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
        gap: 28px;
        padding: 40px;
        border: 1px solid var(--panel-border);
        border-radius: 28px;
        background:
          linear-gradient(145deg, rgba(10, 22, 40, 0.92), rgba(19, 44, 76, 0.72)),
          var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -40px -120px auto;
        width: 260px;
        height: 260px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(115, 224, 255, 0.26), transparent 70%);
        pointer-events: none;
      }

      .copy {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
        justify-content: center;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        width: fit-content;
        padding: 9px 16px;
        border: 1px solid rgba(115, 224, 255, 0.22);
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.9rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(2.6rem, 7vw, 5rem);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }

      .subtitle {
        max-width: 32rem;
        margin: 0;
        color: var(--muted);
        font-size: clamp(1rem, 2vw, 1.28rem);
        line-height: 1.6;
      }

      .highlights {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 8px;
      }

      .pill {
        padding: 10px 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #e7f1ff;
        font-size: 0.95rem;
      }

      .brand-panel {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        min-height: 100%;
        padding: 28px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
      }

      .brand-orb {
        width: min(240px, 58vw);
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        padding: 20px;
        border-radius: 30px;
        background:
          radial-gradient(circle at top, rgba(255, 255, 255, 0.14), transparent 48%),
          linear-gradient(160deg, rgba(12, 32, 58, 0.94), rgba(34, 90, 156, 0.88));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 24px 44px rgba(1, 12, 30, 0.34);
      }

      .brand-orb img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 18px 26px rgba(7, 17, 32, 0.3));
      }

      .panel-note {
        margin: 0;
        color: var(--muted);
        text-align: center;
        line-height: 1.5;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 22px 26px;
        border: 1px solid var(--panel-border);
        border-radius: 22px;
        background: rgba(8, 18, 34, 0.62);
        box-shadow: 0 18px 40px rgba(2, 10, 21, 0.2);
        backdrop-filter: blur(14px);
      }

      .footer-copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .footer-copy strong {
        font-size: 1rem;
      }

      .footer-copy span {
        color: var(--muted);
      }

      .contact-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 18px;
        border-radius: 999px;
        background: rgba(115, 224, 255, 0.14);
        border: 1px solid rgba(115, 224, 255, 0.2);
        color: var(--text);
        text-decoration: none;
        font-weight: 700;
        transition:
          transform 160ms ease,
          background 160ms ease,
          border-color 160ms ease;
      }

      .contact-link:hover {
        transform: translateY(-1px);
        background: rgba(115, 224, 255, 0.2);
        border-color: rgba(115, 224, 255, 0.3);
      }

      @media (max-width: 860px) {
        body {
          padding: 16px;
        }

        .hero {
          grid-template-columns: 1fr;
          padding: 28px;
        }

        .brand-panel {
          min-height: auto;
        }

        .footer {
          flex-direction: column;
          align-items: flex-start;
        }

        .contact-link {
          width: 100%;
        }
      }

      @media (max-width: 520px) {
        .hero {
          padding: 22px;
          border-radius: 22px;
        }

        .brand-panel {
          padding: 20px;
          border-radius: 18px;
        }

        .brand-orb {
          width: min(200px, 64vw);
          padding: 16px;
          border-radius: 22px;
        }

        .footer {
          padding: 18px;
          border-radius: 18px;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div class="copy">
          <div class="eyebrow">Live Tracking</div>
          <h1>ProofView</h1>
          <p class="subtitle">Keep a pulse on what gets opened and when.</p>
          <div class="highlights">
            <span class="pill">Open activity</span>
            <span class="pill">Tracked delivery</span>
            <span class="pill">Instant visibility</span>
          </div>
        </div>

        <aside class="brand-panel" aria-label="ProofView brand">
          <div class="brand-orb">
            <img src="/brand/mascot.svg" alt="ProofView logo" />
          </div>
          <p class="panel-note">ProofView is online and ready to track activity from your Chrome extension.</p>
        </aside>
      </section>

      <footer class="footer">
        <div class="footer-copy">
          <strong>Contact</strong>
          <span>For support or questions, reach out directly.</span>
        </div>
        <a class="contact-link" href="mailto:pimpabuttery86@gmail.com">pimpabuttery86@gmail.com</a>
      </footer>
    </main>
  </body>
</html>`;
}

function homePage(res) {
  return sendHtml(res, 200, renderHomePage());
}

module.exports = { homePage };
