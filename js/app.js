/*
 * app.js — ตัวควบคุมหลักของเว็บแผนที่นำทางโรงเรียนบดินทรเดชา
 * ---------------------------------------------------------------
 * หน้าที่: โหลดข้อมูล JSON -> สร้างกราฟ -> ผูก UI เข้ากับอัลกอริทึม
 */

'use strict';

const DATA_FILES = ['data/buildings.json', 'data/nodes.json', 'data/edges.json'];

/* ประเภทโหนดที่ไม่ต้องแสดงในช่องค้นหา (เป็นโครงสร้างภายในของกราฟ) */
const HIDDEN_TYPES = new Set(['corridor', 'junction']);

const state = {
  graph: null,
  buildings: [],
  buildingsById: new Map(),
  areas: [],
  map: null,
  searchable: [],
  start: null,
  goal: null,
  route: null,
  options: {
    metric: 'distance',
    algorithm: 'astar',
    avoidStairs: false,
  },
};

/* =============================================================
 * โหลดข้อมูล
 * ============================================================= */
async function loadData() {
  const [buildingsDoc, nodesDoc, edgesDoc] = await Promise.all(
    DATA_FILES.map(async (path) => {
      const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`โหลด ${path} ไม่สำเร็จ (HTTP ${res.status})`);
      return res.json();
    }),
  );

  state.buildings = buildingsDoc.buildings || [];
  state.areas = buildingsDoc.areas || [];
  state.meta = buildingsDoc.meta || {};
  state.buildingsById = new Map(state.buildings.map((b) => [b.id, b]));
  state.graph = new Graph(nodesDoc.nodes || [], edgesDoc.edges || []);

  state.searchable = [...state.graph.nodes.values()]
    .filter((n) => !HIDDEN_TYPES.has(n.type))
    .map((n) => {
      const building = n.building ? state.buildingsById.get(n.building) : null;
      const context = building
        ? `${building.name} · ชั้น ${n.floor}`
        : `${Directions.typeLabel(n.type)} · ชั้น ${n.floor}`;
      // รวมคำอธิบายและชื่อพ้องเข้าไปด้วย เพื่อให้ค้นด้วยรหัสห้องแล้วเจอ
      const haystack = [
        n.name, context, Directions.typeLabel(n.type), n.description || '',
        ...(n.aliases || []),
      ].join(' ').toLowerCase();
      return { node: n, context, haystack };
    })
    .sort((a, b) => a.node.name.localeCompare(b.node.name, 'th'));
}

/* =============================================================
 * ตัวช่วยเล็ก ๆ
 * ============================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function normalize(text) {
  return (text || '').toLowerCase().replace(/\s+/g, '');
}

function nodeContext(node) {
  const building = node.building ? state.buildingsById.get(node.building) : null;
  return building
    ? `${building.name} · ชั้น ${node.floor}`
    : `${Directions.typeLabel(node.type)} · ชั้น ${node.floor}`;
}

/* =============================================================
 * ช่องค้นหาแบบมีรายการแนะนำ (combobox)
 * ============================================================= */
class LocationPicker {
  constructor(wrapper, onSelect) {
    this.wrapper = wrapper;
    this.input = $('input', wrapper);
    this.list = $('.picker-list', wrapper);
    this.clearBtn = $('.picker-clear', wrapper);
    this.onSelect = onSelect;
    this.selected = null;
    this.matches = [];
    this.activeIndex = -1;

    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('focus', () => this.refresh());
    this.input.addEventListener('keydown', (evt) => this.onKeyDown(evt));
    this.clearBtn.addEventListener('click', () => this.clear());
    document.addEventListener('click', (evt) => {
      if (!wrapper.contains(evt.target)) this.close();
    });
  }

  clear() {
    this.selected = null;
    this.input.value = '';
    this.close();
    this.wrapper.classList.remove('has-value');
    this.onSelect(null);
    this.input.focus();
  }

  set(node) {
    this.selected = node;
    this.input.value = node ? node.name : '';
    this.wrapper.classList.toggle('has-value', !!node);
    this.close();
  }

