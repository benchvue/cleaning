/* 작은 SVG 다이어그램 도우미: 상태도·흐름도(flow)와 시퀀스(seq).
   좌표는 viewBox 기준 px. 노드 상자 테두리에서 화살표가 시작·끝나도록 자동 계산한다. */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, a, p, t) { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; if (p) p.appendChild(e); return e; }
  const KIND = {
    box: { fill: "#ffffff", stroke: "#c9cec4", text: "#1c2633", sub: "#5b6672" },
    state: { fill: "#ffffff", stroke: "#7f8f63", text: "#1c2633", sub: "#5b6672", rx: 18 },
    active: { fill: "#e9eee0", stroke: "#4b5a35", text: "#1c2633", sub: "#4b5a35", rx: 18 },
    warn: { fill: "#fbf0d9", stroke: "#b7791f", text: "#6b4508", sub: "#8a5a0d", rx: 18 },
    bad: { fill: "#f8e3e1", stroke: "#b83a32", text: "#7a231d", sub: "#9b2c22", rx: 18 },
    dark: { fill: "#1c2633", stroke: "#1c2633", text: "#ffffff", sub: "#cfd6de" },
    ext: { fill: "#f6f7f3", stroke: "#8b949c", text: "#1c2633", sub: "#5b6672", dash: "5 3" },
    blue: { fill: "#eef4fb", stroke: "#2f6db0", text: "#1c2633", sub: "#3b4b5e" },
    oak: { fill: "#f6e9da", stroke: "#c27c3a", text: "#5c3d17", sub: "#8a4f17" },
    sage: { fill: "#e9eee0", stroke: "#7f8f63", text: "#1c2633", sub: "#4b5a35" },
    store: { fill: "#ffffff", stroke: "#5b6672", text: "#1c2633", sub: "#5b6672" }
  };
  function marker(svg, color) {
    const id = "ar" + color.replace("#", "");
    if (svg.querySelector("#" + id)) return id;
    const defs = svg.querySelector("defs") || el("defs", {}, svg);
    const m = el("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    el("path", { d: "M0,0 L10,5 L0,10 z", fill: color }, m);
    return id;
  }
  function clip(n, tx, ty) {           // 상자 중심에서 (tx,ty) 방향으로 테두리 교점
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const sx = (n.w / 2) / Math.abs(dx || 1e-9), sy = (n.h / 2) / Math.abs(dy || 1e-9), k = Math.min(sx, sy);
    return [cx + dx * k, cy + dy * k];
  }
  function label(g, x, y, text, color) {
    if (!text) return;
    const lines = String(text).split("\n");
    const w = Math.max.apply(null, lines.map(l => l.length)) * 6.4 + 10, h = lines.length * 13 + 5;
    el("rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 4, fill: "#ffffff", opacity: .94 }, g);
    lines.forEach((l, i) => el("text", { x, y: y - h / 2 + 13 + i * 13 - 2, "text-anchor": "middle", "font-size": 10.5, fill: color || "#3b4b5e" }, g, l));
  }
  function flow(svg, spec) {
    if (typeof svg === "string") svg = document.getElementById(svg);
    const g = el("g", {}, svg), eg = el("g", {}, g), ng = el("g", {}, g), lg = el("g", {}, g);
    const N = {};
    (spec.groups || []).forEach(gr => {
      el("rect", { x: gr.x, y: gr.y, width: gr.w, height: gr.h, rx: 12, fill: gr.fill || "#f6f7f3", stroke: gr.stroke || "#c9cec4", "stroke-dasharray": gr.dash || "", "stroke-width": 1.3 }, eg);
      if (gr.title) el("text", { x: gr.x + 12, y: gr.y + 18, "font-size": 12, "font-weight": 700, fill: gr.color || "#1c2633" }, eg, gr.title);
    });
    spec.nodes.forEach(n => {
      N[n.id] = n;
      const k = KIND[n.kind || "box"];
      if (n.kind === "start") { el("circle", { cx: n.x + n.w / 2, cy: n.y + n.h / 2, r: Math.min(n.w, n.h) / 2, fill: "#1c2633" }, ng); return; }
      if (n.kind === "end") { el("circle", { cx: n.x + n.w / 2, cy: n.y + n.h / 2, r: Math.min(n.w, n.h) / 2, fill: "#fff", stroke: "#1c2633", "stroke-width": 2 }, ng); el("circle", { cx: n.x + n.w / 2, cy: n.y + n.h / 2, r: Math.min(n.w, n.h) / 2 - 4, fill: "#1c2633" }, ng); return; }
      if (n.kind === "store") {
        const cx = n.x, cy = n.y, w = n.w, h = n.h;
        el("path", { d: `M${cx},${cy + 6} a${w / 2},6 0 0,1 ${w},0 v${h - 12} a${w / 2},6 0 0,1 ${-w},0 z`, fill: k.fill, stroke: k.stroke, "stroke-width": 1.3 }, ng);
        el("path", { d: `M${cx},${cy + 6} a${w / 2},6 0 0,0 ${w},0`, fill: "none", stroke: k.stroke, "stroke-width": 1.3 }, ng);
      } else {
        el("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: n.rx != null ? n.rx : (k.rx || 8), fill: n.fill || k.fill, stroke: n.stroke || k.stroke, "stroke-width": n.sw || 1.4, "stroke-dasharray": k.dash || "" }, ng);
      }
      const lines = n.sub ? String(n.sub).split("\n") : [];
      const total = 15 + lines.length * 13;
      let y0 = n.y + n.h / 2 - total / 2 + 12;
      const tx = n.align === "left" ? n.x + 10 : n.x + n.w / 2, anc = n.align === "left" ? "start" : "middle";
      el("text", { x: tx, y: y0, "text-anchor": anc, "font-size": n.fs || 12.5, "font-weight": 700, fill: n.color || k.text }, ng, n.title || n.id);
      lines.forEach((l, i) => el("text", { x: tx, y: y0 + 15 + i * 13, "text-anchor": anc, "font-size": 10.5, fill: k.sub, "font-family": n.mono ? "IBM Plex Mono, monospace" : "" }, ng, l));
    });
    (spec.edges || []).forEach(e => {
      const a = N[e.a], b = N[e.b], color = e.color || "#5b6672", mk = marker(svg, color);
      const attrs = { fill: "none", stroke: color, "stroke-width": e.w || 1.5, "marker-end": "url(#" + mk + ")" };
      if (e.dash) attrs["stroke-dasharray"] = e.dash === true ? "5 4" : e.dash;
      if (e.id) attrs.id = e.id;
      if (a === b) {
        const cx = a.x + a.w / 2 + (e.dx || 0), top = a.y;
        attrs.d = `M${cx - 14},${top} C${cx - 30},${top - 40} ${cx + 30},${top - 40} ${cx + 14},${top}`;
        el("path", attrs, eg); label(lg, cx, top - 34, e.label, e.lc); return;
      }
      if (e.path) {            // 직접 지정한 꺾은선 [[x,y],...]
        attrs.d = "M" + e.path.map(p => p.join(",")).join(" L");
        el("path", attrs, eg);
        const m = e.labelAt || e.path[Math.floor(e.path.length / 2)];
        label(lg, m[0], m[1], e.label, e.lc); return;
      }
      const acx = a.x + a.w / 2 + (e.ax || 0), acy = a.y + a.h / 2 + (e.ay || 0), bcx = b.x + b.w / 2 + (e.bx || 0), bcy = b.y + b.h / 2 + (e.by || 0);
      const bend = e.bend || 0;
      const mx = (acx + bcx) / 2, my = (acy + bcy) / 2, dx = bcx - acx, dy = bcy - acy, len = Math.hypot(dx, dy) || 1;
      const qx = mx - dy / len * bend, qy = my + dx / len * bend;
      const p1 = clip(Object.assign({}, a, { x: a.x + (e.ax || 0), y: a.y + (e.ay || 0) }), bend ? qx : bcx, bend ? qy : bcy);
      const p2 = clip(Object.assign({}, b, { x: b.x + (e.bx || 0), y: b.y + (e.by || 0) }), bend ? qx : acx, bend ? qy : acy);
      attrs.d = bend ? `M${p1[0]},${p1[1]} Q${qx},${qy} ${p2[0]},${p2[1]}` : `M${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`;
      el("path", attrs, eg);
      const lx = bend ? (p1[0] + 2 * qx + p2[0]) / 4 : (p1[0] + p2[0]) / 2, ly = bend ? (p1[1] + 2 * qy + p2[1]) / 4 : (p1[1] + p2[1]) / 2;
      label(lg, lx + (e.lx || 0), ly + (e.ly || 0), e.label, e.lc);
    });
    return g;
  }
  // 시퀀스 다이어그램
  function seq(svg, spec) {
    if (typeof svg === "string") svg = document.getElementById(svg);
    const A = spec.actors, gap = spec.gap || 150, left = spec.left || 80, top = 20, boxH = 40, rowH = spec.rowH || 34;
    const W = left * 2 + gap * (A.length - 1), H = top + boxH + 20 + spec.msgs.length * rowH + 30;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const g = el("g", {}, svg), X = i => left + i * gap;
    A.forEach((a, i) => {
      const name = typeof a === "string" ? a : a.name, k = KIND[(a && a.kind) || "box"];
      el("line", { x1: X(i), y1: top + boxH, x2: X(i), y2: H - 10, stroke: "#c9cec4", "stroke-dasharray": "4 4" }, g);
      el("rect", { x: X(i) - 64, y: top, width: 128, height: boxH, rx: 8, fill: k.fill, stroke: k.stroke, "stroke-width": 1.4 }, g);
      el("text", { x: X(i), y: top + 25, "text-anchor": "middle", "font-size": 12.5, "font-weight": 700, fill: k.text }, g, name);
    });
    const idx = n => A.findIndex(a => (typeof a === "string" ? a : a.name) === n);
    spec.msgs.forEach((m, r) => {
      const y = top + boxH + 30 + r * rowH, i = idx(m.from), j = idx(m.to), color = m.color || "#3b4b5e", mk = marker(svg, color);
      if (m.note) {
        const x1 = X(Math.min(i, j)) - 60, x2 = X(Math.max(i, j)) + 60;
        el("rect", { x: x1, y: y - 13, width: x2 - x1, height: 22, rx: 4, fill: "#fbf0d9", stroke: "#e6c98d" }, g);
        el("text", { x: (x1 + x2) / 2, y: y + 2, "text-anchor": "middle", "font-size": 11, fill: "#6b4508" }, g, m.note);
        return;
      }
      if (i === j) {
        el("path", { d: `M${X(i)},${y - 6} h28 v14 h-26`, fill: "none", stroke: color, "stroke-width": 1.4, "marker-end": "url(#" + mk + ")" }, g);
        el("text", { x: X(i) + 34, y: y + 4, "font-size": 11, fill: color }, g, m.label);
        return;
      }
      el("line", { x1: X(i), y1: y, x2: X(j) + (j > i ? -3 : 3), y2: y, stroke: color, "stroke-width": 1.4, "stroke-dasharray": m.dash ? "5 4" : "", "marker-end": "url(#" + mk + ")" }, g);
      el("text", { x: (X(i) + X(j)) / 2, y: y - 6, "text-anchor": "middle", "font-size": 11, fill: color }, g, m.label);
    });
  }
  global.Diagram = { flow, seq, el };
})(window);
