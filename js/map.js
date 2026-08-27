/*
 * map.js — วาดแผนที่โรงเรียนด้วย SVG (ผังพื้นจริง + เลื่อน/ซูม)
 * ---------------------------------------------------------------
 * แผนที่เป็นผังมองจากด้านบน หน่วยพิกัดเป็นเมตร (1 หน่วย SVG = 1 เมตร)
 *
 * ลำดับการวาดจากล่างขึ้นบน
 *   ground    พื้นโรงเรียน
 *   areas     สนาม ลานจอดรถ สวน สระว่ายน้ำ
 *   paths     ทางเดินกลางแจ้ง (วาดจากเส้นเชื่อมชนิด outdoor)
 *   shells    เงาอาคารทุกหลัง (อาคารที่ไม่มีชั้นที่เลือกอยู่จะเห็นแค่ชั้นนี้)
 *   rooms     ผังพื้นของชั้นที่เลือก — ห้อง ผนัง ประตู บันได
 *   edges     โครงสร้างกราฟ (เปิด/ปิดได้)
 *   route     เส้นทางที่ค้นหา
 *   nodes     ไอคอนและป้ายชื่อ
 *   markers   หมุดต้นทาง/ปลายทาง
 */

'use strict';

const NS = 'http://www.w3.org/2000/svg';

/** ระยะขอบรอบผัง (เมตร) เพื่อไม่ให้อาคารริมสุดชิดขอบจอ */
const MAP_PADDING = 16;

/**
 * สี สัญลักษณ์ และสีพื้นห้องของแต่ละประเภทโหนด
 * roomFill ใช้เป็นสีพื้นห้องบนผังพื้น จึงเลือกโทนอ่อนเพื่อให้เส้นทางสีส้มเด่น
 */
const TYPE_STYLE = {
  classroom:    { color: '#2563eb', glyph: '',    label: 'ห้องเรียน',       roomFill: 'room-plain' },
  lab:          { color: '#0d9488', glyph: '🧪', label: 'ห้องปฏิบัติการ',  roomFill: 'room-lab' },
  computer_lab: { color: '#0891b2', glyph: '💻', label: 'ห้องคอมพิวเตอร์', roomFill: 'room-lab' },
  teacher_room: { color: '#c2410c', glyph: '🧑‍🏫', label: 'ห้องพักครู',   roomFill: 'room-staff' },
  office:       { color: '#b91c1c', glyph: '🏢', label: 'ห้องสำนักงาน',    roomFill: 'room-staff' },
  library:      { color: '#7c3aed', glyph: '📚', label: 'ห้องสมุด',        roomFill: 'room-special' },
  toilet:       { color: '#0284c7', glyph: '🚻', label: 'ห้องน้ำ',         roomFill: 'room-toilet' },
  health_room:  { color: '#dc2626', glyph: '🏥', label: 'ห้องพยาบาล',      roomFill: 'room-care' },
  canteen:      { color: '#ea580c', glyph: '🍽️', label: 'โรงอาหาร',       roomFill: 'room-food' },
  shop:         { color: '#d97706', glyph: '🛒', label: 'ร้านค้า',         roomFill: 'room-food' },
  meeting:      { color: '#9333ea', glyph: '🗣️', label: 'ห้องประชุม',     roomFill: 'room-special' },
  activity:     { color: '#db2777', glyph: '🎭', label: 'ห้องกิจกรรม',     roomFill: 'room-special' },
  stairs:       { color: '#475569', glyph: '🪜', label: 'บันได',           roomFill: 'room-service' },
  elevator:     { color: '#475569', glyph: '🛗', label: 'ลิฟต์',           roomFill: 'room-service' },
  entrance:     { color: '#059669', glyph: '🚪', label: 'ทางเข้าอาคาร' },
  gate:         { color: '#16a34a', glyph: '🚧', label: 'ประตูโรงเรียน' },
  landmark:     { color: '#eab308', glyph: '🚩', label: 'จุดสังเกต' },
  sport:        { color: '#059669', glyph: '🏃', label: 'สนามกีฬา' },
  corridor:     { color: '#94a3b8', glyph: '',   label: 'ทางเดิน' },
  junction:     { color: '#94a3b8', glyph: '',   label: 'ทางแยก' },
};