  search(query) {
    const q = normalize(query);
    if (!q) return state.searchable.slice(0, 12);
    const scored = [];
    state.searchable.forEach((entry) => {
      const name = normalize(entry.node.name);
      let score = -1;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (normalize(entry.haystack).includes(q)) score = 3;
      if (score >= 0) scored.push({ entry, score });
    });
    scored.sort((a, b) => a.score - b.score
      || a.entry.node.name.localeCompare(b.entry.node.name, 'th'));
    return scored.slice(0, 30).map((s) => s.entry);
  }

  refresh() {
    this.matches = this.search(this.input.value);
    this.activeIndex = -1;
    this.list.innerHTML = '';
    if (this.matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'picker-empty';
      empty.textContent = 'ไม่พบสถานที่ที่ตรงกับคำค้น';
      this.list.appendChild(empty);
    }
    this.matches.forEach((entry, index) => {
      const style = TYPE_STYLE[entry.node.type] || {};
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'picker-item';
      item.dataset.index = index;
      item.innerHTML = `
        <span class="picker-glyph" style="background:${style.color || '#64748b'}22;color:${style.color || '#334155'}">${style.glyph || '📍'}</span>
        <span class="picker-text">
          <span class="picker-name"></span>
          <span class="picker-context"></span>
        </span>`;
      $('.picker-name', item).textContent = entry.node.name;
      $('.picker-context', item).textContent = entry.context;
      item.addEventListener('click', () => {
        this.set(entry.node);
        this.onSelect(entry.node);
      });
      this.list.appendChild(item);
    });
    this.wrapper.classList.add('is-open');
  }

  close() {
    this.wrapper.classList.remove('is-open');
  }

