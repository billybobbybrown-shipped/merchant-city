// Procedural UI icons — drawn in code like every other asset in the game.
// Flat, muted palette on transparent ground, consistent dark outline.

const OUT = "rgba(8,10,14,0.65)";
const cache = new Map<string, string>();

type Draw = (c: CanvasRenderingContext2D) => void;

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fillOut(c: CanvasRenderingContext2D, color: string) {
  c.fillStyle = color;
  c.fill();
  c.lineWidth = 1.4;
  c.strokeStyle = OUT;
  c.stroke();
}

// All drawers work in a 24×24 box.
const DRAWERS: Record<string, Draw> = {
  // ---------------- items ----------------
  wood: (c) => {
    // one big log lying sideways, bark cap left, sawn end right
    const y = 12;
    const R = 4.6;
    const x0 = 4.2;
    const x1 = 19;
    // left bark cap (the far end of the log)
    c.beginPath();
    c.ellipse(x0, y, 1.6, R, 0, 0, Math.PI * 2);
    fillOut(c, "#5d3d23");
    // body
    const g = c.createLinearGradient(0, y - R, 0, y + R);
    g.addColorStop(0, "#9a6a40");
    g.addColorStop(0.45, "#7c5232");
    g.addColorStop(1, "#573920");
    c.beginPath();
    c.moveTo(x0, y - R);
    c.lineTo(x1, y - R);
    c.lineTo(x1, y + R);
    c.lineTo(x0, y + R);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // bark streaks
    c.strokeStyle = "rgba(44,27,15,0.5)";
    c.lineWidth = 1.05;
    c.beginPath();
    c.moveTo(6.6, y - 2.5);
    c.lineTo(10.8, y - 2.5);
    c.moveTo(9, y - 0.2);
    c.lineTo(14, y - 0.2);
    c.moveTo(6.8, y + 2.2);
    c.lineTo(11.6, y + 2.2);
    c.moveTo(13.2, y + 2.9);
    c.lineTo(16.4, y + 2.9);
    c.stroke();
    // top highlight
    c.strokeStyle = "rgba(235,195,145,0.4)";
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(5.6, y - R + 1.1);
    c.lineTo(16.6, y - R + 1.1);
    c.stroke();
    // knot stub on top
    c.beginPath();
    c.ellipse(9.4, y - R + 0.3, 1.7, 1.1, 0, Math.PI, Math.PI * 2);
    fillOut(c, "#6b4629");
    // sawn end face
    c.beginPath();
    c.ellipse(x1, y, 2.5, R, 0, 0, Math.PI * 2);
    fillOut(c, "#7b5232");
    c.beginPath();
    c.ellipse(x1, y, 1.85, R - 1.15, 0, 0, Math.PI * 2);
    c.fillStyle = "#e8c795";
    c.fill();
    // growth rings
    c.strokeStyle = "rgba(140,95,55,0.85)";
    c.lineWidth = 0.95;
    c.beginPath();
    c.ellipse(x1 + 0.1, y + 0.2, 1.15, 2.2, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(x1 + 0.15, y + 0.25, 0.5, 1, 0, 0, Math.PI * 2);
    c.fillStyle = "#a3714a";
    c.fill();
  },
  stone: (c) => {
    // angular low-poly rock: three hard facets, no curves
    c.beginPath();
    c.moveTo(3.8, 16.8);
    c.lineTo(5.6, 9.6);
    c.lineTo(10.8, 5.2);
    c.lineTo(17, 6);
    c.lineTo(20.6, 11.6);
    c.lineTo(18.4, 16.8);
    c.closePath();
    fillOut(c, "#848b93");
    // lit top facet
    c.beginPath();
    c.moveTo(5.6, 9.6);
    c.lineTo(10.8, 5.2);
    c.lineTo(17, 6);
    c.lineTo(13, 9.8);
    c.closePath();
    c.fillStyle = "#adb5bd";
    c.fill();
    // dark right facet
    c.beginPath();
    c.moveTo(13, 9.8);
    c.lineTo(17, 6);
    c.lineTo(20.6, 11.6);
    c.lineTo(18.4, 16.8);
    c.lineTo(12.2, 16.8);
    c.closePath();
    c.fillStyle = "#666e76";
    c.fill();
    // facet seams
    c.strokeStyle = "rgba(8,10,14,0.4)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(5.6, 9.6);
    c.lineTo(13, 9.8);
    c.lineTo(12.2, 16.8);
    c.moveTo(13, 9.8);
    c.lineTo(17, 6);
    c.stroke();
    // sharp chip beside it
    c.beginPath();
    c.moveTo(2.2, 18.8);
    c.lineTo(3.8, 14.8);
    c.lineTo(6.8, 15.6);
    c.lineTo(6.2, 18.8);
    c.closePath();
    fillOut(c, "#6d747c");
    c.beginPath();
    c.moveTo(3.8, 14.8);
    c.lineTo(6.8, 15.6);
    c.lineTo(5.2, 16.4);
    c.closePath();
    c.fillStyle = "#98a0a8";
    c.fill();
  },
  iron_ore: (c) => {
    // angular gray rock with rust-orange iron nuggets
    c.beginPath();
    c.moveTo(3.8, 16.6);
    c.lineTo(5, 8.8);
    c.lineTo(11.6, 4.6);
    c.lineTo(18.6, 7.4);
    c.lineTo(20.4, 14.4);
    c.lineTo(16.2, 18.8);
    c.lineTo(6.6, 18.8);
    c.closePath();
    fillOut(c, "#788089");
    // top-light facet
    c.beginPath();
    c.moveTo(5, 8.8);
    c.lineTo(11.6, 4.6);
    c.lineTo(18.6, 7.4);
    c.lineTo(11.8, 9.8);
    c.closePath();
    c.fillStyle = "#a2aab3";
    c.fill();
    // lower-right shade
    c.beginPath();
    c.moveTo(11.8, 9.8);
    c.lineTo(18.6, 7.4);
    c.lineTo(20.4, 14.4);
    c.lineTo(16.2, 18.8);
    c.lineTo(11.4, 18.8);
    c.closePath();
    c.fillStyle = "rgba(24,30,38,0.24)";
    c.fill();
    // iron nuggets
    const nug = (x: number, y: number, r: number) => {
      c.beginPath();
      c.moveTo(x - r, y + 0.2 * r);
      c.lineTo(x - 0.4 * r, y - r);
      c.lineTo(x + 0.8 * r, y - 0.7 * r);
      c.lineTo(x + r, y + 0.5 * r);
      c.lineTo(x + 0.1 * r, y + r);
      c.closePath();
      c.fillStyle = "#cf7a3e";
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = "rgba(8,10,14,0.6)";
      c.stroke();
      c.beginPath();
      c.arc(x - 0.25 * r, y - 0.3 * r, r * 0.32, 0, Math.PI * 2);
      c.fillStyle = "#eda05f";
      c.fill();
    };
    nug(8.6, 13.6, 2.5);
    nug(14.6, 12.1, 2.9);
    nug(11.8, 16.4, 1.9);
    nug(12.4, 7.6, 1.6);
  },
  wheat: (c) => {
    // one wheat stalk: single grain head on a stem with a leaf
    // stem
    c.lineCap = "round";
    c.strokeStyle = "#b98e3e";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(12, 21);
    c.quadraticCurveTo(11.7, 16, 12, 12.6);
    c.stroke();
    // leaf blade
    c.beginPath();
    c.moveTo(12, 17.2);
    c.quadraticCurveTo(14.8, 16.6, 16.6, 13.6);
    c.quadraticCurveTo(13.8, 14, 12.5, 15.9);
    c.closePath();
    fillOut(c, "#7ba05d");
    // awns at the tip
    c.strokeStyle = "#d9b45c";
    c.lineWidth = 0.95;
    c.beginPath();
    c.moveTo(11.2, 4.6);
    c.lineTo(9.8, 1.6);
    c.moveTo(12, 4.2);
    c.lineTo(12, 1.2);
    c.moveTo(12.8, 4.6);
    c.lineTo(14.2, 1.6);
    c.stroke();
    // grain head: pairs of plump grains down the axis
    for (let i = 0; i < 5; i++) {
      const y = 4.9 + i * 2.15;
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.ellipse(12 + sd * 1.55, y, 1.1, 1.8, sd * 0.5, 0, Math.PI * 2);
        c.fillStyle = i % 2 ? "#e0ba5e" : "#d4a94c";
        c.fill();
        c.lineWidth = 0.8;
        c.strokeStyle = "rgba(112,80,24,0.8)";
        c.stroke();
      }
    }
    // tip grain
    c.beginPath();
    c.ellipse(12, 3.6, 1.05, 1.8, 0, 0, Math.PI * 2);
    c.fillStyle = "#eccb6c";
    c.fill();
    c.lineWidth = 0.8;
    c.strokeStyle = "rgba(112,80,24,0.8)";
    c.stroke();
    c.lineCap = "butt";
  },
  corn: (c) => {
    // corn cob with kernel grid, wrapped in husk leaves
    c.save();
    c.translate(12, 11.6);
    c.rotate(0.22);
    // back husk leaf
    c.beginPath();
    c.moveTo(0, 7.6);
    c.quadraticCurveTo(-5.6, 4.2, -4.4, -3.2);
    c.quadraticCurveTo(-2.6, 1.8, -0.6, 4.6);
    c.closePath();
    fillOut(c, "#4f8a55");
    // cob: tapered, rounded tip
    const g = c.createLinearGradient(-3.4, 0, 3.4, 0);
    g.addColorStop(0, "#f2d269");
    g.addColorStop(0.55, "#e5bd4d");
    g.addColorStop(1, "#c99c34");
    c.beginPath();
    c.moveTo(-3.3, 4.6);
    c.quadraticCurveTo(-3.7, -3.6, -1.9, -7.2);
    c.quadraticCurveTo(-0.9, -8.6, 0.1, -8.6);
    c.quadraticCurveTo(1.2, -8.6, 2.1, -7.2);
    c.quadraticCurveTo(3.8, -3.6, 3.4, 4.6);
    c.quadraticCurveTo(0, 6.2, -3.3, 4.6);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // kernels: staggered rows
    c.fillStyle = "rgba(160,118,26,0.5)";
    for (let r = 0; r < 6; r++) {
      const y = -6.2 + r * 1.85;
      const half = 2 + Math.min(1.2, (y + 7) * 0.32);
      for (let k = -1; k <= 1; k++) {
        const x = k * 1.75 + (r % 2 ? 0.85 : 0);
        if (Math.abs(x) > half + 0.6) continue;
        c.beginPath();
        c.arc(x, y, 0.62, 0, Math.PI * 2);
        c.fill();
      }
    }
    // front husk leaves hugging the base
    c.beginPath();
    c.moveTo(-0.4, 7);
    c.quadraticCurveTo(-6.4, 5, -5.2, -1.8);
    c.quadraticCurveTo(-3.2, 2.2, -0.2, 4.2);
    c.quadraticCurveTo(-0.5, 5.6, -0.4, 7);
    c.closePath();
    fillOut(c, "#5d9b63");
    c.beginPath();
    c.moveTo(0.2, 7.2);
    c.quadraticCurveTo(6.2, 5.4, 5.4, -1.4);
    c.quadraticCurveTo(3.3, 2.4, 0.3, 4.3);
    c.quadraticCurveTo(0.6, 5.8, 0.2, 7.2);
    c.closePath();
    fillOut(c, "#548c59");
    // leaf midribs
    c.strokeStyle = "rgba(28,56,32,0.55)";
    c.lineWidth = 0.85;
    c.beginPath();
    c.moveTo(-1.4, 5.6);
    c.quadraticCurveTo(-3.9, 3.4, -4.2, -0.6);
    c.moveTo(1.6, 5.8);
    c.quadraticCurveTo(4.1, 3.6, 4.4, -0.2);
    c.stroke();
    c.restore();
  },
  carrots: (c) => {
    // one big carrot at a slight diagonal
    c.save();
    c.translate(11.4, 13.7);
    c.rotate(0.42);
    const g = c.createLinearGradient(-3.4, 0, 3.4, 0);
    g.addColorStop(0, "#ef9350");
    g.addColorStop(0.5, "#e07d38");
    g.addColorStop(1, "#c05f24");
    c.beginPath();
    c.moveTo(-3.4, -6.6);
    c.quadraticCurveTo(-2.9, 4.6, 0, 9.2);
    c.quadraticCurveTo(2.9, 4.6, 3.4, -6.6);
    c.quadraticCurveTo(0, -8.4, -3.4, -6.6);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // ridge lines
    c.strokeStyle = "rgba(122,58,18,0.55)";
    c.lineWidth = 1;
    for (const y of [-3.6, -0.4, 2.8]) {
      c.beginPath();
      c.moveTo(-2.5 + y * -0.08, y);
      c.quadraticCurveTo(0, y + 0.9, 2.3, y + 0.4);
      c.stroke();
    }
    // highlight along the left side
    c.strokeStyle = "rgba(255,225,190,0.5)";
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(-2.3, -5.6);
    c.quadraticCurveTo(-2, 1.2, -0.6, 6.4);
    c.stroke();
    // leafy top
    for (const [gx, gr, sc] of [[-2, -0.6, 1], [0, 0.05, 1.15], [2, 0.65, 0.95]]) {
      c.save();
      c.translate(gx as number, -6.9);
      c.rotate(gr as number);
      c.scale(sc as number, sc as number);
      c.beginPath();
      c.ellipse(0, -2.3, 1.3, 2.7, 0, 0, Math.PI * 2);
      c.fillStyle = "#5d9b63";
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = "rgba(8,10,14,0.6)";
      c.stroke();
      c.strokeStyle = "rgba(30,60,34,0.6)";
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(0, -0.3);
      c.lineTo(0, -3.9);
      c.stroke();
      c.restore();
    }
    c.restore();
  },
  cotton: (c) => {
    c.strokeStyle = "#6d8a4e";
    c.lineWidth = 1.7;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(12, 20);
    c.quadraticCurveTo(11.4, 17, 12, 15);
    c.stroke();
    c.beginPath();
    c.moveTo(12, 17.6);
    c.quadraticCurveTo(15, 17, 16.2, 18.6);
    c.stroke();
    c.beginPath();
    c.ellipse(16.8, 18.8, 1.9, 1.1, 0.5, 0, Math.PI * 2);
    c.fillStyle = "#7ba05d";
    c.fill();
    c.lineCap = "butt";
    // fluffy boll cluster with soft shading
    for (const [x, y, r] of [[8.8, 11.6, 3.6], [15.2, 11.6, 3.6], [12, 7.8, 3.9], [12, 12.6, 3.3]]) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = "#e4ded2";
      c.fill();
    }
    for (const [x, y, r] of [[8.8, 11.6, 3.6], [15.2, 11.6, 3.6], [12, 7.8, 3.9]]) {
      c.beginPath();
      c.arc(x - r * 0.28, y - r * 0.3, r * 0.62, 0, Math.PI * 2);
      c.fillStyle = "#f6f3ec";
      c.fill();
    }
    c.beginPath();
    c.arc(12, 10.6, 6.6, 0, Math.PI * 2);
    c.lineWidth = 1.2;
    c.strokeStyle = "rgba(8,10,14,0.35)";
    c.stroke();
  },
  crude_oil: (c) => {
    // steel oil drum with rib rings and drop emblem
    const g = c.createLinearGradient(5.6, 0, 18.4, 0);
    g.addColorStop(0, "#4a545e");
    g.addColorStop(0.45, "#39424c");
    g.addColorStop(1, "#2b333b");
    rr(c, 5.6, 5.4, 12.8, 14.4, 1.6);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // top lid
    c.beginPath();
    c.ellipse(12, 5.6, 6.4, 1.9, 0, 0, Math.PI * 2);
    fillOut(c, "#59646f");
    c.beginPath();
    c.ellipse(12, 5.6, 4.4, 1.1, 0, 0, Math.PI * 2);
    c.fillStyle = "#49545f";
    c.fill();
    // rib rings
    c.strokeStyle = "rgba(255,255,255,0.16)";
    c.lineWidth = 1.5;
    for (const y of [9.8, 14.6]) {
      c.beginPath();
      c.moveTo(5.8, y);
      c.quadraticCurveTo(12, y + 1.4, 18.2, y);
      c.stroke();
    }
    c.strokeStyle = "rgba(8,10,14,0.45)";
    c.lineWidth = 1;
    for (const y of [10.6, 15.4]) {
      c.beginPath();
      c.moveTo(5.8, y);
      c.quadraticCurveTo(12, y + 1.4, 18.2, y);
      c.stroke();
    }
    // oil drop: round bulb with a pointed tip
    c.beginPath();
    c.moveTo(12, 9.4);
    c.quadraticCurveTo(14.6, 12.6, 14.6, 14.2);
    c.arc(12, 14.2, 2.6, 0, Math.PI, false);
    c.quadraticCurveTo(9.4, 12.6, 12, 9.4);
    c.closePath();
    c.fillStyle = "#0d0f12";
    c.fill();
    c.lineWidth = 1.1;
    c.strokeStyle = "rgba(220,230,240,0.55)";
    c.stroke();
    c.beginPath();
    c.arc(10.9, 14, 0.85, 0, Math.PI * 2);
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.fill();
  },
  planks: (c) => {
    // one milled board in 3/4, slight diagonal
    c.save();
    c.translate(12, 12);
    c.rotate(-0.16);
    const w = 16.8;
    const x = -w / 2 - 0.8;
    const yTop = -2.9;
    const SK = 2.6;
    const H = 4.1;
    // lit top face
    c.beginPath();
    c.moveTo(x + SK, yTop);
    c.lineTo(x + w + SK, yTop);
    c.lineTo(x + w, yTop + 2.1);
    c.lineTo(x, yTop + 2.1);
    c.closePath();
    c.fillStyle = "#e9c288";
    c.fill();
    c.lineWidth = 1.35;
    c.strokeStyle = OUT;
    c.stroke();
    // top grain
    c.strokeStyle = "rgba(150,105,55,0.55)";
    c.lineWidth = 0.85;
    c.beginPath();
    c.moveTo(x + 3.4, yTop + 1);
    c.lineTo(x + w - 2.4, yTop + 1);
    c.stroke();
    // front face
    const g = c.createLinearGradient(0, yTop + 2.1, 0, yTop + 2.1 + H);
    g.addColorStop(0, "#c8955c");
    g.addColorStop(1, "#986a3d");
    rr(c, x, yTop + 2.1, w, H, 0.5);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.35;
    c.strokeStyle = OUT;
    c.stroke();
    // pale cut strip on the left end
    rr(c, x + 0.55, yTop + 2.6, 1.45, H - 1, 0.3);
    c.fillStyle = "#ecd2a4";
    c.fill();
    c.lineWidth = 0.85;
    c.strokeStyle = "rgba(8,10,14,0.5)";
    c.stroke();
    // long front grain with a knot
    c.strokeStyle = "rgba(100,66,32,0.65)";
    c.lineWidth = 0.95;
    c.beginPath();
    c.moveTo(x + 1.8, yTop + 3.5);
    c.quadraticCurveTo(x + w * 0.3, yTop + 4.6, x + w * 0.52, yTop + 3.5);
    c.quadraticCurveTo(x + w * 0.72, yTop + 2.9, x + w - 2, yTop + 3.8);
    c.moveTo(x + 2.6, yTop + 5.2);
    c.lineTo(x + w * 0.44, yTop + 5.35);
    c.moveTo(x + w * 0.62, yTop + 5.3);
    c.lineTo(x + w - 2.2, yTop + 5.1);
    c.stroke();
    c.beginPath();
    c.ellipse(x + w * 0.56, yTop + 4.3, 1.15, 0.75, 0.15, 0, Math.PI * 2);
    c.strokeStyle = "rgba(100,66,32,0.8)";
    c.lineWidth = 0.85;
    c.stroke();
    c.beginPath();
    c.ellipse(x + w * 0.56, yTop + 4.3, 0.45, 0.3, 0.15, 0, Math.PI * 2);
    c.fillStyle = "rgba(100,66,32,0.7)";
    c.fill();
    // pale end grain on the right
    c.beginPath();
    c.moveTo(x + w + SK, yTop);
    c.lineTo(x + w, yTop + 2.1);
    c.lineTo(x + w, yTop + 2.1 + H);
    c.lineTo(x + w + SK, yTop + H + 0.5);
    c.closePath();
    c.fillStyle = "#f1dcae";
    c.fill();
    c.lineWidth = 1.1;
    c.strokeStyle = "rgba(8,10,14,0.55)";
    c.stroke();
    c.strokeStyle = "rgba(150,105,55,0.8)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(x + w + SK * 0.35, yTop + 3.1, 1.6, -1.35, 1.25);
    c.stroke();
    c.restore();
  },
  bricks: (c) => {
    // brick wall fragment: staggered courses in mortar
    // mortar slab
    rr(c, 3.2, 5.6, 17.6, 13.6, 0.8);
    fillOut(c, "#b3aa9c");
    const brick = (x: number, y: number, w: number) => {
      rr(c, x, y, w, 3.4, 0.4);
      const g = c.createLinearGradient(0, y, 0, y + 3.4);
      g.addColorStop(0, "#c05a3e");
      g.addColorStop(1, "#98422c");
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 0.9;
      c.strokeStyle = "rgba(8,10,14,0.5)";
      c.stroke();
      // face light
      c.fillStyle = "rgba(255,220,200,0.28)";
      c.fillRect(x + 0.6, y + 0.5, Math.min(1.6, w - 1.2), 0.8);
    };
    // course 1
    brick(4.1, 6.5, 7.6);
    brick(12.5, 6.5, 7.4);
    // course 2 (staggered with half bricks)
    brick(4.1, 10.7, 3.5);
    brick(8.4, 10.7, 7.6);
    brick(16.8, 10.7, 3.1);
    // course 3
    brick(4.1, 14.9, 7.6);
    brick(12.5, 14.9, 7.4);
  },
  iron: (c) => {
    // pyramid of polished ingots
    const ingot = (x: number, y: number) => {
      c.beginPath();
      c.moveTo(x, y + 5.2);
      c.lineTo(x + 2.1, y);
      c.lineTo(x + 8.6, y);
      c.lineTo(x + 10.7, y + 5.2);
      c.closePath();
      const g = c.createLinearGradient(0, y, 0, y + 5.2);
      g.addColorStop(0, "#e6ebf0");
      g.addColorStop(0.5, "#b9c2ca");
      g.addColorStop(1, "#8d97a1");
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 1.3;
      c.strokeStyle = OUT;
      c.stroke();
      // top shine
      c.strokeStyle = "rgba(255,255,255,0.75)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 2.7, y + 1);
      c.lineTo(x + 7.9, y + 1);
      c.stroke();
    };
    ingot(1.6, 12.6);
    ingot(11.7, 12.6);
    ingot(6.6, 6.4);
  },
  flour: (c) => {
    // plump cloth sack, rolled cuff, grain mark
    c.beginPath();
    c.moveTo(8, 9.4);
    c.quadraticCurveTo(4.6, 12.6, 4.8, 16.4);
    c.quadraticCurveTo(5, 19.8, 8.6, 20);
    c.lineTo(15.4, 20);
    c.quadraticCurveTo(19, 19.8, 19.2, 16.4);
    c.quadraticCurveTo(19.4, 12.6, 16, 9.4);
    c.closePath();
    fillOut(c, "#e9dec7");
    // side shading
    c.beginPath();
    c.moveTo(16, 9.4);
    c.quadraticCurveTo(19.4, 12.6, 19.2, 16.4);
    c.quadraticCurveTo(19.1, 19.2, 16.4, 19.9);
    c.quadraticCurveTo(17.6, 16 , 16, 9.4);
    c.closePath();
    c.fillStyle = "rgba(140,120,85,0.22)";
    c.fill();
    // rolled cuff
    rr(c, 7.6, 5.6, 8.8, 4.2, 2);
    fillOut(c, "#d9cbab");
    c.strokeStyle = "rgba(140,120,85,0.5)";
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(9, 6.6);
    c.quadraticCurveTo(12, 7.8, 15, 6.6);
    c.stroke();
    // cinch rope
    c.strokeStyle = "#a98f5f";
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(7.4, 9.8);
    c.quadraticCurveTo(12, 11.2, 16.6, 9.8);
    c.stroke();
    // grain mark
    c.fillStyle = "#c9a648";
    for (const [gx, gy] of [[12, 13.2], [10.9, 14.9], [13.1, 14.9], [12, 16.6]]) {
      c.beginPath();
      c.ellipse(gx as number, gy as number, 0.85, 1.15, 0, 0, Math.PI * 2);
      c.fill();
    }
  },
  fabric: (c) => {
    // folded cloth stack with a draped corner — obviously textile
    const layer = (x: number, y: number, w: number, base: string, lite: string) => {
      const h = 4.8;
      c.beginPath();
      c.moveTo(x + w - 0.6, y);
      c.lineTo(x + 2.4, y);
      c.arcTo(x, y, x, y + h / 2, 2.4);
      c.arcTo(x, y + h, x + 2.4, y + h, 2.4);
      c.lineTo(x + w - 1.2, y + h);
      // soft wavy cut edge
      c.quadraticCurveTo(x + w + 0.9, y + h * 0.72, x + w - 0.2, y + h * 0.4);
      c.quadraticCurveTo(x + w - 1.3, y + h * 0.18, x + w - 0.6, y);
      c.closePath();
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, lite);
      g.addColorStop(1, base);
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 1.3;
      c.strokeStyle = OUT;
      c.stroke();
      // fold crease shadow near the bottom
      c.strokeStyle = "rgba(16,26,44,0.35)";
      c.lineWidth = 0.95;
      c.beginPath();
      c.moveTo(x + 2.2, y + h - 1.05);
      c.lineTo(x + w - 2.2, y + h - 1.05);
      c.stroke();
    };
    layer(3.6, 13.8, 16.6, "#3d5c8c", "#527ba8");
    layer(3, 9.2, 17.4, "#48699b", "#6389ba");
    layer(3.8, 4.6, 16, "#5d84b8", "#7ea6d6");
    // woven stripe pattern on the top layer
    c.strokeStyle = "rgba(255,255,255,0.4)";
    c.lineWidth = 0.85;
    c.beginPath();
    c.moveTo(6.4, 6);
    c.lineTo(18.6, 6);
    c.moveTo(6.4, 7.7);
    c.lineTo(18.8, 7.7);
    c.stroke();
    // draped corner hanging over the stack front
    c.beginPath();
    c.moveTo(13.2, 9.3);
    c.lineTo(19.4, 9.15);
    c.quadraticCurveTo(19.9, 13.4, 17, 17.6);
    c.quadraticCurveTo(15.2, 14, 13.2, 9.3);
    c.closePath();
    const dg = c.createLinearGradient(0, 9.3, 0, 17.6);
    dg.addColorStop(0, "#89add9");
    dg.addColorStop(1, "#5f86ba");
    c.fillStyle = dg;
    c.fill();
    c.lineWidth = 1.3;
    c.strokeStyle = OUT;
    c.stroke();
    // drape fold line
    c.strokeStyle = "rgba(20,32,54,0.4)";
    c.lineWidth = 0.95;
    c.beginPath();
    c.moveTo(16.4, 9.6);
    c.quadraticCurveTo(17.4, 12.8, 16.9, 15.6);
    c.stroke();
  },
  fuel: (c) => {
    // red jerry can: handle, spout, X emboss
    // spout
    rr(c, 15.6, 3.6, 3.2, 3, 0.7);
    fillOut(c, "#8f3d33");
    // body
    const g = c.createLinearGradient(4.6, 0, 19.4, 0);
    g.addColorStop(0, "#d0685a");
    g.addColorStop(0.5, "#c0564a");
    g.addColorStop(1, "#9c4237");
    rr(c, 4.6, 6.2, 14.8, 13.8, 1.6);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // recessed handle slots
    for (const x of [7, 10.6]) {
      rr(c, x, 7.6, 2.6, 1.6, 0.8);
      c.fillStyle = "#7e332a";
      c.fill();
      c.lineWidth = 0.9;
      c.strokeStyle = "rgba(8,10,14,0.5)";
      c.stroke();
    }
    // X emboss
    c.strokeStyle = "rgba(8,10,14,0.35)";
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(8, 11.6);
    c.lineTo(16, 17.6);
    c.moveTo(16, 11.6);
    c.lineTo(8, 17.6);
    c.stroke();
    c.strokeStyle = "rgba(255,220,210,0.5)";
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(8, 11.2);
    c.lineTo(16, 17.2);
    c.moveTo(16, 11.2);
    c.lineTo(8, 17.2);
    c.stroke();
  },
  chair: (c) => {
    // cozy armchair, front view
    rr(c, 5.4, 6.4, 13.2, 9, 2.6);
    fillOut(c, "#8c5a4a");
    rr(c, 7.2, 8.2, 9.6, 5.4, 1.6);
    c.fillStyle = "#a5705c";
    c.fill();
    // armrests
    rr(c, 4.2, 11, 3.4, 6.4, 1.6);
    fillOut(c, "#7b4c3e");
    rr(c, 16.4, 11, 3.4, 6.4, 1.6);
    fillOut(c, "#7b4c3e");
    // seat cushion
    rr(c, 7, 13.4, 10, 4, 1.6);
    fillOut(c, "#a5705c");
    // legs
    c.fillStyle = "#4c342b";
    c.fillRect(6.4, 17.4, 1.8, 2.2);
    c.fillRect(15.8, 17.4, 1.8, 2.2);
  },
  bread: (c) => {
    const g = c.createLinearGradient(0, 8, 0, 17);
    g.addColorStop(0, "#d2a05c");
    g.addColorStop(1, "#a87838");
    c.beginPath();
    c.moveTo(4.4, 16.6);
    c.quadraticCurveTo(3.6, 9.4, 9, 8.2);
    c.lineTo(16, 8.2);
    c.quadraticCurveTo(20.6, 9.2, 19.8, 16.6);
    c.quadraticCurveTo(19.4, 17.6, 18, 17.6);
    c.lineTo(6.2, 17.6);
    c.quadraticCurveTo(4.8, 17.6, 4.4, 16.6);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // slashes
    c.strokeStyle = "#f0d9ab";
    c.lineWidth = 1.6;
    c.lineCap = "round";
    for (const x of [8.6, 12, 15.4]) {
      c.beginPath();
      c.moveTo(x - 1.3, 10.6);
      c.lineTo(x + 1.3, 13.2);
      c.stroke();
    }
    c.lineCap = "butt";
  },
  shirt: (c) => {
    c.beginPath();
    c.moveTo(9, 4.8);
    c.quadraticCurveTo(12, 7, 15, 4.8);
    c.lineTo(19.6, 8);
    c.lineTo(17.6, 11.6);
    c.lineTo(15.6, 10.4);
    c.lineTo(15.6, 19);
    c.quadraticCurveTo(12, 19.8, 8.4, 19);
    c.lineTo(8.4, 10.4);
    c.lineTo(6.4, 11.6);
    c.lineTo(4.4, 8);
    c.closePath();
    fillOut(c, "#4a8c6a");
    // collar + sleeve shading
    c.beginPath();
    c.moveTo(9, 4.8);
    c.quadraticCurveTo(12, 7.6, 15, 4.8);
    c.quadraticCurveTo(12, 6.4, 9, 4.8);
    c.fillStyle = "#356b4e";
    c.fill();
    c.fillStyle = "rgba(8,10,14,0.18)";
    c.beginPath();
    c.moveTo(4.4, 8);
    c.lineTo(6.4, 11.6);
    c.lineTo(8.4, 10.4);
    c.lineTo(8.4, 8.6);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(19.6, 8);
    c.lineTo(17.6, 11.6);
    c.lineTo(15.6, 10.4);
    c.lineTo(15.6, 8.6);
    c.closePath();
    c.fill();
  },
  phone: (c) => {
    rr(c, 7.2, 3.8, 9.6, 16.4, 2.4);
    fillOut(c, "#2e3740");
    const g = c.createLinearGradient(8, 5, 16, 18);
    g.addColorStop(0, "#8fd4ee");
    g.addColorStop(0.55, "#5aa8cc");
    g.addColorStop(1, "#3d7c9e");
    rr(c, 8.5, 5.8, 7, 11.4, 1);
    c.fillStyle = g;
    c.fill();
    // screen glare
    c.beginPath();
    c.moveTo(9, 5.8);
    c.lineTo(12.2, 5.8);
    c.lineTo(9.6, 17.2);
    c.lineTo(9, 17.2);
    c.closePath();
    c.fillStyle = "rgba(255,255,255,0.22)";
    c.fill();
    // speaker + home button
    rr(c, 10.6, 4.4, 2.8, 0.9, 0.45);
    c.fillStyle = "#4a5560";
    c.fill();
    c.beginPath();
    c.arc(12, 18.6, 1.05, 0, Math.PI * 2);
    c.fillStyle = "#59646f";
    c.fill();
  },

  desk: (c) => {
    // desk: top slab, leg, drawer pedestal
    const g = c.createLinearGradient(0, 6.6, 0, 9.8);
    g.addColorStop(0, "#b08a5e");
    g.addColorStop(1, "#8a6a48");
    rr(c, 2.8, 6.6, 18.4, 3.2, 1);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // left leg
    rr(c, 4.6, 9.8, 2.6, 9.6, 0.7);
    fillOut(c, "#7b5f42");
    // drawer pedestal
    rr(c, 12.8, 9.8, 7, 9.6, 0.8);
    fillOut(c, "#8a6a48");
    for (const y of [11.4, 14.6]) {
      rr(c, 14, y, 4.6, 2.2, 0.5);
      c.fillStyle = "#6e5237";
      c.fill();
      c.lineWidth = 0.9;
      c.strokeStyle = "rgba(8,10,14,0.5)";
      c.stroke();
      c.beginPath();
      c.arc(16.3, y + 1.1, 0.55, 0, Math.PI * 2);
      c.fillStyle = "#d9c9a8";
      c.fill();
    }
  },
  shelf: (c) => {
    // shop gondola: two shelves of distinct products
    rr(c, 3.2, 2.8, 17.6, 18.4, 1.2);
    fillOut(c, "#5a646f");
    c.fillStyle = "#39424b";
    c.fillRect(4.4, 4, 15.2, 16);
    // shelf boards with lit front edge
    for (const y of [10.6, 17.2]) {
      c.fillStyle = "#2b333b";
      c.fillRect(4.4, y, 15.2, 1.5);
      c.fillStyle = "#77828e";
      c.fillRect(4.4, y, 15.2, 0.55);
    }
    const o = () => {
      c.lineWidth = 0.9;
      c.strokeStyle = "rgba(8,10,14,0.65)";
      c.stroke();
    };
    // top shelf: cereal box, milk bottle, green jar
    rr(c, 5.6, 5.4, 3.7, 5.2, 0.4);
    c.fillStyle = "#b8794e";
    c.fill();
    o();
    c.fillStyle = "#e6d9b8";
    c.fillRect(6.2, 6.8, 2.5, 1.5);
    rr(c, 11.2, 6.4, 2.7, 4.2, 0.5);
    c.fillStyle = "#e9e5da";
    c.fill();
    o();
    rr(c, 11.9, 5.1, 1.3, 1.5, 0.3);
    c.fillStyle = "#cfc9ba";
    c.fill();
    o();
    rr(c, 15.2, 6.6, 3.4, 4, 0.6);
    c.fillStyle = "#7fa06a";
    c.fill();
    o();
    rr(c, 15.6, 5.7, 2.6, 1.1, 0.4);
    c.fillStyle = "#5d7a4c";
    c.fill();
    o();
    // bottom shelf: two cans, gold box, green bottle
    for (const x of [5.6, 8.9]) {
      rr(c, x, 12.9, 2.8, 4.1, 0.5);
      c.fillStyle = "#a05c5c";
      c.fill();
      o();
      c.fillStyle = "#e0d7cd";
      c.fillRect(x + 0.4, 14.2, 2, 1.3);
    }
    rr(c, 12.6, 12.7, 3.9, 4.3, 0.4);
    c.fillStyle = "#c2a05a";
    c.fill();
    o();
    rr(c, 17.3, 12.4, 2.2, 4.6, 0.5);
    c.fillStyle = "#5d8b6f";
    c.fill();
    o();
  },
  counter: (c) => {
    // sales counter + register
    rr(c, 3.6, 10.8, 16.8, 8.4, 1.2);
    fillOut(c, "#8a6a48");
    const g = c.createLinearGradient(0, 9.4, 0, 11.6);
    g.addColorStop(0, "#c3cad1");
    g.addColorStop(1, "#99a3ac");
    rr(c, 2.8, 9.4, 18.4, 2.2, 0.9);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.3;
    c.strokeStyle = OUT;
    c.stroke();
    c.fillStyle = "rgba(8,10,14,0.2)";
    c.fillRect(5.2, 13.4, 13.6, 1.1);
    // register
    rr(c, 13.6, 4.6, 5.4, 4.8, 0.9);
    fillOut(c, "#39424c");
    rr(c, 14.6, 5.6, 2.2, 1.6, 0.4);
    c.fillStyle = "#8fd4ee";
    c.fill();
  },
  rack_s: (c) => {
    // narrow industrial rack: orange steel, one bay, two levels
    const beam = "#d97f3f";
    const box = (x: number, y: number, w: number, h: number) => {
      rr(c, x, y, w, h, 0.5);
      fillOut(c, "#c9a06a");
      c.strokeStyle = "rgba(122,88,44,0.7)";
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x + w / 2, y);
      c.lineTo(x + w / 2, y + h);
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.2)";
      c.fillRect(x + 0.6, y + 0.6, w - 1.2, 0.9);
    };
    box(7.6, 5.2, 8.8, 5.2);
    box(7.6, 13, 8.8, 5.2);
    // uprights
    for (const x of [5.4, 17]) {
      rr(c, x, 3.4, 1.9, 17, 0.5);
      fillOut(c, beam);
    }
    // beams
    for (const y of [10.4, 18.2]) {
      rr(c, 5.8, y, 12.4, 1.7, 0.4);
      fillOut(c, beam);
    }
  },
  rack_m: (c) => {
    // two-bay industrial rack
    const beam = "#d97f3f";
    const box = (x: number, y: number, w: number) => {
      rr(c, x, y, w, 4.6, 0.5);
      fillOut(c, "#c9a06a");
      c.strokeStyle = "rgba(122,88,44,0.7)";
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x + w / 2, y);
      c.lineTo(x + w / 2, y + 4.6);
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.2)";
      c.fillRect(x + 0.6, y + 0.6, w - 1.2, 0.8);
    };
    box(4.6, 5.4, 6.2);
    box(13.4, 5.4, 6.2);
    box(4.6, 13.2, 6.2);
    box(13.4, 13.2, 6.2);
    for (const x of [2.6, 11.2, 19.8]) {
      rr(c, x, 3.4, 1.7, 17, 0.5);
      fillOut(c, beam);
    }
    for (const y of [10, 17.8]) {
      rr(c, 3, y, 18, 1.6, 0.4);
      fillOut(c, beam);
    }
  },
  rack_l: (c) => {
    // wide three-level industrial rack
    const beam = "#d97f3f";
    const box = (x: number, y: number, w: number) => {
      rr(c, x, y, w, 3.6, 0.4);
      fillOut(c, "#c9a06a");
      c.fillStyle = "rgba(255,255,255,0.2)";
      c.fillRect(x + 0.5, y + 0.5, w - 1, 0.7);
    };
    box(3.4, 3.8, 5.4);
    box(9.8, 3.8, 5.4);
    box(16.2, 3.8, 4.6);
    box(3.4, 9.8, 5.4);
    box(9.8, 9.8, 5.4);
    box(16.2, 9.8, 4.6);
    box(3.4, 15.8, 5.4);
    box(9.8, 15.8, 5.4);
    box(16.2, 15.8, 4.6);
    for (const x of [1.9, 8.9, 15.5, 20.8]) {
      rr(c, x, 2.4, 1.5, 19, 0.4);
      fillOut(c, beam);
    }
    for (const y of [7.6, 13.6, 19.6]) {
      rr(c, 2.2, y, 19.8, 1.4, 0.4);
      fillOut(c, beam);
    }
  },
  sawmill: (c) => {
    // saw table with circular blade
    rr(c, 3, 12.4, 18, 3, 0.7);
    fillOut(c, "#8a949d");
    for (const x of [4.6, 17.2]) {
      rr(c, x, 15.4, 2, 5, 0.5);
      fillOut(c, "#57616c");
    }
    // blade
    c.beginPath();
    c.arc(11.4, 9.4, 4.6, 0, Math.PI * 2);
    fillOut(c, "#c3ccd4");
    // teeth
    c.strokeStyle = "rgba(8,10,14,0.65)";
    c.lineWidth = 1.1;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      c.beginPath();
      c.moveTo(11.4 + Math.cos(a) * 4.6, 9.4 + Math.sin(a) * 4.6);
      c.lineTo(11.4 + Math.cos(a + 0.24) * 5.5, 9.4 + Math.sin(a + 0.24) * 5.5);
      c.stroke();
    }
    c.beginPath();
    c.arc(11.4, 9.4, 1.1, 0, Math.PI * 2);
    c.fillStyle = "#59646f";
    c.fill();
    // log on the feed side
    rr(c, 16.2, 9.6, 5.2, 2.8, 1.3);
    fillOut(c, "#7b5232");
  },
  smelter: (c) => {
    // steel furnace with molten glow and chimney
    rr(c, 5.2, 7, 12, 12.6, 1);
    fillOut(c, "#4b545c");
    rr(c, 4.4, 5.6, 13.6, 2.2, 0.7);
    fillOut(c, "#5d6976");
    // chimney
    rr(c, 14.4, 1.6, 2.6, 4.4, 0.5);
    fillOut(c, "#5d6976");
    // rivets
    c.fillStyle = "rgba(220,228,236,0.35)";
    for (const [x, y] of [[6.8, 9], [15.6, 9], [6.8, 16.6], [15.6, 16.6]]) {
      c.beginPath();
      c.arc(x as number, y as number, 0.55, 0, Math.PI * 2);
      c.fill();
    }
    // molten tap glow
    rr(c, 8.2, 14.6, 6, 2.6, 0.7);
    const g = c.createLinearGradient(0, 14.6, 0, 17.2);
    g.addColorStop(0, "#ffc46e");
    g.addColorStop(1, "#e2571f");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.1;
    c.strokeStyle = OUT;
    c.stroke();
    // drip
    c.beginPath();
    c.arc(11.2, 18.4, 0.9, 0, Math.PI * 2);
    c.fillStyle = "#ff9440";
    c.fill();
  },
  loom: (c) => {
    // weaving loom: frame, warp threads, cloth roll
    for (const x of [3.6, 18.6]) {
      rr(c, x, 4.6, 1.8, 15.4, 0.6);
      fillOut(c, "#6b5136");
    }
    rr(c, 4.4, 4.2, 15.2, 2, 0.6);
    fillOut(c, "#8a6a48");
    // warp threads
    c.strokeStyle = "#d8d0bc";
    c.lineWidth = 0.9;
    for (let i = 0; i < 7; i++) {
      const x = 6.4 + i * 1.85;
      c.beginPath();
      c.moveTo(x, 6.4);
      c.lineTo(x, 14.6);
      c.stroke();
    }
    // woven cloth building up
    rr(c, 5.6, 14.4, 12.8, 2.6, 0.5);
    fillOut(c, "#5d84b8");
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(6.6, 15.7);
    c.lineTo(17.6, 15.7);
    c.stroke();
    // cloth roll at the bottom
    rr(c, 5, 17.6, 14, 2.8, 1.4);
    fillOut(c, "#4a6da0");
  },
  refinery: (c) => {
    // refinery: tank + column + pipe
    // distillation column
    rr(c, 15.4, 3, 3.6, 15.2, 1.4);
    fillOut(c, "#5d6976");
    c.strokeStyle = "rgba(220,228,236,0.3)";
    c.lineWidth = 0.9;
    for (const y of [6.4, 9.8, 13.2]) {
      c.beginPath();
      c.moveTo(15.8, y);
      c.lineTo(18.6, y);
      c.stroke();
    }
    rr(c, 14.9, 1.8, 4.6, 1.5, 0.6);
    fillOut(c, "#6d7883");
    // horizontal tank
    rr(c, 2.6, 10.6, 11.6, 6.2, 3);
    fillOut(c, "#8a949d");
    c.beginPath();
    c.ellipse(4.4, 13.7, 1.3, 2.5, 0, 0, Math.PI * 2);
    c.fillStyle = "#77828e";
    c.fill();
    // saddles
    rr(c, 4.2, 16.8, 2.2, 3, 0.4);
    fillOut(c, "#4b545c");
    rr(c, 10.2, 16.8, 2.2, 3, 0.4);
    fillOut(c, "#4b545c");
    // connecting pipe
    c.strokeStyle = "#77828e";
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(13.6, 12);
    c.quadraticCurveTo(15.4, 11, 15.6, 9);
    c.stroke();
    c.strokeStyle = "rgba(8,10,14,0.4)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(13.6, 11.2);
    c.quadraticCurveTo(15, 10.4, 15.1, 9);
    c.stroke();
  },
  oven: (c) => {
    // baker's oven: brick dome, glowing chamber, chimney
    rr(c, 3.8, 8.2, 16.4, 11.6, 1);
    fillOut(c, "#a4523a");
    // dome
    c.beginPath();
    c.moveTo(4.6, 8.4);
    c.quadraticCurveTo(12, 2.6, 19.4, 8.4);
    c.closePath();
    fillOut(c, "#94472f");
    // chimney
    rr(c, 10.8, 1.6, 2.4, 3, 0.4);
    fillOut(c, "#7a3c2a");
    // glowing arched chamber
    c.beginPath();
    c.moveTo(8.2, 16.6);
    c.lineTo(8.2, 13.2);
    c.arc(12, 13.2, 3.8, Math.PI, 0);
    c.lineTo(15.8, 16.6);
    c.closePath();
    const g = c.createLinearGradient(0, 10, 0, 16.6);
    g.addColorStop(0, "#ffc46e");
    g.addColorStop(1, "#e2571f");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = OUT;
    c.stroke();
    // loaf silhouette inside
    c.beginPath();
    c.ellipse(12, 15.4, 2.2, 1.1, 0, Math.PI, 0);
    c.fillStyle = "#a4672c";
    c.fill();
    // hearth slab
    rr(c, 6.6, 16.8, 10.8, 1.6, 0.5);
    fillOut(c, "#7a3c2a");
  },
  assembly_line: (c) => {
    // side view: conveyor on legs, gantry press over it, a part on the belt
    rr(c, 2.2, 13.2, 19.6, 1.8, 0.6);
    fillOut(c, "#57616c"); // belt table
    c.fillStyle = "#2e363e";
    c.fillRect(3.4, 13.6, 17.2, 1);
    for (const x of [3.6, 20.2]) {
      c.beginPath();
      c.arc(x, 14.1, 1.5, 0, Math.PI * 2);
      fillOut(c, "#4b545c"); // rollers
    }
    for (const x of [4.6, 17.4]) {
      rr(c, x, 15.0, 1.7, 5.6, 0.4);
      fillOut(c, "#3d454e"); // legs
    }
    // gantry
    for (const x of [7.2, 15.4]) {
      rr(c, x, 4.6, 1.6, 8.8, 0.4);
      fillOut(c, "#7d838a");
    }
    rr(c, 6.4, 3.0, 11.2, 2.0, 0.5);
    fillOut(c, "#57616c"); // crossbeam
    rr(c, 10.0, 5.2, 4.0, 3.4, 0.5);
    fillOut(c, "#4b545c"); // press head
    rr(c, 11.4, 8.4, 1.2, 1.8, 0.3);
    fillOut(c, "#98a1a9"); // ram
    rr(c, 9.6, 10.0, 4.8, 1.1, 0.3);
    fillOut(c, "#b35c2a"); // die plate
    // part on the belt, just past the press
    rr(c, 16.2, 10.8, 2.6, 2.4, 0.4);
    fillOut(c, "#3f6d9e");
    // status lamps on the beam
    for (const [i, x] of [7.6, 9.2].entries()) {
      c.beginPath();
      c.arc(x, 4.0, 0.7, 0, Math.PI * 2);
      c.fillStyle = i ? "#ff7a2e" : "#55803f";
      c.fill();
    }
  },
  fabricator: (c) => {
    // sealed fab cabinet: lit exposure window, wafer on the deck, exhaust stack
    rr(c, 8.4, 1.4, 2.4, 3.2, 0.6);
    fillOut(c, "#7d838a");
    rr(c, 2.6, 4.2, 18.8, 11.4, 1.3);
    fillOut(c, "#57616c");
    rr(c, 4.6, 6.0, 14.8, 6.0, 0.8);
    fillOut(c, "#2e363e");
    const g = c.createLinearGradient(5.4, 6.8, 18.6, 11.2);
    g.addColorStop(0, "#9fd8e8");
    g.addColorStop(1, "#2f6f96");
    rr(c, 5.4, 6.8, 13.2, 4.4, 0.5);
    c.fillStyle = g;
    c.fill();
    // wafer inside, mid-exposure
    c.beginPath();
    c.arc(12, 9.0, 1.7, 0, Math.PI * 2);
    c.fillStyle = "#dfe4ea";
    c.fill();
    c.strokeStyle = "#2e363e";
    c.lineWidth = 0.5;
    c.stroke();
    // deck and cassettes
    rr(c, 4.2, 13.0, 15.6, 1.6, 0.4);
    fillOut(c, "#4b545c");
    c.fillStyle = "#b9c2ca";
    for (const x of [6.2, 10.0, 13.8]) c.fillRect(x, 13.5, 2.4, 0.7);
    // feet
    for (const x of [4.2, 17.6]) {
      rr(c, x, 15.6, 2.2, 2.2, 0.4);
      fillOut(c, "#3d454e");
    }
  },
  electronics_bench: (c) => {
    // bench with twin monitors and a circuit board
    rr(c, 3, 14.6, 18, 2, 0.6);
    fillOut(c, "#57616c");
    for (const x of [4.4, 17.8]) {
      rr(c, x, 16.6, 1.8, 4.2, 0.4);
      fillOut(c, "#3d454e");
    }
    // monitors
    for (const x of [4.8, 12.6]) {
      rr(c, x, 5.6, 6.6, 5, 0.7);
      fillOut(c, "#2e363e");
      const g = c.createLinearGradient(x, 5.6, x + 6.6, 10.6);
      g.addColorStop(0, "#8fd4ee");
      g.addColorStop(1, "#3d7c9e");
      rr(c, x + 0.7, 6.3, 5.2, 3.6, 0.4);
      c.fillStyle = g;
      c.fill();
      rr(c, x + 2.6, 10.6, 1.4, 1.6, 0.3);
      c.fillStyle = "#3d454e";
      c.fill();
      rr(c, x + 1.6, 12.2, 3.4, 0.9, 0.4);
      c.fillStyle = "#4b545c";
      c.fill();
    }
    // circuit board on the bench
    rr(c, 8.6, 12.9, 6.6, 1.4, 0.3);
    fillOut(c, "#3f6d4c");
    c.fillStyle = "#c9a648";
    for (const x of [9.6, 11.4, 13.2]) c.fillRect(x, 13.3, 0.8, 0.6);
  },
  carpentry_bench: (c) => {
    // side-view bench: thick top, splayed legs, vise
    const g = c.createLinearGradient(0, 9.2, 0, 12.4);
    g.addColorStop(0, "#b08a5e");
    g.addColorStop(1, "#84643f");
    rr(c, 2.6, 9.2, 18.8, 3.2, 0.9);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // legs + stretcher
    for (const x of [4.6, 17.2]) {
      rr(c, x, 12.4, 2.2, 7.8, 0.6);
      fillOut(c, "#6b5136");
    }
    c.fillStyle = "#7b5f42";
    c.fillRect(6.8, 15.6, 10.4, 1.6);
    c.lineWidth = 0.9;
    c.strokeStyle = "rgba(8,10,14,0.45)";
    c.strokeRect(6.8, 15.6, 10.4, 1.6);
    // bench vise on the right end
    rr(c, 16, 6.4, 4.6, 2.8, 0.6);
    fillOut(c, "#8a949d");
    rr(c, 17.2, 4.9, 2.2, 1.5, 0.4);
    fillOut(c, "#6d7883");
    c.strokeStyle = "#59646f";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(15.2, 7.8);
    c.lineTo(16, 7.8);
    c.stroke();
    // tool: mallet lying on top
    c.save();
    c.translate(8.6, 7.9);
    c.rotate(-0.18);
    rr(c, -0.7, -0.6, 1.4, 4.6, 0.5);
    fillOut(c, "#8a6f45");
    rr(c, -2.6, -3, 5.2, 2.6, 0.7);
    fillOut(c, "#a5825c");
    c.restore();
  },
  plant: (c) => {
    // potted plant
    c.beginPath();
    c.moveTo(7.4, 14.6);
    c.lineTo(16.6, 14.6);
    c.lineTo(15.6, 20);
    c.lineTo(8.4, 20);
    c.closePath();
    fillOut(c, "#b06a4a");
    rr(c, 6.8, 13.2, 10.4, 1.9, 0.7);
    fillOut(c, "#c07a55");
    // foliage
    for (const [x, y, r, col] of [
      [12, 7, 4.4, "#4f8a55"], [8.6, 9.4, 3.2, "#5d9b63"], [15.4, 9.2, 3.3, "#457a4b"], [12, 10.6, 3.4, "#5d9b63"],
    ]) {
      c.beginPath();
      c.arc(x as number, y as number, r as number, 0, Math.PI * 2);
      c.fillStyle = col as string;
      c.fill();
    }
    c.lineWidth = 1.3;
    c.strokeStyle = OUT;
    c.beginPath();
    c.arc(12, 8.8, 5.6, Math.PI * 1.05, Math.PI * 1.95);
    c.stroke();
  },
  rug: (c) => {
    // bordered rug, top-down
    rr(c, 3.2, 6, 17.6, 12, 1.4);
    fillOut(c, "#8a4f4f");
    rr(c, 5, 7.7, 14, 8.6, 1);
    c.fillStyle = "#a86058";
    c.fill();
    rr(c, 6.8, 9.4, 10.4, 5.2, 0.8);
    c.fillStyle = "#c2a05a";
    c.fill();
    c.beginPath();
    c.moveTo(12, 9.8);
    c.lineTo(14.4, 12);
    c.lineTo(12, 14.2);
    c.lineTo(9.6, 12);
    c.closePath();
    c.fillStyle = "#8a4f4f";
    c.fill();
    // fringe
    c.strokeStyle = "#d6c9a8";
    c.lineWidth = 1;
    for (let x = 4.4; x < 20.4; x += 2) {
      c.beginPath();
      c.moveTo(x, 5.4);
      c.lineTo(x, 6);
      c.moveTo(x, 18);
      c.lineTo(x, 18.6);
      c.stroke();
    }
  },

  // ---------------- building kinds ----------------
  kind_house: (c) => {
    c.beginPath();
    c.moveTo(4, 12);
    c.lineTo(12, 4.5);
    c.lineTo(20, 12);
    c.closePath();
    fillOut(c, "#8a5f3d");
    rr(c, 6.5, 12, 11, 7.5, 0.8);
    fillOut(c, "#c9beA6".toLowerCase());
    rr(c, 10.4, 14.5, 3.2, 5, 0.6);
    c.fillStyle = "#5d4a38";
    c.fill();
  },
  kind_shop: (c) => {
    rr(c, 5, 10, 14, 9, 0.8);
    fillOut(c, "#b8aa90");
    c.beginPath();
    c.moveTo(4, 10);
    c.lineTo(6, 5.5);
    c.lineTo(18, 5.5);
    c.lineTo(20, 10);
    c.closePath();
    fillOut(c, "#8c3535");
    rr(c, 7.4, 13, 3.4, 6, 0.5);
    c.fillStyle = "#4a4038";
    c.fill();
    rr(c, 12.6, 13, 4.2, 3.4, 0.5);
    c.fillStyle = "#2a3540";
    c.fill();
  },
  kind_office: (c) => {
    rr(c, 6, 4, 12, 15.5, 0.8);
    fillOut(c, "#8d9aa6");
    c.fillStyle = "#232e38";
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 3; x++) c.fillRect(7.8 + x * 3.4, 5.8 + y * 3.3, 2.2, 2.1);
  },
  kind_apartment: (c) => {
    rr(c, 5, 6, 14, 13.5, 0.8);
    fillOut(c, "#b09a80");
    c.fillStyle = "#232e38";
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) c.fillRect(7 + x * 3.8, 7.8 + y * 3.6, 2.4, 2.3);
  },
  kind_tower: (c) => {
    rr(c, 8, 3.5, 8, 16, 0.8);
    fillOut(c, "#7d8894");
    c.fillStyle = "#232e38";
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 2; x++) c.fillRect(9.6 + x * 3, 5 + y * 2.9, 1.9, 1.8);
  },
  kind_skyscraper: (c) => {
    rr(c, 8.5, 5, 7, 14.5, 0.6);
    fillOut(c, "#69707a");
    c.beginPath();
    c.moveTo(12, 1.6);
    c.lineTo(12, 5);
    c.lineWidth = 1.4;
    c.strokeStyle = "#8b9196";
    c.stroke();
    c.fillStyle = "#7cc9e8";
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 2; x++) c.fillRect(9.8 + x * 2.9, 6.4 + y * 2.6, 1.8, 1.6);
  },
  kind_warehouse: (c) => {
    rr(c, 3.5, 9, 17, 10, 0.8);
    fillOut(c, "#989792");
    c.beginPath();
    c.moveTo(3.5, 9);
    c.lineTo(12, 4.5);
    c.lineTo(20.5, 9);
    c.closePath();
    fillOut(c, "#6f6e69");
    rr(c, 8.6, 12, 6.8, 7, 0.5);
    c.fillStyle = "#4a4e52";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.25)";
    c.lineWidth = 1;
    for (let y = 13.6; y < 19; y += 1.8) {
      c.beginPath();
      c.moveTo(8.8, y);
      c.lineTo(15.2, y);
      c.stroke();
    }
  },
  kind_factory: (c) => {
    rr(c, 4, 11, 16, 8, 0.8);
    fillOut(c, "#8d8a84");
    c.beginPath();
    c.moveTo(4, 11);
    c.lineTo(4, 7.5);
    c.lineTo(9, 11);
    c.lineTo(9, 7.5);
    c.lineTo(14, 11);
    c.closePath();
    fillOut(c, "#6f6c66");
    rr(c, 15.4, 4, 3, 7, 0.8);
    fillOut(c, "#8c5844");
  },
  kind_gas_station: (c) => {
    // canopy on posts with a pump underneath
    rr(c, 4, 5, 16, 3, 0.8);
    fillOut(c, "#c0392b");
    c.fillStyle = "#8d9aa6";
    c.fillRect(6, 8, 1.4, 10);
    c.fillRect(16.6, 8, 1.4, 10);
    rr(c, 10, 11, 4.4, 7.5, 0.6);
    fillOut(c, "#dcdcd6");
    c.fillStyle = "#c0392b";
    c.fillRect(10.3, 12.4, 3.8, 1.6);
  },
  kind_custom: (c) => {
    rr(c, 4.5, 4.5, 15, 15, 1.2);
    c.setLineDash([2.6, 2]);
    c.lineWidth = 1.5;
    c.strokeStyle = "#8b96a1";
    c.stroke();
    c.setLineDash([]);
    rr(c, 8, 8, 8, 8, 0.8);
    fillOut(c, "#9aa5b0");
  },
  construction: (c) => {
    c.lineWidth = 1.6;
    c.strokeStyle = "#c9a648";
    for (const x of [6, 12, 18]) {
      c.beginPath();
      c.moveTo(x, 5);
      c.lineTo(x, 19);
      c.stroke();
    }
    for (const y of [8, 13, 18]) {
      c.beginPath();
      c.moveTo(5, y);
      c.lineTo(19, y);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(5, 19);
    c.lineTo(19, 19);
    c.lineWidth = 2;
    c.strokeStyle = "#8b6f35";
    c.stroke();
  },

  // ---------------- UI glyphs ----------------
  bag: (c) => {
    rr(c, 5.5, 9, 13, 10.5, 2.6);
    fillOut(c, "#8a6f45");
    c.beginPath();
    c.arc(12, 9, 4.2, Math.PI, 0);
    c.lineWidth = 2;
    c.strokeStyle = "#6e5636";
    c.stroke();
    rr(c, 9.6, 12, 4.8, 3.4, 1);
    c.fillStyle = "#c9a97b";
    c.fill();
  },
  box: (c) => {
    rr(c, 4.5, 7, 15, 12, 1.2);
    fillOut(c, "#b08d5e");
    c.fillStyle = "#8a6f45";
    c.fillRect(11, 7, 2, 12);
    rr(c, 8.4, 10, 7.2, 3.6, 0.6);
    c.fillStyle = "#e8e4d8";
    c.fill();
  },
  hammer: (c) => {
    c.save();
    c.translate(12, 12);
    c.rotate(0.6);
    rr(c, -1.4, -3, 2.8, 12.5, 1.2);
    fillOut(c, "#8a6f45");
    rr(c, -6.5, -9, 13, 4.6, 1.4);
    fillOut(c, "#9aa4ad");
    c.restore();
  },
  design: (c) => {
    rr(c, 4.5, 4.5, 15, 15, 1.2);
    c.setLineDash([2.8, 2]);
    c.lineWidth = 1.5;
    c.strokeStyle = "#c9a648";
    c.stroke();
    c.setLineDash([]);
    c.save();
    c.translate(13.5, 10.5);
    c.rotate(0.8);
    rr(c, -1.4, -6, 2.8, 10, 1);
    fillOut(c, "#e8d8ae");
    c.beginPath();
    c.moveTo(-1.4, 4);
    c.lineTo(0, 7);
    c.lineTo(1.4, 4);
    c.closePath();
    fillOut(c, "#5d4a38");
    c.restore();
  },
  silicon: (c) => {
    // a polished wafer with a flat, seen at an angle
    c.save();
    c.translate(12, 12);
    c.scale(1, 0.52);
    c.beginPath();
    c.arc(0, 0, 8.6, 0.55, Math.PI * 2 + 0.15);
    c.closePath();
    const g = c.createLinearGradient(-8, -8, 8, 8);
    g.addColorStop(0, "#9fb3c8");
    g.addColorStop(0.5, "#5d6b7d");
    g.addColorStop(1, "#39424e");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.4;
    c.strokeStyle = OUT;
    c.stroke();
    c.restore();
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(6, 8.6);
    c.lineTo(11, 7.4);
    c.stroke();
  },
  wiring: (c) => {
    // a coil of insulated cable
    c.lineCap = "round";
    for (const [r, col] of [
      [7.4, "#b8642f"],
      [4.6, "#d98a4a"],
    ] as const) {
      c.beginPath();
      c.arc(12, 12, r, 0.4, Math.PI * 2 - 0.15);
      c.lineWidth = 2.8;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 1.9;
      c.strokeStyle = col;
      c.stroke();
    }
    // the loose end
    c.beginPath();
    c.moveTo(17.5, 14.5);
    c.lineTo(21, 18.5);
    c.lineWidth = 2.6;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 1.7;
    c.strokeStyle = "#d98a4a";
    c.stroke();
    c.beginPath();
    c.arc(21, 18.8, 1.5, 0, Math.PI * 2);
    fillOut(c, "#c8b27a");
  },
  ram_ddr4: (c) => {
    // a memory module: green board, four chips, gold contact fingers
    rr(c, 2.5, 8, 19, 8, 1);
    fillOut(c, "#2f6a44");
    for (let i = 0; i < 4; i++) {
      rr(c, 4 + i * 4.4, 9.6, 3.4, 3.6, 0.5);
      fillOut(c, "#23272d");
    }
    c.fillStyle = "#d8c07a";
    for (let i = 0; i < 9; i++) c.fillRect(3.4 + i * 2, 15.2, 1.2, 2.4);
  },
  ram_ddr5: (c) => {
    // denser board, eight chips, a power-management chip at the middle
    rr(c, 2, 7.5, 20, 9, 1);
    fillOut(c, "#1f4f7a");
    for (let i = 0; i < 4; i++) {
      rr(c, 3.4 + i * 4.5, 8.8, 3.2, 2.6, 0.4);
      fillOut(c, "#23272d");
      rr(c, 3.4 + i * 4.5, 12, 3.2, 2.6, 0.4);
      fillOut(c, "#23272d");
    }
    rr(c, 10.6, 8.8, 2.8, 5.8, 0.4);
    fillOut(c, "#4b525c");
    c.fillStyle = "#d8c07a";
    for (let i = 0; i < 10; i++) c.fillRect(2.8 + i * 1.9, 15.6, 1.1, 2.2);
  },
  ram_ecc: (c) => {
    // server memory under a finned heat spreader
    rr(c, 2, 12.5, 20, 6.5, 1);
    fillOut(c, "#1f4f7a");
    c.fillStyle = "#d8c07a";
    for (let i = 0; i < 10; i++) c.fillRect(2.8 + i * 1.9, 18, 1.1, 2);
    rr(c, 2, 4, 20, 9, 1.2);
    const g = c.createLinearGradient(2, 4, 22, 13);
    g.addColorStop(0, "#b6bec9");
    g.addColorStop(0.5, "#7e8794");
    g.addColorStop(1, "#5b636e");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = "rgba(20,24,30,0.5)";
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.moveTo(4 + i * 2.6, 5);
      c.lineTo(4 + i * 2.6, 12);
      c.stroke();
    }
  },
  transistor: (c) => {
    // black half-can with three legs
    c.beginPath();
    c.moveTo(6, 14);
    c.lineTo(6, 8.5);
    c.arc(12, 8.5, 6, Math.PI, 0);
    c.lineTo(18, 14);
    c.closePath();
    fillOut(c, "#23272d");
    c.beginPath();
    c.moveTo(6.4, 12.4);
    c.lineTo(17.6, 12.4);
    c.lineWidth = 1.1;
    c.strokeStyle = "rgba(255,255,255,0.18)";
    c.stroke();
    for (const x of [8.5, 12, 15.5]) {
      c.beginPath();
      c.moveTo(x, 14);
      c.lineTo(x, 19.5);
      c.lineWidth = 1.9;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 1.1;
      c.strokeStyle = "#b9c0c9";
      c.stroke();
    }
  },
  capacitor: (c) => {
    // an electrolytic can with its stripe and leads
    rr(c, 7.5, 5.5, 9, 12, 2);
    fillOut(c, "#2f5f9e");
    rr(c, 8.6, 6.6, 2.4, 9.8, 1);
    c.fillStyle = "rgba(230,240,250,0.75)";
    c.fill();
    c.beginPath();
    c.ellipse(12, 5.7, 4.5, 1.5, 0, 0, Math.PI * 2);
    fillOut(c, "#4d84c9");
    for (const x of [9.8, 14.2]) {
      c.beginPath();
      c.moveTo(x, 17.5);
      c.lineTo(x, 20.5);
      c.lineWidth = 1.9;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 1.1;
      c.strokeStyle = "#b9c0c9";
      c.stroke();
    }
  },
  circuit_board: (c) => {
    // green board with traces and a chip
    rr(c, 3.5, 5, 17, 14, 1.6);
    fillOut(c, "#2f6a44");
    c.strokeStyle = "#c8a24a";
    c.lineWidth = 1;
    for (const [x0, y0, x1, y1] of [
      [6, 8, 13, 8],
      [13, 8, 13, 12],
      [6, 16, 10, 16],
      [16, 10, 16, 17],
    ] as const) {
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    rr(c, 8.5, 10, 6, 5, 0.8);
    fillOut(c, "#23272d");
    for (const [x, y] of [
      [6, 8],
      [16, 17],
      [6, 16],
    ] as const) {
      c.beginPath();
      c.arc(x, y, 1.2, 0, Math.PI * 2);
      c.fillStyle = "#d8c07a";
      c.fill();
    }
  },
  metal_shop: (c) => {
    // anvil on a stand
    c.beginPath();
    c.moveTo(3.5, 9);
    c.lineTo(17, 9);
    c.lineTo(20.5, 11.5);
    c.lineTo(17, 12.5);
    c.lineTo(15.5, 12.5);
    c.lineTo(14, 15);
    c.lineTo(9.5, 15);
    c.lineTo(8, 12.5);
    c.lineTo(3.5, 12.5);
    c.closePath();
    fillOut(c, "#767f8b");
    rr(c, 8, 15, 7.5, 5, 0.8);
    fillOut(c, "#4b525c");
    c.beginPath();
    c.moveTo(5.5, 6.5);
    c.lineTo(8.5, 3.5);
    c.lineWidth = 2.2;
    c.strokeStyle = "#d8c07a";
    c.stroke();
  },
  nails: (c) => {
    // three loose nails at angles
    for (const [x, y, a] of [
      [7, 17, -0.5],
      [12, 18, 0.15],
      [17, 16.5, 0.6],
    ] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.beginPath();
      c.moveTo(-0.9, -9);
      c.lineTo(0.9, -9);
      c.lineTo(0.55, 3.5);
      c.lineTo(0, 5.2);
      c.lineTo(-0.55, 3.5);
      c.closePath();
      fillOut(c, "#aab2bd");
      c.beginPath();
      c.ellipse(0, -9, 2.6, 1.1, 0, 0, Math.PI * 2);
      fillOut(c, "#c4ccd6");
      c.restore();
    }
  },
  silicon_ingot: (c) => {
    // a dark polished boule
    c.beginPath();
    c.ellipse(12, 8.5, 4.6, 2, 0, 0, Math.PI * 2);
    c.moveTo(7.4, 8.5);
    c.lineTo(7.4, 16);
    c.bezierCurveTo(7.4, 19, 16.6, 19, 16.6, 16);
    c.lineTo(16.6, 8.5);
    c.closePath();
    const g = c.createLinearGradient(7, 6, 17, 19);
    g.addColorStop(0, "#8a93a0");
    g.addColorStop(0.5, "#525a66");
    g.addColorStop(1, "#2f353d");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.3;
    c.strokeStyle = OUT;
    c.stroke();
  },
  gold_ore: (c) => {
    // three rough nuggets with a warm sheen
    for (const [x, y, r] of [
      [8.5, 15, 3.6],
      [14.5, 14.5, 3.1],
      [11.5, 9.5, 3.9],
    ] as const) {
      c.beginPath();
      c.moveTo(x - r, y + r * 0.5);
      c.lineTo(x - r * 0.5, y - r);
      c.lineTo(x + r * 0.7, y - r * 0.7);
      c.lineTo(x + r, y + r * 0.4);
      c.lineTo(x, y + r);
      c.closePath();
      const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, "#f6dd7a");
      g.addColorStop(0.55, "#d8ab2e");
      g.addColorStop(1, "#a37c15");
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 1.3;
      c.strokeStyle = OUT;
      c.stroke();
    }
  },
  gold_ingot: (c) => {
    // a stacked pair of poured bars
    for (const [x, y, w, h] of [
      [5, 13, 14, 5],
      [7, 8, 11, 5],
    ] as const) {
      c.beginPath();
      c.moveTo(x + 1.6, y);
      c.lineTo(x + w - 1.6, y);
      c.lineTo(x + w, y + h);
      c.lineTo(x, y + h);
      c.closePath();
      const g = c.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, "#f7e08a");
      g.addColorStop(0.5, "#d9ad31");
      g.addColorStop(1, "#9d7712");
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 1.3;
      c.strokeStyle = OUT;
      c.stroke();
    }
  },
  demolish: (c) => {
    // a sledgehammer over rubble
    c.save();
    c.translate(12, 12);
    c.rotate(-0.5);
    rr(c, -1.1, -8, 2.2, 11, 0.8);
    fillOut(c, "#b08d5e");
    rr(c, -3.6, -10.5, 7.2, 4, 1);
    fillOut(c, "#8b9199");
    c.restore();
    c.beginPath();
    c.moveTo(3, 19);
    c.lineTo(7, 14.5);
    c.lineTo(11, 19);
    c.closePath();
    fillOut(c, "#6f7681");
    c.beginPath();
    c.moveTo(10, 19.5);
    c.lineTo(13.5, 16);
    c.lineTo(17, 19.5);
    c.closePath();
    fillOut(c, "#585f69");
  },
  edit: (c) => {
    c.save();
    c.translate(12, 12);
    c.rotate(0.8);
    rr(c, -1.6, -8.5, 3.2, 13, 1.2);
    fillOut(c, "#c9a648");
    c.beginPath();
    c.moveTo(-1.6, 4.5);
    c.lineTo(0, 8.5);
    c.lineTo(1.6, 4.5);
    c.closePath();
    fillOut(c, "#5d4a38");
    c.restore();
  },
  arrow_out: (c) => {
    c.lineWidth = 2.2;
    c.strokeStyle = "#9fd8a2";
    c.beginPath();
    c.moveTo(5, 12);
    c.lineTo(17, 12);
    c.moveTo(13, 7.5);
    c.lineTo(17.5, 12);
    c.lineTo(13, 16.5);
    c.stroke();
  },
  arrow_in: (c) => {
    c.lineWidth = 2.2;
    c.strokeStyle = "#7cb9e8";
    c.beginPath();
    c.moveTo(19, 12);
    c.lineTo(7, 12);
    c.moveTo(11, 7.5);
    c.lineTo(6.5, 12);
    c.lineTo(11, 16.5);
    c.stroke();
  },
  // ---------------- permitted goods (Phase 4B) ----------------
  tobacco: (c) => {
    // one broad green leaf, pointed tip, center rib and veins
    c.beginPath();
    c.moveTo(12, 2.8);
    c.bezierCurveTo(18.6, 5.4, 19.6, 13.6, 12.6, 20.8);
    c.bezierCurveTo(12.3, 21.1, 11.7, 21.1, 11.4, 20.8);
    c.bezierCurveTo(4.4, 13.6, 5.4, 5.4, 12, 2.8);
    c.closePath();
    const g = c.createLinearGradient(6, 4, 18, 20);
    g.addColorStop(0, "#6f9a4a");
    g.addColorStop(1, "#4c7434");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // center rib + veins
    c.strokeStyle = "rgba(30,48,20,0.65)";
    c.lineWidth = 1.15;
    c.beginPath();
    c.moveTo(12, 3.6);
    c.lineTo(12, 20.2);
    c.stroke();
    c.lineWidth = 0.95;
    c.beginPath();
    for (const [y, dx] of [[7, 3.6], [10.4, 4.6], [13.8, 4.2], [16.6, 3]] as const) {
      c.moveTo(12, y);
      c.lineTo(12 - dx, y + 2.2);
      c.moveTo(12, y);
      c.lineTo(12 + dx, y + 2.2);
    }
    c.stroke();
  },
  cured_tobacco: (c) => {
    // bundle of browned leaves tied at the top, hanging points down
    for (const [dx, rot, tone] of [[-3.4, -0.3, "#8a5a30"], [3.4, 0.3, "#7a4c26"], [0, 0, "#9c6a38"]] as const) {
      c.save();
      c.translate(12 + dx, 6.4);
      c.rotate(rot);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(3.4, 4, 2.6, 10.6, 0, 14.4);
      c.bezierCurveTo(-2.6, 10.6, -3.4, 4, 0, 0);
      c.closePath();
      fillOut(c, tone);
      c.strokeStyle = "rgba(50,30,14,0.55)";
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(0, 1);
      c.lineTo(0, 13.4);
      c.stroke();
      c.restore();
    }
    // binding twine
    rr(c, 9.4, 4.2, 5.2, 2.6, 1.2);
    fillOut(c, "#c9a648");
  },
  beer: (c) => {
    // beer mug: amber body, foam head, handle
    rr(c, 5.4, 7.6, 10.4, 12.6, 1.4);
    const g = c.createLinearGradient(0, 8, 0, 20);
    g.addColorStop(0, "#e2a33c");
    g.addColorStop(1, "#b6741f");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // handle
    c.beginPath();
    c.arc(16.6, 13.4, 3.2, -Math.PI / 2, Math.PI / 2);
    c.lineWidth = 2.2;
    c.strokeStyle = "#b6741f";
    c.stroke();
    c.lineWidth = 1.1;
    c.strokeStyle = OUT;
    c.beginPath();
    c.arc(16.6, 13.4, 4.2, -Math.PI / 2, Math.PI / 2);
    c.arc(16.6, 13.4, 2.2, Math.PI / 2, -Math.PI / 2, true);
    c.stroke();
    // glass shine
    c.strokeStyle = "rgba(255,240,210,0.5)";
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(7.4, 9.6);
    c.lineTo(7.4, 18);
    c.stroke();
    // foam blobs over the rim
    for (const [x, r] of [[7.2, 2.2], [10.4, 2.8], [13.6, 2.2]] as const) {
      c.beginPath();
      c.arc(x, 6.6, r, 0, Math.PI * 2);
      fillOut(c, "#f2ead8");
    }
  },
  whiskey: (c) => {
    // whiskey bottle: shoulders, neck with cap, label band
    c.beginPath();
    c.moveTo(9.4, 2.6);
    c.lineTo(14.6, 2.6);
    c.lineTo(14.6, 7.2);
    c.bezierCurveTo(16.8, 8.2, 17.4, 9.6, 17.4, 11.4);
    c.lineTo(17.4, 19.6);
    c.quadraticCurveTo(17.4, 21.2, 15.8, 21.2);
    c.lineTo(8.2, 21.2);
    c.quadraticCurveTo(6.6, 21.2, 6.6, 19.6);
    c.lineTo(6.6, 11.4);
    c.bezierCurveTo(6.6, 9.6, 7.2, 8.2, 9.4, 7.2);
    c.closePath();
    const g = c.createLinearGradient(0, 8, 0, 21);
    g.addColorStop(0, "#8a4a20");
    g.addColorStop(1, "#5f2e10");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = OUT;
    c.stroke();
    // cap
    rr(c, 9, 2, 6, 2.6, 0.6);
    fillOut(c, "#2e3338");
    // label
    rr(c, 7.6, 13, 8.8, 4.6, 0.8);
    fillOut(c, "#e8e0cc");
    c.strokeStyle = "rgba(60,40,20,0.7)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(9, 15.3);
    c.lineTo(15, 15.3);
    c.stroke();
    // liquid shine
    c.strokeStyle = "rgba(255,205,150,0.4)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(8.4, 10.4);
    c.lineTo(8.4, 19.6);
    c.stroke();
  },
  cigarettes: (c) => {
    // open pack with three cigarettes standing out of it
    rr(c, 6.2, 9.4, 11.6, 11.2, 1);
    fillOut(c, "#b03a30");
    rr(c, 6.2, 9.4, 11.6, 3.4, 1);
    fillOut(c, "#8a2a22");
    // cigarettes: white body, tan filter at the bottom inside the pack
    for (const x of [8.2, 11.2, 14.2] as const) {
      rr(c, x, 3.4, 1.9, 7.4, 0.7);
      fillOut(c, "#eee9dd");
      rr(c, x, 8.6, 1.9, 2.2, 0.5);
      c.fillStyle = "#d8a24e";
      c.fill();
    }
    // pack label stripe
    rr(c, 8, 14.6, 8, 3.2, 0.7);
    fillOut(c, "#e8e0cc");
  },
  cigars: (c) => {
    // two stacked cigars with bands, cut tips
    for (const [y, tone] of [[8.2, "#6e4224"], [13.4, "#7c4c2a"]] as const) {
      rr(c, 3.6, y, 16.8, 4.2, 2.1);
      fillOut(c, tone);
      // wrapper spiral hints
      c.strokeStyle = "rgba(40,22,10,0.45)";
      c.lineWidth = 1;
      c.beginPath();
      for (const x of [7.4, 10.6, 13.8]) {
        c.moveTo(x, y + 0.4);
        c.lineTo(x - 1.6, y + 3.8);
      }
      c.stroke();
      // band
      rr(c, 14.8, y + 0.3, 2.6, 3.6, 0.8);
      fillOut(c, "#c9a648");
      // lit/cut end
      c.beginPath();
      c.ellipse(4.4, y + 2.1, 1, 1.6, 0, 0, Math.PI * 2);
      fillOut(c, "#3a2412");
    }
  },
  // ---- currencies: each coin is a struck disc, told apart by metal and device
  coin_duc: (c) => {
    // Ducat: gold, milled edge, a cut gem struck into the face
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      c.beginPath();
      c.arc(12 + Math.cos(a) * 10.4, 12 + Math.sin(a) * 10.4, 1, 0, Math.PI * 2);
      c.fillStyle = "#8a6414";
      c.fill();
    }
    const g = c.createLinearGradient(3, 3, 20, 21);
    g.addColorStop(0, "#f5d670");
    g.addColorStop(0.5, "#d9a93c");
    g.addColorStop(1, "#9c7016");
    c.beginPath();
    c.arc(12, 12, 9.6, 0, Math.PI * 2);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.arc(12, 12, 7.4, 0, Math.PI * 2);
    c.strokeStyle = "rgba(90,62,10,0.55)";
    c.lineWidth = 0.9;
    c.stroke();
    // gem: a rotated square with a bright table facet
    c.save();
    c.translate(12, 12);
    c.rotate(Math.PI / 4);
    rr(c, -3.1, -3.1, 6.2, 6.2, 0.7);
    c.fillStyle = "#f7e9b4";
    c.fill();
    c.strokeStyle = "rgba(90,62,10,0.6)";
    c.lineWidth = 0.8;
    c.stroke();
    rr(c, -1.5, -1.5, 3, 3, 0.4);
    c.fillStyle = "#fffbe8";
    c.fill();
    c.restore();
  },
  coin_obl: (c) => {
    // Obol: a silver coin struck as a diamond. Shape carries the difference from
    // the Ducat, not decoration on the rim — a lobed or dotted edge just read as
    // a gear next to a round gold coin.
    c.save();
    c.translate(12, 12);
    c.rotate(Math.PI / 4);
    const g = c.createLinearGradient(-7.8, -7.8, 7.8, 7.8);
    g.addColorStop(0, "#f4f8fb");
    g.addColorStop(0.45, "#c8d2dc");
    g.addColorStop(1, "#7e8a97");
    rr(c, -7.7, -7.7, 15.4, 15.4, 2.4);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    rr(c, -5.4, -5.4, 10.8, 10.8, 1.6);
    c.strokeStyle = "rgba(58,70,82,0.42)";
    c.lineWidth = 0.85;
    c.stroke();
    c.restore();
    // a crescent struck into the face, upright whatever the coin's shape
    c.beginPath();
    c.arc(11.7, 12.2, 4.6, Math.PI * 0.36, Math.PI * 1.64);
    c.arc(13.6, 12.2, 3.9, Math.PI * 1.64, Math.PI * 0.36, true);
    c.closePath();
    c.fillStyle = "#5b6875";
    c.fill();
    c.strokeStyle = "rgba(30,40,50,0.6)";
    c.lineWidth = 0.7;
    c.stroke();
    // and the pellet it sits beside
    c.beginPath();
    c.arc(15.1, 9.0, 1.25, 0, Math.PI * 2);
    c.fillStyle = "#fbfdff";
    c.fill();
    c.strokeStyle = "rgba(58,70,82,0.6)";
    c.lineWidth = 0.7;
    c.stroke();
  },
  coin_tid: (c) => {
    // Tiderium: a hexagonal token in tide green, with a wave across the face
    const hex = (r: number) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        const x = 12 + Math.cos(a) * r;
        const y = 12 + Math.sin(a) * r;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath();
    };
    const g = c.createLinearGradient(4, 3, 20, 21);
    g.addColorStop(0, "#7fe3d2");
    g.addColorStop(0.5, "#2f9f96");
    g.addColorStop(1, "#166a72");
    hex(10);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    hex(7.2);
    c.strokeStyle = "rgba(9,50,55,0.45)";
    c.lineWidth = 0.9;
    c.stroke();
    // the tide: two crests through the middle
    c.strokeStyle = "#e8fbf6";
    c.lineWidth = 1.5;
    c.lineCap = "round";
    for (const dy of [-1.7, 1.5]) {
      c.beginPath();
      c.moveTo(7.2, 12 + dy);
      c.bezierCurveTo(9, 12 + dy - 2, 10.6, 12 + dy + 2, 12.4, 12 + dy);
      c.bezierCurveTo(14, 12 + dy - 2, 15.4, 12 + dy + 1.6, 16.8, 12 + dy - 0.4);
      c.stroke();
    }
    c.lineCap = "butt";
  },
  gun_barrel: (c) => {
    // steel tube on the diagonal: breech block, muzzle collar, open bore
    c.save();
    c.translate(12, 12);
    c.rotate(-0.42);
    rr(c, -9.6, -1.6, 17.4, 3.2, 1.5);
    fillOut(c, "#57616c");
    rr(c, -9, -1.15, 16.2, 1, 0.5);
    c.fillStyle = "rgba(255,255,255,0.16)";
    c.fill();
    rr(c, 6.2, -2.3, 3.2, 4.6, 1);
    fillOut(c, "#3f4750"); // muzzle collar
    c.beginPath();
    c.arc(8.6, 0, 1.1, 0, Math.PI * 2);
    c.fillStyle = "#181d22";
    c.fill(); // bore
    rr(c, -10.6, -2.4, 2.8, 4.8, 0.8);
    fillOut(c, "#4b545c"); // breech
    c.strokeStyle = "rgba(8,10,14,0.55)";
    c.lineWidth = 0.9;
    for (const x of [-4.4, 0.8]) {
      c.beginPath();
      c.moveTo(x, -1.6);
      c.lineTo(x, 1.6);
      c.stroke();
    }
    c.restore();
  },
  gun_action: (c) => {
    // receiver: ejection port, bolt handle out the side, trigger and guard
    rr(c, 3.4, 7.4, 17.2, 7.2, 1.4);
    fillOut(c, "#4b545c");
    rr(c, 5.2, 8.5, 12.4, 2.2, 0.8);
    fillOut(c, "#333b43"); // ejection port
    rr(c, 12.2, 4.2, 2.4, 4.2, 1);
    fillOut(c, "#7d838a"); // bolt shank
    c.beginPath();
    c.arc(13.4, 4.4, 1.7, 0, Math.PI * 2);
    fillOut(c, "#98a1a9"); // bolt knob
    for (const x of [6.4, 18.2]) {
      c.beginPath();
      c.arc(x, 12.8, 1.1, 0, Math.PI * 2);
      fillOut(c, "#98a1a9");
      c.strokeStyle = "rgba(8,10,14,0.7)";
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x - 0.7, 12.8);
      c.lineTo(x + 0.7, 12.8);
      c.stroke();
    }
    c.strokeStyle = "#3f4750";
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(9.6, 16.2, 2.6, -Math.PI * 0.06, Math.PI * 0.96);
    c.stroke(); // trigger guard
    rr(c, 9, 14.5, 1.3, 3, 0.5);
    fillOut(c, "#2e343a"); // trigger
  },
  gun_stock: (c) => {
    // shoulder stock: butt plate, comb rising to the tang, grip below
    c.beginPath();
    c.moveTo(4.2, 7.2);
    c.lineTo(13.6, 5.4);
    c.lineTo(20.4, 5.0);
    c.lineTo(20.4, 7.8);
    c.lineTo(14.2, 10.0);
    c.lineTo(12.4, 15.6);
    c.lineTo(8.8, 15.2);
    c.lineTo(4.2, 13.6);
    c.closePath();
    fillOut(c, "#7b5232");
    // grain
    c.strokeStyle = "rgba(48,30,14,0.45)";
    c.lineWidth = 0.8;
    for (const [y0, y1] of [[8.8, 7.6], [10.6, 9.2]]) {
      c.beginPath();
      c.moveTo(5.2, y0);
      c.bezierCurveTo(9, y0 - 0.6, 12, y1, 15.4, y1 - 0.4);
      c.stroke();
    }
    // butt plate
    rr(c, 2.6, 6.6, 2, 7.6, 0.6);
    fillOut(c, "#3f4750");
  },
  hunting_rifle: (c) => {
    // rifle at a slight angle: wooden stock, long barrel, scope
    c.save();
    c.translate(11.4, 12);
    c.rotate(-0.32);
    // barrel
    rr(c, -1, -1.1, 11.4, 1.9, 0.8);
    fillOut(c, "#3f4750");
    // muzzle tip
    rr(c, 9.4, -1.4, 1.6, 2.4, 0.5);
    fillOut(c, "#2e343a");
    // body + trigger guard
    rr(c, -4.6, -1.5, 5.4, 2.9, 0.7);
    fillOut(c, "#57616c");
    c.beginPath();
    c.arc(-1.6, 2.4, 1.6, -Math.PI * 0.1, Math.PI * 0.95);
    c.lineWidth = 1.5;
    c.strokeStyle = "#3f4750";
    c.stroke();
    // wooden stock, angled down-left
    c.beginPath();
    c.moveTo(-4.4, -1.4);
    c.lineTo(-7.4, -0.6);
    c.lineTo(-9.6, 2.8);
    c.lineTo(-6.6, 3.4);
    c.lineTo(-4.2, 1.4);
    c.closePath();
    fillOut(c, "#7b5232");
    // scope
    rr(c, -0.6, -3.4, 4.6, 1.7, 0.8);
    fillOut(c, "#2e3338");
    c.restore();
  },
  pistol: (c) => {
    // compact sidearm: slide, grip angled back, trigger guard
    rr(c, 4.4, 7.2, 14.2, 3.6, 1);
    fillOut(c, "#4b545c"); // slide
    rr(c, 4.4, 7.2, 14.2, 1.4, 0.7);
    fillOut(c, "#57616c"); // slide top
    rr(c, 17.2, 7.8, 1.6, 2.4, 0.4);
    fillOut(c, "#2e343a"); // muzzle
    // grip
    c.save();
    c.translate(7.6, 10.6);
    c.rotate(0.28);
    rr(c, -1.7, 0, 3.4, 7.6, 1);
    fillOut(c, "#5f4630");
    c.strokeStyle = "rgba(40,25,12,0.5)";
    c.lineWidth = 0.9;
    c.beginPath();
    for (let i = 1; i < 4; i++) {
      c.moveTo(-1.2, i * 1.7);
      c.lineTo(1.2, i * 1.7);
    }
    c.stroke();
    c.restore();
    // trigger guard
    c.beginPath();
    c.arc(11.6, 12.2, 2.1, -Math.PI * 0.05, Math.PI * 0.95);
    c.lineWidth = 1.6;
    c.strokeStyle = "#3f4750";
    c.stroke();
    // rear sight nub
    rr(c, 5, 6.2, 1.4, 1.2, 0.3);
    fillOut(c, "#2e343a");
  },
  shotgun: (c) => {
    // side-by-side break action: twin barrels, hinge, wood stock and forend
    c.save();
    c.translate(10.8, 12);
    c.rotate(-0.3);
    rr(c, -1.4, -2.1, 11.8, 1.8, 0.7);
    fillOut(c, "#3f4750");
    rr(c, -1.4, -0.1, 11.8, 1.8, 0.7);
    fillOut(c, "#4b545c");
    rr(c, 9.6, -2.4, 1.7, 4.5, 0.5);
    fillOut(c, "#2e343a"); // muzzles
    c.fillStyle = "#12171b";
    for (const y of [-1.2, 0.8]) {
      c.beginPath();
      c.arc(10.45, y, 0.55, 0, Math.PI * 2);
      c.fill();
    }
    rr(c, -5.2, -2.1, 4.2, 4, 0.7);
    fillOut(c, "#57616c"); // receiver
    c.strokeStyle = "rgba(8,10,14,0.6)";
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(-1.2, -2.1);
    c.lineTo(-1.2, 1.9);
    c.stroke(); // break hinge
    c.strokeStyle = "#3f4750";
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(-2.8, 2.7, 1.7, -Math.PI * 0.08, Math.PI * 0.95);
    c.stroke(); // trigger guard
    c.beginPath();
    c.moveTo(-5, -1.9);
    c.lineTo(-8.4, -1.1);
    c.lineTo(-10.6, 3.0);
    c.lineTo(-7.4, 3.9);
    c.lineTo(-4.8, 1.7);
    c.closePath();
    fillOut(c, "#7b5232"); // stock
    rr(c, 1.2, 1.5, 5.4, 1.7, 0.6);
    fillOut(c, "#7b5232"); // forend
    c.restore();
  },
  ammo: (c) => {
    // three rifle cartridges: brass case, copper tip
    for (const [i, x] of [5.4, 10.6, 15.8].entries()) {
      const y = 4.6 + (i % 2) * 1.2;
      // tip
      c.beginPath();
      c.moveTo(x + 1.4, y);
      c.quadraticCurveTo(x + 2.8, y + 1.6, x + 2.8, y + 4);
      c.lineTo(x, y + 4);
      c.quadraticCurveTo(x, y + 1.6, x + 1.4, y);
      c.closePath();
      fillOut(c, "#b06a3a");
      // case
      rr(c, x, y + 4, 2.8, 9.4, 0.5);
      const g = c.createLinearGradient(x, 0, x + 2.8, 0);
      g.addColorStop(0, "#d8b24e");
      g.addColorStop(1, "#a8842e");
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 1.3;
      c.strokeStyle = OUT;
      c.stroke();
      // rim
      rr(c, x - 0.4, y + 13.4, 3.6, 1.8, 0.5);
      fillOut(c, "#a8842e");
    }
  },
  // ---------------- mining components (Phase 4D) ----------------
  cpu_basic: (c) => {
    // CPU package: square die on a pin grid
    rr(c, 5, 5, 14, 14, 1.2);
    fillOut(c, "#3f6d4a");
    rr(c, 8.4, 8.4, 7.2, 7.2, 0.8);
    fillOut(c, "#8a949d");
    // pins
    c.strokeStyle = "#c9a648";
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const t = 6.6 + i * 2.7;
      c.moveTo(t, 5);
      c.lineTo(t, 2.8);
      c.moveTo(t, 19);
      c.lineTo(t, 21.2);
      c.moveTo(5, t);
      c.lineTo(2.8, t);
      c.moveTo(19, t);
      c.lineTo(21.2, t);
    }
    c.stroke();
  },
  cpu_adv: (c) => {
    // bigger die, gold corner mark
    rr(c, 4.4, 4.4, 15.2, 15.2, 1.4);
    fillOut(c, "#2e4a6e");
    rr(c, 7.6, 7.6, 8.8, 8.8, 0.9);
    fillOut(c, "#a8b2ba");
    rr(c, 9.6, 9.6, 4.8, 4.8, 0.5);
    fillOut(c, "#57616c");
    c.beginPath();
    c.arc(6.4, 6.4, 1, 0, Math.PI * 2);
    fillOut(c, "#c9a648");
    c.strokeStyle = "#c9a648";
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const t = 6.2 + i * 2.9;
      c.moveTo(t, 4.4);
      c.lineTo(t, 2.4);
      c.moveTo(t, 19.6);
      c.lineTo(t, 21.6);
    }
    c.stroke();
  },
  gpu: (c) => {
    // graphics card: board, dual fans, bracket
    rr(c, 2.6, 8, 18.8, 8.6, 1);
    fillOut(c, "#2e3338");
    rr(c, 2.6, 6.2, 3, 2.2, 0.5);
    fillOut(c, "#8a949d"); // bracket
    for (const x of [9, 16.4]) {
      c.beginPath();
      c.arc(x, 12.3, 3.1, 0, Math.PI * 2);
      fillOut(c, "#4b545c");
      // fan blades
      c.strokeStyle = "rgba(8,10,14,0.6)";
      c.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        c.beginPath();
        c.moveTo(x, 12.3);
        c.quadraticCurveTo(x + Math.cos(a + 0.6) * 2.4, 12.3 + Math.sin(a + 0.6) * 2.4, x + Math.cos(a) * 2.9, 12.3 + Math.sin(a) * 2.9);
        c.stroke();
      }
      c.beginPath();
      c.arc(x, 12.3, 0.8, 0, Math.PI * 2);
      c.fillStyle = "#8a949d";
      c.fill();
    }
    // pcie fingers
    rr(c, 5, 16.6, 10, 1.8, 0.4);
    fillOut(c, "#c9a648");
  },
  asic: (c) => {
    // ASIC miner: boxy unit with a big front fan and heat fins
    rr(c, 4, 3.4, 16, 17.4, 1.4);
    fillOut(c, "#4b545c");
    // fins on top
    c.strokeStyle = "rgba(8,10,14,0.6)";
    c.lineWidth = 1.1;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      c.moveTo(5.6 + i * 2.4, 3.6);
      c.lineTo(5.6 + i * 2.4, 6.4);
    }
    c.stroke();
    // big fan
    c.beginPath();
    c.arc(12, 13.4, 5.4, 0, Math.PI * 2);
    fillOut(c, "#2e3338");
    c.strokeStyle = "#8a949d";
    c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(12, 13.4);
      c.quadraticCurveTo(12 + Math.cos(a + 0.5) * 3.6, 13.4 + Math.sin(a + 0.5) * 3.6, 12 + Math.cos(a) * 4.7, 13.4 + Math.sin(a) * 4.7);
      c.stroke();
    }
    c.beginPath();
    c.arc(12, 13.4, 1.2, 0, Math.PI * 2);
    fillOut(c, "#8a949d");
  },
  psu_unit: (c) => {
    // power supply: box, fan grille corner, cable
    rr(c, 3.4, 6, 15.2, 11.6, 1);
    fillOut(c, "#57616c");
    c.beginPath();
    c.arc(8.6, 11.8, 3.2, 0, Math.PI * 2);
    fillOut(c, "#3f4750");
    c.strokeStyle = "rgba(200,210,220,0.6)";
    c.lineWidth = 0.9;
    for (const r of [1.2, 2.2]) {
      c.beginPath();
      c.arc(8.6, 11.8, r, 0, Math.PI * 2);
      c.stroke();
    }
    // power socket + switch
    rr(c, 14, 8, 3, 2.4, 0.4);
    fillOut(c, "#2e3338");
    rr(c, 14.4, 11.6, 2.2, 1.6, 0.3);
    fillOut(c, "#b03a30");
    // cable out the bottom
    c.strokeStyle = "#2e3338";
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(16, 17.6);
    c.quadraticCurveTo(18.4, 19.4, 16.6, 21);
    c.stroke();
  },
  cooling_fan: (c) => {
    // case fan: square frame, 7 blades, hub
    rr(c, 3.6, 3.6, 16.8, 16.8, 2);
    fillOut(c, "#3f4750");
    c.beginPath();
    c.arc(12, 12, 7, 0, Math.PI * 2);
    fillOut(c, "#2e3338");
    c.fillStyle = "#9fb6c4";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      c.beginPath();
      c.moveTo(12 + Math.cos(a) * 1.6, 12 + Math.sin(a) * 1.6);
      c.quadraticCurveTo(
        12 + Math.cos(a + 0.5) * 6.4, 12 + Math.sin(a + 0.5) * 6.4,
        12 + Math.cos(a + 0.9) * 5.4, 12 + Math.sin(a + 0.9) * 5.4
      );
      c.quadraticCurveTo(12 + Math.cos(a + 0.5) * 4, 12 + Math.sin(a + 0.5) * 4, 12 + Math.cos(a) * 1.6, 12 + Math.sin(a) * 1.6);
      c.fill();
    }
    c.beginPath();
    c.arc(12, 12, 2.2, 0, Math.PI * 2);
    fillOut(c, "#8a949d");
    // corner screws
    for (const [x, y] of [[5.6, 5.6], [18.4, 5.6], [5.6, 18.4], [18.4, 18.4]] as const) {
      c.beginPath();
      c.arc(x, y, 0.8, 0, Math.PI * 2);
      c.fillStyle = "#8a949d";
      c.fill();
    }
  },
  cooling_liquid: (c) => {
    // AIO liquid cooler: pump block + radiator with hoses
    rr(c, 3.2, 4.2, 6.6, 15.6, 1);
    fillOut(c, "#3f4750"); // radiator
    c.strokeStyle = "rgba(8,10,14,0.55)";
    c.lineWidth = 0.9;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      c.moveTo(4.4 + i * 1.1, 5);
      c.lineTo(4.4 + i * 1.1, 19);
    }
    c.stroke();
    // pump block
    c.beginPath();
    c.arc(16.6, 14.8, 4.2, 0, Math.PI * 2);
    fillOut(c, "#2e3338");
    c.beginPath();
    c.arc(16.6, 14.8, 2.2, 0, Math.PI * 2);
    fillOut(c, "#4a90b8");
    // hoses
    c.strokeStyle = "#2e3338";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(9.8, 6.4);
    c.quadraticCurveTo(15.4, 5.4, 16.6, 10.6);
    c.moveTo(9.8, 9.8);
    c.quadraticCurveTo(13.8, 9.6, 14.4, 11.8);
    c.stroke();
  },
  delivery_space: (c) => {
    // a pallet with two cartons on it
    const PLANK = "#a8845a";
    // pallet deck
    for (let i = 0; i < 4; i++) {
      rr(c, 2.6 + i * 4.9, 15.4, 3.6, 4.4, 0.5);
      fillOut(c, PLANK);
    }
    rr(c, 2.2, 19.2, 19.6, 1.9, 0.5);
    fillOut(c, "#7d6242");
    // cartons stacked on top
    rr(c, 4.2, 8.2, 8.4, 7.4, 0.8);
    fillOut(c, "#c39a68");
    rr(c, 13.4, 10.4, 6.8, 5.2, 0.8);
    fillOut(c, "#b08d5e");
    // tape + seam
    c.strokeStyle = "rgba(90,64,32,0.75)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(8.4, 8.2);
    c.lineTo(8.4, 15.6);
    c.moveTo(4.2, 10.2);
    c.lineTo(12.6, 10.2);
    c.stroke();
  },
  mining_rack_s: (c) => {
    // single-bay rack: frame with one server unit + status LEDs
    rr(c, 4.4, 3.6, 15.2, 16.8, 1.2);
    fillOut(c, "#3f4750");
    rr(c, 6, 6, 12, 4.6, 0.7);
    fillOut(c, "#57616c");
    rr(c, 6, 12, 12, 4.6, 0.7);
    fillOut(c, "#2e3338");
    for (const [i, y] of [7.2, 13.2].entries()) {
      c.beginPath();
      c.arc(8, y + 1.1, 0.8, 0, Math.PI * 2);
      c.fillStyle = i ? "#5a6570" : "#7cc98a";
      c.fill();
      c.strokeStyle = "rgba(8,10,14,0.55)";
      c.lineWidth = 0.9;
      c.beginPath();
      for (let k = 0; k < 4; k++) {
        c.moveTo(11 + k * 1.9, y + 0.4);
        c.lineTo(11 + k * 1.9, y + 1.9);
      }
      c.stroke();
    }
    // feet
    rr(c, 5.2, 20.4, 2.4, 1, 0.3);
    fillOut(c, "#2e3338");
    rr(c, 16.4, 20.4, 2.4, 1, 0.3);
    fillOut(c, "#2e3338");
  },
  mining_rack_m: (c) => {
    // server rack: tall cabinet, 4 units with LEDs
    rr(c, 5.6, 2.6, 12.8, 18.8, 1.2);
    fillOut(c, "#3f4750");
    for (let i = 0; i < 4; i++) {
      const y = 4.2 + i * 4.3;
      rr(c, 7, y, 10, 3.2, 0.5);
      fillOut(c, i % 2 ? "#2e3338" : "#57616c");
      c.beginPath();
      c.arc(8.6, y + 1.6, 0.7, 0, Math.PI * 2);
      c.fillStyle = i === 3 ? "#e0a13c" : "#7cc98a";
      c.fill();
      c.strokeStyle = "rgba(8,10,14,0.55)";
      c.lineWidth = 0.85;
      c.beginPath();
      for (let k = 0; k < 4; k++) {
        c.moveTo(10.8 + k * 1.6, y + 0.7);
        c.lineTo(10.8 + k * 1.6, y + 2.5);
      }
      c.stroke();
    }
    rr(c, 6.4, 21.2, 2.2, 0.9, 0.3);
    fillOut(c, "#2e3338");
    rr(c, 15.4, 21.2, 2.2, 0.9, 0.3);
    fillOut(c, "#2e3338");
  },
  mining_rack_l: (c) => {
    // industrial: two cabinets side by side
    for (const x of [2.8, 12.6] as const) {
      rr(c, x, 3.4, 8.6, 17.6, 1);
      fillOut(c, "#3f4750");
      for (let i = 0; i < 4; i++) {
        const y = 4.8 + i * 4;
        rr(c, x + 1, y, 6.6, 2.9, 0.4);
        fillOut(c, i % 2 ? "#2e3338" : "#57616c");
        c.beginPath();
        c.arc(x + 2.2, y + 1.45, 0.6, 0, Math.PI * 2);
        c.fillStyle = "#7cc98a";
        c.fill();
      }
    }
  },
  // ---------------- Phase 4B machines ----------------
  brewery: (c) => {
    // twin brew vats with copper cone tops on a platform
    rr(c, 3, 18.6, 18, 2.4, 0.7);
    fillOut(c, "#5f4630");
    for (const x of [4.6, 13.2] as const) {
      // cone top
      c.beginPath();
      c.moveTo(x + 3.1, 3.2);
      c.lineTo(x + 6.2, 7.4);
      c.lineTo(x, 7.4);
      c.closePath();
      fillOut(c, "#b35c2a");
      // vat body
      rr(c, x, 7.4, 6.2, 11.2, 1.2);
      const g = c.createLinearGradient(x, 0, x + 6.2, 0);
      g.addColorStop(0, "#98a1a9");
      g.addColorStop(1, "#6d757d");
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 1.4;
      c.strokeStyle = OUT;
      c.stroke();
      // band + tap
      c.strokeStyle = "rgba(8,10,14,0.4)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 0.6, 11);
      c.lineTo(x + 5.6, 11);
      c.stroke();
      rr(c, x + 2.2, 16.2, 1.8, 1.6, 0.4);
      fillOut(c, "#3f4750");
    }
    // connecting pipe
    rr(c, 10.2, 9.2, 3.6, 1.5, 0.7);
    fillOut(c, "#b35c2a");
  },
  curing_barn: (c) => {
    // open drying frame with hanging browned leaves
    // posts + top beam
    rr(c, 3, 4.2, 2, 16.4, 0.6);
    fillOut(c, "#5f4630");
    rr(c, 19, 4.2, 2, 16.4, 0.6);
    fillOut(c, "#5f4630");
    rr(c, 2.4, 3.4, 19.2, 2.2, 0.7);
    fillOut(c, "#7b5232");
    // hanging leaf bundles
    for (const [x, tone] of [[7.4, "#8a5a30"], [12, "#9c6a38"], [16.6, "#7a4c26"]] as const) {
      c.strokeStyle = "rgba(40,25,12,0.8)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, 5.6);
      c.lineTo(x, 7.4);
      c.stroke();
      c.beginPath();
      c.moveTo(x, 7.4);
      c.bezierCurveTo(x + 2.8, 10.4, x + 2.2, 15.4, x, 18.6);
      c.bezierCurveTo(x - 2.2, 15.4, x - 2.8, 10.4, x, 7.4);
      c.closePath();
      fillOut(c, tone);
      c.strokeStyle = "rgba(50,30,14,0.55)";
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x, 8.2);
      c.lineTo(x, 17.6);
      c.stroke();
    }
  },
  gun_mill: (c) => {
    // lathe: cabinet base, headstock driving a barrel blank through the chuck
    rr(c, 2.2, 12.6, 19.6, 8.2, 1.2);
    fillOut(c, "#3d454e"); // cabinet
    rr(c, 2.2, 10.8, 19.6, 2.2, 0.6);
    fillOut(c, "#57616c"); // bed
    rr(c, 3.0, 5.4, 5.6, 5.6, 1);
    fillOut(c, "#7d838a"); // headstock
    c.beginPath();
    c.arc(8.8, 8.2, 1.9, 0, Math.PI * 2);
    fillOut(c, "#4b545c"); // chuck
    rr(c, 9.6, 7.5, 9.0, 1.5, 0.6);
    fillOut(c, "#b9c2ca"); // barrel blank
    rr(c, 18.0, 6.6, 2.6, 3.2, 0.5);
    fillOut(c, "#57616c"); // tailstock
    rr(c, 12.4, 9.4, 2.2, 1.8, 0.4);
    fillOut(c, "#b35c2a"); // tool post
    rr(c, 15.4, 14.2, 4.6, 3.4, 0.6);
    fillOut(c, "#2e363e"); // control panel
    const g = c.createLinearGradient(15.9, 14.7, 19.5, 17.1);
    g.addColorStop(0, "#8fd4ee");
    g.addColorStop(1, "#3d7c9e");
    rr(c, 15.9, 14.7, 3.6, 2.4, 0.4);
    c.fillStyle = g;
    c.fill();
    for (const [i, x] of [4.4, 6.4].entries()) {
      c.beginPath();
      c.arc(x, 15.4, 0.9, 0, Math.PI * 2);
      c.fillStyle = i ? "#ff7a2e" : "#55803f";
      c.fill();
    }
    rr(c, 4.0, 17.6, 8.0, 1.4, 0.4);
    fillOut(c, "#4b545c"); // chip tray
  },
};

export function iconURL(id: string, size = 18): string {
  const dpr = Math.min(3, Math.ceil(window.devicePixelRatio || 1));
  const key = `${id}@${size}x${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const draw = DRAWERS[id];
  const canvas = document.createElement("canvas");
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const c = canvas.getContext("2d")!;
  c.scale((size * dpr) / 24, (size * dpr) / 24);
  if (draw) draw(c);
  else {
    rr(c, 6, 6, 12, 12, 3);
    fillOut(c, "#5a6570");
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

// inline <img> tag helper — rendered at the exact pixel size for crispness
// a coin's icon id, so panels don't have to know the naming
export const coinIcon = (code: string) => `coin_${code}`;

export function ic(id: string, size = 18): string {
  return `<img class="icon" src="${iconURL(id, size)}" width="${size}" height="${size}" alt="" />`;
}
