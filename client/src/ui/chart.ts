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

export function drawCandles(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  opts: { bucketMs?: number; emptyText?: string } = {}
) {
  const emptyText = opts.emptyText ?? "No trades yet — history builds as the market moves";
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 760;
  const H = canvas.clientHeight || 280;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, W, H);
  if (!candles.length) {
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
  const bucketMs = opts.bucketMs ?? 60_000;
  const maxBuckets = Math.min(120, Math.max(40, Math.floor(plotW / 8)));
  const data = fillSeries(candles, bucketMs, maxBuckets);
  if (!data.length) return;

  const lo = Math.min(...data.map((d) => d.l));
  const hi = Math.max(...data.map((d) => d.h));
  const pad = (hi - lo) * 0.1 || hi * 0.03 || 0.5;
  const pLo = lo - pad;
  const pHi = hi + pad;
  const y = (v: number) => yTop + (yBot - yTop) * (1 - (v - pLo) / (pHi - pLo));
  // A young market has only a handful of candles. Stretching them across the
  // whole plot turns them into slabs, so candles keep a sensible maximum width
  // and a short series sits at the right-hand edge, where the newest data is —
  // it reads as a market that has just opened, not a broken chart.
  const MAX_BW = 14;
  const bw = Math.min(plotW / data.length, MAX_BW);
  const xOffset = plotW - bw * data.length;
  const x = (i: number) => xOffset + i * bw + bw / 2;
  const bodyW = Math.max(2, bw * 0.72);

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

  // ---- last price line + axis chip ----
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
