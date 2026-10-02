import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import {
  progression,
  sats,
  type Config,
  type State,
  type Celebration,
  type Contribution,
  type Method,
} from "../shared/model";
import { background, render, type Trail } from "./world";
import { defaultPresentation, type Presentation } from "../shared/presentation";
import { CelebrationQueue } from "./cinema";
import { JourneyMotion, courierX } from "./motion";
import "./style.css";
const BASE = location.pathname.startsWith("/rehearsal") ? "/rehearsal" : "";
async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch(BASE + "/api" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error ?? "Please try again.");
  return value;
}
function QR({ value, size = 160 }: { value: string; size?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#142b29", light: "#fffdf6" },
    }).then((x) => {
      if (active) setUrl(x);
    });
    return () => {
      active = false;
    };
  }, [value, size]);
  return (
    <img
      src={url || undefined}
      width={size}
      height={size}
      alt="Scan to contribute"
    />
  );
}
function useJourney() {
  const [data, setData] = useState<{
      config: Config;
      state: State;
      presentation: Presentation;
    } | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [events, setEvents] = useState<Celebration[]>([]),
    [restore, setRestore] = useState(0);
  useEffect(() => {
    let source: EventSource | undefined,
      active = true;
    let retry: ReturnType<typeof setTimeout>;
    function connect() {
      api<{ config: Config; state: State; presentation: Presentation }>(
        "/state",
      )
        .then((d) => {
          if (!active) return;
          setData(d);
          source = new EventSource(
            BASE + "/api/events?after=" + d.state.eventId,
          );
          source.onopen = () => setConnected(true);
          source.onerror = () => setConnected(false);
          source.addEventListener("presentation", (e) =>
            setData((p) =>
              p
                ? { ...p, presentation: JSON.parse((e as MessageEvent).data) }
                : p,
            ),
          );
          source.addEventListener("snapshot", (e) => {
            setData((p) =>
              p ? { ...p, state: JSON.parse((e as MessageEvent).data) } : p,
            );
            setEvents([]);
            setRestore((v) => v + 1);
          });
          source.addEventListener("reset", (e) => {
            setData((p) =>
              p ? { ...p, state: JSON.parse((e as MessageEvent).data) } : p,
            );
            setEvents([]);
            setRestore((v) => v + 1);
          });
          source.addEventListener("donation", (e) => {
            const v = JSON.parse((e as MessageEvent).data);
            setData((p) => (p ? { ...p, state: v.state } : p));
            setEvents((p) => [...p, v.event].slice(-300));
          });
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            retry = setTimeout(connect, 2000);
          }
        });
    }
    connect();
    return () => {
      active = false;
      clearTimeout(retry);
      source?.close();
    };
  }, []);
  return { data, connected, error, events, restore };
}
function ThemeToggle() {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme || "dark",
  );
  useEffect(() => {
    const sync = () =>
      setTheme(document.documentElement.dataset.theme || "dark");
    const storage = (event: StorageEvent) => {
      if (event.key === "pif-theme") {
        document.documentElement.dataset.theme =
          event.newValue === "light" ? "light" : "dark";
        sync();
      }
    };
    window.addEventListener("storage", storage);
    window.addEventListener("pif-theme", sync);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("pif-theme", sync);
    };
  }, []);
  return (
    <button
      className="theme-toggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("pif-theme", next);
        } catch {
          /* Storage can be unavailable. */
        }
        window.dispatchEvent(new Event("pif-theme"));
      }}
    >
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
function Header({
  mode,
  connected,
  config,
}: {
  mode?: string;
  connected?: boolean;
  config?: Config;
}) {
  return (
    <header className="header">
      <a className="wordmark" href={BASE + "/"}>
        <span className="brand-mark">↗</span>{" "}
        {config?.title === "Play It Forward" || !config
          ? "play it forward"
          : config.title}
        <span className="brand-dot">.</span>
      </a>
      <span className="event-name">
        {config?.event ?? "bitcoin++ BERLIN / PAYMENTS EDITION"}
      </span>
      <span className="status">
        <i className={connected ? "online" : ""} />
        {!mode
          ? "CONNECTING…"
          : mode === "demo"
            ? "DEMO · SIMULATED SATS"
            : mode === "signet"
              ? "SIGNET · TEST SATS"
              : "LIVE COMMUNITY POOL"}
      </span>
      <ThemeToggle />
    </header>
  );
}
function World({
  state,
  events,
  reduced,
  config,
  restore,
  onChapter,
  onCue,
  onPending,
  presentation,
}: {
  state: State;
  events: Celebration[];
  reduced: boolean;
  config: Config;
  restore: number;
  onChapter: (chapter: number) => void;
  onCue: (event: Celebration) => void;
  onPending: (count: number) => void;
  presentation: Presentation;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({
    state,
    events,
    reduced,
    config,
    restore,
    onChapter,
    onCue,
    onPending,
    presentation,
  });
  latest.current = {
    state,
    events,
    reduced,
    config,
    restore,
    onChapter,
    onCue,
    onPending,
    presentation,
  };
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    let raf = 0,
      seen = state.eventId,
      restored = restore;
    let trails: Trail[] = [],
      tick = 0,
      reportedChapter = -1;
    const motion = new JourneyMotion(state, presentation.pace === "cinematic");
    const queue = new CelebrationQueue(state.eventId);
    let visual = state,
      skip = presentation.skip,
      reportedPending = -1;
    const backgrounds = new Map<string, HTMLCanvasElement>();
    function sceneState(chapter: number, s: State, cfg: Config): State {
      const index = [
        "station",
        "spree",
        "alexanderplatz",
        "gallery",
        "gate",
        "vault",
      ].indexOf(cfg.chapters[chapter].scene);
      return {
        ...s,
        chapter: index,
        vaultOpen: chapter === s.chapter && s.vaultOpen,
      };
    }
    function sceneBackground(s: State) {
      const key = `${s.chapter}/${s.vaultOpen}/${s.treasureTier}`;
      if (!backgrounds.has(key))
        backgrounds.set(
          key,
          background(s.chapter, s.vaultOpen, s.treasureTier),
        );
      return backgrounds.get(key)!;
    }
    function frame(ms: number) {
      const now = ms / 1000;
      const {
        state: s,
        events: e,
        reduced: r,
        config: cfg,
        restore: epoch,
      } = latest.current;
      const settings = latest.current.presentation;
      const snap =
        epoch !== restored || s.eventId < seen || settings.skip !== skip;
      if (snap) {
        trails = [];
        seen = s.eventId;
        restored = epoch;
        skip = settings.skip;
        queue.clear(s.eventId);
        visual = s;
        motion.snap(s);
      }
      queue.enqueue(e);
      const cue = queue.next(
        now,
        !motion.sample(now).walking,
        settings.cueSeconds,
      );
      if (cue) {
        visual = { ...s, ...progression(cue.total, cfg), total: cue.total };
        trails.push({
          born: now,
          index: tick++,
          amount: cue.amount,
          milestone: cue.level > cue.previousLevel,
          duration: settings.pace === "cinematic" ? 3.2 : 1.6,
        });
        latest.current.onCue(cue);
      }
      if (queue.count !== reportedPending) {
        reportedPending = queue.count;
        latest.current.onPending(queue.count);
      }
      seen = Math.max(seen, s.eventId);
      motion.setPace(settings.pace === "cinematic");
      motion.update(visual, now, r || snap);
      const pose = motion.sample(now);
      if (pose.chapter !== reportedChapter) {
        reportedChapter = pose.chapter;
        latest.current.onChapter(pose.chapter);
      }
      const outgoing = sceneState(pose.chapter, visual, cfg);
      const incoming =
        pose.nextChapter === undefined
          ? undefined
          : sceneState(pose.nextChapter, visual, cfg);
      const x = incoming
        ? courierX(outgoing.chapter, 1) * (1 - pose.slide) +
          courierX(incoming.chapter, 0) * pose.slide
        : courierX(outgoing.chapter, pose.progress);
      trails = trails.filter((trail) => now - trail.born < trail.duration + 2);
      render(c, sceneBackground(outgoing), outgoing, now, trails, r, {
        x,
        walking: pose.walking,
        slide: pose.slide,
        incoming: incoming
          ? { bg: sceneBackground(incoming), state: incoming }
          : undefined,
      });
      // Useful to inspect the amount-based position without exposing payment details.
      ref.current!.dataset.chapter = String(pose.chapter);
      ref.current!.dataset.progress = String(pose.progress);
      ref.current!.dataset.courierX = String(x);
      ref.current!.dataset.travel = String(pose.transitioning);
      ref.current!.dataset.acknowledged = String(tick);
      ref.current!.dataset.activeTrails = String(trails.length);
      ref.current!.dataset.pending = String(queue.count);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      width="640"
      height="300"
      aria-label="Animated pixel-art courier exploring Berlin"
      role="img"
    />
  );
}
function Screen({ presenting = false }: { presenting?: boolean }) {
  const { data, connected, error, events, restore } = useJourney();
  const [visualChapter, setVisualChapter] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false),
    [controls, setControls] = useState(true),
    [fullscreenError, setFullscreenError] = useState("");
  const hideControls = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reveal = () => {
    setControls(true);
    clearTimeout(hideControls.current);
    hideControls.current = setTimeout(() => setControls(false), 3500);
  };
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    if (presenting) reveal();
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      clearTimeout(hideControls.current);
    };
  }, [presenting]);
  async function toggleFullscreen() {
    try {
      setFullscreenError("");
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        setFullscreenError(
          "Fullscreen is unavailable in this browser. The presentation still fills this window.",
        );
    } catch {
      setFullscreenError(
        "Fullscreen could not start. The presentation still fills this window.",
      );
    }
  }
  const [reduced, setReduced] = useState(
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [sound, setSound] = useState(false),
    [notice, setNotice] = useState<{
      amount: number;
      count: number;
      name: string;
      rewards: string[];
    } | null>(null);
  const [pending, setPending] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  function celebrate(event: Celebration) {
    const earned =
      data?.config.chapters
        .filter((_, i) => i > event.previousLevel && i <= event.level)
        .map((ch) => ch.reward)
        .filter((reward) => reward !== null) ?? [];
    setNotice({
      amount: event.amount,
      count: 1,
      name: event.name,
      rewards: earned,
    });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(
      () => setNotice(null),
      (data?.presentation?.cueSeconds ?? 3.6) * 1000,
    );
    if (sound && audio.current) {
      const context = audio.current,
        now = context.currentTime;
      const shift = [0, 2, 4, 7][event.id % 4];
      const notes =
        event.level > event.previousLevel
          ? [130.81, 261.63, 329.63, 392, 523.25]
          : [261.63, 329.63, 392];
      notes.forEach((frequency, i) => {
        const start = now + i * 0.19;
        [1, 2.002].forEach((harmonic, h) => {
          const oscillator = context.createOscillator(),
            gain = context.createGain();
          oscillator.type = h ? "triangle" : "sine";
          oscillator.frequency.value = frequency * 2 ** (shift / 12) * harmonic;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(
            (h ? 0.014 : 0.045) * (data?.presentation?.volume ?? 0.45),
            start + 0.07,
          );
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.6);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 2.7);
        });
      });
    }
  }
  useEffect(() => {
    setNotice(null);
    setPending(0);
    clearTimeout(noticeTimer.current);
  }, [restore, data?.presentation?.skip]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  if (!data)
    return <div className="loading">{error || "Packing the satchel…"}</div>;
  const { config, state } = data;
  const c = config.chapters[state.chapter];
  const visible = config.chapters[visualChapter ?? state.chapter];
  const url = config.publicUrl + BASE + "/donate";
  return (
    <main
      className={`screen ${presenting ? "presentation" : "overview"} ${controls ? "controls-visible" : "controls-hidden"}`}
      onPointerMove={presenting ? reveal : undefined}
      onFocusCapture={presenting ? reveal : undefined}
      onKeyDown={presenting ? reveal : undefined}
    >
      <Header mode={state.mode} connected={connected} config={config} />
      {!presenting && (
        <a className="present-link" href={BASE + "/screen"}>
          Present adventure <span>↗</span>
        </a>
      )}
      <section className="intro">
        <div>
          <p className="eyebrow">
            A COMMUNITY ADVENTURE · SIX STOPS THROUGH BERLIN
          </p>
          <h1>
            A little kindness.
            <br />
            <em>A long way.</em>
          </h1>
        </div>
        <div className="intro-note">
          <span className="spark">✳</span>
          <p>
            One city. One courier. All of us.
            <br />
            Your sats carry the story forward.
          </p>
        </div>
      </section>
      <section className="adventure">
        <div className="scene">
          <World
            state={state}
            events={events}
            reduced={reduced}
            config={config}
            restore={restore}
            onChapter={setVisualChapter}
            onCue={celebrate}
            onPending={setPending}
            presentation={data.presentation ?? defaultPresentation}
          />
          <div className="scene-title">
            <span className="chapter-label">
              CHAPTER{" "}
              {String((visualChapter ?? state.chapter) + 1).padStart(2, "0")} /
              06
            </span>
            <h2>{visible.name}</h2>
            <p>{visible.subtitle}</p>
            {pending > 0 && (
              <p className="queue-note">
                {pending} moments still to come · pool total is current
              </p>
            )}
          </div>
          <div className="scene-bottom">
            <span className="location-pin">⌖ BERLIN, DE</span>
            <span className="inventory">
              {state.rewards.length ? (
                state.rewards.map((x) => (
                  <span key={x} title={x}>
                    {
                      {
                        hat: "CAP",
                        sunglasses: "SHADES",
                        shirt: "TEE",
                        bag: "BAG",
                        key: "KEY",
                      }[x as "hat"]
                    }
                  </span>
                ))
              ) : (
                <span>A SATCHEL FULL OF POSSIBILITIES</span>
              )}
            </span>
          </div>
          {notice && (
            <div className="celebration" role="status">
              <span>✦</span>
              <div>
                <b>+{sats(notice.amount)} sats</b>
                <small>
                  {notice.count > 1
                    ? `${notice.count} contributions. One beautiful moment.`
                    : notice.name
                      ? `Thank you, ${notice.name}.`
                      : "A little kindness just arrived."}
                </small>
                {!!notice.rewards.length && (
                  <small className="earned-rewards">
                    Collected:{" "}
                    {notice.rewards
                      .map(
                        (reward) =>
                          ({
                            hat: "cap",
                            sunglasses: "shades",
                            shirt: "tee",
                            bag: "orange bag",
                            key: "treasure key",
                          })[reward] ?? reward,
                      )
                      .join(" · ")}
                  </small>
                )}
              </div>
            </div>
          )}
        </div>
        <aside className="pool">
          <p className="eyebrow">COMMUNITY PRIZE POOL RAISED</p>
          <div className="total">
            {sats(state.total)}
            <span>sats</span>
          </div>
          <div className="chapter-progress">
            <div>
              <span>
                {state.vaultOpen ? "The vault is open ✦" : "Next chapter"}
              </span>
              <b>
                {state.vaultOpen
                  ? "Keep the magic going"
                  : `${sats(state.remaining)} sats to go`}
              </b>
            </div>
            <progress max="1" value={state.progress} />
            <p>
              {state.vaultOpen
                ? "Every contribution adds to our shared treasure."
                : (config.chapters[state.chapter + 1]?.name ??
                  "Open the community vault")}
            </p>
          </div>
          <div className="qr-panel">
            <QR value={url} size={136} />
            <div>
              <h3>Carry it forward.</h3>
              <p>
                Scan. Send sats.
                <br />
                Be part of the story.
              </p>
            </div>
          </div>
          <a className="donate-link" href={BASE + "/donate"}>
            JOIN THE JOURNEY <span>↗</span>
          </a>
          <p className="pool-footnote">
            {state.mode === "demo"
              ? "Demo adventure · no real money moves"
              : state.mode === "signet"
                ? "Test network · no real prize money"
                : "Bitcoin · Lightning · Ark"}
            {presenting ? " " : <br />}
            All contributions grow the community pool.
          </p>
        </aside>
      </section>
      <section className="journey">
        {presenting && (
          <div className="presentation-progress">
            <span>
              {state.vaultOpen
                ? "The vault is open ✦"
                : `${c.name} · ${sats(state.remaining)} sats to go`}
            </span>
            <progress
              max="1"
              value={state.progress}
              aria-label="Current chapter progress"
            />
          </div>
        )}
        <div className="journey-heading">
          <span className="eyebrow">OUR BERLIN JOURNEY</span>
          <span>
            {Math.min(100, Math.floor((state.total / config.goal) * 100))}% of{" "}
            {sats(config.goal)} sats <b>↗</b>
          </span>
        </div>
        <progress
          className="overall-progress"
          max={config.goal}
          value={Math.min(state.total, config.goal)}
          aria-label="Total sats toward the community vault"
        />
        <div className="stops">
          {config.chapters.map((ch, i) => (
            <div
              className={`stop ${i <= state.chapter ? "reached" : ""} ${i === state.chapter ? "current" : ""}`}
              key={ch.scene}
            >
              <span className="stop-dot">
                {i < state.chapter ? "✓" : String(i + 1).padStart(2, "0")}
              </span>
              <span>
                {
                  [
                    "Station",
                    "Spree",
                    "Alexanderplatz",
                    "East Side Gallery",
                    "Brandenburg Gate",
                    "Community Vault",
                  ][i]
                }
              </span>
            </div>
          ))}
        </div>
      </section>
      <footer>
        <span>SMALL PAYMENTS. SHARED POSSIBILITIES.</span>
        <div>
          <button onClick={() => setReduced(!reduced)}>
            {reduced ? "Motion off" : "Motion on"}
          </button>
          <button
            onClick={() => {
              if (!sound) {
                audio.current ??= new AudioContext();
                void audio.current.resume();
              }
              setSound(!sound);
            }}
          >
            {sound ? "Sound on" : "Sound off"}
          </button>
          {presenting ? (
            <>
              <button onClick={toggleFullscreen}>
                {fullscreen ? "Exit fullscreen" : "Fullscreen ↗"}
              </button>
              <a href={BASE + "/"}>Overview ↗</a>
            </>
          ) : (
            <a href={BASE + "/screen"}>Present adventure ↗</a>
          )}
          <a href={BASE + "/admin"}>Operator ↗</a>
        </div>
      </footer>
      {fullscreenError && (
        <div className="connection-note" role="status">
          {fullscreenError}
        </div>
      )}
      {!connected && (
        <div className="connection-note">Reconnecting to the journey…</div>
      )}
    </main>
  );
}
function Donate() {
  const { data, connected, error } = useJourney();
  const [amount, setAmount] = useState(5000),
    [name, setName] = useState(""),
    [method, setMethod] = useState<Method>("lightning"),
    [c, setC] = useState<Contribution | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (data && !data.config.methods.includes(method))
      setMethod(data.config.methods[0]);
  }, [data?.config, method]);
  useEffect(() => {
    if (!c) return;
    const timer = setInterval(
      () =>
        api<Contribution>("/contributions/" + c.id)
          .then(setC)
          .catch(() => setMessage("Reconnecting to payment status…")),
      2000,
    );
    return () => clearInterval(timer);
  }, [c?.id]);
  async function contribute() {
    setBusy(true);
    setMessage("");
    try {
      setC(await api<Contribution>("/contributions", { amount, name, method }));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return <div className="loading">{error || "Opening the journey…"}</div>;
  return (
    <main className="mobile">
      <Header
        mode={data.state.mode}
        connected={connected}
        config={data.config}
      />
      <div className="mobile-heading">
        <p className="eyebrow">BERLIN, LET’S BUILD SOMETHING TOGETHER.</p>
        <h1>
          Your sats.
          <br />
          <em>Our adventure.</em>
        </h1>
        <p>
          Help our courier explore Berlin and grow the community hackathon prize
          pool.
        </p>
      </div>
      <div className="donation-card">
        {c ? (
          <>
            <p className="eyebrow">
              {c.status === "paid"
                ? "KINDNESS DELIVERED ✦"
                : c.status === "expired"
                  ? "INVOICE EXPIRED"
                  : "A LITTLE MAGIC, ON ITS WAY"}
            </p>
            <h2>
              {c.status === "paid"
                ? "Thank you" + (c.name ? ", " + c.name : "") + "."
                : `${sats(c.amount)} sats`}
            </h2>
            {c.status === "paid" ? (
              <>
                <div className="thanks">✳</div>
                <p>
                  {sats(c.received)} sats reached the community pool.
                  <br />
                  The courier felt that one.
                </p>
              </>
            ) : (
              <>
                <QR value={c.uri} size={224} />
                <p className="payment-note">
                  {data.state.mode === "demo"
                    ? "This is a simulated contribution. No wallet or real sats needed."
                    : method === "bitcoin"
                      ? "Your payment joins the pool after one confirmation."
                      : method === "ark"
                        ? "Send to this Ark address using a compatible Bark wallet."
                        : "Scan with your Lightning wallet, or open it below."}
                </p>
                {data.state.mode === "demo" ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        setC(
                          await api<Contribution>(
                            "/contributions/" + c.id + "/simulate",
                            {},
                          ),
                        );
                      } catch (e) {
                        setMessage((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    SEND DEMO SATS ↗
                  </button>
                ) : (
                  <>
                    {c.status !== "expired" && c.method !== "ark" && (
                      <a className="primary" href={c.uri}>
                        OPEN WALLET ↗
                      </a>
                    )}
                    <button
                      className="secondary"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(c.destination)
                          .then(() => setMessage("Payment details copied."))
                          .catch(() =>
                            setMessage(
                              "Select and copy the payment details below.",
                            ),
                          )
                      }
                    >
                      {c.method === "ark"
                        ? "Copy Ark address"
                        : "Copy payment details"}
                    </button>
                    <code className="destination">{c.destination}</code>
                    <span className="pending">
                      {c.status === "expired"
                        ? "Create a fresh invoice to try again."
                        : "Waiting for verified payment…"}
                    </span>
                  </>
                )}
              </>
            )}
            <button
              className="secondary"
              onClick={() => {
                setC(null);
                setMessage("");
              }}
            >
              {" "}
              {c.status === "paid"
                ? "Contribute again"
                : "Back to contribution"}
            </button>
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="amount">
              HOW MUCH KINDNESS?
            </label>
            <div className="amount-input">
              <input
                id="amount"
                type="number"
                min="1"
                max="1000000000"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <span>sats</span>
            </div>
            <div className="amounts">
              {[1000, 5000, 10000, 50000].map((n) => (
                <button
                  className={n === amount ? "selected" : ""}
                  key={n}
                  onClick={() => setAmount(n)}
                >
                  {sats(n)}
                </button>
              ))}
            </div>
            <label className="field-label" htmlFor="name">
              YOUR NAME <span>optional</span>
            </label>
            <input
              id="name"
              className="name-input"
              maxLength={32}
              placeholder="A kind Berliner"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="hint">
              Shown with your celebration on the venue screen.
            </p>
            <div className="methods">
              {data.config.methods.map((m) => (
                <button
                  className={m === method ? "selected" : ""}
                  key={m}
                  onClick={() => setMethod(m)}
                >
                  {m === "lightning"
                    ? "ϟ Lightning"
                    : m === "bitcoin"
                      ? "₿ Bitcoin"
                      : "◈ Ark"}
                </button>
              ))}
            </div>
            <button
              className="primary"
              disabled={busy || amount < 1 || !Number.isInteger(amount)}
              onClick={contribute}
            >
              {busy ? "Preparing your contribution…" : "CARRY IT FORWARD ↗"}
            </button>
            <p className="hint">
              {data.state.mode === "demo"
                ? "SIMULATED SATS · NO REAL MONEY MOVES"
                : data.state.mode === "signet"
                  ? "SIGNET TEST SATS · NO REAL MONEY"
                  : "Funds go to the organizer’s community prize wallet."}
            </p>
          </>
        )}
        {message && (
          <p role="alert" className="message">
            {message}
          </p>
        )}
      </div>
      <div className="mobile-total">
        <span>TOGETHER, WE’VE RAISED</span>
        <b>
          {sats(data.state.total)} <small>sats</small>
        </b>
      </div>
      <a className="back-link" href={BASE + "/screen"}>
        Follow the adventure ↗
      </a>
    </main>
  );
}
function Admin() {
  const { data, connected } = useJourney();
  const [token, setToken] = useState(""),
    [logged, setLogged] = useState(false),
    [health, setHealth] = useState<any>(null),
    [amount, setAmount] = useState(5000),
    [name, setName] = useState("Berlin community"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [burstCount, setBurstCount] = useState(10),
    [movieDuration, setMovieDuration] = useState(180),
    [pace, setPace] = useState<"cinematic" | "snappy">("cinematic"),
    [cueSeconds, setCueSeconds] = useState(3.6),
    [volume, setVolume] = useState(0.45);
  const settingsLoaded = useRef(false);
  async function refresh() {
    try {
      const next = await api<any>("/admin/health");
      setHealth(next);
      if (!settingsLoaded.current) {
        const p = next.presentation ?? defaultPresentation;
        setPace(p.pace);
        setCueSeconds(p.cueSeconds);
        setVolume(p.volume);
        settingsLoaded.current = true;
      }
      setLogged(true);
    } catch {
      setLogged(false);
    }
  }
  useEffect(() => {
    void refresh();
    const i = setInterval(refresh, 5000);
    return () => clearInterval(i);
  }, []);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await api("/admin/" + path, body);
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin">
      <Header
        mode={data?.state.mode}
        connected={connected}
        config={data?.config}
      />
      <p className="eyebrow">
        BEHIND THE ADVENTURE {BASE ? "· ISOLATED REHEARSAL" : "· EVENT"}
      </p>
      <h1>
        Operator’s desk<span className="orange">.</span>
      </h1>
      {!logged ? (
        <form
          className="admin-card"
          onSubmit={async (e) => {
            e.preventDefault();
            await act("login", { token });
            setToken("");
          }}
        >
          <label htmlFor="token">Operator token</label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="current-password"
          />
          <button className="primary" disabled={busy}>
            Unlock desk ↗
          </button>
        </form>
      ) : (
        <>
          <div className="admin-grid">
            <section className="admin-card">
              <p className="eyebrow">JOURNEY HEALTH</p>
              <h2>
                {health?.mode === "demo"
                  ? "Simulation mode"
                  : health?.mode + " payments"}
              </h2>
              <p>
                {sats(data?.state.total ?? 0)} sats · {data?.state.count ?? 0}{" "}
                receipts
              </p>
              <p>{health?.screenConnections} connected pages</p>
              <p>
                Last reconciliation:{" "}
                {health?.lastSync
                  ? new Date(health.lastSync).toLocaleTimeString()
                  : "Waiting"}
              </p>
              {health?.syncError && (
                <p role="alert" className="message">
                  {health.syncError}
                </p>
              )}
              <button
                className="secondary"
                onClick={() => act("reconcile", {})}
                disabled={busy}
              >
                Reconcile now
              </button>
            </section>
            <section className="admin-card">
              <p className="eyebrow">DEMO CONTROLS</p>
              <label htmlFor="sim-amount">Donation amount in sats</label>
              <input
                id="sim-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <label htmlFor="sim-name">Contributor name</label>
              <input
                id="sim-name"
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="burst-count">Donations in a burst (1–100)</label>
              <input
                id="burst-count"
                type="number"
                min="1"
                max="100"
                value={burstCount}
                onChange={(e) => setBurstCount(Number(e.target.value))}
              />
              <div className="preset-row">
                {[1000, 10000, 50000, 250000].map((n) => (
                  <button
                    className="secondary"
                    key={n}
                    onClick={() => setAmount(n)}
                  >
                    {sats(n)} sats
                  </button>
                ))}
              </div>
              <button
                className="secondary"
                disabled={
                  busy ||
                  health?.mode !== "demo" ||
                  !data ||
                  data.state.vaultOpen
                }
                onClick={() =>
                  act("simulate", {
                    amount: data!.state.remaining,
                    name: "Next chapter",
                  })
                }
              >
                Reach next milestone ↗
              </button>
              <button
                className="primary"
                disabled={busy || health?.mode !== "demo"}
                onClick={() => act("simulate", { amount, name })}
              >
                Send donation ↗
              </button>
              <button
                className="secondary"
                disabled={busy || health?.mode !== "demo"}
                onClick={() =>
                  act("simulate", { amount, name, count: burstCount })
                }
              >
                Send burst · {burstCount} donations
              </button>
              <button
                className="secondary"
                disabled={busy || health?.mode !== "demo"}
                onClick={() =>
                  act("simulate", {
                    amount: 2100000,
                    name: "The Berlin community",
                  })
                }
              >
                Travel to the treasure room
              </button>
              <button
                className="danger"
                disabled={busy || health?.mode !== "demo"}
                onClick={() => {
                  if (confirm("Reset this simulated adventure to zero?"))
                    void act("reset", {});
                }}
              >
                Reset demo adventure
              </button>
            </section>
          </div>
          <div className="admin-grid">
            <section className="admin-card">
              <p className="eyebrow">THE DIRECTOR’S CHAIR</p>
              <h2>Give every gift a moment.</h2>
              <label htmlFor="pace">Travel style</label>
              <select
                id="pace"
                value={pace}
                onChange={(e) =>
                  setPace(e.target.value as "cinematic" | "snappy")
                }
              >
                <option value="cinematic">
                  Cinematic · slow camera travel
                </option>
                <option value="snappy">Snappy · quick transitions</option>
              </select>
              <label htmlFor="cue-seconds">
                Seconds per donation celebration
              </label>
              <input
                id="cue-seconds"
                type="number"
                min="1"
                max="8"
                step=".2"
                value={cueSeconds}
                onChange={(e) => setCueSeconds(Number(e.target.value))}
              />
              <label htmlFor="volume">
                Music volume · {Math.round(volume * 100)}%
              </label>
              <input
                id="volume"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
              <p>
                Sound must be enabled on the venue screen. Pool totals always
                update immediately; celebrations play individually.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  act("presentation", { pace, cueSeconds, volume })
                }
              >
                Apply to connected screens
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => act("skip", {})}
              >
                Skip queued celebrations · catch up now
              </button>
            </section>
            <section className="admin-card">
              <p className="eyebrow">MOVIE MODE · SIMULATED SATS ONLY</p>
              <h2>A whole adventure, on a timer.</h2>
              <label htmlFor="movie-duration">
                Movie duration in seconds (30–1800)
              </label>
              <input
                id="movie-duration"
                type="number"
                min="30"
                max="1800"
                value={movieDuration}
                onChange={(e) => setMovieDuration(Number(e.target.value))}
              />
              <p>
                Gifts are paced through each remaining chapter, reaching the
                goal at the scheduled time. The final celebration may finish a
                few seconds later. Pause stops new movie gifts; queued
                celebrations continue.
              </p>
              <p>
                {health?.movie?.running
                  ? `${health.movie.paused ? "Paused" : "Playing"} · ${Math.ceil(health.movie.remaining)} seconds left · ${health.movie.gifts}/${health.movie.planned} gifts`
                  : "Ready for the next screening."}
              </p>
              <button
                className="primary"
                disabled={
                  busy || health?.mode !== "demo" || health?.movie?.running
                }
                onClick={() =>
                  act("movie", { action: "start", duration: movieDuration })
                }
              >
                Start movie ↗
              </button>
              <div className="preset-row">
                <button
                  className="secondary"
                  disabled={busy || !health?.movie?.running}
                  onClick={() =>
                    act("movie", {
                      action: health?.movie?.paused ? "resume" : "pause",
                    })
                  }
                >
                  {health?.movie?.paused ? "Resume movie" : "Pause movie"}
                </button>
                <button
                  className="secondary"
                  disabled={busy || !health?.movie?.running}
                  onClick={() => act("movie", { action: "stop" })}
                >
                  Stop movie
                </button>
              </div>
            </section>
          </div>
          <section className="admin-card mode-card">
            <p className="eyebrow">EVENT AND REHEARSAL</p>
            <h2>
              {BASE
                ? "Rehearsal · its own demo ledger"
                : health?.mode === "mainnet"
                  ? "Mainnet event"
                  : "Event is in " + (health?.mode ?? "demo") + " mode"}
            </h2>
            <p>
              {BASE
                ? "These simulated receipts never enter the event prize pool or wallet."
                : "Use rehearsal for movie demos and practice. The event’s network is configured at server startup so switching views cannot swap wallets or mix funds."}
            </p>
            <a className="primary" href={BASE ? "/admin" : "/rehearsal/admin"}>
              {BASE
                ? "Return to event operator desk ↗"
                : "Open isolated rehearsal ↗"}
            </a>
            <a
              className="secondary"
              href={BASE + "/screen"}
              target="_blank"
              rel="noreferrer"
            >
              Open this venue screen ↗
            </a>
            {!BASE && (
              <p>
                {health?.liveReady
                  ? "Mainnet wallet reconciliation is healthy."
                  : "Mainnet setup: install Barkd 0.7.1, create and back up a mainnet wallet, set BARK_TOKEN and PAYMENT_MODE=mainnet, configure HTTPS, then enable LIVE_PAYMENTS_ENABLED and restart. Run a small settlement test before sharing the QR."}
              </p>
            )}
          </section>
          <button
            className="secondary"
            onClick={async () => {
              await api("/admin/logout", {});
              setLogged(false);
            }}
          >
            Lock desk
          </button>
        </>
      )}
      {message && (
        <p className="message" role="alert">
          {message}
        </p>
      )}
      <a className="back-link" href={BASE + "/screen"}>
        Back to the venue screen ↗
      </a>
    </main>
  );
}
const path = location.pathname.slice(BASE.length) || "/";
createRoot(document.getElementById("root")!).render(
  path === "/admin" ? (
    <Admin />
  ) : path === "/donate" ? (
    <Donate />
  ) : (
    <Screen presenting={path === "/screen"} />
  ),
);
