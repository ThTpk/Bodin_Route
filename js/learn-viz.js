/*
 * learn-viz.js — ตัวจำลองการทำงานของ Dijkstra และ A* Search แบบทีละขั้น
 * ---------------------------------------------------------------
 * ใช้ในหน้า dijkstra.html และ astar.html
 *
 * แนวคิด
 *   1) รันอัลกอริทึมจริงบนกราฟตัวอย่าง แล้ว "บันทึกภาพนิ่ง" (snapshot)
 *      ของสถานะทุกครั้งที่มีเหตุการณ์สำคัญ เช่น ดึงโหนดออกจากคิว หรือ relax เส้นเชื่อม
 *   2) ผู้ใช้เลื่อนไปมาระหว่างภาพนิ่งเหล่านั้นได้อิสระ (เดินหน้า/ถอยหลัง/เล่นอัตโนมัติ)
 *   3) แต่ละเหตุการณ์ผูกกับหมายเลขบรรทัดของ pseudo code จึงไฮไลต์บรรทัดที่กำลังทำงานได้
 *
 * กราฟตัวอย่างเป็นแผนผังโรงเรียนแบบย่อ 11 โหนด 16 เส้นเชื่อม
 * น้ำหนักเส้นเชื่อม = ระยะเดินจริง (เมตร) ซึ่ง "ไม่น้อยกว่า" ระยะเส้นตรงเสมอ
 * ทำให้ระยะเส้นตรงใช้เป็น heuristic ของ A* ได้อย่างปลอดภัย (admissible)
 */

'use strict';