/** ชนิดพื้นที่กลางแจ้ง -> คลาส CSS */
const AREA_CLASS = {
  sport: 'area-sport',
  yard: 'area-yard',
  roof: 'area-roof',
  parking: 'area-parking',
  green: 'area-green',
  pool: 'area-pool',
};

/** ประเภทที่เป็นโครงสร้างภายในของกราฟ ไม่ต้องมีไอคอน */
const STRUCTURAL = new Set(['corridor', 'junction']);

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  });
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * ย่อชื่อห้องให้พอดีกับกล่องบนผังพื้น
 * กล่องห้องกว้างราว 11 เมตร ที่ขนาดตัวอักษรปกติจึงใส่ได้ราว 8 ตัวอักษร
 */
function shortLabel(node) {
  const name = node.name;
  switch (node.type) {
    case 'stairs': {
      const tag = name.match(/บันได\s*([AB])/);
      return tag ? `บันได ${tag[1]}` : 'บันได';
    }
    case 'elevator': return 'ลิฟต์';
    case 'toilet':
      if (name.includes('ชาย')) return 'ห้องน้ำ ช';
      if (name.includes('หญิง')) return 'ห้องน้ำ ญ';
      return 'ห้องน้ำ';
    case 'teacher_room': return 'พักครู';
    case 'health_room': return 'พยาบาล';
    case 'canteen': return 'โรงอาหาร';
    case 'library': return 'ห้องสมุด';
    case 'shop': return 'ร้านค้า';
    default:
      // ตัดคำนำหน้าที่ยาวและไม่ได้ช่วยแยกความต่างออก
      return name
        .replace(/^ห้องปฏิบัติการ\s*/, '')
        .replace(/^ห้องกลุ่ม/, '')
        .replace(/^ห้อง\s*/, '');
  }
}

/** ความกว้างเฉลี่ยของอักษรไทยเทียบกับขนาดตัวอักษร ใช้ประมาณว่าข้อความยาวเท่าไร */
const CHAR_RATIO = 0.58;

/** ขนาดตัวอักษรที่ลองไล่จากใหญ่ไปเล็ก */
const LABEL_SIZES = [2.7, 2.15, 1.75];

/**
 * จัดข้อความให้พอดีกล่องห้อง
 * ลองไล่ขนาดตัวอักษรจากใหญ่ไปเล็ก ถ้าบรรทัดเดียวไม่พอก็ตัดเป็นสองบรรทัด
 *
 * @param {string} text
 * @param {number} boxLen    ความยาวของกล่องตามแนวที่ข้อความวิ่ง (เมตร)
 * @returns {{lines: string[], size: number}}
 */
function fitLabel(text, boxLen) {
  const usable = boxLen * 0.9;
  const width = (str, size) => str.length * size * CHAR_RATIO;

  // 1) บรรทัดเดียว — ลดขนาดตัวอักษรลงจนกว่าจะพอดี
  for (const size of LABEL_SIZES) {
    if (width(text, size) <= usable) return { lines: [text], size };
  }

  // 2) สองบรรทัด — ตัดได้เฉพาะที่ช่องว่างเท่านั้น
  //    ภาษาไทยไม่มีช่องว่างระหว่างคำ ถ้าตัดกลางคำจะอ่านไม่รู้เรื่อง
  const cut = bestSpace(text);
  if (cut > 0) {
    const a = text.slice(0, cut).trim();
    const b = text.slice(cut).trim();
    const longest = a.length > b.length ? a : b;
    for (const size of LABEL_SIZES) {
      if (width(longest, size) <= usable) return { lines: [a, b], size };
    }
  }

  // 3) ยังไม่พอ — ใช้ขนาดเล็กสุดแล้วตัดท้ายด้วย …
  const size = LABEL_SIZES[LABEL_SIZES.length - 1];
  const max = Math.max(2, Math.floor(usable / (size * CHAR_RATIO)));
  return { lines: [text.length > max ? `${text.slice(0, max - 1)}…` : text], size };
}

