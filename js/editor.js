/*
 * editor.js — เครื่องมือแก้ไขโหนดและเส้นเชื่อมของแผนที่
 * ---------------------------------------------------------------
 * แก้ไขในเบราว์เซอร์ เก็บร่างไว้ใน localStorage แล้วส่งออกเป็นไฟล์ JSON
 * เพื่อนำไปวางทับไฟล์ใน data/ ของโปรเจกต์
 */

'use strict';

const STORAGE_KEY = 'bodin-map-editor-draft-v1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const NODE_TYPES = [
  'classroom', 'lab', 'computer_lab', 'teacher_room', 'office', 'library',
  'toilet', 'health_room', 'canteen', 'shop', 'meeting', 'activity',
  'stairs', 'elevator', 'entrance', 'gate', 'landmark', 'corridor', 'junction',
];

const EDGE_TYPES = [
  'corridor', 'outdoor', 'room', 'entrance', 'ramp',
  'stairs_up', 'stairs_down', 'elevator',
];

/* ความเร็วเดินเฉลี่ย (เมตร/วินาที) ตรงกับที่ใช้ใน tools/generate_data.py */
const SPEED = {
  corridor: 1.30, outdoor: 1.40, room: 1.10, entrance: 1.20,
  ramp: 0.90, stairs_up: 0.42, stairs_down: 0.62, elevator: 0.55,
};

const ed = {
  nodes: [],
  edges: [],
  buildings: [],
  buildingsById: new Map(),
  areas: [],
  meta: {},
  graph: null,
  map: null,
  mode: 'select',
  selectedNodeId: null,
  selectedEdgeIndex: null,
  pendingEdgeFrom: null,
  dirty: false,
};

/* =============================================================
 * ตัวช่วย
 * ============================================================= */
let toastTimer = null;
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3600);
}

function markDirty() {
  ed.dirty = true;
  $('#dirty-flag').hidden = false;
  saveDraft();
}

function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      nodes: ed.nodes,
      edges: ed.edges,
    }));
  } catch (err) {
    console.warn('บันทึกร่างลง localStorage ไม่สำเร็จ', err);
  }
}

function distanceBetween(a, b) {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;
}

function estimateTime(distance, type) {
  return Math.max(1, Math.round(distance / (SPEED[type] || SPEED.corridor)));
}

function nodeById(id) {
  return ed.nodes.find((n) => n.id === id) || null;
}

function nodeLabel(id) {
  const n = nodeById(id);
  if (!n) return `⚠ ไม่พบโหนด ${id}`;
  const b = n.building ? ed.buildingsById.get(n.building) : null;
  return b ? `${n.name} (${b.shortName} ชั้น ${n.floor})` : n.name;
}