(function () {

  /* =============================================================
   * ข้อมูลกราฟตัวอย่าง
   * ============================================================= */
  const NODES = [
    { id: 'S', name: 'ประตูโรงเรียน', x: 110, y: 135 },
    { id: 'P', name: 'ลานจอดรถ',      x: 10,  y: 60  },
    { id: 'Q', name: 'โรงอาหาร',       x: 10,  y: 210 },
    { id: 'A', name: 'อาคาร 1',        x: 210, y: 45  },
    { id: 'B', name: 'สนามกีฬา',       x: 210, y: 225 },
    { id: 'C', name: 'อาคาร 2',        x: 330, y: 40  },
    { id: 'D', name: 'ลานกลาง',        x: 330, y: 135 },
    { id: 'E', name: 'หอประชุม',       x: 330, y: 235 },
    { id: 'F', name: 'อาคาร 3',        x: 450, y: 60  },
    { id: 'G', name: 'โรงยิม',         x: 450, y: 210 },
    { id: 'H', name: 'ห้องสมุด',       x: 560, y: 130 },
  ];

  const EDGES = [
    { a: 'S', b: 'P', w: 130 },
    { a: 'S', b: 'Q', w: 130 },
    { a: 'P', b: 'Q', w: 155 },
    { a: 'S', b: 'A', w: 140 },
    { a: 'S', b: 'B', w: 140 },
    { a: 'S', b: 'D', w: 300 },
    { a: 'A', b: 'C', w: 125 },
    { a: 'A', b: 'D', w: 165 },
    { a: 'B', b: 'E', w: 125 },
    { a: 'B', b: 'D', w: 160 },
    { a: 'C', b: 'F', w: 125 },
    { a: 'D', b: 'F', w: 150 },
    { a: 'D', b: 'G', w: 150 },
    { a: 'E', b: 'G', w: 130 },
    { a: 'F', b: 'H', w: 135 },
    { a: 'G', b: 'H', w: 140 },
  ];

  const START = 'S';
  const GOAL = 'H';

  const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

  const ADJ = new Map(NODES.map((n) => [n.id, []]));
  EDGES.forEach((e, i) => {
    ADJ.get(e.a).push({ to: e.b, w: e.w, index: i });
    ADJ.get(e.b).push({ to: e.a, w: e.w, index: i });
  });

  /** ระยะเส้นตรงระหว่างสองโหนด ปัดเป็นจำนวนเต็ม — ใช้เป็น heuristic ของ A* */
  function straightLine(fromId, toId) {
    const a = NODE_BY_ID.get(fromId);
    const b = NODE_BY_ID.get(toId);
    return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
  }

  /* =============================================================
   * บรรทัดของ pseudo code ที่ตรงกับแต่ละเหตุการณ์
   * (ต้องตรงกับลำดับบรรทัดใน dijkstra.html / astar.html)
   * ============================================================= */
  const LINES = {
    dijkstra: {
      init: [3, 4], push: [5], loop: [6], pop: [7], goal: [8], settle: [9],
      skip: [11], relax: [12, 13], update: [14, 15, 16], done: [17],
    },
    astar: {
      init: [2, 3], push: [4], loop: [6], pop: [7], goal: [8], settle: [9],
      skip: [11], relax: [12, 13], update: [14, 15, 16, 17], done: [8],
    },
  };

  /* =============================================================
   * คิวลำดับความสำคัญอย่างง่าย (อาร์เรย์ + อัปเดตค่าเดิมได้)
   * ใช้แบบตรงไปตรงมาเพื่อให้แสดงเนื้อในคิวบนหน้าจอได้ง่าย
   * ของจริงในเว็บนำทางใช้ binary heap (js/graph.js)
   * ============================================================= */
  class SimpleQueue {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    /** ใส่โหนดใหม่ หรือลดค่าคีย์ของโหนดที่มีอยู่แล้ว */
    put(id, key) {
      const found = this.items.find((it) => it.id === id);
      if (found) { found.key = key; return false; }
      this.items.push({ id, key });
      return true;
    }
    /** ดึงโหนดที่คีย์น้อยที่สุดออก (ถ้าเท่ากันใช้ลำดับตัวอักษรเพื่อให้ผลคงที่) */
    take() {
      let best = 0;
      for (let i = 1; i < this.items.length; i += 1) {
        const it = this.items[i];
        const b = this.items[best];
        if (it.key < b.key || (it.key === b.key && it.id < b.id)) best = i;
      }
      return this.items.splice(best, 1)[0];
    }
    snapshot() {
      return this.items
        .map((it) => ({ id: it.id, key: it.key }))
        .sort((x, y) => x.key - y.key || (x.id < y.id ? -1 : 1));
    }
  }

  /* =============================================================
   * รันอัลกอริทึมพร้อมบันทึกทุกขั้นตอน
   * mode = 'dijkstra' | 'astar'
   * ============================================================= */
  function record(mode, startId, goalId) {
    const useH = mode === 'astar';
    const L = LINES[mode];
    const h = (id) => (useH ? straightLine(id, goalId) : 0);

    const g = new Map([[startId, 0]]);
    const prev = new Map();
    const settled = new Set();
    const queue = new SimpleQueue();
    const events = [];

    const nm = (id) => `<b>${id}</b> (${NODE_BY_ID.get(id).name})`;
    const val = (id) => (g.has(id) ? g.get(id) : '∞');

    const snap = (extra) => Object.assign({
      g: new Map(g),
      prev: new Map(prev),
      settled: new Set(settled),
      queue: queue.snapshot(),
      current: null,
      activeEdge: null,
      path: null,
    }, extra);

    const push = (kind, lines, text, extra) => {
      events.push({ kind, lines, text, state: snap(extra) });
    };

    push('init', L.init,
      `เริ่มต้น: ระยะจากจุดเริ่มต้นของทุกโหนดตั้งเป็น <code>∞</code> (ยังไปไม่ถึง) ` +
      `ยกเว้น ${nm(startId)} ที่เป็น <code>0</code> เพราะเรายืนอยู่ตรงนั้นพอดี`);

    queue.put(startId, useH ? h(startId) : 0);
    push('push', L.push,
      useH
        ? `ใส่ ${nm(startId)} ลงคิว ด้วยค่า <code>f = g + h = 0 + ${h(startId)} = ${h(startId)}</code>`
        : `ใส่ ${nm(startId)} ลงคิว ด้วยค่าระยะ <code>0</code>`,
      { current: startId });

    let reached = false;

    while (queue.size > 0) {
      const top = queue.take();
      const u = top.id;

      push('pop', L.pop,
        `ดึง ${nm(u)} ออกจากคิว เพราะมีค่า <code>${useH ? 'f' : 'ระยะ'} = ${top.key}</code> น้อยที่สุด` +
        (u === startId ? '' : ` — ระยะจากจุดเริ่มต้นถึงที่นี่คือ <code>${val(u)}</code> เมตร`),
        { current: u });

      if (u === goalId) {
        reached = true;
        push('goal', L.goal,
          `${nm(u)} คือ<b>เป้าหมาย</b> — เมื่อเป้าหมายถูกดึงออกจากคิว แปลว่าไม่มีทางไหนสั้นกว่านี้อีกแล้ว จึงหยุดค้นหาได้ทันที`,
          { current: u });
        break;
      }

      settled.add(u);
      push('settle', L.settle,
        `ปิด ${nm(u)} (settled) — ค่าระยะ <code>${val(u)}</code> ของโหนดนี้ถือว่า<span class="ok">สั้นที่สุดแน่นอนแล้ว</span> ไม่ต้องกลับมาแก้อีก`,
        { current: u });

      for (const link of ADJ.get(u)) {
        const v = link.to;

        if (settled.has(v)) {
          push('skip', L.skip,
            `เพื่อนบ้าน ${nm(v)} ถูกปิดไปแล้ว <span class="no">ข้าม</span>`,
            { current: u, activeEdge: [u, v] });
          continue;
        }

        const alt = g.get(u) + link.w;
        const old = g.has(v) ? g.get(v) : Infinity;

        if (alt < old) {
          g.set(v, alt);
          prev.set(v, u);
          const isNew = queue.put(v, useH ? alt + h(v) : alt);
          const gLine = `<code>${g.get(u)} + ${link.w} = ${alt}</code> ` +
            `น้อยกว่าค่าเดิม <code>${old === Infinity ? '∞' : old}</code> → <span class="ok">อัปเดต</span>`;
          push('update', L.update,
            useH
              ? `ลองเดินจาก ${nm(u)} ไป ${nm(v)}: ${gLine} เป็น <code>g = ${alt}</code>, ` +
                `บันทึกว่ามาจาก <b>${u}</b> แล้วคิดค่าจัดลำดับ <code>f = ${alt} + ${h(v)} = ${alt + h(v)}</code> ` +
                `(${h(v)} คือระยะเส้นตรงจาก <b>${v}</b> ถึงเป้าหมาย) ${isNew ? 'ใส่ลงคิว' : 'อัปเดตค่าในคิว'}`
              : `ลองเดินจาก ${nm(u)} ไป ${nm(v)}: ${gLine} เมตร ` +
                `บันทึกว่ามาจาก <b>${u}</b> แล้ว${isNew ? 'ใส่ลงคิว' : 'อัปเดตค่าในคิว'}`,
            { current: u, activeEdge: [u, v] });
        } else {
          push('relax', L.relax,
            `ลองเดินจาก ${nm(u)} ไป ${nm(v)}: <code>${g.get(u)} + ${link.w} = ${alt}</code> ` +
            `<span class="no">ไม่ดีกว่า</span>ค่าเดิม <code>${old}</code> → ไม่เปลี่ยนอะไร`,
            { current: u, activeEdge: [u, v] });
        }
      }
    }

    /* ---- ย้อนรอยเส้นทางจาก prev ---- */
    let path = null;
    let cost = null;
    if (reached) {
      path = [goalId];
      while (prev.has(path[path.length - 1])) path.push(prev.get(path[path.length - 1]));
      path.reverse();
      cost = g.get(goalId);
    }

    if (reached) {
      push('done', LINES[mode].done,
        `เสร็จแล้ว — ย้อนรอยจากตาราง "มาจาก" ได้เส้นทาง <b>${path.join(' → ')}</b> ` +
        `รวม <b>${cost} เมตร</b> โดยระหว่างทางปิดโหนดไปทั้งหมด <b>${settled.size + 1}</b> โหนด ` +
        `(รวมเป้าหมาย) จาก ${NODES.length} โหนด`,
        { path, current: null });
    } else {
      push('done', LINES[mode].done, 'คิวหมดแล้วแต่ยังไปไม่ถึงเป้าหมาย แปลว่ากราฟไม่เชื่อมต่อกัน', {});
    }

    return {
      events,
      path,
      cost,
      // จำนวนโหนดที่ถูกดึงออกจากคิว = ปริมาณงานที่อัลกอริทึมทำจริง
      expanded: settled.size + (reached ? 1 : 0),
      startId,
      goalId,
    };
  }

  /* =============================================================
   * ตัวช่วยสร้าง SVG
   * ============================================================= */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  /* =============================================================
   * ตัวจำลอง
   * ============================================================= */
  class Visualizer {
    constructor(root) {
      this.root = root;
      this.mode = root.dataset.mode === 'astar' ? 'astar' : 'dijkstra';
      this.useH = this.mode === 'astar';
      this.startId = START;
      this.goalId = GOAL;
      this.index = 0;
      this.timer = null;
      this.speed = 1100;

      this.pcList = root.querySelector('.pc');   // pseudo code ที่เขียนไว้ใน HTML
      this.buildShell();
      this.buildScene();
      this.load();

      document.addEventListener('keydown', (evt) => {
        if (!this.root.contains(document.activeElement)) return;
        if (evt.key === 'ArrowRight') { evt.preventDefault(); this.step(1); }
        if (evt.key === 'ArrowLeft') { evt.preventDefault(); this.step(-1); }
      });
    }

    /* ---- โครง HTML ของตัวจำลอง ---- */
    buildShell() {
      const root = this.root;
      const pc = this.pcList;
      root.innerHTML = '';

      const stage = document.createElement('div');
      stage.className = 'viz-stage';
      this.svg = svgEl('svg', {
        class: 'viz-svg',
        viewBox: '-46 -20 660 302',
        role: 'img',
        'aria-label': 'ภาพจำลองการค้นหาเส้นทางบนกราฟตัวอย่าง',
      });
      stage.appendChild(this.svg);
      root.appendChild(stage);

      const legend = document.createElement('div');
      legend.className = 'vz-legend';
      legend.innerHTML =
        '<span><i class="vz-dot"></i> ยังไม่พบ</span>' +
        '<span><i class="vz-dot open"></i> อยู่ในคิว (รู้ระยะแล้วแต่ยังไม่ยืนยัน)</span>' +
        '<span><i class="vz-dot settled"></i> ปิดแล้ว (ระยะสั้นที่สุดยืนยันแล้ว)</span>' +
        '<span><i class="vz-dot current"></i> กำลังพิจารณา</span>' +
        '<span><i class="vz-bar"></i> เส้นทางคำตอบ</span>';
      root.appendChild(legend);

      const narrate = document.createElement('div');
      narrate.className = 'viz-narrate';
      narrate.innerHTML = '<span class="viz-stepno"></span><p class="viz-text"></p>';
      root.appendChild(narrate);
      this.stepNoEl = narrate.querySelector('.viz-stepno');
      this.textEl = narrate.querySelector('.viz-text');

      const controls = document.createElement('div');
      controls.className = 'viz-controls';
      controls.innerHTML =
        '<button type="button" data-act="first" title="กลับไปขั้นแรก">⏮ เริ่มใหม่</button>' +
        '<button type="button" data-act="prev">◀ ก่อนหน้า</button>' +
        '<button type="button" class="primary" data-act="play">▶ เล่นอัตโนมัติ</button>' +
        '<button type="button" data-act="next">ถัดไป ▶</button>' +
        '<button type="button" data-act="last" title="ข้ามไปผลลัพธ์">⏭ ผลลัพธ์</button>' +
        '<span class="spacer"></span>' +
        '<label>ความเร็ว <select data-act="speed">' +
        '<option value="1800">ช้า</option>' +
        '<option value="1100" selected>ปกติ</option>' +
        '<option value="550">เร็ว</option>' +
        '</select></label>';
      root.appendChild(controls);
      this.controls = controls;

      controls.addEventListener('click', (evt) => {
        const btn = evt.target.closest('button');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'first') { this.pause(); this.go(0); }
        if (act === 'prev') { this.pause(); this.step(-1); }
        if (act === 'next') { this.pause(); this.step(1); }
        if (act === 'last') { this.pause(); this.go(this.events.length - 1); }
        if (act === 'play') this.toggle();
      });
      controls.querySelector('[data-act="speed"]').addEventListener('change', (evt) => {
        this.speed = Number(evt.target.value);
        if (this.timer) { this.pause(); this.play(); }
      });

      const panels = document.createElement('div');
      panels.className = 'viz-panels';
      panels.innerHTML =
        '<div class="viz-panel"><h5>Pseudo code (แถบเหลือง = บรรทัดที่กำลังทำงาน)</h5>' +
        '<div class="viz-panel-body" data-slot="pc"></div></div>' +
        '<div class="viz-panel"><h5>ตารางค่าของทุกโหนด</h5>' +
        '<div class="viz-panel-body" data-slot="table"></div></div>' +
        '<div class="viz-panel"><h5>คิวลำดับความสำคัญ &amp; บันทึกการทำงาน</h5>' +
        '<div class="viz-panel-body"><div class="vz-queue" data-slot="queue"></div>' +
        '<ul class="vz-log" data-slot="log"></ul></div></div>';
      root.appendChild(panels);

      panels.querySelector('[data-slot="pc"]').appendChild(pc);
      this.tableSlot = panels.querySelector('[data-slot="table"]');
      this.queueSlot = panels.querySelector('[data-slot="queue"]');
      this.logSlot = panels.querySelector('[data-slot="log"]');
      this.pcLines = [...pc.children];
    }

    /* ---- วาดโหนดและเส้นเชื่อมครั้งเดียว แล้วค่อยเปลี่ยนคลาสทีหลัง ---- */
    buildScene() {
      const svg = this.svg;
      const gEdges = svgEl('g', {});
      const gLabels = svgEl('g', {});
      const gHint = svgEl('g', {});
      const gNodes = svgEl('g', {});
      svg.appendChild(gEdges);
      svg.appendChild(gLabels);
      svg.appendChild(gHint);
      svg.appendChild(gNodes);

      this.edgeEls = EDGES.map((e) => {
        const a = NODE_BY_ID.get(e.a);
        const b = NODE_BY_ID.get(e.b);
        const line = svgEl('line', { class: 'vz-edge', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        gEdges.appendChild(line);
        const label = svgEl('text', {
          class: 'vz-wlabel',
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2 - 3,
          'text-anchor': 'middle',
        });
        label.textContent = e.w;
        gLabels.appendChild(label);
        return line;
      });

      /* เส้นประแสดงค่าประมาณ h ของ A* */
      this.hLine = svgEl('line', { class: 'vz-hline', x1: 0, y1: 0, x2: 0, y2: 0, opacity: 0 });
      this.hLabel = svgEl('text', { class: 'vz-hlabel', 'text-anchor': 'middle', opacity: 0 });
      gHint.appendChild(this.hLine);
      gHint.appendChild(this.hLabel);

      this.nodeEls = new Map();
      NODES.forEach((n) => {
        const group = svgEl('g', { class: 'vz-node', transform: `translate(${n.x} ${n.y})`, tabindex: '0' });
        const ring = svgEl('circle', { class: 'vz-ring', r: 20, cx: 0, cy: 0 });
        const body = svgEl('circle', { class: 'vz-body', r: 19, cx: 0, cy: 0 });
        const id = svgEl('text', { class: 'vz-id', x: 0, y: 1 });
        id.textContent = n.id;
        const cost = svgEl('text', { class: 'vz-cost', x: 0, y: -25 });
        const name = svgEl('text', { class: 'vz-name', x: 0, y: 35 });
        name.textContent = n.name;
        const pinBg = svgEl('circle', { class: 'vz-pin-bg', r: 9, cx: 15, cy: -14, opacity: 0 });
        const pin = svgEl('text', { class: 'vz-pin', x: 15, y: -14, opacity: 0 });
        group.appendChild(ring);
        group.appendChild(body);
        group.appendChild(id);
        group.appendChild(cost);
        group.appendChild(name);
        group.appendChild(pinBg);
        group.appendChild(pin);
        group.addEventListener('click', () => this.setGoal(n.id));
        group.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); this.setGoal(n.id); }
        });
        gNodes.appendChild(group);
        this.nodeEls.set(n.id, { group, cost, pin, pinBg });
      });
    }

    /* ---- คำนวณเหตุการณ์ใหม่ทั้งชุด ---- */
    load() {
      this.result = record(this.mode, this.startId, this.goalId);
      this.events = this.result.events;
      this.buildLog();
      this.go(0);
    }

    setGoal(id) {
      if (id === this.startId || id === this.goalId) return;
      this.pause();
      this.goalId = id;
      this.load();
    }

    buildLog() {
      this.logSlot.innerHTML = '';
      this.logEls = this.events.map((ev, i) => {
        const li = document.createElement('li');
        li.className = ev.kind === 'pop' ? 'pop' : '';
        li.innerHTML = `${i + 1}. ${ev.text.replace(/<[^>]+>/g, '')}`;
        this.logSlot.appendChild(li);
        return li;
      });
    }

    /* ---- ควบคุมการเล่น ---- */
    go(i) {
      this.index = Math.max(0, Math.min(this.events.length - 1, i));
      this.render();
      if (this.index >= this.events.length - 1) this.pause();
    }

    step(delta) { this.go(this.index + delta); }

    play() {
      if (this.index >= this.events.length - 1) this.index = 0;
      this.timer = setInterval(() => this.step(1), this.speed);
      this.controls.querySelector('[data-act="play"]').textContent = '⏸ หยุดชั่วคราว';
    }

    pause() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.controls.querySelector('[data-act="play"]').textContent = '▶ เล่นอัตโนมัติ';
    }

    toggle() { if (this.timer) this.pause(); else this.play(); }

    /* ---- วาดสถานะปัจจุบัน ---- */
    render() {
      const ev = this.events[this.index];
      const st = ev.state;
      const useH = this.useH;
      const goalId = this.goalId;
      const pathSet = new Set(st.path || []);
      const pathEdges = new Set();
      if (st.path) {
        for (let i = 0; i + 1 < st.path.length; i += 1) {
          pathEdges.add([st.path[i], st.path[i + 1]].sort().join('-'));
        }
      }

      /* เส้นเชื่อม */
      EDGES.forEach((e, i) => {
        const el = this.edgeEls[i];
        const key = [e.a, e.b].sort().join('-');
        const isTree = st.prev.get(e.a) === e.b || st.prev.get(e.b) === e.a;
        const isActive = st.activeEdge
          && [st.activeEdge[0], st.activeEdge[1]].sort().join('-') === key;
        el.setAttribute('class', 'vz-edge'
          + (isTree ? ' is-tree' : '')
          + (isActive ? ' is-active' : '')
          + (pathEdges.has(key) ? ' is-path' : ''));
      });

      /* โหนด */
      NODES.forEach((n) => {
        const refs = this.nodeEls.get(n.id);
        const known = st.g.has(n.id);
        const inQueue = st.queue.some((q) => q.id === n.id);
        let cls = 'vz-node';
        if (st.settled.has(n.id) || (st.path && pathSet.has(n.id) && n.id === goalId)) cls += ' is-settled';
        else if (inQueue || (n.id === st.current && known)) cls += ' is-open';
        if (n.id === st.current) cls += ' is-current';
        if (pathSet.has(n.id)) cls += ' is-path';
        refs.group.setAttribute('class', cls);

        if (!known) {
          refs.cost.textContent = '∞';
        } else if (useH) {
          refs.cost.textContent = `f ${st.g.get(n.id) + straightLine(n.id, goalId)}`;
        } else {
          refs.cost.textContent = st.g.get(n.id);
        }

        const isStart = n.id === this.startId;
        const isGoal = n.id === goalId;
        refs.pin.textContent = isStart ? 'A' : (isGoal ? 'B' : '');
        refs.pin.setAttribute('opacity', isStart || isGoal ? '1' : '0');
        refs.pinBg.setAttribute('opacity', isStart || isGoal ? '1' : '0');
        refs.pinBg.setAttribute('fill', isStart ? '#16a34a' : '#f97316');
      });

      /* เส้นประของ heuristic (เฉพาะ A*) */
      if (useH && st.current && st.current !== goalId) {
        const a = NODE_BY_ID.get(st.current);
        const b = NODE_BY_ID.get(goalId);
        this.hLine.setAttribute('x1', a.x);
        this.hLine.setAttribute('y1', a.y);
        this.hLine.setAttribute('x2', b.x);
        this.hLine.setAttribute('y2', b.y);
        this.hLine.setAttribute('opacity', '1');
        this.hLabel.setAttribute('x', (a.x + b.x) / 2);
        this.hLabel.setAttribute('y', (a.y + b.y) / 2 + 16);
        this.hLabel.textContent = `h = ${straightLine(st.current, goalId)}`;
        this.hLabel.setAttribute('opacity', '1');
      } else {
        this.hLine.setAttribute('opacity', '0');
        this.hLabel.setAttribute('opacity', '0');
      }

      /* คำบรรยาย */
      this.stepNoEl.textContent = `ขั้นที่ ${this.index + 1}/${this.events.length}`;
      this.textEl.innerHTML = ev.text;

      /* pseudo code */
      const hl = new Set(ev.lines);
      this.pcLines.forEach((li, i) => {
        li.classList.toggle('is-hl', hl.has(i + 1));
      });

      /* ตาราง */
      this.renderTable(st);

      /* คิว */
      this.queueSlot.innerHTML = '';
      if (st.queue.length === 0) {
        const chip = document.createElement('span');
        chip.className = 'vz-chip empty';
        chip.textContent = 'คิวว่าง';
        this.queueSlot.appendChild(chip);
      } else {
        st.queue.forEach((q, i) => {
          const chip = document.createElement('span');
          chip.className = 'vz-chip' + (i === 0 ? ' is-min' : '');
          chip.textContent = `${q.id} : ${q.key}`;
          chip.title = i === 0 ? 'ค่าน้อยที่สุด — จะถูกดึงออกเป็นตัวถัดไป' : '';
          this.queueSlot.appendChild(chip);
        });
      }

      /* บันทึก */
      this.logEls.forEach((li, i) => li.classList.toggle('is-now', i === this.index));
      const now = this.logEls[this.index];
      if (now) now.scrollIntoView({ block: 'nearest' });

      /* ปุ่ม */
      this.controls.querySelector('[data-act="prev"]').disabled = this.index === 0;
      this.controls.querySelector('[data-act="first"]').disabled = this.index === 0;
      const atEnd = this.index === this.events.length - 1;
      this.controls.querySelector('[data-act="next"]').disabled = atEnd;
      this.controls.querySelector('[data-act="last"]').disabled = atEnd;
    }

    renderTable(st) {
      const useH = this.useH;
      const goalId = this.goalId;
      const head = useH
        ? '<tr><th>โหนด</th><th class="num">g</th><th class="num">h</th><th class="num">f</th><th>มาจาก</th></tr>'
        : '<tr><th>โหนด</th><th class="num">ระยะ</th><th>มาจาก</th><th>สถานะ</th></tr>';
      const rows = NODES.map((n) => {
        const known = st.g.has(n.id);
        const gv = known ? st.g.get(n.id) : '∞';
        const hv = straightLine(n.id, goalId);
        const fv = known ? st.g.get(n.id) + hv : '∞';
        const from = st.prev.has(n.id) ? st.prev.get(n.id) : '–';
        let cls = 'is-unseen';
        let status = 'ยังไม่พบ';
        if (st.settled.has(n.id)) { cls = 'is-settled'; status = 'ปิดแล้ว'; }
        else if (st.queue.some((q) => q.id === n.id)) { cls = 'is-open'; status = 'อยู่ในคิว'; }
        else if (n.id === st.current && known) { cls = 'is-open'; status = 'กำลังพิจารณา'; }
        if (n.id === st.current) cls += ' is-current';
        return useH
          ? `<tr class="${cls}"><td>${n.id}</td><td class="num">${gv}</td>` +
            `<td class="num">${hv}</td><td class="num">${fv}</td><td>${from}</td></tr>`
          : `<tr class="${cls}"><td>${n.id}</td><td class="num">${gv}</td>` +
            `<td>${from}</td><td>${status}</td></tr>`;
      }).join('');
      this.tableSlot.innerHTML = `<table class="vz-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }
  }

  /* =============================================================
   * เติมตัวเลขสถิติลงในหน้า ผ่านแอตทริบิวต์ data-stat
   * ============================================================= */
  function applyStats() {
    const d = record('dijkstra', START, GOAL);
    const a = record('astar', START, GOAL);
    const map = {
      'dijkstra-expanded': d.expanded,
      'astar-expanded': a.expanded,
      'dijkstra-steps': d.events.length,
      'astar-steps': a.events.length,
      'total-nodes': NODES.length,
      'total-edges': EDGES.length,
      'cost': d.cost,
      'path': d.path.join(' → '),
      'saved-percent': Math.round((1 - a.expanded / d.expanded) * 100),
    };
    document.querySelectorAll('[data-stat]').forEach((el) => {
      const key = el.dataset.stat;
      if (key in map) el.textContent = map[key];
    });
  }

  window.LearnViz = {
    NODES, EDGES, START, GOAL, record, straightLine,
    init() {
      document.querySelectorAll('.viz[data-mode]').forEach((el) => new Visualizer(el));
      applyStats();
    },
  };

  document.addEventListener('DOMContentLoaded', () => window.LearnViz.init());
}());
