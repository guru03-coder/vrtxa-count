# Vortexa — 24-Hour Countdown Timer

Vortexa is a striking, single-page countdown timer built for hackathons. It features a cosmic event horizon visual signature, a server-side source of truth, and robust protection against local clock manipulation.

---

## Features

- **Event Horizon Interface:** Converging gravitational light streaks representing inbound particle streams flowing into a central singularity where the digits reside.
- **Warping Digit Ticks:** A subtle, conceptual gravitational spaghettification stretch effect applied automatically to digits at each second change.
- **Absolute Time Stability:** Uses a server-side state stored in a local JSON database. Client-side ticking uses monotonic clock timings (`performance.now()`), making the countdown completely immune to system date/time modifications.
- **Spectator Mode:** Appending `?spectator=true` to the URL hides all control items (start button, settings) and overlays a clean watermark, making it ready for a 1920x1080 projector output.
- **Sound Synthesis:** An inline audio milestone synthesizer that plays ambient bells and sub-bass implosions at milestones (`12h`, `6h`, `1h`, `10min`, `60sec`, `0sec`). Muted by default to respect browser policies.
- **Organizer Bypass Reset:** Dual hidden triggers combined with a PIN code prompt preventing unauthorized/accidental timer modifications.

---

## Getting Started

### 1. Installation
Install the project dependencies:
```bash
npm install
```

### 2. Run Locally
Run the local Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build & Production Start
To test or run in production mode:
```bash
npm run build
npm run start
```

---

## Organizer Hidden Controls

To prevent accidental discovery or disruption by live audiences, the timer configuration panel is hidden:

### How to Trigger the Panel
You can summon the organizer control panel using either of these two methods:
1. **Invisible Touch/Click Area:** Click or tap the **bottom-right corner** of the screen (a transparent `32x32px` touch target) **3 times within 2 seconds**.
2. **Keyboard Shortcut:** Press **`Shift` + `Ctrl` + `Alt` + `R`** anywhere on the page.

### Admin Dialog & Safeguards
- **Organizer PIN:** Enter the PIN **`2026`** to authorize modifications.
- **Actions:**
  - If the timer is **idle**: Displays a button to start the 24-hour countdown immediately.
  - If the timer is **running** or **ended**: Displays a warning and a **Reset** button to reset the timer back to its initial 24-hour idle state.

---

## Deployment (Production Hosting)

### SQLite vs. File Database
The persistence store is located at `data/timer-state.json` inside the root workspace. 

- **Local Machine / VPS / Docker:** The JSON store is persistent and survives machine restarts.
- **Serverless (Vercel):** On Vercel, the directory `/tmp` can be used, or the local project directory is read-only. For single-event configurations, a simple file store is fine. For fully distributed, multi-server serverless environments where memory/file system is ephemeral, you can easily wire `src/lib/timerStore.ts` to connect to a cloud KV or database (e.g. Vercel KV / Redis, Upstash, or Supabase).