  onKeyDown(evt) {
    if (evt.key === 'Escape') { this.close(); return; }
    if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
      evt.preventDefault();
      if (!this.wrapper.classList.contains('is-open')) this.refresh();
      const dir = evt.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex = (this.activeIndex + dir + this.matches.length) % Math.max(1, this.matches.length);
      $$('.picker-item', this.list).forEach((item, i) => {
        item.classList.toggle('is-active', i === this.activeIndex);
        if (i === this.activeIndex) item.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      const pick = this.matches[this.activeIndex >= 0 ? this.activeIndex : 0];
      if (pick) {
        this.set(pick.node);
        this.onSelect(pick.node);
      }
    }
  }
}

/* =============================================================
 * แสดงผลเส้นทาง
 * ============================================================= */
const ICON_SVG = {
  start: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
  finish: '<path d="M6 3v18M6 4h11l-2.5 4L17 12H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  straight: '<path d="M12 20V6m0 0-5 5m5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  left: '<path d="M18 20v-8a4 4 0 0 0-4-4H6m0 0 5-5M6 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M6 20v-8a4 4 0 0 1 4-4h8m0 0-5-5m5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  'slight-left': '<path d="M15 20v-7a5 5 0 0 0-2-4L8 6m0 0h5M8 6v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  'slight-right': '<path d="M9 20v-7a5 5 0 0 1 2-4l5-3m0 0h-5m5 0v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  'stairs-up': '<path d="M3 21h4v-4h4v-4h4V9h4V5h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  'stairs-down': '<path d="M21 3h-4v4h-4v4H9v4H5v4H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  elevator: '<rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 10l1.5-2L12 10M12 14l1.5 2 1.5-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  building: '<path d="M4 21V6l8-3 8 3v15M9 21v-5h6v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  outdoor: '<path d="M12 3v18M5 12a7 7 0 0 1 7-7 7 7 0 0 1 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_SVG[name] || ICON_SVG.straight}</svg>`;
}

/**
 * อาคารที่ขึ้นไปชั้นบนได้โดยไม่ต้องใช้บันได
 * ใช้ BFS บนกราฟที่ตัดเส้นเชื่อมชนิดบันไดออก แล้วดูว่าเหลืออาคารใดที่ยังไปถึงชั้นสองขึ้นไปได้
 */
function stepFreeBuildingNames() {
  const origin = state.start || [...state.graph.nodes.values()][0];
  const visited = new Set([origin.id]);
  const queue = [origin.id];
  while (queue.length > 0) {
    const current = queue.pop();
    state.graph.neighbors(current).forEach((link) => {
      if (visited.has(link.to)) return;
      if (!Graph.allowed(link.edge, { avoidStairs: true })) return;
      visited.add(link.to);
      queue.push(link.to);
    });
  }
  const names = new Set();
  visited.forEach((id) => {
    const n = state.graph.node(id);
    if (n && n.building && n.floor > 1) {
      const b = state.buildingsById.get(n.building);
      if (b) names.add(b.name);
    }
  });
  return [...names];
}

function renderRoute() {
  const panel = $('#result-panel');
  const route = state.route;

  if (!route) {
    panel.hidden = true;
    state.view.renderRoute(null);
    return;
  }

  panel.hidden = false;

  if (!route.found) {
    const goal = state.graph.node(state.goal.id);
    const goalBuilding = goal.building ? state.buildingsById.get(goal.building) : null;
    const stepFree = state.options.avoidStairs ? stepFreeBuildingNames() : [];
    $('#result-body').innerHTML = `
      <div class="notice notice-warn">
        <strong>ไม่พบเส้นทางที่เชื่อมถึงกัน</strong>
        ${state.options.avoidStairs ? `
          <p>ขณะนี้เปิดตัวเลือก <strong>เลี่ยงบันได</strong> อยู่ แต่ในชุดข้อมูลปัจจุบัน
          ${goalBuilding ? `<strong>${goalBuilding.name} ชั้น ${goal.floor}</strong>` : 'ปลายทางนี้'}
          ยังไม่มีลิฟต์หรือทางลาดบันทึกไว้ จึงขึ้นไปได้ด้วยบันไดเท่านั้น</p>
          <p>อาคารที่ขึ้นชั้นบนได้โดยไม่ใช้บันได:
          ${stepFree.length ? stepFree.join(', ') : 'ยังไม่มีในข้อมูล'}</p>
          <p>ในชุดข้อมูลนี้ บันไดเป็นทางเดียวที่ข้ามชั้นได้
          ส่วนทางเชื่อมระหว่างอาคารอยู่ที่ชั้น 2 เท่านั้น
          ถ้าต้องการลิฟต์หรือทางลาด ให้เพิ่มโหนดและเส้นเชื่อมชนิด
          <code>elevator</code> หรือ <code>ramp</code> ใน <code>data/</code></p>`
        : '<p>โหนดปลายทางอาจยังไม่มีเส้นเชื่อมกับส่วนอื่นของกราฟ ลองตรวจข้อมูลด้วย <code>python tools/validate_data.py</code></p>'}
      </div>`;
    state.view.renderRoute(null);
    return;
  }

  const steps = Directions.build(state.graph, route, state.buildingsById);
  const startNode = state.graph.node(route.path[0]);
  const goalNode = state.graph.node(route.path[route.path.length - 1]);
  const floors = [...new Set(route.path
    .map((id) => state.graph.node(id))
    .filter((n) => n.building)
    .map((n) => n.floor))].sort((a, b) => a - b);

  const summary = `
    <div class="route-summary">
      <div class="route-headline">
        <span class="route-from">${startNode.name}</span>
        <span class="route-arrow">→</span>
        <span class="route-to">${goalNode.name}</span>
      </div>
      <div class="route-metrics">
        <div class="metric metric-primary">
          <span class="metric-value">${Directions.formatDuration(route.time)}</span>
          <span class="metric-label">เวลาเดินโดยประมาณ</span>
        </div>
        <div class="metric">
          <span class="metric-value">${Directions.formatDistance(route.distance)}</span>
          <span class="metric-label">ระยะทาง</span>
        </div>
        <div class="metric">
          <span class="metric-value">${route.floorChanges}</span>
          <span class="metric-label">ช่วงขึ้น-ลงชั้น</span>
        </div>
      </div>
      ${floors.length > 1 ? `<div class="route-floors">
        <span class="route-floors-label">ชั้นที่ผ่าน</span>
        ${floors.map((f) => `<button type="button" class="chip floor-chip" data-floor="${f}">ชั้น ${f}</button>`).join('')}
      </div>` : ''}
      <div class="route-stats">
        คำนวณด้วย ${route.stats.algorithm} · สำรวจ ${route.stats.visited} โหนด ·
        คลาย ${route.stats.relaxed} เส้นเชื่อม · ${route.stats.ms.toFixed(1)} มิลลิวินาที
      </div>
    </div>`;

  const list = `
    <ol class="steps">
      ${steps.map((s, i) => `
        <li class="step" data-node="${s.nodeId}" data-floor="${s.floor}" tabindex="0">
          <span class="step-index">${i + 1}</span>
          <span class="step-icon icon-${s.icon}">${icon(s.icon)}</span>
          <span class="step-body">
            <span class="step-title"></span>
            <span class="step-detail"></span>
          </span>
          ${s.distance > 0 ? `<span class="step-distance">${Directions.formatDistance(s.distance)}</span>` : ''}
        </li>`).join('')}
    </ol>`;

  $('#result-body').innerHTML = summary + list;

  // ใส่ข้อความแบบ textContent เพื่อเลี่ยงปัญหาอักขระพิเศษในชื่อห้อง
  $$('#result-body .step').forEach((li, i) => {
    $('.step-title', li).textContent = steps[i].title;
    $('.step-detail', li).textContent = steps[i].detail;
    const focus = () => {
      state.view.focusNode(steps[i].nodeId);
      state.view.select(steps[i].nodeId);
      $$('#result-body .step').forEach((x) => x.classList.remove('is-active'));
      li.classList.add('is-active');
    };
    li.addEventListener('click', focus);
    li.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); focus(); }
    });
  });

  $$('#result-body .floor-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.view.setFloor(Number(chip.dataset.floor));
      updateFloorButtons();
    });
  });

  // เส้นทางที่อยู่ชั้นเดียวจะเน้นชั้นนั้น ถ้าข้ามชั้นให้แสดงทุกชั้นเพื่อเห็นทั้งเส้นทาง
  state.view.setFloor(floors.length === 1 ? floors[0] : null);
  updateFloorButtons();
  state.view.setEndpoints(startNode.id, goalNode.id);
  state.view.renderRoute(route);
  state.view.focusNode(startNode.id, 2.6);
}

