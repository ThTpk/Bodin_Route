/*
 * map.js — วาดแผนที่โรงเรียนด้วย SVG พร้อมการเลื่อน/ซูม
 * ---------------------------------------------------------------
 * แผนที่เป็นผังมองจากด้านบน หน่วยพิกัดเป็นเมตร (1 หน่วย SVG = 1 เมตร)
 * แบ่งการวาดเป็นชั้น (layer) เพื่อควบคุมลำดับการซ้อนทับ
 */

'use strict';

const NS = 'http://www.w3.org/2000/svg';

/** สี + สัญลักษณ์ประจำประเภทโหนด */
const TYPE_STYLE = {
  classroom:    { color: '#2563eb', glyph: '📘', label: 'ห้องเรียน' },
  lab:          { color: '#0d9488', glyph: '🧪', label: 'ห้องปฏิบัติการ' },
  computer_lab: { color: '#0891b2', glyph: '💻', label: 'ห้องคอมพิวเตอร์' },
  teacher_room: { color: '#c2410c', glyph: '🧑‍🏫', label: 'ห้องพักครู' },
  office:       { color: '#b91c1c', glyph: '🏢', label: 'ห้องสำนักงาน' },
  library:      { color: '#7c3aed', glyph: '📚', label: 'ห้องสมุด' },
  toilet:       { color: '#0284c7', glyph: '🚻', label: 'ห้องน้ำ' },
  health_room:  { color: '#dc2626', glyph: '🏥', label: 'ห้องพยาบาล' },
  canteen:      { color: '#ea580c', glyph: '🍽️', label: 'โรงอาหาร' },
  shop:         { color: '#d97706', glyph: '🛒', label: 'ร้านค้า' },
  meeting:      { color: '#9333ea', glyph: '🗣️', label: 'ห้องประชุม' },
  activity:     { color: '#db2777', glyph: '🎭', label: 'ห้องกิจกรรม' },
  stairs:       { color: '#64748b', glyph: '🪜', label: 'บันได' },
  elevator:     { color: '#475569', glyph: '🛗', label: 'ลิฟต์' },
  entrance:     { color: '#059669', glyph: '🚪', label: 'ทางเข้าอาคาร' },
  gate:         { color: '#16a34a', glyph: '🚧', label: 'ประตูโรงเรียน' },
  landmark:     { color: '#eab308', glyph: '🚩', label: 'จุดสังเกต' },
  sport:        { color: '#059669', glyph: '🏃', label: 'สนามกีฬา' },
  corridor:     { color: '#94a3b8', glyph: '', label: 'ทางเดิน' },
  junction:     { color: '#94a3b8', glyph: '', label: 'ทางแยก' },
};

const AREA_STYLE = {
  sport:   { fill: '#bbf7d0', stroke: '#4ade80' },
  yard:    { fill: '#fef3c7', stroke: '#fcd34d' },
  roof:    { fill: '#e0e7ff', stroke: '#a5b4fc' },
  parking: { fill: '#e2e8f0', stroke: '#cbd5e1' },
  green:   { fill: '#d1fae5', stroke: '#6ee7b7' },
  pool:    { fill: '#bae6fd', stroke: '#38bdf8' },
};

/* ระยะขอบรอบผัง (เมตร) เพื่อไม่ให้อาคารริมสุดชิดขอบจอ */
const MAP_PADDING = 14;

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  });
  if (parent) parent.appendChild(node);
  return node;
}

class SchoolMap {
  /**
   * @param {SVGElement} svg
   * @param {object} deps  { graph, buildings, areas, extent }
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
    this.showAllNodes = true;
    this.typeFilter = null;     // Set ของประเภทที่ต้องการแสดง (null = ทั้งหมด)
    this.route = null;
    this.selectedId = null;
    this.endpoints = { start: null, goal: null };
    this.onNodeClick = () => {};
    this.onMapClick = null;   // (x, y) เป็นเมตรบนผัง — ใช้ในหน้าแก้ไขข้อมูล

    this.view = { k: 1, tx: 0, ty: 0 };
    this.nodeElements = new Map();

    this._setupSvg();
    this._setupInteractions();
    this.renderStatic();
    this.renderNodes();
    this.fit();
  }

  /* ------------------------- โครงสร้าง SVG ------------------------- */
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
    const shadow = el('filter', { id: 'bldShadow', x: '-20%', y: '-20%', width: '150%', height: '150%' }, defs);
    el('feDropShadow', { dx: 0.8, dy: 1.4, stdDeviation: 1.1, 'flood-opacity': 0.28 }, shadow);

    const arrow = el('marker', {
      id: 'routeArrow', viewBox: '0 0 10 10', refX: 8, refY: 5,
      markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse',
    }, defs);
    el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#f97316' }, arrow);