/** ตำแหน่งช่องว่างที่ใกล้กึ่งกลางข้อความที่สุด คืน -1 ถ้าไม่มีช่องว่าง */
function bestSpace(text) {
  const mid = text.length / 2;
  let best = -1;
  for (let i = 1; i < text.length - 1; i += 1) {
    if (text[i] !== ' ') continue;
    if (best === -1 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  return best;
}

class SchoolMap {
  /**
   * @param {SVGElement} svg
   * @param {object} deps  { graph, buildings, buildingsById, areas, extent }
   */
  constructor(svg, deps) {
    this.svg = svg;
    this.graph = deps.graph;
    this.buildings = deps.buildings;
    this.buildingsById = deps.buildingsById;
    this.areas = deps.areas;
    this.extent = deps.extent || [0, 0, 320, 232];

    this.floor = 1;
    this.showEdges = false;
    this.typeFilter = null;     // Set ของประเภทที่ต้องการแสดง (null = ทั้งหมด)
    this.route = null;
    this.selectedId = null;
    this.endpoints = { start: null, goal: null };
    this.onNodeClick = () => {};
    this.onMapClick = null;     // (x, y) เป็นเมตรบนผัง — ใช้ในหน้าแก้ไขข้อมูล

    this.view = { k: 1, tx: 0, ty: 0 };
    this.nodeElements = new Map();

    this._setupSvg();
    this._setupInteractions();
    this.renderStatic();
    this.renderNodes();
    this.fit();
  }

  /* ==============================================================
   * โครงสร้าง SVG
   * ============================================================ */
  _setupSvg() {
    const [x0, y0, x1, y1] = this.extent;
    const pad = MAP_PADDING;
    this.viewBox = {
      x: x0 - pad, y: y0 - pad,
      w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2,
    };
    this.svg.setAttribute('viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
    this.svg.innerHTML = '';

    const defs = el('defs', {}, this.svg);

    const shadow = el('filter', {
      id: 'bldShadow', x: '-25%', y: '-25%', width: '160%', height: '170%',
    }, defs);
    el('feDropShadow', {
      dx: 0, dy: 1.6, stdDeviation: 1.6, 'flood-opacity': 0.22,
    }, shadow);

    // ลายเส้นทแยงสำหรับพื้นที่ที่ยังไม่ได้สำรวจ
    const hatch = el('pattern', {
      id: 'hatchPattern', width: 3, height: 3,
      patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
    }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 3, class: 'hatch-line' }, hatch);

    this.viewport = el('g', { id: 'viewport' }, this.svg);
    this.layers = {
      ground: el('g', { class: 'layer-ground' }, this.viewport),
      areas: el('g', { class: 'layer-areas' }, this.viewport),
      paths: el('g', { class: 'layer-paths' }, this.viewport),
      shells: el('g', { class: 'layer-shells' }, this.viewport),
      rooms: el('g', { class: 'layer-rooms' }, this.viewport),
      edges: el('g', { class: 'layer-edges' }, this.viewport),
      route: el('g', { class: 'layer-route' }, this.viewport),
      nodes: el('g', { class: 'layer-nodes' }, this.viewport),
      markers: el('g', { class: 'layer-markers' }, this.viewport),
    };
  }

  /* ==============================================================
   * เลื่อน / ซูม
   * ============================================================ */
  _setupInteractions() {
    const svg = this.svg;
    const pointers = new Map();
    let dragging = false;
    let last = null;
    let pinchStart = null;
    let moved = 0;

    const toLocal = (evt) => {
      const rect = svg.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    };

    svg.addEventListener('pointerdown', (evt) => {
      svg.setPointerCapture(evt.pointerId);
      pointers.set(evt.pointerId, toLocal(evt));
      moved = 0;
      if (pointers.size === 1) {
        dragging = true;
        last = toLocal(evt);
        svg.classList.add('is-dragging');
      } else if (pointers.size === 2) {
        dragging = false;
        const [a, b] = [...pointers.values()];
        pinchStart = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          k: this.view.k,
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      }
    });

    svg.addEventListener('pointermove', (evt) => {
      if (!pointers.has(evt.pointerId)) return;
      const p = toLocal(evt);
      pointers.set(evt.pointerId, p);

      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        this._zoomAt(pinchStart.center,
          (pinchStart.k * (dist / (pinchStart.dist || 1))) / this.view.k);
        return;
      }
      if (!dragging || !last) return;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      this.view.tx += dx;
      this.view.ty += dy;
      last = p;
      this._applyTransform();
    });

    const endPointer = (evt) => {
      const wasDragging = dragging;
      pointers.delete(evt.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) {
        dragging = false;
        last = null;
        svg.classList.remove('is-dragging');
        // ถือว่าเป็นการคลิกพื้นที่ว่างก็ต่อเมื่อเมาส์แทบไม่ขยับ และไม่ได้คลิกลงบนโหนด/ห้อง
        const target = evt.target instanceof Element ? evt.target : null;
        const onFeature = target && target.closest('.node, .room');
        if (wasDragging && moved < 4 && !onFeature && this.onMapClick && evt.type === 'pointerup') {
          const p = this.toMapCoords(evt);
          this.onMapClick(p.x, p.y, evt);
        }
      }
    };
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);
    svg.addEventListener('pointerleave', endPointer);

    svg.addEventListener('wheel', (evt) => {
      evt.preventDefault();
      this._zoomAt(toLocal(evt), Math.exp(-evt.deltaY * 0.0016));
    }, { passive: false });

    svg.addEventListener('dblclick', (evt) => {
      this._zoomAt(toLocal(evt), 1.6);
    });
  }

  _zoomAt(point, factor) {
    const next = Math.min(16, Math.max(0.45, this.view.k * factor));
    const ratio = next / this.view.k;
    this.view.tx = point.x - (point.x - this.view.tx) * ratio;
    this.view.ty = point.y - (point.y - this.view.ty) * ratio;
    this.view.k = next;
    this._applyTransform();
  }

  _applyTransform() {
    const { k, tx, ty } = this.view;
    this.viewport.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    this.svg.style.setProperty('--map-scale', k);
    this.svg.classList.toggle('zoom-1', k > 1.7);   // เริ่มเห็นเลขห้อง
    this.svg.classList.toggle('zoom-2', k > 3.0);   // เห็นไอคอนและชื่อเต็ม
    this.svg.classList.toggle('zoom-3', k > 5.0);   // เห็นรายละเอียดทั้งหมด
  }

  fit() {
    this.view = { k: 1, tx: 0, ty: 0 };
    this._applyTransform();
  }

  zoomIn() { this._zoomAt(this._center(), 1.35); }

  zoomOut() { this._zoomAt(this._center(), 1 / 1.35); }

  _center() {
    const rect = this.svg.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  /** แปลงพิกัดหน้าจอของอีเวนต์เป็นพิกัดเมตรบนผัง */
  toMapCoords(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = this.viewport.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
  }

  /** เลื่อนแผนที่ให้โหนดที่ระบุอยู่กลางจอ */
  focusNode(id, zoom = 3.4) {
    const node = this.graph.node(id);
    if (!node) return;
    const vb = this.viewBox;
    const rect = this.svg.getBoundingClientRect();
    const base = Math.min(rect.width / vb.w, rect.height / vb.h);
    const px = (rect.width - vb.w * base) / 2 + (node.x - vb.x) * base;
    const py = (rect.height - vb.h * base) / 2 + (node.y - vb.y) * base;
    this.view.k = zoom;
    this.view.tx = rect.width / 2 - px * zoom;
    this.view.ty = rect.height / 2 - py * zoom;
    this._applyTransform();
  }

  /* ==============================================================
   * ฉากหลัง: พื้น พื้นที่กลางแจ้ง และทางเดิน
   * ============================================================ */
  renderStatic() {
    const vb = this.viewBox;
    el('rect', {
      x: vb.x, y: vb.y, width: vb.w, height: vb.h, class: 'map-ground',
    }, this.layers.ground);

    // ---- พื้นที่กลางแจ้ง ----
    this.areas.forEach((area) => {
      const [ax, ay, bx, by] = area.rect;
      const g = el('g', { class: `area ${AREA_CLASS[area.kind] || 'area-green'}` }, this.layers.areas);
      el('rect', {
        x: ax, y: ay, width: bx - ax, height: by - ay, rx: 2, class: 'area-shape',
      }, g);

      // เส้นสนามให้ดูเหมือนสนามกีฬาจริง
      if (area.kind === 'sport') {
        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        el('rect', {
          x: ax + 3, y: ay + 3, width: bx - ax - 6, height: by - ay - 6,
          class: 'area-line', rx: 1,
        }, g);
        el('circle', { cx, cy, r: Math.min(bx - ax, by - ay) * 0.16, class: 'area-line' }, g);
        el('line', {
          x1: (bx - ax) > (by - ay) ? cx : ax + 3,
          y1: (bx - ax) > (by - ay) ? ay + 3 : cy,
          x2: (bx - ax) > (by - ay) ? cx : bx - 3,
          y2: (bx - ax) > (by - ay) ? by - 3 : cy,
          class: 'area-line',
        }, g);
      }

      const t = el('text', {
        x: (ax + bx) / 2, y: (ay + by) / 2, class: 'area-label',
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }, g);
      t.textContent = area.name;
    });

    // ---- ทางเดินกลางแจ้ง: วาดจากเส้นเชื่อมชนิด outdoor ----
    const walk = el('g', { class: 'walkways' }, this.layers.paths);
    const drawn = new Set();
    this.graph.edges.forEach((e) => {
      if (e.type !== 'outdoor') return;
      const a = this.graph.node(e.from);
      const b = this.graph.node(e.to);
      if (!a || !b) return;
      const key = [e.from, e.to].sort().join('|');
      if (drawn.has(key)) return;
      drawn.add(key);
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'walkway-base' }, walk);
    });
    this.graph.edges.forEach((e) => {
      if (e.type !== 'outdoor') return;
      const a = this.graph.node(e.from);
      const b = this.graph.node(e.to);
      if (!a || !b) return;
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'walkway-top' }, walk);
    });
  }

  /* ==============================================================
   * ผังพื้นของชั้นที่เลือก
   * ============================================================ */
  _renderFloorPlan() {
    const shells = this.layers.shells;
    const rooms = this.layers.rooms;
    shells.innerHTML = '';
    rooms.innerHTML = '';

    // จัดกลุ่มโหนดที่มีรูปทรงห้อง ตามอาคาร (เฉพาะชั้นที่เลือก)
    const byBuilding = new Map();
    this.graph.nodes.forEach((n) => {
      if (!n.rect || n.building === null || n.floor !== this.floor) return;
      if (!byBuilding.has(n.building)) byBuilding.set(n.building, []);
      byBuilding.get(n.building).push(n);
    });

    this.buildings.forEach((b) => {
      const [ax, ay, bx, by] = b.rect;
      const hasFloor = b.floors.includes(this.floor);
      const g = el('g', {
        class: `building${hasFloor ? ' has-floor' : ' is-shell'}`,
        'data-building': b.id,
      }, shells);

      // เปลือกอาคาร
      el('rect', {
        x: ax, y: ay, width: bx - ax, height: by - ay, rx: 1,
        class: 'building-shell', filter: 'url(#bldShadow)',
        style: `--bld-color:${b.color}`,
      }, g);

      if (!hasFloor) {
        // อาคารที่ไม่มีชั้นนี้ — แสดงแค่ชื่อไว้อ้างอิงตำแหน่ง
        const label = el('text', {
          x: (ax + bx) / 2, y: (ay + by) / 2, class: 'building-label is-muted',
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
        }, g);
        label.textContent = b.shortName || b.name;
        g.addEventListener('click', () => {
          this.svg.dispatchEvent(new CustomEvent('building-click', { detail: { building: b } }));
        });
        return;
      }

      // ทางเดินกลางอาคาร
      const cw = b.corridorWidth || 3.2;
      if (b.axis === 'x') {
        el('rect', {
          x: ax, y: (ay + by) / 2 - cw / 2, width: bx - ax, height: cw,
          class: 'corridor-band',
        }, g);
      } else {
        el('rect', {
          x: (ax + bx) / 2 - cw / 2, y: ay, width: cw, height: by - ay,
          class: 'corridor-band',
        }, g);
      }

      g.addEventListener('click', (evt) => {
        if (evt.target.closest('.room')) return;
        this.svg.dispatchEvent(new CustomEvent('building-click', { detail: { building: b } }));
      });

      // ---- ห้องแต่ละห้อง ----
      const list = byBuilding.get(b.id) || [];
      list.forEach((n) => {
        const [rx, ry, rx2, ry2] = n.rect;
        const w = rx2 - rx;
        const h = ry2 - ry;
        const style = TYPE_STYLE[n.type] || {};
        const cls = style.roomFill || 'room-plain';
        const rg = el('g', {
          class: `room room-${n.type} ${cls}`,
          'data-id': n.id,
        }, rooms);

        el('rect', { x: rx, y: ry, width: w, height: h, class: 'room-shape' }, rg);

        if (n.type === 'stairs') this._drawStairTreads(rg, n.rect, b.axis);
        if (n.type === 'elevator') this._drawLiftMark(rg, n.rect);

        // ช่องประตูที่ติดทางเดิน — วาดทับเส้นผนังให้ดูเป็นช่องเปิด
        if (n.door) {
          const [dx, dy] = n.door;
          const horizontal = b.axis === 'x';
          el('line', {
            x1: horizontal ? dx - 0.8 : dx,
            y1: horizontal ? dy : dy - 0.8,
            x2: horizontal ? dx + 0.8 : dx,
            y2: horizontal ? dy : dy + 0.8,
            class: 'room-door',
          }, rg);
        }

        this._drawRoomLabel(rg, n, style);

        rg.addEventListener('click', (evt) => {
          evt.stopPropagation();
          this.onNodeClick(n);
        });
      });

      // ชื่ออาคารลอยอยู่เหนือหลังคา อ่านได้ตอนซูมออก
      const tag = el('text', {
        x: (ax + bx) / 2, y: ay - 2.5, class: 'building-tag',
        'text-anchor': 'middle',
      }, g);
      tag.textContent = b.shortName || b.name;
    });
  }

  /**
   * ป้ายชื่อห้องบนผังพื้น จัดขนาดและตัดบรรทัดให้พอดีกล่องห้อง
   */
  _drawRoomLabel(parent, node, style) {
    const [rx, ry, rx2, ry2] = node.rect;
    const w = rx2 - rx;
    const h = ry2 - ry;
    const cx = rx + w / 2;
    const cy = ry + h / 2;

    // ถ้ากล่องสูงกว่ากว้าง ให้หมุนป้าย 90 องศาเพื่อให้ข้อความวิ่งตามด้านยาว
    // (ครอบคลุมทั้งอาคารแนวเหนือ-ใต้ และโถงบันไดของอาคารแนวตะวันออก-ตะวันตก)
    const rotated = h > w * 1.15;
    const boxLen = rotated ? h : w;            // แนวที่ข้อความวิ่ง
    const { lines, size } = fitLabel(shortLabel(node), boxLen);

    const g = el('g', {
      class: 'room-text',
      transform: rotated ? `rotate(-90 ${cx} ${cy})` : null,
    }, parent);

    const hasGlyph = node.type !== 'classroom' && style.glyph;
    const lineH = size * 1.15;
    // จัดกลุ่มข้อความ (+ ไอคอน) ให้อยู่กึ่งกลางกล่องในแนวตั้ง
    const blockH = lines.length * lineH + (hasGlyph ? size * 1.3 : 0);
    let y = cy - blockH / 2 + lineH * 0.62;

    if (hasGlyph) {
      const glyph = el('text', {
        x: cx, y, class: 'room-glyph',
        style: `font-size:${(size * 1.05).toFixed(2)}px`,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }, g);
      glyph.textContent = style.glyph;
      y += size * 1.3;
    }

    lines.forEach((line) => {
      const t = el('text', {
        x: cx, y, class: 'room-label',
        style: `font-size:${size}px`,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }, g);
      t.textContent = line;
      y += lineH;
    });
  }

  /** เส้นลูกนอนของบันได วาดขวางทิศทางเดิน */
  _drawStairTreads(parent, rect, axis) {
    const [x1, y1, x2, y2] = rect;
    const steps = 6;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (axis === 'x') {
        const x = x1 + (x2 - x1) * t;
        el('line', { x1: x, y1: y1 + 0.8, x2: x, y2: y2 - 0.8, class: 'stair-tread' }, parent);
      } else {
        const y = y1 + (y2 - y1) * t;
        el('line', { x1: x1 + 0.8, y1: y, x2: x2 - 0.8, y2: y, class: 'stair-tread' }, parent);
      }
    }
  }

  /** เครื่องหมายกากบาทในช่องลิฟต์ ตามสัญลักษณ์ผังสถาปัตย์ */
  _drawLiftMark(parent, rect) {
    const [x1, y1, x2, y2] = rect;
    el('line', { x1: x1 + 1, y1: y1 + 1, x2: x2 - 1, y2: y2 - 1, class: 'lift-mark' }, parent);
    el('line', { x1: x2 - 1, y1: y1 + 1, x2: x1 + 1, y2: y2 - 1, class: 'lift-mark' }, parent);
  }

  /* ==============================================================
   * ไอคอนและป้ายของโหนด
   * ============================================================ */
  setFloor(floor) {
    this.floor = floor;
    this.renderNodes();
    this.renderRoute(this.route);
  }

  setShowEdges(show) {
    this.showEdges = show;
    this.renderNodes();
  }

  setTypeFilter(types) {
    this.typeFilter = types && types.size ? types : null;
    this.renderNodes();
  }

  _visible(node) {
    if (node.building === null || node.building === undefined) return true;
    return node.floor === this.floor;
  }

  renderNodes() {
    this._renderFloorPlan();

    const nodesLayer = this.layers.nodes;
    const edgesLayer = this.layers.edges;
    nodesLayer.innerHTML = '';
    edgesLayer.innerHTML = '';
    this.nodeElements.clear();

    // โครงสร้างกราฟ (เปิดจากตัวเลือกในหน้าเว็บ)
    if (this.showEdges) {
      const drawn = new Set();
      this.graph.edges.forEach((e) => {
        const a = this.graph.node(e.from);
        const b = this.graph.node(e.to);
        if (!a || !b || !this._visible(a) || !this._visible(b)) return;
        const key = [e.from, e.to].sort().join('|');
        if (drawn.has(key)) return;
        drawn.add(key);
        el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `graph-edge edge-${e.type}`,
        }, edgesLayer);
      });
    }

    this.graph.nodes.forEach((node) => {
      if (!this._visible(node)) return;
      const structural = STRUCTURAL.has(node.type);
      if (structural && !this.showEdges) return;
      // ห้องที่มีรูปทรงถูกวาดในผังพื้นแล้ว ไม่ต้องวางไอคอนซ้ำ
      if (node.rect) return;
      if (this.typeFilter && !structural && !this.typeFilter.has(node.type)) return;

      const style = TYPE_STYLE[node.type] || { color: '#64748b', glyph: '📍' };
      const g = el('g', {
        class: `node node-${node.type}${structural ? ' node-structural' : ''}`,
        'data-id': node.id,
        transform: `translate(${node.x} ${node.y})`,
      }, nodesLayer);

      if (structural) {
        el('circle', { r: 0.9, class: 'structural-dot' }, g);
      } else {
        el('circle', { class: 'node-halo', r: 3.4 }, g);
        el('circle', { class: 'node-dot', r: 2.4, fill: style.color }, g);
        const glyph = el('text', {
          class: 'node-glyph', y: 0.05, 'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }, g);
        glyph.textContent = style.glyph || '📍';
        const label = el('text', { class: 'node-label', y: 6.4, 'text-anchor': 'middle' }, g);
        label.textContent = node.name;
      }

      g.addEventListener('click', (evt) => {
        evt.stopPropagation();
        this.onNodeClick(node);
      });
      this.nodeElements.set(node.id, g);
    });

    this._applySelection();
    this._renderEndpointMarkers();
  }

  /* ==============================================================
   * เส้นทาง
   * ============================================================ */
  renderRoute(route) {
    this.route = route;
    const layer = this.layers.route;
    layer.innerHTML = '';
    if (!route || !route.found || route.path.length < 2) {
      this._applySelection();
      this._renderEndpointMarkers();
      return;
    }

    const nodes = route.path.map((id) => this.graph.node(id)).filter(Boolean);

    // แบ่งเส้นทางเป็นช่วงตามชั้น ช่วงที่ไม่ได้อยู่ชั้นปัจจุบันจะจางลง
    const runs = [];
    let current = null;
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const vertical = a.floor !== b.floor && a.building === b.building;
      if (vertical) {
        if (current) { runs.push(current); current = null; }
        el('circle', {
          cx: a.x, cy: a.y, r: 3.2,
          class: `route-vertical${this._visible(a) ? '' : ' is-faded'}`,
        }, layer);
        continue;
      }
      const onFloor = this._visible(a) && this._visible(b);
      if (!current || current.onFloor !== onFloor) {
        if (current) runs.push(current);
        current = { onFloor, points: [a] };
      }
      current.points.push(b);
    }
    if (current) runs.push(current);

    // วาดสองชั้น: เส้นขาวรองพื้น แล้วทับด้วยเส้นสีส้ม
    ['route-casing', 'route-line'].forEach((cls) => {
      runs.forEach((run) => {
        if (run.points.length < 2) return;
        el('polyline', {
          points: run.points.map((n) => `${n.x},${n.y}`).join(' '),
          class: `${cls}${run.onFloor ? '' : ' is-faded'}`,
        }, layer);
      });
    });

    this._applySelection();
    this._renderEndpointMarkers();
  }

  setEndpoints(startId, goalId) {
    this.endpoints = { start: startId, goal: goalId };
    this._renderEndpointMarkers();
  }

  _renderEndpointMarkers() {
    const layer = this.layers.markers;
    layer.innerHTML = '';
    const draw = (id, kind, text) => {
      const node = this.graph.node(id);
      if (!node) return;
      const g = el('g', {
        class: `endpoint endpoint-${kind}${this._visible(node) ? '' : ' is-faded'}`,
        transform: `translate(${node.x} ${node.y})`,
      }, layer);
      el('path', {
        d: 'M 0 0 C -5.2 -6.4 -6.6 -8.6 -6.6 -11.2 A 6.6 6.6 0 1 1 6.6 -11.2 C 6.6 -8.6 5.2 -6.4 0 0 Z',
        class: 'pin-body',
      }, g);
      const t = el('text', {
        y: -11.2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'pin-text',
      }, g);
      t.textContent = text;
    };
    draw(this.endpoints.start, 'start', 'A');
    draw(this.endpoints.goal, 'goal', 'B');
  }

  select(id) {
    this.selectedId = id;
    this._applySelection();
  }

  _applySelection() {
    const onRoute = new Set(this.route && this.route.found ? this.route.path : []);
    const mark = (elm, id) => {
      elm.classList.toggle('is-selected', id === this.selectedId);
      elm.classList.toggle('is-on-route', onRoute.has(id));
    };
    this.nodeElements.forEach(mark);
    this.layers.rooms.querySelectorAll('.room').forEach((rg) => {
      mark(rg, rg.dataset.id);
    });
  }

  /** เปลี่ยนกราฟที่ใช้วาด โดยคงตำแหน่งการเลื่อน/ซูมเดิมไว้ (ใช้ในหน้าแก้ไขข้อมูล) */
  setGraph(graph) {
    this.graph = graph;
    if (this.selectedId && !graph.node(this.selectedId)) this.selectedId = null;
    // renderStatic() วาดเพิ่มลงในเลเยอร์ จึงต้องล้างของเดิมก่อน
    this.layers.ground.innerHTML = '';
    this.layers.areas.innerHTML = '';
    this.layers.paths.innerHTML = '';
    this.renderStatic();
    this.renderNodes();
    const stillValid = this.route && this.route.found
      && this.route.path.every((id) => graph.node(id));
    this.renderRoute(stillValid ? this.route : null);
  }

  /** ชั้นที่มีอยู่จริงในระบบ (ใช้สร้างปุ่มเลือกชั้น) */
  availableFloors() {
    const set = new Set();
    this.graph.nodes.forEach((n) => {
      if (n.building) set.add(n.floor);
    });
    return [...set].sort((a, b) => a - b);
  }
}

window.SchoolMap = SchoolMap;
window.TYPE_STYLE = TYPE_STYLE;