function calculateRoute() {
  if (!state.start || !state.goal) {
    showToast('กรุณาเลือกทั้งจุดเริ่มต้นและจุดหมาย');
    return;
  }
  if (state.start.id === state.goal.id) {
    showToast('จุดเริ่มต้นและจุดหมายเป็นที่เดียวกัน');
    return;
  }
  state.route = state.graph.shortestPath(state.start.id, state.goal.id, state.options);
  renderRoute();
  syncHash();
  if (window.matchMedia('(max-width: 900px)').matches) {
    $('.sidebar').classList.add('is-expanded');
  }
}

/* =============================================================
 * ค้นหาสถานที่ประเภทที่ต้องการที่ใกล้ที่สุด (multi-target Dijkstra)
 * ============================================================= */
function findNearest(types, label) {
  const origin = state.start || state.goal;
  if (!origin) {
    showToast('เลือก "จุดเริ่มต้น" ก่อน แล้วระบบจะหาจุดที่ใกล้ที่สุดให้');
    return;
  }
  const wanted = new Set(types);
  const results = state.graph.nearest(
    origin.id,
    (n) => wanted.has(n.type),
    Object.assign({}, state.options, { limit: 3 }),
  );
  if (results.length === 0) {
    showToast(`ไม่พบ${label}ที่เดินถึงได้จาก ${origin.name}`);
    return;
  }
  const best = results[0];
  state.goal = best.node;
  pickers.goal.set(best.node);
  state.route = state.graph.shortestPath(origin.id, best.node.id, state.options);
  renderRoute();
  syncHash();
  showToast(`${label}ที่ใกล้ที่สุดคือ ${best.node.name} (${Directions.formatDistance(best.distance)})`);
}

/* =============================================================
 * แผงรายละเอียดสถานที่
 * ============================================================= */