/** สร้างรหัสโหนดที่ยังไม่ถูกใช้ */
function makeNodeId(building, floor) {
  const base = building ? `${building}-f${floor}-n` : 'out-n';
  let i = 1;
  while (nodeById(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

/** หาว่าพิกัดที่คลิกอยู่ในอาคารใด */
function buildingAt(x, y) {
  return ed.buildings.find((b) => {
    const [x1, y1, x2, y2] = b.rect;
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  }) || null;
}

function rebuildGraph() {
  ed.graph = new Graph(ed.nodes, ed.edges);
  if (ed.map) ed.map.setGraph(ed.graph);
  $('#count-nodes').textContent = ed.nodes.length;
  $('#count-edges').textContent = ed.edges.length;
}

/* =============================================================
 * โหลดข้อมูล
 * ============================================================= */
async function loadData() {
  const [buildingsDoc, nodesDoc, edgesDoc] = await Promise.all(
    ['data/buildings.json', 'data/nodes.json', 'data/edges.json'].map(async (p) => {
      const res = await fetch(`${p}?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`โหลด ${p} ไม่สำเร็จ (HTTP ${res.status})`);
      return res.json();
    }),
  );

  ed.buildings = buildingsDoc.buildings || [];
  ed.areas = buildingsDoc.areas || [];
  ed.meta = buildingsDoc.meta || {};
  ed.buildingsById = new Map(ed.buildings.map((b) => [b.id, b]));

  const draft = readDraft();
  if (draft) {
    ed.nodes = draft.nodes;
    ed.edges = draft.edges;
    ed.dirty = true;
    $('#dirty-flag').hidden = false;
    showToast(`โหลดร่างที่บันทึกไว้เมื่อ ${new Date(draft.savedAt).toLocaleString('th-TH')}`);
  } else {
    ed.nodes = nodesDoc.nodes || [];
    ed.edges = edgesDoc.edges || [];
  }
}

function readDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!Array.isArray(draft.nodes) || !Array.isArray(draft.edges)) return null;
    return draft;
  } catch (err) {
    return null;
  }
}

/* =============================================================
 * รายการโหนด
 * ============================================================= */
function filteredNodes() {
  const q = $('#node-search').value.trim().toLowerCase();
  const building = $('#node-filter-building').value;
  const type = $('#node-filter-type').value;
  return ed.nodes.filter((n) => {
    if (building && (n.building || '') !== building) return false;
    if (type && n.type !== type) return false;
    if (!q) return true;
    return `${n.name} ${n.id} ${(n.aliases || []).join(' ')}`.toLowerCase().includes(q);
  });
}

function renderNodeList() {
  const list = $('#node-list');
  const matches = filteredNodes();
  const shown = matches.slice(0, 300);
  list.innerHTML = '';

  if (matches.length === 0) {
    list.innerHTML = '<p class="hint">ไม่พบโหนดที่ตรงกับเงื่อนไข</p>';
    return;
  }

  shown.forEach((n) => {
    const style = TYPE_STYLE[n.type] || { color: '#64748b', glyph: '📍' };
    const b = n.building ? ed.buildingsById.get(n.building) : null;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `list-row${n.id === ed.selectedNodeId ? ' is-selected' : ''}`;
    row.innerHTML = `
      <span class="row-glyph" style="background:${style.color}22;color:${style.color}">${style.glyph || '📍'}</span>
      <span class="row-text">
        <span class="row-title"></span>
        <span class="row-sub"></span>
      </span>`;
    $('.row-title', row).textContent = n.name;
    $('.row-sub', row).textContent = `${n.id} · ${b ? `${b.shortName} ชั้น ${n.floor}` : 'กลางแจ้ง'}`;
    row.addEventListener('click', () => selectNode(n.id));
    list.appendChild(row);
  });

  if (matches.length > shown.length) {
    const more = document.createElement('p');
    more.className = 'hint';
    more.textContent = `แสดง ${shown.length} จาก ${matches.length} รายการ — พิมพ์คำค้นเพื่อกรองให้แคบลง`;
    list.appendChild(more);
  }
}

function selectNode(id) {
  ed.selectedNodeId = id;
  ed.selectedEdgeIndex = null;
  ed.map.select(id);
  const node = nodeById(id);
  if (node && node.building) {
    ed.map.setFloor(node.floor);
    updateFloorButtons();
  }
  ed.map.focusNode(id, Math.max(ed.map.view.k, 3));
  renderNodeList();
  renderNodeForm();
}

/* =============================================================
 * ฟอร์มแก้ไขโหนด
 * ============================================================= */
function renderNodeForm() {
  const form = $('#node-form');
  const n = nodeById(ed.selectedNodeId);
  if (!n) { form.hidden = true; return; }

  const connected = ed.edges.filter((e) => e.from === n.id || e.to === n.id);
  form.hidden = false;
  form.innerHTML = `
    <div class="form-head">
      <h3>แก้ไขโหนด</h3>
      <code class="form-id">${n.id}</code>
    </div>

    <label>ชื่อสถานที่
      <input type="text" data-field="name" value="">
    </label>

    <label>ประเภท
      <select data-field="type">
        ${NODE_TYPES.map((t) => `<option value="${t}"${t === n.type ? ' selected' : ''}>${(TYPE_STYLE[t] || {}).label || t} (${t})</option>`).join('')}
      </select>
    </label>

    <div class="form-row">
      <label>อาคาร
        <select data-field="building">
          <option value="">— กลางแจ้ง —</option>
          ${ed.buildings.map((b) => `<option value="${b.id}"${b.id === n.building ? ' selected' : ''}>${b.name}</option>`).join('')}
        </select>
      </label>
      <label>ชั้น
        <input type="number" data-field="floor" min="0" max="12" step="1" value="${n.floor}">
      </label>
    </div>

    <div class="form-row">
      <label>พิกัด x (เมตร)
        <input type="number" data-field="x" step="0.1" value="${n.x}">
      </label>
      <label>พิกัด y (เมตร)
        <input type="number" data-field="y" step="0.1" value="${n.y}">
      </label>
    </div>

    <label>คำอธิบาย
      <textarea data-field="description" rows="3"></textarea>
    </label>

    <label>ลิงก์รูปถ่าย (เช่น assets/photos/room-121.jpg)
      <input type="text" data-field="photo" value="">
    </label>

    <label>ชื่อเรียกอื่น (คั่นด้วยจุลภาค — ช่วยให้ค้นหาเจอง่ายขึ้น)
      <input type="text" data-field="aliases" value="">
    </label>

    <p class="hint">มีเส้นเชื่อมกับโหนดนี้ ${connected.length} เส้น</p>

    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-act="move">ย้ายตำแหน่ง (คลิกบนแผนที่)</button>
      <button type="button" class="btn btn-ghost btn-danger" data-act="delete">ลบโหนดนี้</button>
    </div>`;

  $('[data-field="name"]', form).value = n.name || '';
  $('[data-field="description"]', form).value = n.description || '';
  $('[data-field="photo"]', form).value = n.photo || '';
  $('[data-field="aliases"]', form).value = (n.aliases || []).join(', ');

  $$('[data-field]', form).forEach((input) => {
    input.addEventListener('change', () => {
      const field = input.dataset.field;
      if (field === 'aliases') {
        n.aliases = input.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (field === 'floor') {
        n.floor = Number(input.value) || 0;
      } else if (field === 'x' || field === 'y') {
        n[field] = Number(input.value) || 0;
        recomputeEdgesFor(n.id);
      } else if (field === 'building') {
        n.building = input.value || null;
      } else {
        n[field] = input.value;
      }
      markDirty();
      rebuildGraph();
      renderNodeList();
      renderEdgeList();
      if (field === 'x' || field === 'y' || field === 'building' || field === 'floor') renderNodeForm();
    });
  });

  $('[data-act="move"]', form).addEventListener('click', () => {
    setMode('move-node');
    showToast(`คลิกตำแหน่งใหม่บนแผนที่เพื่อย้าย "${n.name}"`);
  });

  $('[data-act="delete"]', form).addEventListener('click', () => {
    if (!confirm(`ลบโหนด "${n.name}" และเส้นเชื่อม ${connected.length} เส้นที่ต่อกับโหนดนี้?`)) return;
    ed.edges = ed.edges.filter((e) => e.from !== n.id && e.to !== n.id);
    ed.nodes = ed.nodes.filter((x) => x.id !== n.id);
    ed.selectedNodeId = null;
    markDirty();
    rebuildGraph();
    renderNodeList();
    renderEdgeList();
    form.hidden = true;
    showToast(`ลบ "${n.name}" แล้ว`);
  });
}

/** คำนวณระยะทาง/เวลาของเส้นเชื่อมที่ต่อกับโหนดนี้ใหม่หลังย้ายตำแหน่ง */
function recomputeEdgesFor(nodeId) {
  ed.edges.forEach((e) => {
    if (e.from !== nodeId && e.to !== nodeId) return;
    if (e.type === 'stairs_up' || e.type === 'stairs_down' || e.type === 'elevator') return;
    const a = nodeById(e.from);
    const b = nodeById(e.to);
    if (!a || !b) return;
    e.distance = Math.max(1, distanceBetween(a, b));
    e.time = estimateTime(e.distance, e.type);
  });
}

/* =============================================================
 * รายการเส้นเชื่อม
 * ============================================================= */
function renderEdgeList() {
  const list = $('#edge-list');
  const q = $('#edge-search').value.trim().toLowerCase();
  const type = $('#edge-filter-type').value;

  const matches = ed.edges
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => {
      if (type && e.type !== type) return false;
      if (!q) return true;
      const a = nodeById(e.from);
      const b = nodeById(e.to);
      return `${e.from} ${e.to} ${a ? a.name : ''} ${b ? b.name : ''}`.toLowerCase().includes(q);
    });

  list.innerHTML = '';
  if (matches.length === 0) {
    list.innerHTML = '<p class="hint">ไม่พบเส้นเชื่อมที่ตรงกับเงื่อนไข</p>';
    return;
  }

  matches.slice(0, 300).forEach(({ e, index }) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `list-row${index === ed.selectedEdgeIndex ? ' is-selected' : ''}`;
    row.innerHTML = `
      <span class="row-glyph row-glyph--edge">${e.bidirectional === false ? '→' : '↔'}</span>
      <span class="row-text">
        <span class="row-title"></span>
        <span class="row-sub"></span>
      </span>`;
    $('.row-title', row).textContent = `${nodeLabel(e.from)} ${e.bidirectional === false ? '→' : '↔'} ${nodeLabel(e.to)}`;
    $('.row-sub', row).textContent = `${e.type} · ${e.distance} ม. · ${e.time} วิ`;
    row.addEventListener('click', () => selectEdge(index));
    list.appendChild(row);
  });

  if (matches.length > 300) {
    const more = document.createElement('p');
    more.className = 'hint';
    more.textContent = `แสดง 300 จาก ${matches.length} รายการ`;
    list.appendChild(more);
  }
}

function selectEdge(index) {
  ed.selectedEdgeIndex = index;
  const e = ed.edges[index];
  if (e) {
    const a = nodeById(e.from);
    if (a && a.building) { ed.map.setFloor(a.floor); updateFloorButtons(); }
    if (a) ed.map.focusNode(a.id, Math.max(ed.map.view.k, 3));
  }
  renderEdgeList();
  renderEdgeForm();
}

function renderEdgeForm() {
  const form = $('#edge-form');
  const e = ed.edges[ed.selectedEdgeIndex];
  if (!e) { form.hidden = true; return; }

  const a = nodeById(e.from);
  const b = nodeById(e.to);
  const geometric = a && b ? distanceBetween(a, b) : null;

  form.hidden = false;
  form.innerHTML = `
    <div class="form-head"><h3>แก้ไขเส้นเชื่อม</h3></div>

    <label>จากโหนด
      <input type="text" data-field="from" value="${e.from}">
    </label>
    <label>ไปยังโหนด
      <input type="text" data-field="to" value="${e.to}">
    </label>

    <label>ประเภทเส้นทาง
      <select data-field="type">
        ${EDGE_TYPES.map((t) => `<option value="${t}"${t === e.type ? ' selected' : ''}>${t}</option>`).join('')}
      </select>
    </label>

    <div class="form-row">
      <label>ระยะทาง (เมตร)
        <input type="number" data-field="distance" step="0.1" min="0.1" value="${e.distance}">
      </label>
      <label>เวลาเดิน (วินาที)
        <input type="number" data-field="time" step="1" min="1" value="${e.time}">
      </label>
    </div>

    <label class="check">
      <input type="checkbox" data-field="bidirectional"${e.bidirectional !== false ? ' checked' : ''}>
      <span>เดินได้สองทาง (ปิดไว้สำหรับบันไดขึ้น/ลงที่ใช้เวลาต่างกัน)</span>
    </label>

    <label>หมายเหตุ
      <input type="text" data-field="note" value="">
    </label>

    ${geometric !== null ? `<p class="hint">ระยะตรงตามพิกัดคือ ${geometric} เมตร</p>` : '<p class="hint warn">⚠ มีโหนดปลายทางที่ไม่มีอยู่จริง</p>'}

    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-act="recalc">คำนวณระยะ/เวลาใหม่จากพิกัด</button>
      <button type="button" class="btn btn-ghost btn-danger" data-act="delete">ลบเส้นเชื่อมนี้</button>
    </div>`;

  $('[data-field="note"]', form).value = e.note || '';

  $$('[data-field]', form).forEach((input) => {
    input.addEventListener('change', () => {
      const field = input.dataset.field;
      if (field === 'bidirectional') e.bidirectional = input.checked;
      else if (field === 'distance' || field === 'time') e[field] = Number(input.value) || 1;
      else if (field === 'note') { if (input.value) e.note = input.value; else delete e.note; }
      else e[field] = input.value;
      markDirty();
      rebuildGraph();
      renderEdgeList();
      renderEdgeForm();
    });
  });

  $('[data-act="recalc"]', form).addEventListener('click', () => {
    if (!a || !b) { showToast('คำนวณไม่ได้ เพราะมีโหนดปลายทางที่ไม่มีอยู่จริง'); return; }
    e.distance = Math.max(1, distanceBetween(a, b));
    e.time = estimateTime(e.distance, e.type);
    markDirty();
    rebuildGraph();
    renderEdgeList();
    renderEdgeForm();
    showToast(`ปรับเป็น ${e.distance} เมตร / ${e.time} วินาที`);
  });

  $('[data-act="delete"]', form).addEventListener('click', () => {
    if (!confirm('ลบเส้นเชื่อมนี้?')) return;
    ed.edges.splice(ed.selectedEdgeIndex, 1);
    ed.selectedEdgeIndex = null;
    markDirty();
    rebuildGraph();
    renderEdgeList();
    form.hidden = true;
  });
}

/* =============================================================
 * โหมดการทำงานบนแผนที่
 * ============================================================= */
const MODE_HINT = {
  select: 'คลิกโหนดบนแผนที่เพื่อดูและแก้ไขรายละเอียด',
  'add-node': 'คลิกตำแหน่งบนแผนที่เพื่อวางโหนดใหม่ ระบบจะเดาอาคารและชั้นจากตำแหน่งที่คลิกให้',
  'add-edge': 'คลิกโหนดต้นทาง แล้วคลิกโหนดปลายทาง ระบบจะคำนวณระยะทางและเวลาให้อัตโนมัติ',
  'move-node': 'คลิกตำแหน่งใหม่บนแผนที่เพื่อย้ายโหนดที่เลือกไว้',
};

function setMode(mode) {
  ed.mode = mode;
  ed.pendingEdgeFrom = null;
  $$('.mode-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
  $('#mode-hint').textContent = MODE_HINT[mode] || '';
  $('.mapwrap').classList.toggle('is-placing', mode === 'add-node' || mode === 'move-node');
}

function handleMapClick(x, y) {
  if (ed.mode === 'add-node') {
    const b = buildingAt(x, y);
    const floor = b ? ed.map.floor : 0;
    const node = {
      id: makeNodeId(b ? b.id : null, floor),
      name: 'สถานที่ใหม่',
      type: b ? 'classroom' : 'landmark',
      building: b ? b.id : null,
      floor,
      x, y,
      description: '',
      photo: '',
      aliases: [],
    };
    ed.nodes.push(node);
    markDirty();
    rebuildGraph();
    setMode('select');
    selectNode(node.id);
    switchTab('nodes');
    showToast(`เพิ่มโหนด ${node.id} แล้ว — แก้ชื่อและประเภทได้ในฟอร์มด้านล่าง`);
    return;
  }

  if (ed.mode === 'move-node') {
    const n = nodeById(ed.selectedNodeId);
    if (!n) { setMode('select'); return; }
    n.x = x;
    n.y = y;
    const b = buildingAt(x, y);
    n.building = b ? b.id : null;
    n.floor = b ? ed.map.floor : 0;
    recomputeEdgesFor(n.id);
    markDirty();
    rebuildGraph();
    setMode('select');
    renderNodeForm();
    renderEdgeList();
    showToast(`ย้าย "${n.name}" ไปที่ (${x}, ${y}) แล้ว`);
  }
}

function handleNodeClick(node) {
  if (ed.mode === 'add-edge') {
    if (!ed.pendingEdgeFrom) {
      ed.pendingEdgeFrom = node.id;
      ed.map.select(node.id);
      showToast(`เลือกต้นทาง "${node.name}" แล้ว — คลิกโหนดปลายทาง`);
      return;
    }
    if (ed.pendingEdgeFrom === node.id) {
      showToast('ต้นทางและปลายทางเป็นโหนดเดียวกัน');
      return;
    }
    const a = nodeById(ed.pendingEdgeFrom);
    const exists = ed.edges.some((e) => (e.from === a.id && e.to === node.id)
      || (e.bidirectional !== false && e.from === node.id && e.to === a.id));
    if (exists) {
      showToast('มีเส้นเชื่อมระหว่างสองโหนดนี้อยู่แล้ว');
      ed.pendingEdgeFrom = null;
      return;
    }
    const sameSpot = a.building === node.building && a.floor === node.floor;
    const type = sameSpot ? (a.building ? 'corridor' : 'outdoor')
      : (a.building === node.building ? 'stairs_up' : 'outdoor');
    const distance = Math.max(1, distanceBetween(a, node));
    ed.edges.push({
      from: a.id,
      to: node.id,
      distance,
      time: estimateTime(distance, type),
      type,
      bidirectional: true,
    });
    ed.pendingEdgeFrom = null;
    markDirty();
    rebuildGraph();
    renderEdgeList();
    setMode('select');
    switchTab('edges');
    selectEdge(ed.edges.length - 1);
    showToast(`เชื่อม "${a.name}" กับ "${node.name}" แล้ว (${distance} เมตร)`);
    return;
  }

  selectNode(node.id);
  switchTab('nodes');
}

/* =============================================================
 * ตรวจสอบข้อมูล (ตรรกะเดียวกับ tools/validate_data.py)
 * ============================================================= */
function validate() {
  const errors = [];
  const warnings = [];
  const seen = new Map();

  ed.nodes.forEach((n) => {
    if (seen.has(n.id)) errors.push(`โหนด id ซ้ำ: ${n.id}`);
    seen.set(n.id, n);
    if (!n.name) warnings.push(`โหนด ${n.id} ยังไม่มีชื่อ`);
    if (typeof n.x !== 'number' || typeof n.y !== 'number') errors.push(`โหนด ${n.id} พิกัดไม่ถูกต้อง`);
  });

  const touched = new Set();
  ed.edges.forEach((e, i) => {
    ['from', 'to'].forEach((side) => {
      if (!seen.has(e[side])) errors.push(`เส้นเชื่อมที่ ${i + 1} อ้างถึงโหนดที่ไม่มีอยู่: ${e[side]}`);
    });
    if (!(e.distance > 0)) errors.push(`เส้นเชื่อมที่ ${i + 1} ระยะทางไม่ถูกต้อง: ${e.distance}`);
    if (!(e.time > 0)) errors.push(`เส้นเชื่อมที่ ${i + 1} เวลาไม่ถูกต้อง: ${e.time}`);
    if (!EDGE_TYPES.includes(e.type)) warnings.push(`เส้นเชื่อมที่ ${i + 1} ประเภทไม่รู้จัก: ${e.type}`);
    touched.add(e.from);
    touched.add(e.to);
  });

  ed.nodes.forEach((n) => {
    if (!touched.has(n.id)) warnings.push(`โหนด ${n.id} (${n.name}) ยังไม่มีเส้นเชื่อมเลย`);
  });

  // ตรวจความเชื่อมต่อด้วย BFS
  const graph = new Graph(ed.nodes, ed.edges);
  const startId = seen.has('out-gate2') ? 'out-gate2' : (ed.nodes[0] && ed.nodes[0].id);
  let unreachable = [];
  if (startId) {
    unreachable = graph.unreachableFrom(startId);
    if (unreachable.length > 0) {
      errors.push(`มี ${unreachable.length} โหนดที่เดินไปไม่ถึงจาก "${seen.get(startId).name}"`);
    }
  }

  const out = $('#validation-output');
  const rows = [];
  rows.push(`<p><strong>โหนด ${ed.nodes.length} จุด · เส้นเชื่อม ${ed.edges.length} เส้น</strong></p>`);
  if (errors.length === 0 && warnings.length === 0) {
    rows.push('<p class="ok">✅ ผ่านการตรวจสอบทั้งหมด</p>');
  }
  if (errors.length) {
    rows.push(`<p class="err">❌ ข้อผิดพลาด ${errors.length} ข้อ</p><ul>${
      errors.slice(0, 40).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`);
  }
  if (unreachable.length) {
    rows.push(`<details><summary>โหนดที่เดินไปไม่ถึง (${unreachable.length})</summary><ul>${
      unreachable.slice(0, 60).map((n) => `<li>${escapeHtml(`${n.id} — ${n.name}`)}</li>`).join('')}</ul></details>`);
  }
  if (warnings.length) {
    rows.push(`<details><summary>คำเตือน ${warnings.length} ข้อ</summary><ul>${
      warnings.slice(0, 60).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul></details>`);
  }
  out.innerHTML = rows.join('');
  switchTab('io');
  showToast(errors.length ? `พบข้อผิดพลาด ${errors.length} ข้อ` : 'ข้อมูลผ่านการตรวจสอบ');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* =============================================================
 * นำเข้า / ส่งออก
 * ============================================================= */
function download(kind) {
  const payloads = {
    nodes: { version: '1.0', nodes: ed.nodes },
    edges: { version: '1.0', edges: ed.edges },
    buildings: { meta: ed.meta, buildings: ed.buildings, areas: ed.areas },
  };
  const blob = new Blob([JSON.stringify(payloads[kind], null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${kind}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`ดาวน์โหลด ${kind}.json แล้ว — นำไปวางทับไฟล์ในโฟลเดอร์ data/`);
}

async function importFiles(fileList) {
  let loaded = 0;
  for (const file of fileList) {
    try {
      const doc = JSON.parse(await file.text());
      if (Array.isArray(doc.nodes)) { ed.nodes = doc.nodes; loaded += 1; }
      if (Array.isArray(doc.edges)) { ed.edges = doc.edges; loaded += 1; }
      if (Array.isArray(doc.buildings)) {
        ed.buildings = doc.buildings;
        ed.areas = doc.areas || ed.areas;
        ed.meta = doc.meta || ed.meta;
        ed.buildingsById = new Map(ed.buildings.map((b) => [b.id, b]));
        loaded += 1;
      }
    } catch (err) {
      showToast(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${err.message}`);
      return;
    }
  }
  if (loaded === 0) {
    showToast('ไม่พบข้อมูล nodes / edges / buildings ในไฟล์ที่เลือก');
    return;
  }
  ed.selectedNodeId = null;
  ed.selectedEdgeIndex = null;
  markDirty();
  rebuildGraph();
  buildFilters();
  renderNodeList();
  renderEdgeList();
  showToast(`นำเข้าข้อมูลสำเร็จ (${loaded} ชุด)`);
}

/* =============================================================
 * แท็บ / ตัวกรอง / ตัวควบคุมแผนที่
 * ============================================================= */
function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
}

function buildFilters() {
  $('#node-filter-building').innerHTML = ['<option value="">ทุกอาคาร</option>',
    ...ed.buildings.map((b) => `<option value="${b.id}">${b.name}</option>`)].join('');

  const usedTypes = [...new Set(ed.nodes.map((n) => n.type))].sort();
  $('#node-filter-type').innerHTML = ['<option value="">ทุกประเภท</option>',
    ...usedTypes.map((t) => `<option value="${t}">${(TYPE_STYLE[t] || {}).label || t}</option>`)].join('');

  const usedEdgeTypes = [...new Set(ed.edges.map((e) => e.type))].sort();
  $('#edge-filter-type').innerHTML = ['<option value="">ทุกประเภท</option>',
    ...usedEdgeTypes.map((t) => `<option value="${t}">${t}</option>`)].join('');
}

function updateFloorButtons() {
  $$('#floor-switch button').forEach((btn) => {
    btn.classList.toggle('is-active', Number(btn.dataset.floor) === ed.map.floor);
  });
}

function buildFloorSwitch() {
  const wrap = $('#floor-switch');
  wrap.innerHTML = '';
  const floors = [...new Set(ed.nodes.filter((n) => n.building).map((n) => n.floor))]
    .sort((a, b) => a - b);
  floors.forEach((f) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.floor = f;
    btn.textContent = f;
    btn.addEventListener('click', () => { ed.map.setFloor(f); updateFloorButtons(); });
    wrap.appendChild(btn);
  });
  updateFloorButtons();
}

/* =============================================================
 * เริ่มระบบ
 * ============================================================= */
async function main() {
  const loader = $('#loader');
  try {
    await loadData();
  } catch (err) {
    loader.innerHTML = `<div class="notice notice-error"><strong>โหลดข้อมูลไม่สำเร็จ</strong>
      <p class="load-error"></p>
      ${location.protocol === 'file:' ? '<p>เปิดหน้านี้ผ่านเว็บเซิร์ฟเวอร์ เช่น <code>python -m http.server 8000</code></p>' : ''}</div>`;
    $('.load-error', loader).textContent = err.message;
    return;
  }

  ed.graph = new Graph(ed.nodes, ed.edges);
  ed.map = new SchoolMap($('#map'), {
    graph: ed.graph,
    buildings: ed.buildings,
    buildingsById: ed.buildingsById,
    areas: ed.areas,
    extent: ed.meta.extent || [0, 0, 320, 232],
  });
  ed.map.setShowEdges(true);
  ed.map.onNodeClick = handleNodeClick;
  ed.map.onMapClick = handleMapClick;

  buildFloorSwitch();
  buildFilters();
  rebuildGraph();
  renderNodeList();
  renderEdgeList();
  setMode('select');

  $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $$('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  ['#node-search', '#node-filter-building', '#node-filter-type'].forEach((sel) => {
    $(sel).addEventListener('input', renderNodeList);
  });
  ['#edge-search', '#edge-filter-type'].forEach((sel) => {
    $(sel).addEventListener('input', renderEdgeList);
  });

  $('#validate-btn').addEventListener('click', validate);
  $('#export-btn').addEventListener('click', () => { switchTab('io'); download('nodes'); });
  $$('[data-download]').forEach((b) => b.addEventListener('click', () => download(b.dataset.download)));
  $('#import-file').addEventListener('change', (evt) => importFiles([...evt.target.files]));

  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('ล้างการแก้ไขทั้งหมดในเบราว์เซอร์ แล้วโหลดข้อมูลจากไฟล์ในโปรเจกต์ใหม่?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  $('#zoom-in').addEventListener('click', () => ed.map.zoomIn());
  $('#zoom-out').addEventListener('click', () => ed.map.zoomOut());
  $('#zoom-fit').addEventListener('click', () => ed.map.fit());

  window.addEventListener('beforeunload', (evt) => {
    if (!ed.dirty) return;
    evt.preventDefault();
    evt.returnValue = '';
  });

  loader.remove();
}

document.addEventListener('DOMContentLoaded', main);