    this.viewport = el('g', { id: 'viewport' }, this.svg);
    this.layers = {
      areas: el('g', { class: 'layer-areas' }, this.viewport),
      buildings: el('g', { class: 'layer-buildings' }, this.viewport),
      edges: el('g', { class: 'layer-edges' }, this.viewport),
      route: el('g', { class: 'layer-route' }, this.viewport),
      nodes: el('g', { class: 'layer-nodes' }, this.viewport),
      markers: el('g', { class: 'layer-markers' }, this.viewport),
    };
  }

  /* ------------------------- เลื่อน / ซูม ------------------------- */
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
        const scale = dist / (pinchStart.dist || 1);
        this._zoomAt(pinchStart.center, (pinchStart.k * scale) / this.view.k);
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
        // ถือว่าเป็นการคลิกพื้นที่ว่างก็ต่อเมื่อเมาส์แทบไม่ขยับ (ไม่ใช่การลากแผนที่)
        // และไม่ได้คลิกลงบนโหนด ซึ่งมีตัวจัดการของตัวเองอยู่แล้ว
        const onNode = evt.target instanceof Element && evt.target.closest('.node');
        if (wasDragging && moved < 4 && !onNode && this.onMapClick && evt.type === 'pointerup') {
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
      const factor = Math.exp(-evt.deltaY * 0.0016);
      this._zoomAt(toLocal(evt), factor);
    }, { passive: false });

    svg.addEventListener('dblclick', (evt) => {
      this._zoomAt(toLocal(evt), 1.6);
    });
  }

  _zoomAt(point, factor) {
    const next = Math.min(14, Math.max(0.45, this.view.k * factor));
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
    this.svg.classList.toggle('zoomed-in', k > 2.1);
    this.svg.classList.toggle('zoomed-far', k > 3.6);
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

  /** เปลี่ยนกราฟที่ใช้วาด โดยคงตำแหน่งการเลื่อน/ซูมเดิมไว้ (ใช้ในหน้าแก้ไขข้อมูล) */
  setGraph(graph) {
    this.graph = graph;
    if (this.selectedId && !graph.node(this.selectedId)) this.selectedId = null;
    this.renderNodes();
    this.renderRoute(this.route && this.route.found
      && this.route.path.every((id) => graph.node(id)) ? this.route : null);
  }

  /** เลื่อนแผนที่ให้โหนดที่ระบุอยู่กลางจอ */
  focusNode(id, zoom = 3.2) {
    const node = this.graph.node(id);
    if (!node) return;
    const vb = this.viewBox;
    const rect = this.svg.getBoundingClientRect();
    // สัดส่วนของ viewBox ที่ถูก preserveAspectRatio จัดวางแบบ meet
    const base = Math.min(rect.width / vb.w, rect.height / vb.h);
    const offsetX = (rect.width - vb.w * base) / 2;
    const offsetY = (rect.height - vb.h * base) / 2;
    const px = offsetX + (node.x - vb.x) * base;
    const py = offsetY + (node.y - vb.y) * base;
    this.view.k = zoom;
    this.view.tx = rect.width / 2 - px * zoom;
    this.view.ty = rect.height / 2 - py * zoom;
    this._applyTransform();
  }

  /* ------------------------- วาดฉากหลัง ------------------------- */
  renderStatic() {
    const [x0, y0, x1, y1] = this.extent;
    el('rect', {
      x: x0, y: y0, width: x1 - x0, height: y1 - y0,
      class: 'map-ground', rx: 2,
    }, this.layers.areas);

    this.areas.forEach((area) => {
      const [ax, ay, bx, by] = area.rect;
      const style = AREA_STYLE[area.kind] || AREA_STYLE.green;
      const g = el('g', { class: 'area' }, this.layers.areas);
      el('rect', {
        x: ax, y: ay, width: bx - ax, height: by - ay, rx: 2,
        fill: style.fill, stroke: style.stroke, 'stroke-width': 0.5,
      }, g);
      const t = el('text', {
        x: (ax + bx) / 2, y: (ay + by) / 2, class: 'area-label',
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }, g);
      t.textContent = area.name;
    });

    this.buildingElements = new Map();
    this.buildings.forEach((b) => {
      const [ax, ay, bx, by] = b.rect;
      const g = el('g', { class: 'building', 'data-building': b.id }, this.layers.buildings);
      el('rect', {
        x: ax, y: ay, width: bx - ax, height: by - ay, rx: 1.5,
        fill: b.color, 'fill-opacity': 0.16, stroke: b.color,
        'stroke-width': 0.7, filter: 'url(#bldShadow)',
      }, g);
      // แถบทางเดินกลางอาคาร
      if (b.axis === 'x') {
        el('rect', {
          x: ax + 1, y: (ay + by) / 2 - 1.6, width: bx - ax - 2, height: 3.2,
          fill: b.color, 'fill-opacity': 0.22,
        }, g);
      } else {
        el('rect', {
          x: (ax + bx) / 2 - 1.6, y: ay + 1, width: 3.2, height: by - ay - 2,
          fill: b.color, 'fill-opacity': 0.22,
        }, g);
      }
      const label = el('text', {
        x: (ax + bx) / 2, y: (ay + by) / 2, class: 'building-label',
        'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: b.color,
      }, g);
      label.textContent = b.shortName || b.name;
      g.addEventListener('click', () => {
        const detail = { building: b };
        this.svg.dispatchEvent(new CustomEvent('building-click', { detail }));
      });
      this.buildingElements.set(b.id, g);
    });
  }

  /* ------------------------- โหนด + เส้นเชื่อม ------------------------- */
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
    if (node.building === null || node.building === undefined) return true; // กลางแจ้ง แสดงตลอด
    return node.floor === this.floor;
  }

  renderNodes() {
    const nodesLayer = this.layers.nodes;
    const edgesLayer = this.layers.edges;
    nodesLayer.innerHTML = '';
    edgesLayer.innerHTML = '';
    this.nodeElements.clear();

    // เส้นเชื่อม (โครงสร้างกราฟ) — แสดงเมื่อเปิดตัวเลือกเท่านั้น
    if (this.showEdges) {
      const drawn = new Set();
      this.graph.edges.forEach((e) => {
        const a = this.graph.node(e.from);
        const b = this.graph.node(e.to);
        if (!a || !b) return;
        if (!this._visible(a) || !this._visible(b)) return;
        const key = [e.from, e.to].sort().join('|');
        if (drawn.has(key)) return;
        drawn.add(key);
        el('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          class: `graph-edge edge-${e.type}`,
        }, edgesLayer);
      });
    }

    this.graph.nodes.forEach((node) => {
      if (!this._visible(node)) return;
      const style = TYPE_STYLE[node.type] || { color: '#64748b', glyph: '📍' };
      const isStructural = node.type === 'corridor' || node.type === 'junction';
      if (isStructural && !this.showEdges) return;
      if (this.typeFilter && !isStructural && !this.typeFilter.has(node.type)) return;

      const g = el('g', {
        class: `node node-${node.type}${isStructural ? ' node-structural' : ''}`,
        'data-id': node.id,
        transform: `translate(${node.x} ${node.y})`,
      }, nodesLayer);

      if (isStructural) {
        el('circle', { r: 0.9, fill: style.color, 'fill-opacity': 0.65 }, g);
      } else {
        el('circle', { class: 'node-halo', r: 3.4 }, g);
        el('circle', { class: 'node-dot', r: 2.3, fill: style.color }, g);
        const glyph = el('text', {
          class: 'node-glyph', y: 0.05, 'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }, g);
        glyph.textContent = style.glyph || '';
        const label = el('text', {
          class: 'node-label', y: 6.2, 'text-anchor': 'middle',
        }, g);
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

  /* ------------------------- เส้นทาง ------------------------- */
  renderRoute(route) {
    this.route = route;
    const layer = this.layers.route;
    layer.innerHTML = '';
    if (!route || !route.found || route.path.length < 2) {
      this._renderEndpointMarkers();
      return;
    }

    const nodes = route.path.map((id) => this.graph.node(id)).filter(Boolean);

    // แบ่งเส้นทางเป็นช่วงตามชั้น เพื่อให้ช่วงที่ไม่ได้อยู่ชั้นปัจจุบันจางลง
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const onFloor = this._visible(a) && this._visible(b);
      const vertical = a.floor !== b.floor && a.building === b.building;
      if (vertical) {
        el('circle', {
          cx: a.x, cy: a.y, r: 3.6,
          class: `route-vertical${onFloor ? '' : ' is-faded'}`,
        }, layer);
        continue;
      }
      el('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        class: `route-line${onFloor ? '' : ' is-faded'}`,
      }, layer);
    }

    // เส้นเรืองแสงเฉพาะช่วงบนชั้นปัจจุบัน
    let current = [];
    const flush = () => {
      if (current.length > 1) {
        el('polyline', {
          points: current.map((n) => `${n.x},${n.y}`).join(' '),
          class: 'route-glow',
        }, layer);
      }
      current = [];
    };
    nodes.forEach((n) => {
      if (this._visible(n)) current.push(n);
      else flush();
    });
    flush();

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
      const faded = !this._visible(node);
      const g = el('g', {
        class: `endpoint endpoint-${kind}${faded ? ' is-faded' : ''}`,
        transform: `translate(${node.x} ${node.y})`,
      }, layer);
      el('path', {
        d: 'M 0 0 C -5.2 -6.4 -6.6 -8.6 -6.6 -11.2 A 6.6 6.6 0 1 1 6.6 -11.2 C 6.6 -8.6 5.2 -6.4 0 0 Z',
        class: 'pin-body',
      }, g);
      const t = el('text', {
        y: -11.2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        class: 'pin-text',
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
    this.nodeElements.forEach((g, id) => {
      g.classList.toggle('is-selected', id === this.selectedId);
      g.classList.toggle('is-on-route', !!this.route && this.route.found && this.route.path.includes(id));
    });
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
