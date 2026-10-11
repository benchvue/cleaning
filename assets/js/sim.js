/* 가상 청소 시뮬레이션 엔진 + 캔버스 뷰
   실제 시스템의 Fleet Manager 규칙을 그대로 흉내 낸다:
   - 로봇마다 담당 구역을 뒤에서 앞으로 0.33 m 간격으로 왕복 청소
   - 본당 뒷문은 한 번에 1대만 통과 (뮤텍스)
   - 자기 구역이 끝나면 남은 줄이 가장 많은 구역의 앞쪽 줄을 가져와 도움 (재배분)
   - 모두 끝나면 1대씩 문을 지나 도크로 복귀, 먼지 비움
   시간은 "가상 초" 단위. 화면 재생 속도는 뷰에서 정한다. */
(function (global) {
  "use strict";
  const S = global.Sanctuary, L = S.L;
  const CELL = 0.1, NX = Math.round(L.W / CELL), NY = Math.round(L.D / CELL);
  const ROBOT_R = 0.175;
  const DOOR_X = (L.door.x1 + L.door.x2) / 2, LANE_Y = 18.45, DOOR_IN = 17.4;

  function fmtClock(sec) {
    const m = Math.floor(sec / 60), h = Math.floor(m / 60) % 24, mm = m % 60;
    return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  }

  class CleaningSim {
    constructor(opts) {
      opts = opts || {};
      this.spacing = opts.spacing || 0.33;
      this.speed = opts.speed || 0.075;          // m / 가상 초 (회전·감속 포함 평균)
      this.drain = opts.drain || 0.0146;         // % / 가상 초 (카페트 강흡입)
      this.startSec = (opts.startMin != null ? opts.startMin : 540) * 60;
      this.starts = opts.starts || { R3: 0, R2: 30, R1: 60 };
      this.onEvent = opts.onEvent || null;
      // 로봇 중심이 갈 수 있는 칸 (벽·금지 구역에서 반지름만큼 떨어지고, 뒷문에서 이어진 칸)
      const feas = new Uint8Array(NX * NY), reach = new Uint8Array(NX * NY);
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const x = (i + .5) * CELL, y = (j + .5) * CELL;
        if (x >= ROBOT_R && x <= L.W - ROBOT_R && y >= ROBOT_R && y <= L.D - ROBOT_R && !S.inNogo(x, y, ROBOT_R)) feas[j * NX + i] = 1;
      }
      const st = [Math.floor(17.5 / CELL) * NX + Math.floor(DOOR_X / CELL)];
      reach[st[0]] = 1;
      while (st.length) {
        const k = st.pop(), i = k % NX, j = (k - i) / NX;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => {
          const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) return;
          const kk = jj * NX + ii; if (feas[kk] && !reach[kk]) { reach[kk] = 1; st.push(kk); }
        });
      }
      this.reach = reach;
      // 청소 가능한 칸 = 갈 수 있는 중심에서 반지름 안에 드는 바닥 칸
      this.mask = new Uint8Array(NX * NY);
      const rc = Math.ceil(ROBOT_R / CELL);
      for (let k = 0; k < reach.length; k++) {
        if (!reach[k]) continue;
        const i = k % NX, j = (k - i) / NX, x = (i + .5) * CELL, y = (j + .5) * CELL;
        for (let b = -rc; b <= rc; b++) for (let a = -rc; a <= rc; a++) {
          const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue;
          const cx = (ii + .5) * CELL, cy = (jj + .5) * CELL;
          if ((cx - x) * (cx - x) + (cy - y) * (cy - y) <= ROBOT_R * ROBOT_R && !S.inNogo(cx, cy, 0)) this.mask[jj * NX + ii] = 1;
        }
      }
      this.cleanable = this.mask.reduce((a, v) => a + v, 0);
      this.reset();
    }
    reset() {
      this.t = 0;
      this.cov = new Uint8Array(NX * NY);
      this.covered = 0;
      this.newCells = [];
      this.resetFlag = true;
      this.events = [];
      this.door = null; this.doorQ = [];
      this.phase = "ready";       // ready → running → done
      this.stopped = false;
      this.summary = null;
      this.robots = L.robots.map(def => ({
        def, id: def.id, color: def.color,
        x: def.dock.x, y: def.dock.y, hx: 0, hy: -1,
        state: "docked", battery: 100, path: [], wp: 0,
        queue: this.buildPasses(def), helped: 0, cleanM: 0, activeSec: 0, doneSec: null, emptyAt: null,
        under: false, waitLogged: false
      }));
      this.totalPasses = this.robots.reduce((a, r) => a + r.queue.length, 0);
    }
    buildPasses(def) {
      const z = def.zone, out = [];
      for (let y = L.D - ROBOT_R - .03; y >= z.yFront - 1e-6; y -= this.spacing) {
        const iv = this.freeInterval(z.x1, z.x2, y, ROBOT_R + 0.03);
        if (iv) out.push({ y: +y.toFixed(3), a: iv[0], b: iv[1], owner: def.id });
      }
      return out;
    }
    freeInterval(x1, x2, y, m) {
      let segs = [[x1, x2]];
      L.nogo.forEach(z => {
        if (y > z.y - m && y < z.y + z.h + m) {
          segs = segs.flatMap(([a, b]) => {
            const c = z.x - m, d = z.x + z.w + m;
            if (d <= a || c >= b) return [[a, b]];
            const o = []; if (c > a) o.push([a, c]); if (d < b) o.push([d, b]); return o;
          });
        }
      });
      if (this.reach) segs = segs.filter(([a, b]) => this.isReach((a + b) / 2, y));
      segs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
      return segs[0] && segs[0][1] - segs[0][0] > .5 ? segs[0] : null;
    }
    isReach(x, y) {
      const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
      return i >= 0 && j >= 0 && i < NX && j < NY && !!this.reach[j * NX + i];
    }
    log(text, rid, kind) {
      const e = { t: this.t, clock: fmtClock(this.startSec + this.t), text, robot: rid || null, kind: kind || "info" };
      this.events.push(e);
      if (this.onEvent) this.onEvent(e);
    }
    clockSec() { return this.startSec + this.t; }
    clock() { return fmtClock(this.startSec + this.t); }
    start() {
      if (this.phase !== "ready") return;
      this.phase = "running";
      this.robots.forEach(r => { r.state = "queued"; });
      this.log("정기 청소 시작 · 사전 점검 통과 (문 열림, 배터리 100%)", null, "start");
    }
    // 경로 계획
    exitPath(r) {
      return [
        { x: r.def.dock.x, y: LANE_Y }, { x: DOOR_X, y: LANE_Y },
        { x: DOOR_X, y: DOOR_IN, lock: true }, { x: DOOR_X, y: L.backAisleY, unlock: true }
      ];
    }
    returnPath(r) {
      const p = [];
      const ax = r.def.aisle;
      if (r.y < L.backAisleY - .05) { p.push({ x: ax, y: r.y }); p.push({ x: ax, y: L.backAisleY }); }
      p.push({ x: DOOR_X + .7, y: L.backAisleY });
      p.push({ x: DOOR_X, y: DOOR_IN, lock: true });
      p.push({ x: DOOR_X, y: LANE_Y });
      p.push({ x: r.def.dock.x, y: LANE_Y, unlock: true });
      p.push({ x: r.def.dock.x, y: r.def.dock.y });
      return p;
    }
    nextPass(r) {
      let pass = r.queue.shift(), stolen = false;
      if (!pass) {
        let best = null;
        this.robots.forEach(o => { if (o !== r && o.queue.length >= 3 && (!best || o.queue.length > best.queue.length)) best = o; });
        if (best) { pass = best.queue.pop(); stolen = true; r.helped++; if (r.helped === 1) this.log(r.id + " 담당 구역 완료 → " + best.id + " 구역 앞줄 지원 (재배분)", r.id, "rebalance"); }
      }
      if (!pass) {
        r.state = "returning"; r.path = this.returnPath(r); r.wp = 0;
        this.log(r.id + " 청소 끝 · 복귀 명령", r.id, "return");
        return;
      }
      const da = Math.hypot(r.x - pass.a, r.y - pass.y), db = Math.hypot(r.x - pass.b, r.y - pass.y);
      const s = da <= db ? { x: pass.a, y: pass.y } : { x: pass.b, y: pass.y };
      const e = da <= db ? { x: pass.b, y: pass.y } : { x: pass.a, y: pass.y };
      const near = Math.min(da, db) < 1.2;
      r.path = [Object.assign({}, s, { clean: near }), Object.assign({}, e, { clean: true })];
      r.wp = 0;
      r.state = stolen ? "helping" : "cleaning";
    }
    returnAll() {
      if (this.phase !== "running") return;
      this.robots.forEach(r => {
        r.queue = [];
        if (["cleaning", "helping", "transit"].includes(r.state)) { r.state = "returning"; r.path = this.returnPath(r); r.wp = 0; }
        if (r.state === "queued") { r.state = "docked"; r.doneSec = this.t; }
      });
      this.log("관리자: 모두 복귀 명령", null, "admin");
    }
    estop(on) {
      this.stopped = on;
      this.log(on ? "관리자: 긴급 정지 (모든 로봇 정지)" : "관리자: 정지 해제", null, on ? "error" : "admin");
    }
    stamp(x, y) {
      const r = ROBOT_R, i0 = Math.max(0, Math.floor((x - r) / CELL)), i1 = Math.min(NX - 1, Math.floor((x + r) / CELL));
      const j0 = Math.max(0, Math.floor((y - r) / CELL)), j1 = Math.min(NY - 1, Math.floor((y + r) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * NX + i;
        if (this.cov[k] || !this.mask[k]) continue;
        const cx = (i + .5) * CELL, cy = (j + .5) * CELL;
        if ((cx - x) * (cx - x) + (cy - y) * (cy - y) <= r * r) { this.cov[k] = 1; this.covered++; this.newCells.push(k); }
      }
    }
    moveRobot(r, dist) {
      while (dist > 1e-6 && r.wp < r.path.length) {
        const w = r.path[r.wp];
        if (w.lock && this.door !== r.id) {
          if (!this.doorQ.includes(r.id)) this.doorQ.push(r.id);
          if (this.door || this.doorQ[0] !== r.id) {
            if (!r.waitLogged) { r.waitLogged = true; r.prevState = r.state; r.state = "waiting"; this.log(r.id + " 문 앞 대기 · " + (this.door ? this.door + " 통과 중" : this.doorQ[0] + " 다음 차례"), r.id, "door"); }
            return;
          }
          this.door = r.id; this.doorQ.shift();
          if (r.waitLogged) { r.waitLogged = false; r.state = r.prevState; this.log(r.id + " 문 통과 허가", r.id, "door"); }
        }
        const dx = w.x - r.x, dy = w.y - r.y, d = Math.hypot(dx, dy);
        const st = Math.min(d, dist);
        if (d > 1e-6) {
          const ux = dx / d, uy = dy / d; r.hx = ux; r.hy = uy;
          if (w.clean) {
            let done = 0;
            while (done < st) { const k = Math.min(.05, st - done); done += k; r.x += ux * k; r.y += uy * k; this.stamp(r.x, r.y); }
            r.cleanM += st;
          } else { r.x += ux * st; r.y += uy * st; }
        }
        dist -= st;
        if (st >= d - 1e-9) {
          r.x = w.x; r.y = w.y; r.wp++;
          if (w.unlock && this.door === r.id) this.door = null;
        }
      }
      if (r.wp >= r.path.length) this.pathDone(r);
    }
    pathDone(r) {
      if (r.state === "exiting" || r.state === "cleaning" || r.state === "helping") return this.nextPass(r);
      if (r.state === "returning") {
        r.state = "emptying"; r.emptyAt = this.t; r.path = []; r.wp = 0;
        this.log(r.id + " 도크 도착 · 자동 먼지 비움", r.id, "dock");
      }
    }
    step(dt) {
      if (this.phase !== "running" || this.stopped) return;
      this.t += dt;
      this.robots.forEach(r => {
        if (r.state === "docked" || r.state === "done") return;
        if (r.state === "queued") {
          if (this.t >= (this.starts[r.id] || 0)) {
            r.state = "exiting"; r.path = this.exitPath(r); r.wp = 0;
            this.log(r.id + " 출발 명령 (Matter)", r.id, "dispatch");
          } else return;
        }
        if (r.state === "emptying") {
          if (this.t - r.emptyAt > 25) { r.state = "done"; r.doneSec = this.t; this.log(r.id + " 먼지 비움 완료 · 충전", r.id, "done"); }
          return;
        }
        r.activeSec += dt;
        r.battery = Math.max(5, r.battery - this.drain * dt);
        this.moveRobot(r, this.speed * dt);
        r.under = !!S.underChair(r.x, r.y);
      });
      if (this.robots.every(r => r.state === "done" || r.state === "docked") && this.phase === "running" && this.t > 5) {
        this.phase = "done";
        const run = Math.max.apply(null, this.robots.map(r => r.doneSec || 0));
        this.summary = { coverage: this.coverage(), runtimeMin: Math.round(run / 60), areaM2: Math.round(this.covered * CELL * CELL), end: fmtClock(this.startSec + run) };
        this.log("기록 저장 · 청소율 " + Math.round(this.summary.coverage * 100) + "% · " + this.summary.runtimeMin + "분", null, "report");
      }
    }
    coverage() { return this.covered / this.cleanable; }
    zoneProgress(r) {
      const own = r.def.zone; let tot = 0, cov = 0;
      for (let j = Math.floor(own.yFront / CELL) - 3; j < Math.floor(18 / CELL); j++) for (let i = Math.floor(own.x1 / CELL) - 4; i < Math.ceil(own.x2 / CELL) + 4; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const k = j * NX + i; if (!this.mask[k]) continue;
        const x = (i + .5) * CELL; if (x < own.x1 - .4 || x > own.x2 + .4) continue;
        tot++; if (this.cov[k]) cov++;
      }
      return tot ? cov / tot : 0;
    }
    runToEnd(maxSec) {
      if (this.phase === "ready") this.start();
      let n = 0; maxSec = maxSec || 3 * 3600;
      while (this.phase === "running" && this.t < maxSec && n < 200000) { this.step(1); n++; }
    }
  }

  const STATE_KO = { docked: "충전 중", queued: "출발 대기", exiting: "출발", cleaning: "청소 중", helping: "다른 구역 지원", waiting: "문 앞 대기", returning: "복귀 중", emptying: "먼지 비움", done: "충전 중" };

  // 캔버스 뷰
  class SimView {
    constructor(canvas, sim, opts) {
      this.c = canvas; this.sim = sim; this.o = opts || {};
      this.ctx = canvas.getContext("2d");
      this.covCanvas = document.createElement("canvas"); this.covCanvas.width = NX; this.covCanvas.height = NY;
      this.cctx = this.covCanvas.getContext("2d");
      this.img = this.cctx.createImageData(NX, NY);
      this.trails = {};
      this.resize();
      if (global.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }
    resize() {
      const par = this.c.parentElement, cs = getComputedStyle(par);
      const wpx = Math.floor((par.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 360);
      if (wpx === this._w) return; this._w = wpx;
      const extra = 1.7;                          // 복도 높이 (m)
      this.s = wpx / L.W;
      const hpx = (L.D + extra) * this.s;
      const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      this.c.width = Math.round(wpx * dpr); this.c.height = Math.round(hpx * dpr);
      this.c.style.width = wpx + "px"; this.c.style.height = hpx + "px";
      this.dpr = dpr;
      this.bg = document.createElement("canvas"); this.bg.width = this.c.width; this.bg.height = this.c.height;
      const b = this.bg.getContext("2d"); b.scale(dpr, dpr);
      b.fillStyle = "#ffffff"; b.fillRect(0, 0, wpx, hpx);
      S.canvasStatic(b, this.s, { zones: this.o.zones, labels: true, fs: Math.max(9, Math.min(12, this.s * .62)), font: "IBM Plex Sans KR, sans-serif" });
      // 복도·도크
      const s = this.s;
      b.fillStyle = "#f7f4ee"; b.fillRect(0, 18.05 * s, 9.7 * s, 1.55 * s);
      b.strokeStyle = "#1c2633"; b.lineWidth = 1.2; b.strokeRect(0.5, 18.05 * s, 9.7 * s, 1.55 * s);
      b.fillStyle = "#5b6672"; b.font = "500 " + Math.max(9, s * .55) + "px IBM Plex Sans KR, sans-serif"; b.textAlign = "left"; b.textBaseline = "middle";
      b.fillText("복도", .3 * s, 19.0 * s);
      L.robots.forEach(r => {
        b.fillStyle = r.color; b.globalAlpha = .9;
        b.fillRect((r.dock.x - .3) * s, (r.dock.y + .05) * s, .6 * s, .5 * s); b.globalAlpha = 1;
      });
      this.static2 = true;
      this.resetCoverage();
    }
    resetCoverage() {
      this.img = this.cctx.createImageData(NX, NY);
      const cov = this.sim.cov;
      for (let k = 0; k < cov.length; k++) if (cov[k]) this.paint(k);
      this.cctx.putImageData(this.img, 0, 0);
      this.trails = {};
    }
    paint(k) { const d = this.img.data, p = k * 4; d[p] = 74; d[p + 1] = 160; d[p + 2] = 98; d[p + 3] = 150; }
    draw() {
      const sim = this.sim, ctx = this.ctx, s = this.s;
      if (sim.resetFlag) { sim.resetFlag = false; sim.newCells = []; this.resetCoverage(); }
      if (sim.newCells.length) { sim.newCells.forEach(k => this.paint(k)); sim.newCells = []; this.cctx.putImageData(this.img, 0, 0); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.bg, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.covCanvas, 0, 0, L.W * s, L.D * s);
      S.canvasChairs(ctx, s, { colLabels: this.o.colLabels !== false, fs: Math.max(9, Math.min(12, s * .6)), font: "IBM Plex Sans KR, sans-serif" });
      // 벽 + 문
      ctx.strokeStyle = "#1c2633"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, L.W * s - 2, L.D * s - 1);
      ctx.strokeStyle = sim.door ? "#b83a32" : "#ffffff"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(L.door.x1 * s, L.D * s); ctx.lineTo(L.door.x2 * s, L.D * s); ctx.stroke();
      if (this.o.cams) {
        L.cams.forEach(c => { ctx.fillStyle = "#1c2633"; ctx.fillRect(c.x * s - 4, c.y * s - 4, 8, 8); });
      }
      // 로봇
      sim.robots.forEach(r => {
        const x = r.x * s, y = r.y * s, rad = Math.max(5, ROBOT_R * s);
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = r.color; ctx.globalAlpha = r.under ? .55 : 1; ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
        if (!["docked", "done", "queued"].includes(r.state)) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r.hx * rad, y + r.hy * rad); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.font = "700 " + Math.max(10, s * .6) + "px IBM Plex Sans KR, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
        const lx = x + rad + 2, ly = y - rad + 2;
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.strokeText(r.id, lx, ly);
        ctx.fillStyle = r.color; ctx.fillText(r.id, lx, ly);
        if (r.state === "waiting") {
          ctx.fillStyle = "#b83a32"; ctx.font = "700 " + Math.max(9, s * .5) + "px IBM Plex Sans KR, sans-serif"; ctx.textBaseline = "top";
          ctx.fillText("대기", x - rad, y + rad + 2);
        }
      });
    }
  }

  // 재생기: requestAnimationFrame 루프 (화면 밖이면 멈춤)
  class Player {
    constructor(sim, view, opts) {
      this.sim = sim; this.view = view; this.o = opts || {};
      this.rate = this.o.rate || 60; this.playing = !!this.o.autoplay; this.last = null; this.visible = true;
      this.onTick = this.o.onTick || null; this.onEnd = this.o.onEnd || null;
      if (global.IntersectionObserver) new IntersectionObserver(es => { this.visible = es[0].isIntersecting; this.last = null; }).observe(view.c);
      const reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce && this.o.reduceToEnd) { sim.runToEnd(); this.playing = false; }
      this.endWait = 0;
      requestAnimationFrame(t => this.frame(t));
    }
    frame(ts) {
      if (this.playing && this.visible) {
        if (this.last != null) {
          let dt = Math.min(.05, (ts - this.last) / 1000) * this.rate;
          if (this.sim.phase === "ready" && this.o.autostart !== false) this.sim.start();
          while (dt > 0) { const k = Math.min(dt, 2); this.sim.step(k); dt -= k; }
          if (this.sim.phase === "done") {
            this.endWait += (ts - this.last) / 1000;
            if (this.o.loop && this.endWait > (this.o.loopPause || 6)) { this.endWait = 0; this.sim.reset(); this.sim.start(); if (this.onEnd) this.onEnd("restart"); }
          }
        }
        this.last = ts;
      } else this.last = null;
      this.view.draw();
      if (this.onTick) this.onTick();
      requestAnimationFrame(t => this.frame(t));
    }
  }

  global.CleaningSim = CleaningSim;
  global.SimView = SimView;
  global.SimPlayer = Player;
  global.SimUtil = { fmtClock, STATE_KO, CELL, NX, NY };
})(window);
