// Shared candlestick renderer — the exchange, stocks, and coin charts all
// draw through this. Styled after real trading terminals: continuous candle
// series (flat candles through quiet periods), right price axis, bottom time
// axis, last-price line, volume strip.

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// the timeframes every market chart offers, and each one's bucket width
export const TIMEFRAMES: Array<{ key: string; label: string; ms: number }> = [
  { key: "1m", label: "1m", ms: 60_000 },
  { key: "5m", label: "5m", ms: 300_000 },
  { key: "15m", label: "15m", ms: 900_000 },
  { key: "1h", label: "1H", ms: 3_600_000 },
  { key: "4h", label: "4H", ms: 14_400_000 },
  { key: "1d", label: "1D", ms: 86_400_000 },
];
export const timeframeMs = (key: string) => TIMEFRAMES.find((t) => t.key === key)?.ms ?? 300_000;
export const timeframeButtons = (active: string) =>
  TIMEFRAMES.map(
    (t) => `<button class="gd-btn mkt-res ${t.key === active ? "active" : ""}" data-res="${t.key}">${t.label}</button>`
  ).join("");

export const fmtPrice = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const UP = "#26a69a"; // real-terminal teal/red palette
const DOWN = "#ef5350";

// Continuous series: real candles land in their time bucket; quiet buckets
// become flat candles at the carried close (o=h=l=c), like a market where the
// price just isn't moving.
function fillSeries(candles: Candle[], bucketMs: number, maxBuckets: number): Candle[] {
  if (!candles.length) return [];
  const byBucket = new Map<number, Candle>();
  for (const c of candles) byBucket.set(Math.floor(c.t / bucketMs), c);
  const endBucket = Math.floor(Date.now() / bucketMs);
  const startBucket = Math.max(Math.floor(candles[0].t / bucketMs), endBucket - maxBuckets + 1);
  let carry = candles[0].o;
  for (const c of candles) if (Math.floor(c.t / bucketMs) <= startBucket) carry = c.c;
  const out: Candle[] = [];
  for (let b = startBucket; b <= endBucket; b++) {
    const real = byBucket.get(b);
    if (real) {
      // open from the carried close so candles chain like a real series
      out.push({ ...real, o: carry, h: Math.max(real.h, carry), l: Math.min(real.l, carry) });
      carry = real.c;
    } else {
      out.push({ t: b * bucketMs, o: carry, h: carry, l: carry, c: carry, v: 0 });
    }
  }
  return out;
}

// nice round price steps for the axis
function niceStep(range: number): number {
  const raw = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 0.01)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

// A chart you can hold: drag to pan back through history, wheel to zoom
// anchored under the cursor, and the view stays where you put it while live
// data keeps streaming in — the standard grammar of a trading chart.
interface ChartView {
  key: string; // asset+timeframe — a different market resets the pan
  offset: number; // candles hidden off the right edge (0 = live edge)
  visible: number; // candles on screen
  data: Candle[];
  bucketMs: number;
  endBucket: number;
  emptyText: string;
  drag: { x: number; startOffset: number } | null;
}
const chartViews = new WeakMap<HTMLCanvasElement, ChartView>();

function bindChart(canvas: HTMLCanvasElement, st: ChartView) {
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const plotW = rect.width - 58;
      const bw = plotW / st.visible;
      // which candle sits under the cursor stays under the cursor
      const fromRight = (plotW - (e.clientX - rect.left)) / bw + st.offset;
      const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      st.visible = Math.round(Math.min(320, Math.max(20, st.visible * factor)));
      const bw2 = plotW / st.visible;
      st.offset = Math.round(fromRight - (plotW - (e.clientX - rect.left)) / bw2);
      st.offset = Math.max(0, Math.min(Math.max(0, st.data.length - st.visible), st.offset));
      renderChart(canvas, st);
    },
    { passive: false }
  );
  canvas.addEventListener("pointerdown", (e) => {
    st.drag = { x: e.clientX, startOffset: st.offset };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!st.drag) return;
    const rect = canvas.getBoundingClientRect();
    const bw = (rect.width - 58) / st.visible;
    st.offset = Math.round(st.drag.startOffset + (e.clientX - st.drag.x) / bw);
    st.offset = Math.max(0, Math.min(Math.max(0, st.data.length - st.visible), st.offset));
    renderChart(canvas, st);
  });
  const up = () => {
    st.drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
}

export function drawCandles(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  opts: { bucketMs?: number; emptyText?: string; key?: string } = {}
) {
  const bucketMs = opts.bucketMs ?? 60_000;
  let st = chartViews.get(canvas);
  if (!st) {
    st = {
      key: opts.key ?? "",
      offset: 0,
      visible: 90,
      data: [],
      bucketMs,
      endBucket: 0,
      emptyText: opts.emptyText ?? "No trades yet — history builds as the market moves",
      drag: null,
    };
    chartViews.set(canvas, st);
    bindChart(canvas, st);
  }
  if ((opts.key ?? "") !== st.key) {
    // a different asset or timeframe: back to the live edge
    st.key = opts.key ?? "";
    st.offset = 0;
  }
  st.bucketMs = bucketMs;
  st.emptyText = opts.emptyText ?? st.emptyText;
  const data = fillSeries(candles, bucketMs, 1200);
  const newEnd = data.length ? Math.floor(data[data.length - 1].t / bucketMs) : 0;
  if (st.offset > 0 && st.endBucket && newEnd > st.endBucket) {
    // fresh candles arrived while you're reading history — hold your place
    st.offset = Math.min(Math.max(0, data.length - st.visible), st.offset + (newEnd - st.endBucket));
  }
  st.endBucket = newEnd;
  st.data = data;
  renderChart(canvas, st);
}

