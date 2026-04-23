import "./style.css";
import { createTravelSession } from "./agent";
import type { RealtimeSession } from "@openai/agents/realtime";
import { historyToTranscriptLines, type TranscriptLine } from "./transcript";

type ConnectionState = "disconnected" | "connecting" | "connected";
type TurnState = "idle" | "listening" | "thinking" | "speaking";

const appRoot: HTMLElement = (() => {
  const el = document.getElementById("app");
  if (!el) {
    throw new Error("#app not found");
  }
  return el;
})();

function getApiBase(): string {
  const v = import.meta.env.VITE_API_BASE;
  if (v) return v.replace(/\/$/, "");
  if (import.meta.env.DEV) return "";
  return "http://127.0.0.1:3001";
}

async function fetchClientSecret(): Promise<string> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/client-secret`, { method: "POST" });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? res.statusText);
  }
  const data = (await res.json()) as { value: string };
  if (!data.value) throw new Error("トークンが空です。");
  return data.value;
}

type Ui = {
  elConnectionDot: HTMLSpanElement;
  elConnectionText: HTMLSpanElement;
  elTurn: HTMLDivElement;
  elTranscript: HTMLDivElement;
  elError: HTMLDivElement;
  elStart: HTMLButtonElement;
  elStop: HTMLButtonElement;
};

const ui: Partial<Ui> = {};
let session: RealtimeSession | null = null;
let connection: ConnectionState = "disconnected";
let lastTranscript: TranscriptLine[] = [];

function setConnection(state: ConnectionState) {
  connection = state;
  if (!ui.elConnectionDot || !ui.elConnectionText) return;
  const on = state === "connected";
  ui.elConnectionDot.className = on ? "dot dot--on" : "dot";
  ui.elConnectionText.textContent = state === "connecting" ? "接続中…" : on ? "接続中" : "未接続";
  if (ui.elStart) {
    ui.elStart.disabled = state === "connecting" || state === "connected";
  }
  if (ui.elStop) {
    ui.elStop.disabled = state !== "connecting" && state !== "connected";
  }
}

function turnClassName(t: TurnState): string {
  return `badge${t === "idle" ? " badge--idle" : t === "listening" ? " badge--listen" : t === "thinking" ? " badge--think" : " badge--speak"}`;
}

const turnText: Record<TurnState, string> = {
  idle: "待機中",
  listening: "聞いています",
  thinking: "考えています",
  speaking: "話しています",
};

function setTurn(state: TurnState) {
  if (ui.elTurn) {
    ui.elTurn.className = turnClassName(state);
    ui.elTurn.textContent = turnText[state];
  }
}

function renderTranscriptFromHistory() {
  if (session) {
    lastTranscript = historyToTranscriptLines(session.history);
  }
  if (!ui.elTranscript) return;
  if (lastTranscript.length === 0) {
    ui.elTranscript.innerHTML = '<p class="empty">会話が表示されます（マイクの許可が必要です）。</p>';
    return;
  }
  const html = lastTranscript
    .map((l) => {
      const label = l.role === "user" ? "ユーザー" : l.role === "assistant" ? "AI" : "ツール";
      const cls = l.role === "user" ? "user" : l.role === "assistant" ? "agent" : "tool";
      return `<div class="bubble bubble--${cls}"><span class="bubble__label">${label}</span>${escapeHtml(
        l.text
      )}</div>`;
    })
    .join("");
  ui.elTranscript.innerHTML = html;
  ui.elTranscript.scrollTop = ui.elTranscript.scrollHeight;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showErrorMessage(msg: string | null) {
  if (!ui.elError) return;
  if (msg) {
    ui.elError.textContent = msg;
    ui.elError.removeAttribute("hidden");
    ui.elError.style.display = "block";
  } else {
    ui.elError.textContent = "";
    ui.elError.style.display = "none";
  }
}

function bindSession(s: RealtimeSession) {
  s.on("agent_start", () => {
    if (connection === "connected") setTurn("thinking");
  });
  s.on("audio_start", () => {
    if (connection === "connected") setTurn("speaking");
  });
  s.on("audio_stopped", () => {
    if (connection === "connected") setTurn("listening");
  });
  s.on("agent_end", () => {
    if (connection === "connected") setTurn("listening");
  });
  s.on("history_updated", () => {
    renderTranscriptFromHistory();
  });
  s.on("error", (ev) => {
    const err = (ev as { error?: unknown }).error;
    const text = err instanceof Error ? err.message : String(err);
    showErrorMessage(`エラー: ${text}`);
    setConnection("disconnected");
    setTurn("idle");
    session = null;
  });
}

async function startSession() {
  showErrorMessage(null);
  setConnection("connecting");
  setTurn("idle");
  const token = await fetchClientSecret();
  const s = createTravelSession();
  session = s;
  bindSession(s);
  lastTranscript = [];
  renderTranscriptFromHistory();

  try {
    await s.connect({ apiKey: token });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showErrorMessage(`接続失敗: ${msg}`);
    setConnection("disconnected");
    setTurn("idle");
    s.close();
    session = null;
    return;
  }
  setConnection("connected");
  setTurn("listening");
}

function stopSession() {
  if (session) {
    try {
      session.close();
    } catch {
      /* ignore */
    }
  }
  session = null;
  setConnection("disconnected");
  setTurn("idle");
  lastTranscript = [];
  renderTranscriptFromHistory();
}

function mount() {
  appRoot.innerHTML = `
  <div class="panel">
    <header class="header">
      <div>
        <h1 class="title">旅行アシスタント</h1>
        <p class="sub">Voice · OpenAI Realtime (gpt-realtime-1.5) · 日本語デモ</p>
      </div>
      <div class="pill" title="接続">
        <span class="dot" data-role="connection-dot"></span>
        <span data-role="connection-text">未接続</span>
      </div>
    </header>
    <p class="hint">マイクを有効にし、「開始」で会話を開始します。</p>
    <div class="error" data-role="error" hidden style="display:none" role="alert"></div>
    <div class="status-row" aria-live="polite">
      <span>状態:</span>
      <div class="badge badge--idle" data-role="turn" id="turn-badge">待機中</div>
    </div>
    <div class="actions">
      <button type="button" class="btn btn--primary" data-action="start">開始</button>
      <button type="button" class="btn btn--ghost" data-action="stop" disabled>停止</button>
    </div>
    <p class="hint" style="margin-top:0">会話</p>
    <div class="transcript" data-role="transcript" role="log" aria-relevant="additions"></div>
  </div>
  <footer>天気: 「東京の天気は？」/ 観光: 「京都のおすすめは？」（デモ・モック天気あり）</footer>
  `;

  Object.assign(ui, {
    elConnectionDot: appRoot.querySelector('[data-role="connection-dot"]') as HTMLSpanElement,
    elConnectionText: appRoot.querySelector('[data-role="connection-text"]') as HTMLSpanElement,
    elTurn: appRoot.querySelector('[data-role="turn"]') as HTMLDivElement,
    elTranscript: appRoot.querySelector('[data-role="transcript"]') as HTMLDivElement,
    elError: appRoot.querySelector('[data-role="error"]') as HTMLDivElement,
    elStart: appRoot.querySelector('[data-action="start"]') as HTMLButtonElement,
    elStop: appRoot.querySelector('[data-action="stop"]') as HTMLButtonElement,
  });

  ui.elStart?.addEventListener("click", () => {
    void startSession();
  });
  ui.elStop?.addEventListener("click", () => {
    showErrorMessage(null);
    stopSession();
  });

  setConnection("disconnected");
  setTurn("idle");
  renderTranscriptFromHistory();
}

mount();