function showNodeDetail(node) {
  const panel = $('#detail-panel');
  const style = TYPE_STYLE[node.type] || {};
  const building = node.building ? state.buildingsById.get(node.building) : null;

  const degree = state.graph.neighbors(node.id).length;
  const facts = [
    building ? ['อาคาร', building.name] : ['บริเวณ', Directions.typeLabel(node.type)],
    ['ชั้น', `ชั้น ${node.floor}`],
    ['พิกัดในไฟล์', `x ${node.x}, y ${node.y}`],
    ['ประเภท', Directions.typeLabel(node.type)],
    ['รหัสโหนด', node.id],
    ['จำนวนทางเชื่อม', `${degree} เส้นทาง`],
    node.open ? ['เวลาเปิด', node.open] : null,
    node.source ? ['ที่มาของข้อมูล', node.source] : null,
  ].filter(Boolean);

  panel.hidden = false;
  panel.innerHTML = `
    <div class="panel-head">
      <span class="detail-glyph" style="background:${style.color || '#64748b'}1f;color:${style.color || '#334155'}">${style.glyph || '📍'}</span>
      <div>
        <h2 class="detail-name"></h2>
        <p class="detail-context"></p>
      </div>
      <button type="button" class="icon-btn" id="detail-close" aria-label="ปิด">✕</button>
    </div>
    ${node.photo ? `<img class="detail-photo" src="${node.photo}" alt="" loading="lazy"
        onerror="this.remove()">`
      : `<div class="detail-photo detail-photo--empty">ยังไม่มีรูปถ่ายของสถานที่นี้<br>
         <small>เพิ่มได้ที่ฟิลด์ <code>photo</code> ใน data/nodes.json</small></div>`}
    ${node.description ? '<p class="detail-desc"></p>' : ''}
    <dl class="detail-facts">
      ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd class="fact-value"></dd></div>`).join('')}
    </dl>
    <div class="detail-actions">
      <button type="button" class="btn btn-ghost" id="set-start">ตั้งเป็นจุดเริ่มต้น</button>
      <button type="button" class="btn btn-primary" id="set-goal">นำทางไปที่นี่</button>
    </div>`;

  $('.detail-name', panel).textContent = node.name;
  $('.detail-context', panel).textContent = nodeContext(node);
  if (node.description) $('.detail-desc', panel).textContent = node.description;
  $$('.fact-value', panel).forEach((dd, i) => { dd.textContent = facts[i][1]; });

  $('#detail-close', panel).addEventListener('click', () => { panel.hidden = true; });
  $('#set-start', panel).addEventListener('click', () => {
    state.start = node;
    pickers.start.set(node);
    state.view.setEndpoints(node.id, state.goal ? state.goal.id : null);
    if (state.goal) calculateRoute();
  });
  $('#set-goal', panel).addEventListener('click', () => {
    state.goal = node;
    pickers.goal.set(node);
    state.view.setEndpoints(state.start ? state.start.id : null, node.id);
    if (state.start) calculateRoute();
    else showToast('เลือกจุดเริ่มต้นเพื่อคำนวณเส้นทาง');
  });
}

/* =============================================================
 * ตัวควบคุมภาพ 3 มิติ
 * ============================================================= */
function updateFloorButtons() {
  $$('#floor-switch button').forEach((btn) => {
    const value = btn.dataset.floor === 'all' ? null : Number(btn.dataset.floor);
    btn.classList.toggle('is-active', value === state.view.floor);
  });
}

/**
 * ปุ่มเลือกชั้น — "ทั้งหมด" คือแสดงทุกชั้นพร้อมกัน
 * ส่วนการเลือกชั้นใดชั้นหนึ่งจะทำให้ชั้นอื่นจางลง (ไม่ได้ซ่อน) เพื่อยังเห็นบริบท
 */
function buildFloorSwitch() {
  const wrap = $('#floor-switch');
  wrap.innerHTML = '';
  const add = (value, text, title) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.floor = value;
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener('click', () => {
      state.view.setFloor(value === 'all' ? null : Number(value));
      updateFloorButtons();
    });
    wrap.appendChild(btn);
  };
  add('all', 'ทั้งหมด', 'แสดงทุกชั้น');
  state.view.availableFloors().forEach((f) => add(f, String(f), `เน้นชั้น ${f}`));
  updateFloorButtons();
}

/** สัญลักษณ์โหนด — สร้างจากประเภทที่มีจริงในไฟล์ข้อมูล */
function buildLegend() {
  const wrap = $('#legend-items');
  const shown = Object.keys(state.graph.statistics().byType);
  wrap.innerHTML = shown.map((t) => {
    const s = TYPE_STYLE[t] || { color: '#94a3b8', glyph: '', label: t };
    const count = state.graph.statistics().byType[t];
    return `<button type="button" class="legend-item is-on" data-type="${t}">
      <span class="legend-dot" style="background:${s.color}">${s.glyph || ''}</span>
      <span>${s.label} (${count})</span></button>`;
  }).join('');

  const active = new Set(shown);
  $$('.legend-item', wrap).forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.type;
      if (active.has(t)) active.delete(t); else active.add(t);
      btn.classList.toggle('is-on', active.has(t));
      state.view.setTypeFilter(active.size === shown.length ? null : active);
    });
  });

  // สัญลักษณ์ของเส้นเชื่อมแต่ละชนิด (ดูอย่างเดียว ไม่ใช่ปุ่มกด)
  const edgeTypes = [...new Set(state.graph.edges.map((e) => e.type))];
  const EDGE_LABEL = {
    corridor: 'ทางเดินในชั้น',
    stairs_up: 'บันไดขึ้น',
    stairs_down: 'บันไดลง',
    bridge: 'ทางเชื่อมระหว่างอาคาร',
    elevator: 'ลิฟต์',
    ramp: 'ทางลาด',
  };
  $('#legend-edges').innerHTML = edgeTypes.map((t) => {
    const s = EDGE_STYLE[t] || { color: '#94a3b8' };
    return `<span class="legend-edge">
      <i style="background:${s.color}"></i>${EDGE_LABEL[t] || t}</span>`;
  }).join('');
}

/* =============================================================
 * แจ้งเตือนสั้น ๆ
 * ============================================================= */
let toastTimer = null;
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3800);
}

/* =============================================================
 * แชร์เส้นทางผ่าน URL
 * ============================================================= */
function syncHash() {
  if (!state.start || !state.goal) return;
  const params = new URLSearchParams({
    from: state.start.id,
    to: state.goal.id,
    by: state.options.metric,
  });
  if (state.options.avoidStairs) params.set('nostairs', '1');
  history.replaceState(null, '', `#${params.toString()}`);
}