function renderChart(canvas: HTMLCanvasElement, st: ChartView) {
  const emptyText = st.emptyText;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 760;
  const H = canvas.clientHeight || 280;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, W, H);
  if (!st.data.length) {
    c.fillStyle = "rgba(139,150,161,0.6)";
    c.font = "13px system-ui";
    c.textAlign = "center";
    c.fillText(emptyText, W / 2, H / 2);
    return;
  }

  // layout: plot | right price axis; volume strip + time axis at the bottom
  const axisW = 58;
  const timeH = 18;
  const volH = 34;
  const plotW = W - axisW;
  const yTop = 8;
  const yBot = H - timeH - volH - 4;
  const end = Math.max(0, st.data.length - st.offset);
  const data = st.data.slice(Math.max(0, end - st.visible), end);
  if (!data.length) return;

  const lo = Math.min(...data.map((d) => d.l));
  const hi = Math.max(...data.map((d) => d.h));
  const pad = (hi - lo) * 0.1 || hi * 0.03 || 0.5;
  const pLo = lo - pad;
  const pHi = hi + pad;
  const y = (v: number) => yTop + (yBot - yTop) * (1 - (v - pLo) / (pHi - pLo));
  // the zoom decides candle width; a short young series still sits at the
  // right edge where the newest data lives
  const bw = plotW / st.visible;
  const xOffset = plotW - bw * data.length;
  const x = (i: number) => xOffset + i * bw + bw / 2;
  const bodyW = Math.max(1.5, bw * 0.72);

  // ---- grid: round price levels + hour marks ----
  c.font = "10px system-ui";
  c.textAlign = "left";
  const step = niceStep(pHi - pLo);
  c.strokeStyle = "rgba(255,255,255,0.055)";
  c.fillStyle = "rgba(148,158,169,0.85)";
  for (let v = Math.ceil(pLo / step) * step; v <= pHi; v += step) {
    const yy = y(v);
    c.beginPath();
    c.moveTo(0, yy);
    c.lineTo(plotW, yy);
    c.stroke();
    c.fillText(fmtPrice(v), plotW + 6, yy + 3);
  }
  // time ticks: ~5 vertical lines with HH:MM labels
  c.textAlign = "center";
  // space time labels by pixels, not by candle count: a young series has only a
  // few candles and would otherwise stack its labels on top of each other
  const tickEvery = Math.max(1, Math.ceil(64 / bw));
  for (let i = tickEvery; i < data.length; i += tickEvery) {
    const xx = x(i);
    c.strokeStyle = "rgba(255,255,255,0.04)";
    c.beginPath();
    c.moveTo(xx, yTop);
    c.lineTo(xx, H - timeH);
    c.stroke();
    c.fillStyle = "rgba(148,158,169,0.7)";
    c.fillText(
      new Date(data[i].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      xx,
      H - 5
    );
  }
  c.textAlign = "left";

  // ---- volume strip (its own lane above the time axis) ----
  const maxV = Math.max(...data.map((d) => d.v));
  if (maxV > 0) {
    data.forEach((d, i) => {
      if (d.v <= 0) return;
      c.fillStyle = d.c >= d.o ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)";
      const vh = 3 + (d.v / maxV) * (volH - 6);
      c.fillRect(x(i) - bodyW / 2, H - timeH - vh, bodyW, vh);
    });
  }

  // ---- candles ----
  data.forEach((d, i) => {
    const flat = d.h === d.l && d.v === 0;
    const up = d.c >= d.o;
    const color = up ? UP : DOWN;
    if (flat) {
      // quiet bucket: full-width flat candle — adjacent ones merge into a
      // solid unbroken line at the carried price
      c.fillStyle = up ? "rgba(38,166,154,0.8)" : "rgba(239,83,80,0.8)";
      c.fillRect(i * bw - 0.25, y(d.c) - 1, bw + 0.5, 2);
      return;
    }
    // wick
    c.strokeStyle = color;
    c.lineWidth = Math.max(1, bw * 0.12);
    c.beginPath();
    c.moveTo(x(i), y(d.h));
    c.lineTo(x(i), y(d.l));
    c.stroke();
    // body
    c.fillStyle = color;
    const top = y(Math.max(d.o, d.c));
    const bot = y(Math.min(d.o, d.c));
    c.fillRect(x(i) - bodyW / 2, top, bodyW, Math.max(2, bot - top));
  });

  // ---- last price line + axis chip (live edge only) ----
  if (st.offset > 0) {
    c.fillStyle = "rgba(148,158,169,0.75)";
    c.font = "10px system-ui";
    c.textAlign = "right";
    c.fillText(`← ${st.offset} bars back · scroll right to return`, plotW - 8, yTop + 10);
    c.textAlign = "left";
    return;
  }
  const lastC = data[data.length - 1];
  const lastY = y(lastC.c);
  const lastUp = lastC.c >= lastC.o;
  c.strokeStyle = lastUp ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)";
  c.setLineDash([3, 3]);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, lastY);
  c.lineTo(plotW, lastY);
  c.stroke();
  c.setLineDash([]);
  const chip = fmtPrice(lastC.c);
  c.font = "10px system-ui";
  const chipW = c.measureText(chip).width + 10;
  c.fillStyle = lastUp ? "#1e7d74" : "#b23c39";
  c.beginPath();
  c.roundRect(plotW + 2, lastY - 8, chipW, 16, 3);
  c.fill();
  c.fillStyle = "#f3f6f8";
  c.fillText(chip, plotW + 7, lastY + 3.5);
}
