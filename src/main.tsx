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
import "./style.css";
async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch("/api" + path, {
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
  const [data, setData] = useState<{ config: Config; state: State } | null>(
      null,
    ),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [events, setEvents] = useState<Celebration[]>([]);
  useEffect(() => {
    let source: EventSource | undefined,
      active = true;
    let retry: ReturnType<typeof setTimeout>;
    function connect() {
      api<{ config: Config; state: State }>("/state")
        .then((d) => {
          if (!active) return;
          setData(d);
          source = new EventSource("/api/events?after=" + d.state.eventId);
          source.onopen = () => setConnected(true);
          source.onerror = () => setConnected(false);
          source.addEventListener("snapshot", (e) =>
            setData((p) =>
              p ? { ...p, state: JSON.parse((e as MessageEvent).data) } : p,
            ),
          );
          source.addEventListener("reset", (e) => {
            setData((p) =>
              p ? { ...p, state: JSON.parse((e as MessageEvent).data) } : p,
            );
            setEvents([]);
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
  return { data, connected, error, events };
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
      <a className="wordmark" href="/screen">
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
    </header>
  );
}
function World({
  state,
  events,
  reduced,
  config,
}: {
  state: State;
  events: Celebration[];
  reduced: boolean;
  config: Config;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ state, events, reduced, config });
  latest.current = { state, events, reduced, config };
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    let bg: HTMLCanvasElement,
      key = "",
      raf = 0;
    let seen = state.eventId;
    let trails: Trail[] = [];
    let tick = 0;
    function frame(ms: number) {
      const now = ms / 1000;
      const { state: s, events: e, reduced: r, config: cfg } = latest.current;
      const sceneIndex = [
        "station",
        "spree",
        "alexanderplatz",
        "gallery",
        "gate",
        "vault",
      ].indexOf(cfg.chapters[s.chapter].scene);
      const k = `${sceneIndex}/${s.vaultOpen}/${s.treasureTier}`;
      if (key !== k) {
        bg = background(sceneIndex, s.vaultOpen, s.treasureTier);
        key = k;
      }
      if (s.eventId < seen) {
        seen = s.eventId;
        trails = [];
      }
      for (const event of e)
        if (event.id > seen) {
          trails.push({ born: now + (tick++ % 6) * 0.04, index: tick });
          seen = event.id;
        }
      trails = trails.filter((x) => now - x.born < 1.8);
      render(c, bg, { ...s, chapter: sceneIndex }, now, trails, r);
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
function Screen() {
  const { data, connected, error, events } = useJourney();
  const [reduced, setReduced] = useState(
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [sound, setSound] = useState(false),
    [notice, setNotice] = useState<{
      amount: number;
      count: number;
      name: string;
    } | null>(null),
    [travel, setTravel] = useState<number | null>(null);
  const seen = useRef(0),
    initialised = useRef(false),
    audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (data && !initialised.current) {
      seen.current = data.state.eventId;
      initialised.current = true;
    }
  }, [data]);
  useEffect(() => {
    const fresh = events.filter((x) => x.id > seen.current);
    if (!fresh.length) {
      if (!events.length) {
        setNotice(null);
        setTravel(null);
      }
      return;
    }
    seen.current = fresh.at(-1)!.id;
    setNotice({
      amount: fresh.reduce((s, x) => s + x.amount, 0),
      count: fresh.length,
      name: fresh.length === 1 ? fresh[0].name : "",
    });
    const crossed = fresh.find((x) => x.level > x.previousLevel);
    if (crossed && !reduced) setTravel(crossed.previousLevel);
    if (sound && audio.current) {
      const o = audio.current.createOscillator(),
        g = audio.current.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(660, audio.current.currentTime);
      g.gain.setValueAtTime(0.025, audio.current.currentTime);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.4,
      );
      o.connect(g);
      g.connect(audio.current.destination);
      o.start();
      o.stop(audio.current.currentTime + 0.4);
    }
    const timeout = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timeout);
  }, [events, reduced, sound]);
  useEffect(() => {
    if (travel === null) return;
    const timer = setTimeout(
      () =>
        setTravel((v) =>
          v === null
            ? null
            : v >= Math.min(data?.state.level ?? 0, 5)
              ? null
              : v + 1,
        ),
      850,
    );
    return () => clearTimeout(timer);
  }, [travel, data?.state.level]);
  if (!data)
    return <div className="loading">{error || "Packing the satchel…"}</div>;
  const { config, state } = data;
  const c = config.chapters[state.chapter];
  const url = config.publicUrl + "/donate";
  const displayState =
    travel === null
      ? state
      : {
          ...state,
          ...progression(
            config.chapters[Math.min(travel, 5)].threshold,
            config,
          ),
        };
  return (
    <main className="screen">
      <Header mode={state.mode} connected={connected} config={config} />
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
            state={displayState}
            events={events}
            reduced={reduced}
            config={config}
          />
          <div className="scene-title">
            <span className="chapter-label">
              CHAPTER {String(state.chapter + 1).padStart(2, "0")} / 06
            </span>
            <h2>
              {travel === null
                ? c.name
                : config.chapters[Math.min(travel, 5)].name}
            </h2>
            <p>{c.subtitle}</p>
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
              </div>
            </div>
          )}
          {travel !== null && (
            <div className="montage">
              THE JOURNEY CONTINUES <span>↗</span>
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
          <a className="donate-link" href="/donate">
            JOIN THE JOURNEY <span>↗</span>
          </a>
          <p className="pool-footnote">
            {state.mode === "demo"
              ? "Demo adventure · no real money moves"
              : state.mode === "signet"
                ? "Test network · no real prize money"
                : "Bitcoin · Lightning · Ark"}
            <br />
            All contributions grow the community pool.
          </p>
        </aside>
      </section>
      <section className="journey">
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
          <a href="/admin">Operator ↗</a>
        </div>
      </footer>
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
      <a className="back-link" href="/screen">
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
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setHealth(await api("/admin/health"));
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
      <p className="eyebrow">BEHIND THE ADVENTURE</p>
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
                onClick={() => act("simulate", { amount, name, count: 100 })}
              >
                Burst · 100 donations
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
      <a className="back-link" href="/screen">
        Back to the venue screen ↗
      </a>
    </main>
  );
}
const path = location.pathname;
createRoot(document.getElementById("root")!).render(
  path === "/admin" ? <Admin /> : path === "/donate" ? <Donate /> : <Screen />,
);
