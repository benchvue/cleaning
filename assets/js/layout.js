/* 본당 #105 배치 데이터 (단위 m, 원점 = 강단 쪽 왼쪽 벽 모서리, 뒤에서 강단을 볼 때 기준)
   의자 수는 실측, 방 크기·통로 폭은 추정. 실측값이 오면 이 파일만 고치면 모든 페이지가 바뀐다. */
(function (global) {
  "use strict";
  const L = {
    W: 20, D: 18,                       // 본당 폭·깊이 (추정)
    chair: { pitch: 0.5, depth: 0.5, rowPitch: 0.9, legInnerW: 0.455, legInnerD: 0.45 },
    nogo: [
      { x: 0, y: 0, w: 20, h: 4.6, label: "강단 · 나무 바닥 (청소 안 함)", short: "강단" },
      { x: 6.7, y: 4.6, w: 6.8, h: 2.0, label: "강대상 계단 (나무)", short: "계단" },
      { x: 1.6, y: 4.6, w: 3.4, h: 1.6, label: "피아노", short: "피아노" },
      { x: 0, y: 6.2, w: 2.6, h: 2.1, label: "드럼·키보드", short: "드럼" }
    ],
    cols: [
      { n: "1열", c: [3, 4, 6, 7, 8, 9, 9, 9, 9], a: "r", x: 5.4, y: 7.9 },
      { n: "2열", c: [5, 5, 5, 5, 5, 5, 5, 5, 5], a: "l", x: 6.6, y: 7.9 },
      { n: "3열", c: [5, 5, 5, 5, 5, 5, 5, 5, 5], a: "l", x: 10.3, y: 7.9 },
      { n: "4열", c: [3, 4, 6, 7, 8, 9, 10], a: "l", x: 14.0, y: 9.7 },
      { n: "5열", c: [4, 5, 6, 7], a: "r", x: 19.4, y: 5.6, rot: -22 }
    ],
    robots: [
      { id: "R1", name: "R1", color: "#2f6db0", zoneName: "1열", zone: { x1: 0.2, x2: 5.9, yFront: 4.85 }, aisle: 6.0, dock: { x: 4.6, y: 18.9 } },
      { id: "R2", name: "R2", color: "#c46f22", zoneName: "2·3열", zone: { x1: 6.1, x2: 13.6, yFront: 6.9 }, aisle: 9.7, dock: { x: 5.9, y: 18.9 } },
      { id: "R3", name: "R3", color: "#3f8a55", zoneName: "4·5열 + 앞 오른쪽", zone: { x1: 13.9, x2: 19.8, yFront: 4.8 }, aisle: 13.4, dock: { x: 7.2, y: 18.9 } }
    ],
    zonesRect: [
      { id: "R1", rects: [[0, 4.6, 6.0, 13.4]] },
      { id: "R2", rects: [[6.0, 6.6, 7.8, 11.4]] },
      { id: "R3", rects: [[13.8, 4.6, 6.2, 13.4]] }
    ],
    door: { x1: 1.6, x2: 3.0, y: 18 },
    backAisleY: 16.6,
    corridor: { x: 0, y: 18.1, w: 9.7, h: 1.4 },
    cams: [
      { id: "C1", x: 5, y: 7.9 }, { id: "C2", x: 15, y: 7.9 },
      { id: "C3", x: 5, y: 14.6 }, { id: "C4", x: 15, y: 14.6 }
    ],
    ceilingH: 5.5                        // 천장 카메라 높이 가정 (실측 필요)
  };

  // 의자 목록: 중심, 회전, 네 모서리
  function chairs() {
    const out = [];
    L.cols.forEach((col, ci) => {
      let minx = 1e9, maxx = -1e9;
      const raw = [];
      col.c.forEach((n, r) => {
        for (let i = 0; i < n; i++) {
          const x = col.a === "l" ? col.x + i * L.chair.pitch : col.x - (n - i) * L.chair.pitch;
          const y = col.y + r * L.chair.rowPitch;
          minx = Math.min(minx, x); maxx = Math.max(maxx, x + L.chair.pitch);
          raw.push({ col: ci, row: r, i, x, y });
        }
      });
      const pcx = (minx + maxx) / 2, pcy = col.y + (col.c.length - 1) * L.chair.rowPitch / 2 + L.chair.depth / 2;
      const th = (col.rot || 0) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
      const rot = (px, py) => [pcx + (px - pcx) * cs - (py - pcy) * sn, pcy + (px - pcx) * sn + (py - pcy) * cs];
      raw.forEach(ch => {
        const w = 0.46, d = L.chair.depth, x0 = ch.x + 0.02, y0 = ch.y;
        const corners = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + d], [x0, y0 + d]].map(p => rot(p[0], p[1]));
        const c = rot(x0 + w / 2, y0 + d / 2);
        out.push(Object.assign(ch, { cx: c[0], cy: c[1], rot: col.rot || 0, corners, pivot: [pcx, pcy] }));
      });
    });
    return out;
  }
  const CHAIRS = chairs();
  const totals = L.cols.map(c => c.c.reduce((a, b) => a + b, 0));
  const totalChairs = totals.reduce((a, b) => a + b, 0);

  function inNogo(x, y, m) {
    m = m || 0;
    return L.nogo.some(z => x > z.x - m && x < z.x + z.w + m && y > z.y - m && y < z.y + z.h + m);
  }
  function underChair(x, y) {
    for (const ch of CHAIRS) {
      if (Math.abs(x - ch.cx) > 0.4 || Math.abs(y - ch.cy) > 0.4) continue;
      const th = -ch.rot * Math.PI / 180, dx = x - ch.cx, dy = y - ch.cy;
      const lx = dx * Math.cos(th) - dy * Math.sin(th), ly = dx * Math.sin(th) + dy * Math.cos(th);
      if (Math.abs(lx) <= 0.25 && Math.abs(ly) <= 0.25) return ch;
    }
    return null;
  }

  // SVG 그리기 (ox, oy = 원점 px, s = px/m)
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgLayout(g, ox, oy, s, o) {
    o = o || {};
    const X = v => ox + v * s, Y = v => oy + v * s;
    if (o.floor !== false) el("rect", { x: X(0), y: Y(0), width: L.W * s, height: L.D * s, fill: o.floorFill || "#eef0e8" }, g);
    if (o.zones) L.zonesRect.forEach(z => {
      const r = L.robots.find(q => q.id === z.id);
      z.rects.forEach(rc => el("rect", { x: X(rc[0]), y: Y(rc[1]), width: rc[2] * s, height: rc[3] * s, fill: r.color, opacity: o.zoneOp || .12 }, g));
    });
    if (o.aisle) {
      el("rect", { x: X(0), y: Y(16.05), width: L.W * s, height: 1.95 * s, fill: o.aisle }, g);
      if (o.aisleLabel) el("text", { x: X(14), y: Y(17.2), "text-anchor": "middle", "font-size": o.fs || 12, fill: "#3b4b5e", "font-weight": 600 }, g, o.aisleLabel);
    }
    L.nogo.forEach(z => {
      el("rect", { x: X(z.x), y: Y(z.y), width: z.w * s, height: z.h * s, rx: Math.min(.4 * s, 8), fill: o.hatch ? "url(#" + o.hatch + ")" : "#f6dcd8", stroke: "#c0392b", "stroke-dasharray": "5 3", "stroke-width": o.hatch ? 1 : .6 }, g);
      if (o.labels) el("text", { x: X(z.x + z.w / 2), y: Y(z.y + z.h / 2) + (o.fs || 12) / 3, "text-anchor": "middle", "font-size": o.fs || 12, "font-weight": 700, fill: "#9b2c22" }, g, o.shortLabels ? z.short : z.label);
    });
    const cg = el("g", {}, g);
    CHAIRS.forEach(ch => {
      el("polygon", { points: ch.corners.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" "), fill: o.chairFill || "#a7b48a", stroke: o.plain ? "none" : "#7f8f63", "stroke-width": .5, opacity: o.chairOp || 1 }, cg);
    });
    if (o.colLabels) L.cols.forEach((col, i) => {
      const fx = col.a === "l" ? col.x + col.c[0] * .25 : col.x - col.c[0] * .25;
      el("text", { x: X(col.rot ? fx - .5 : fx), y: Y(col.rot ? col.y - .8 : col.y - .3), "text-anchor": "middle", "font-size": o.colFs || 11.5, "font-weight": 700, fill: "#1c2633" }, g, col.n + " · " + totals[i]);
    });
    if (o.walls !== false) el("rect", { x: X(0), y: Y(0), width: L.W * s, height: L.D * s, fill: "none", stroke: "#1c2633", "stroke-width": o.wallW || 2.5 }, g);
    if (o.door) {
      el("line", { x1: X(L.door.x1), y1: Y(18), x2: X(L.door.x2), y2: Y(18), stroke: "#fff", "stroke-width": (o.wallW || 2.5) + 2 }, g);
    }
  }
  function svgDefs(svg) {
    let defs = svg.querySelector("defs") || el("defs", {}, svg);
    if (!svg.querySelector("#hatchRed")) {
      const p = el("pattern", { id: "hatchRed", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
      el("rect", { width: 8, height: 8, fill: "#fbecea" }, p); el("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: "#c0392b", "stroke-width": 2, opacity: .45 }, p);
      const q = el("pattern", { id: "hatchGray", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-45)" }, defs);
      el("rect", { width: 8, height: 8, fill: "#f1f2ef" }, q); el("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: "#8b949c", "stroke-width": 1.2, opacity: .55 }, q);
    }
    return defs;
  }

  // Canvas 배경 (s = px/m, 원점 0,0)
  function canvasStatic(ctx, s, o) {
    o = o || {};
    ctx.fillStyle = "#eef0e8"; ctx.fillRect(0, 0, L.W * s, L.D * s);
    if (o.zones) L.zonesRect.forEach(z => {
      const r = L.robots.find(q => q.id === z.id);
      ctx.globalAlpha = .10; ctx.fillStyle = r.color;
      z.rects.forEach(rc => ctx.fillRect(rc[0] * s, rc[1] * s, rc[2] * s, rc[3] * s));
      ctx.globalAlpha = 1;
    });
    L.nogo.forEach(z => {
      ctx.save();
      ctx.beginPath(); ctx.rect(z.x * s, z.y * s, z.w * s, z.h * s); ctx.clip();
      ctx.fillStyle = "#fbecea"; ctx.fillRect(z.x * s, z.y * s, z.w * s, z.h * s);
      ctx.strokeStyle = "rgba(192,57,43,.35)"; ctx.lineWidth = 1;
      for (let k = -z.h * s; k < z.w * s; k += 7) { ctx.beginPath(); ctx.moveTo(z.x * s + k, z.y * s + z.h * s); ctx.lineTo(z.x * s + k + z.h * s, z.y * s); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = "rgba(192,57,43,.7)"; ctx.setLineDash([4, 3]); ctx.strokeRect(z.x * s + .5, z.y * s + .5, z.w * s - 1, z.h * s - 1); ctx.setLineDash([]);
      if (o.labels) {
        ctx.fillStyle = "#9b2c22"; ctx.font = "700 " + (o.fs || 11) + "px " + (o.font || "sans-serif"); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const t = (z.w * s < 90) ? z.short : z.label;
        ctx.fillText(t, (z.x + z.w / 2) * s, (z.y + z.h / 2) * s);
      }
    });
  }
  function canvasChairs(ctx, s, o) {
    o = o || {};
    ctx.fillStyle = o.fill || "rgba(150,163,120,.78)";
    ctx.strokeStyle = o.stroke || "rgba(95,110,69,.9)"; ctx.lineWidth = 0.6;
    CHAIRS.forEach(ch => {
      ctx.beginPath();
      ch.corners.forEach((p, i) => i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s));
      ctx.closePath(); ctx.fill(); if (s > 12) ctx.stroke();
    });
    if (o.colLabels) {
      ctx.fillStyle = "#1c2633"; ctx.font = "700 " + (o.fs || 11) + "px " + (o.font || "sans-serif"); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      L.cols.forEach((col, i) => {
        const fx = col.a === "l" ? col.x + col.c[0] * .25 : col.x - col.c[0] * .25;
        ctx.fillText(col.n, (col.rot ? fx - .5 : fx) * s, (col.rot ? col.y - .8 : col.y - .25) * s);
      });
    }
  }

  global.Sanctuary = { L, CHAIRS, totals, totalChairs, inNogo, underChair, svgLayout, svgDefs, svgEl: el, canvasStatic, canvasChairs };
})(window);