function restoreFromHash() {
  if (!location.hash) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const from = state.graph.node(params.get('from'));
  const to = state.graph.node(params.get('to'));
  if (!from || !to) return false;
  state.start = from;
  state.goal = to;
  pickers.start.set(from);
  pickers.goal.set(to);
  if (params.get('by') === 'time') {
    state.options.metric = 'time';
    $('input[name="metric"][value="time"]').checked = true;
  }
  if (params.get('nostairs') === '1') {
    state.options.avoidStairs = true;
    $('#opt-avoid-stairs').checked = true;
  }
  calculateRoute();
  return true;
}

/* =============================================================
 * เริ่มระบบ
 * ============================================================= */
let pickers = {};

async function main() {
  const loader = $('#loader');
  try {
    await loadData();
  } catch (err) {
    const isFile = location.protocol === 'file:';
    loader.innerHTML = `
      <div class="notice notice-error">
        <strong>โหลดข้อมูลแผนที่ไม่สำเร็จ</strong>
        <p class="load-error"></p>
        ${isFile ? `<p>เบราว์เซอร์ไม่อนุญาตให้อ่านไฟล์ JSON เมื่อเปิดหน้าเว็บด้วย
          <code>file://</code> โดยตรง ให้เปิดผ่านเว็บเซิร์ฟเวอร์แทน เช่น
          รันคำสั่งนี้ในโฟลเดอร์โปรเจกต์แล้วเปิด
          <code>http://localhost:8000</code></p>
          <pre><code>python -m http.server 8000</code></pre>` : ''}
      </div>`;
    $('.load-error', loader).textContent = err.message;
    return;
  }

  state.view = new Graph3DView($('#scene'), {
    graph: state.graph,
    buildings: state.buildings,
    buildingsById: state.buildingsById,
    floorHeight: (state.meta && state.meta.floorHeight) || 4,
  });
  state.view.onNodeClick = (node) => {
    state.view.select(node.id);
    showNodeDetail(node);
  };

  pickers = {
    start: new LocationPicker($('#picker-start'), (node) => {
      state.start = node;
      state.view.setEndpoints(node ? node.id : null, state.goal ? state.goal.id : null);
      if (node && state.goal) calculateRoute();
    }),
    goal: new LocationPicker($('#picker-goal'), (node) => {
      state.goal = node;
      state.view.setEndpoints(state.start ? state.start.id : null, node ? node.id : null);
      if (node && state.start) calculateRoute();
    }),
  };

  buildFloorSwitch();
  buildLegend();

  $('#route-form').addEventListener('submit', (evt) => {
    evt.preventDefault();
    calculateRoute();
  });

  $('#swap-btn').addEventListener('click', () => {
    const { start, goal } = state;
    state.start = goal;
    state.goal = start;
    pickers.start.set(goal);
    pickers.goal.set(start);
    state.view.setEndpoints(goal ? goal.id : null, start ? start.id : null);
    if (state.start && state.goal) calculateRoute();
  });

  $$('input[name="metric"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.options.metric = radio.value;
      if (state.start && state.goal) calculateRoute();
    });
  });

  $('#opt-avoid-stairs').addEventListener('change', (evt) => {
    state.options.avoidStairs = evt.target.checked;
    if (state.start && state.goal) calculateRoute();
  });

  $('#opt-algorithm').addEventListener('change', (evt) => {
    state.options.algorithm = evt.target.value;
    if (state.start && state.goal) calculateRoute();
  });

  $('#opt-show-edges').addEventListener('change', (evt) => {
    state.view.setShowEdges(evt.target.checked);
    state.view.renderRoute(state.route);
  });

  $$('.nearest-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      findNearest(btn.dataset.types.split(','), btn.dataset.label);
    });
  });

  $('#zoom-in').addEventListener('click', () => state.view.zoomIn());
  $('#zoom-out').addEventListener('click', () => state.view.zoomOut());
  $('#zoom-fit').addEventListener('click', () => state.view.fit());

  /* ---- ปุ่มสลับสถานะของภาพ 3 มิติ ---- */
  const toggle = (id, apply) => {
    const btn = $(id);
    btn.addEventListener('click', () => {
      const on = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
      apply(on);
    });
  };
  toggle('#btn-spin', (on) => state.view.setAutoRotate(on));
  toggle('#btn-grid', (on) => state.view.setShowGrid(on));
  toggle('#btn-labels', (on) => state.view.setShowLabels(on));

  $('#btn-reset').addEventListener('click', () => state.view.resetView());
  $('#floor-gap').addEventListener('input', (evt) => {
    state.view.setFloorGap(evt.target.value);
  });

  $('#sheet-handle').addEventListener('click', () => {
    $('.sidebar').classList.toggle('is-expanded');
  });

  // กล่อง "เกี่ยวกับระบบ"
  const stats = state.graph.statistics();
  $('#stat-nodes').textContent = stats.nodes.toLocaleString('th-TH');
  $('#stat-edges').textContent = stats.edges.toLocaleString('th-TH');
  $('#stat-degree').textContent = stats.averageDegree.toFixed(2);
  $('#stat-buildings').textContent = state.buildings.length;

  const about = $('#about-dialog');
  $('#about-btn').addEventListener('click', () => about.showModal());
  $('#about-close').addEventListener('click', () => about.close());

  loader.remove();
  document.body.classList.add('is-ready');

  if (!restoreFromHash()) {
    // ตั้งค่าเริ่มต้นเป็นห้องแรกของอาคาร 1 ชั้น 1
    const first = state.graph.node('b1-f1-r01') || [...state.graph.nodes.values()][0];
    if (first) {
      state.start = first;
      pickers.start.set(first);
      state.view.setEndpoints(first.id, null);
    }
  }
}

document.addEventListener('DOMContentLoaded', main);
