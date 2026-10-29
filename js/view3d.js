/*
 * view3d.js — แสดงกราฟ (โหนด + เส้นเชื่อม) เป็นภาพ 3 มิติที่หมุนได้
 * ---------------------------------------------------------------
 * ไม่มีแผนที่ ไม่มีผังพื้น วาดเฉพาะสิ่งที่มีในไฟล์ข้อมูลเท่านั้น คือ
 *   - โหนดจาก data/nodes.json  (x, y จากไฟล์ / z คำนวณจาก floor)
 *   - เส้นเชื่อมจาก data/edges.json
 *
 * คณิตศาสตร์ที่ใช้
 *   1) หมุนรอบแกน Z ด้วยมุม yaw   (หมุนแผนที่ซ้าย-ขวา)
 *   2) เอียงรอบแกน X ด้วยมุม pitch (ก้ม-เงย)
 *   3) ฉายภาพแบบเปอร์สเปกทีฟ  scale = focal / (dist + depth)
 *   4) เรียงลำดับวาดจากไกลไปใกล้ (painter's algorithm) เพื่อให้ทับกันถูกต้อง
 *
 * การควบคุมเป็นแบบเดียวกับโปรแกรมแผนที่ (Google Maps)
 *   ลากซ้าย            เลื่อนแผนที่
 *   ลากขวา / Ctrl+ลาก / Shift+ลาก   หมุนและก้ม-เงย
 *   สกรอลล์            ซูมเข้าหาตำแหน่งเมาส์
 *   สองนิ้ว            หุบ-กาง = ซูม · บิด = หมุน · เลื่อน = เลื่อนแผนที่
 *
 * ระยะระหว่างชั้นบนภาพถูกขยายให้มากกว่าความจริง เพื่อให้แยกชั้นได้ด้วยตา
 * ค่านี้ใช้กับการวาดภาพอย่างเดียว ไม่กระทบการคำนวณเส้นทาง
 */

'use strict';

/** สี สัญลักษณ์ และชื่อไทยของโหนดแต่ละประเภท */
const TYPE_STYLE = {
  classroom: { color: '#3b82f6', glyph: '🚪', label: 'ห้องเรียน' },
  stairs:    { color: '#f59e0b', glyph: '🪜', label: 'บันได' },
  bridge:    { color: '#22c55e', glyph: '🌉', label: 'ทางเชื่อมระหว่างอาคาร' },
  elevator:  { color: '#a855f7', glyph: '🛗', label: 'ลิฟต์' },
  corridor:  { color: '#94a3b8', glyph: '', label: 'ทางเดิน' },
  junction:  { color: '#94a3b8', glyph: '', label: 'ทางแยก' },
  entrance:  { color: '#10b981', glyph: '🚪', label: 'ทางเข้าอาคาร' },
  gate:      { color: '#16a34a', glyph: '🚧', label: 'ประตู' },
  toilet:    { color: '#0ea5e9', glyph: '🚻', label: 'ห้องน้ำ' },
  office:    { color: '#ef4444', glyph: '🏢', label: 'ห้องสำนักงาน' },
  library:   { color: '#7c3aed', glyph: '📚', label: 'หอสมุด' },
  meeting:   { color: '#8b5cf6', glyph: '🏛️', label: 'หอประบุม' },
  sport:     { color: '#14b8a6', glyph: '⚽', label: 'สนาม/อาคารกีฬา' },
  landmark:  { color: '#a16207', glyph: '📍', label: 'จุดสังเกต' },
  plaza:     { color: '#38bdf8', glyph: '', label: 'ลานกลางแจ้ง' },
};

/** สีและความหนาของเส้นเชื่อมแต่ละชนิด */
const EDGE_STYLE = {
  corridor:     { color: '#64748b', width: 1.6 },
  stairs_up:    { color: '#f59e0b', width: 2.4 },
  stairs_down:  { color: '#f59e0b', width: 2.4 },
  stairs:       { color: '#f59e0b', width: 2.4 },
  bridge:       { color: '#22c55e', width: 2.6 },
  elevator:     { color: '#a855f7', width: 2.4 },
  outdoor:      { color: '#38bdf8', width: 1.8 },
  room:         { color: '#3b82f6', width: 1.2 },
  entrance:     { color: '#10b981', width: 1.8 },
};

const DEFAULT_EDGE_STYLE = { color: '#94a3b8', width: 1.6 };

/** โทนสีของฉาก แยกตามธีมสว่าง/มืดของระบบ */
const THEMES = {
  light: {
    bgTop: '#f4f7fd', bgBottom: '#dbe3f2',
    grid: 'rgba(30,58,138,.16)', gridStrong: 'rgba(30,58,138,.34)',
    label: '#16203a', labelHalo: 'rgba(255,255,255,.9)',
    dim: '#94a3b8', hud: 'rgba(22,32,58,.6)',
  },
  dark: {
    bgTop: '#111a2c', bgBottom: '#070b14',
    grid: 'rgba(148,183,255,.16)', gridStrong: 'rgba(148,183,255,.36)',
    label: '#e8edf7', labelHalo: 'rgba(8,12,22,.85)',
    dim: '#64748b', hud: 'rgba(232,237,247,.55)',
  },
};

const ROUTE_COLOR = '#f97316';
const SELECT_COLOR = '#facc15';

/* ความทึบของทุกหน้าในโมเดลอาคาร = โปร่งแสง 20% มองทะลุเห็นเส้นทางข้างใน */
const BUILDING_ALPHA = 0.20;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/** ย่อมุมให้อยู่ในช่วง (-π, π] ใช้หาทางหมุนที่สั้นที่สุด */
function wrapAngle(a) {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}

const ROOF_PITCH = 0.32;   // ความชันหลังคาปริยายของผัง 3 มิติ = ความสูงสัน / ความกว้าง

/**
 * ทรงหลังคาของปีกอาคารสี่เหลี่ยม ตามค่า roofType / ends / pitch ของ buildings.js
 *
 * สันหลังคาวางตามแนวยาวของปีก ปลายที่เป็น "hip" ลาดเข้าหาสันเป็นทรงปั้นหยา
 * ส่วนปลายที่เป็น "gable" ตัดตรงเป็นหน้าจั่ว (ผนังสามเหลี่ยม ไม่ใช่หลังคา)
 * คืน null เมื่อหลังคาแบน หรือรูปทรงไม่ใช่สี่เหลี่ยมจนวางสันไม่ได้
 *
 * @param {{x:number,y:number}[]} ring  รูปทรงปีกอาคาร เรียงทวนเข็ม
 * @returns {{rise:number, a:{x,y}, b:{x,y}, i:number, ends:string[]}|null}
 *          rise = ความสูงจากชายคาถึงสัน (เมตร) · a, b = ปลายสันทั้งสองข้าง
 *          i = ดัชนีจุดเริ่มของด้านยาว (ring[i] -> ring[i+1])
 */
function roofGeometry(ring, roofType, ends, pitch) {
  if (roofType !== 'hip' && roofType !== 'gable') return null;
  if (ring.length !== 4) return null;

  // ด้านยาวที่สุดคือแนวของสันหลังคา
  let i = 0;
  let best = -1;
  for (let k = 0; k < 4; k += 1) {
    const a = ring[k];
    const c = ring[(k + 1) % 4];
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    if (len > best) { best = len; i = k; }
  }
  const p = (k) => ring[(i + k) % 4];
  const midA = { x: (p(0).x + p(3).x) / 2, y: (p(0).y + p(3).y) / 2 };
  const midB = { x: (p(1).x + p(2).x) / 2, y: (p(1).y + p(2).y) / 2 };
  const width = Math.hypot(p(3).x - p(0).x, p(3).y - p(0).y);
  const span = Math.hypot(midB.x - midA.x, midB.y - midA.y);
  if (!(width > 0.01) || !(span > 0.01)) return null;

  const kind = (ends && ends.length === 2) ? ends : [roofType, roofType];
  const ux = (midB.x - midA.x) / span;
  const uy = (midB.y - midA.y) / span;
  // ปลายปั้นหยาเริ่มสันเข้ามาครึ่งหนึ่งของความกว้าง หน้าจั่วเริ่มสันที่ผนังเลย
  const inA = kind[0] === 'hip' ? Math.min(width / 2, span / 2) : 0;
  const inB = kind[1] === 'hip' ? Math.min(width / 2, span / 2) : 0;
  return {
    rise: (typeof pitch === 'number' ? pitch : ROOF_PITCH) * width,
    a: { x: midA.x + ux * inA, y: midA.y + uy * inA },
    b: { x: midB.x - ux * inB, y: midB.y - uy * inB },
    i,
    ends: kind,
  };
}

/**
 * ลากแบบไหนคือ "หมุน" — ปุ่มขวา ปุ่มกลาง หรือกดปุ่มร่วมค้างไว้
 * นอกนั้นคือเลื่อนแผนที่ เหมือนการควบคุมของ Google Maps
 */
function isRotateDrag(evt) {
  return evt.button === 1 || evt.button === 2
      || evt.ctrlKey || evt.shiftKey || evt.metaKey || evt.altKey;
}

/** แปลงสี #rrggbb + ค่าความทึบ เป็น rgba() */
function rgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** พื้นที่มีเครื่องหมายของรูปหลายเหลี่ยมบนจอ ใช้ดูว่าหน้าไหนหันเข้าหรือหันออกจากกล้อง */
function screenArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.sx * b.sy - b.sx * a.sy;
  }
  return sum / 2;
}

/** ชื่อสั้นสำหรับป้ายกำกับบนภาพ */
function shortLabel(node) {
  if (node.type === 'stairs') {
    return node.name
      .replace(/^บันได/, 'บันได ')
      .replace(/\s*ชั้น\s*\d+$/, '')
      .replace(/\s*ฝั่ง/, ' ');
  }
  if (node.type === 'junction') {
    // "ทางแยกตึก 1 × อาคารเชื่อม ชั้น 2" -> "ตึก 1 × อาคารเชื่อม"
    return node.name.replace(/^ทางแยก/, '').replace(/\s*ชั้น\s*\d+$/, '');
  }
  if (node.type === 'corridor') return node.name.replace(/^ทางเดินหน้าห้อง\s*/, 'หน้าห้อง ');
  if (node.type === 'entrance') return node.name.replace(/^ทางเข้า/, 'เข้า ');
  if (node.type === 'plaza') return node.name.replace(/^ลานหน้า/, 'ลาน ');
  if (node.type === 'bridge') return node.name.replace(/\s*\(.*\)$/, '');
  return node.name.replace(/^ห้อง\s*/, '');
}

class Graph3DView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} deps { graph, buildings, buildingsById, floorHeight }
   */
  constructor(canvas, deps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.graph = deps.graph;
    this.buildings = deps.buildings || [];
    this.buildingsById = deps.buildingsById || new Map();

    this.nodes = [...this.graph.nodes.values()];
    this.edges = this.graph.edges;

    this.floors = [...new Set(this.nodes.map((n) => n.floor || 0))].sort((a, b) => a - b);
    this.minFloor = this.floors[0] || 0;

    /* ความสูงต่อชั้นจริง (เมตร) จาก meta.floorHeight ของ data/buildings.json */
    this.floorHeight = Number(deps.floorHeight) > 0 ? Number(deps.floorHeight) : 3.6;

    /* ระยะระหว่างชั้นบนภาพ เริ่มต้นเท่ากับความสูงชั้นจริง = สัดส่วนถูกต้อง 1:1
     * เลื่อนแถบ "ระยะห่างระหว่างชั้น" เพื่อดึงชั้นให้ห่างกันขึ้นเวลาดูเส้นทางได้ */
    this.floorGap = this.floorHeight;

    /* กล้อง */
    this.yaw = -0.62;
    this.pitch = 0.62;
    this.dist = 220;
    this.target = { x: 0, y: 0, z: 0 };

    /* สถานะการแสดงผล */
    this.floor = null;            // null = แสดงทุกชั้น
    this.typeFilter = null;       // null = แสดงทุกประเภท
    this.showEdges = true;        // false = แสดงเฉพาะเส้นทางที่ค้นหา
    this.showGrid = true;
    this.showBuildings = true;    // โมเดลอาคารโปร่งแสง เส้นทางวิ่งอยู่ข้างใน
    this.showLabels = true;
    this.autoRotate = false;

    this.route = null;
    this.routeEdges = new Set();
    this.routeNodes = new Set();
    this.routePts = [];       // จุดของเส้นทางในพิกัดโลก เรียงจากต้นทางไปปลายทาง
    this.routeCum = [];       // ระยะสะสมจากต้นทางถึงจุดที่ i
    this.routeTotal = 0;      // ความยาวรวมของเส้นทางบนภาพ
    this._routeT0 = 0;        // เวลาเริ่มต้นของจุดที่วิ่งบนเส้นทาง
    this.startId = null;
    this.goalId = null;
    this.selectedId = null;
    this.hoverId = null;

    this.onNodeClick = null;

    this._projected = new Map();
    this._shapes = null;          // รูปทรงอาคารที่แปลงไว้แล้ว (แคชไว้ใช้ซ้ำ)
    this._anim = null;
    this._dirty = true;
    this._time = 0;

    this._theme = matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.dark : THEMES.light;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this._theme = e.matches ? THEMES.dark : THEMES.light;
      this.invalidate();
    });

    this.centerOnData();
    this.bindEvents();
    this.resize();
    this.fit();
    this._booted = true;

    const loop = (t) => {
      this._time = t || 0;
      this.step();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* =============================================================
   * พิกัด 3 มิติของโหนด
   * ============================================================= */
  worldOf(node) {
    return {
      x: node.x,
      y: node.y,
      z: ((node.floor || this.minFloor) - this.minFloor) * this.floorGap,
    };
  }

  bounds() {
    const b = {
      minX: Infinity, maxX: -Infinity,
      minY: Infinity, maxY: -Infinity,
      minZ: Infinity, maxZ: -Infinity,
    };
    this.nodes.forEach((n) => {
      const p = this.worldOf(n);
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
      b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
      b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
    });
    return b;
  }

  centerOnData() {
    const b = this.bounds();
    this.target = {
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
      z: (b.minZ + b.maxZ) / 2,
    };
  }

  /**
   * เปลี่ยนกราฟที่กำลังแสดงโดยใช้อ็อบเจกต์ตัวเดิม
   * ใช้ในหน้าแก้ไขข้อมูล ที่ต้องวาดใหม่ทุกครั้งที่ JSON เปลี่ยน
   * (สร้าง Graph3DView ตัวใหม่ทุกครั้งไม่ได้ เพราะลูปวาดภาพของตัวเก่าจะยังทำงานค้างอยู่)
   */
  setGraph(graph, buildingsById, buildings) {
    this.graph = graph;
    this.buildingsById = buildingsById || new Map();
    if (buildings) this.buildings = buildings;
    else if (buildingsById) this.buildings = [...this.buildingsById.values()];
    this._shapes = null;
    this.nodes = [...graph.nodes.values()];
    this.edges = graph.edges;
    this.floors = [...new Set(this.nodes.map((n) => n.floor || 0))].sort((a, b) => a - b);
    this.minFloor = this.floors.length ? this.floors[0] : 0;

    // สถานะที่ผูกกับกราฟเดิมใช้ต่อไม่ได้ ต้องล้างทิ้ง
    this.route = null;
    this.routeEdges = new Set();
    this.routeNodes = new Set();
    this.routePts = [];       // จุดของเส้นทางในพิกัดโลก เรียงจากต้นทางไปปลายทาง
    this.routeCum = [];       // ระยะสะสมจากต้นทางถึงจุดที่ i
    this.routeTotal = 0;      // ความยาวรวมของเส้นทางบนภาพ
    this._routeT0 = 0;        // เวลาเริ่มต้นของจุดที่วิ่งบนเส้นทาง
    this.startId = null;
    this.goalId = null;
    this.selectedId = null;
    this.hoverId = null;
    this.floor = null;
    this._projected.clear();
    this._anim = null;

    this.centerOnData();
    this.invalidate();
  }

  /* =============================================================
   * การฉายภาพ
   * ============================================================= */
  get focal() {
    return Math.min(this.width, this.height) * 1.15;
  }

  /** หมุน + เอียง จุดในโลก ให้อยู่ในระบบพิกัดของกล้อง */
  toCamera(p) {
    const dx = p.x - this.target.x;
    const dy = p.y - this.target.y;
    const dz = p.z - this.target.z;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const x1 = dx * cy - dy * sy;
    const y1 = dx * sy + dy * cy;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    return {
      x: x1,
      depth: y1 * cp - dz * sp,
      up: y1 * sp + dz * cp,
    };
  }

  /** จุดในโลก -> พิกัดบนจอ (คืน null ถ้าอยู่หลังกล้อง) */
  project(p) {
    const c = this.toCamera(p);
    const depth = this.dist + c.depth;
    if (depth < 1) return null;
    const s = this.focal / depth;
    return {
      sx: this.width / 2 + c.x * s,
      sy: this.height / 2 - c.up * s,
      depth,
      scale: s,
    };
  }

  /**
   * ผกผันของ project(): จุดบนจอ -> จุดในโลกที่ระนาบ z = planeZ
   * ใช้ตอนซูมเข้าหาตำแหน่งเมาส์ (จุดใต้เคอร์เซอร์ต้องอยู่กับที่) แบบเดียวกับแผนที่
   * คืน null เมื่อรังสีจากกล้องขนานกับระนาบ หรือจุดตัดอยู่หลังกล้อง
   */
  unprojectToPlane(sx, sy, planeZ) {
    const f = this.focal;
    const u = (sx - this.width / 2) / f;
    const v = (this.height / 2 - sy) / f;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const dz = planeZ - this.target.z;

    // c.up = v*D, c.depth = D - dist  และ  dz = c.up*cp - c.depth*sp
    const den = v * cp + sp;
    if (Math.abs(den) < 1e-6) return null;
    const depth = (dz + this.dist * sp) / den;
    if (!(depth > 1)) return null;

    const x1 = u * depth;
    const y1 = v * depth * sp + (depth - this.dist) * cp;
    const cy = Math.cos(this.yaw);
    const sy2 = Math.sin(this.yaw);
    return {
      x: this.target.x + x1 * cy + y1 * sy2,
      y: this.target.y - x1 * sy2 + y1 * cy,
      z: planeZ,
    };
  }

  /** ซูมโดยตรึงจุดใต้เคอร์เซอร์ไว้กับที่ (ถ้าไม่ส่งตำแหน่งมา จะซูมเข้ากลางจอ) */
  zoomAt(factor, sx, sy) {
    const before = (sx === undefined) ? null : this.unprojectToPlane(sx, sy, this.groundZ);
    this.dist = clamp(this.dist * factor, 40, 4000);
    if (before) {
      const after = this.unprojectToPlane(sx, sy, this.groundZ);
      if (after) {
        this.target.x += before.x - after.x;
        this.target.y += before.y - after.y;
      }
    }
    this.invalidate();
  }

  /* =============================================================
   * ขนาดพื้นที่วาด
   * ============================================================= */
  resize() {
    // ถ้าก่อนหน้านี้แคนวาสยังไม่มีขนาดจริง (เช่น แท็บถูกซ่อนอยู่ตอนโหลด)
    // เมื่อได้ขนาดจริงแล้วต้องจัดมุมมองให้พอดีจอใหม่อีกครั้ง
    const wasUnsized = !(this.width > 2);
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wasUnsized && this.width > 2 && this._booted) this.fit();
    this.invalidate();
  }

  invalidate() {
    this._dirty = true;
  }

  /* =============================================================
   * จัดมุมมองให้เห็นทั้งกราฟพอดีจอ
   * ============================================================= */
  fit(margin = 0.86) {
    this.centerOnData();
    this.dist = this.distanceToFit(
      this.nodes.map((n) => this.worldOf(n)), this.target, this.yaw, this.pitch, margin,
    );
    this.invalidate();
  }

  /**
   * ระยะกล้องที่ทำให้จุดทุกจุดในลิสต์อยู่ในจอพอดี
   * แก้สมการ |x| * focal / (dist + depth) = halfW  แล้วหาค่า dist ที่มากที่สุดที่ต้องใช้
   * รับ yaw/pitch เข้ามาเป็นพารามิเตอร์ จึงคำนวณล่วงหน้าสำหรับมุมที่ยังไม่ได้หมุนไปได้
   */
  distanceToFit(points, target, yaw, pitch, margin = 0.86) {
    const halfW = (this.width / 2) * margin;
    const halfH = (this.height / 2) * margin;
    const focal = this.focal;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    let need = 60;
    points.forEach((p) => {
      const dx = p.x - target.x;
      const dy = p.y - target.y;
      const dz = p.z - target.z;
      const x1 = dx * cy - dy * sy;
      const y1 = dx * sy + dy * cy;
      const depth = y1 * cp - dz * sp;
      const up = y1 * sp + dz * cp;
      need = Math.max(need,
        (Math.abs(x1) * focal) / halfW - depth,
        (Math.abs(up) * focal) / halfH - depth);
    });
    return clamp(need, 40, 4000);
  }

  zoomIn() { this.dist = clamp(this.dist * 0.78, 40, 4000); this.invalidate(); }

  zoomOut() { this.dist = clamp(this.dist * 1.28, 40, 4000); this.invalidate(); }

  /* -------------------------------------------------------------
   * เลื่อนจุดศูนย์กลางภาพ / หมุนมุมมองแบบทีละขั้น
   * ใช้กับปุ่มบนหน้าจอและปุ่มลูกศรบนคีย์บอร์ด
   * (ลากเมาส์ยังทำได้เหมือนเดิมและให้ผลเดียวกัน)
   * ----------------------------------------------------------- */

  /** เลื่อนจุดศูนย์กลางภาพไปทางทิศที่สั่ง ครั้งละราว 1 ใน 5 ของขนาดจอ */
  panDirection(dir) {
    const kx = this.width * 0.22;
    const ky = this.height * 0.22;
    this._anim = null;
    if (dir === 'up') this.panBy(0, ky);
    else if (dir === 'down') this.panBy(0, -ky);
    else if (dir === 'left') this.panBy(kx, 0);
    else if (dir === 'right') this.panBy(-kx, 0);
  }

  /** หมุนรอบแกนตั้ง (yaw) และก้ม-เงย (pitch) เป็นเรเดียน */
  rotateBy(dYaw, dPitch) {
    this.yaw = (this.yaw + (dYaw || 0)) % TAU;
    this.pitch = clamp(this.pitch + (dPitch || 0), 0.06, 1.52);
    this.invalidate();
  }

  /** ดึงจุดศูนย์กลางภาพกลับไปกึ่งกลางกราฟ โดยไม่เปลี่ยนมุมและระยะซูม */
  recenter() {
    this._anim = null;
    this.centerOnData();
    this.invalidate();
  }

  setFloorGap(gap) {
    this.floorGap = clamp(Number(gap) || 0, this.floorHeight, 40);
    this.rebuildRouteGeometry();
    this.invalidate();
  }

  setAutoRotate(on) {
    this.autoRotate = !!on;
    this.invalidate();
  }

  setShowGrid(on) { this.showGrid = !!on; this.invalidate(); }

  setShowBuildings(on) { this.showBuildings = !!on; this.invalidate(); }

  setShowLabels(on) { this.showLabels = !!on; this.invalidate(); }

  resetView() {
    this.yaw = -0.62;
    this.pitch = 0.62;
    this.fit();
  }

  /* =============================================================
   * สถานะที่ควบคุมจากภายนอก
   * ============================================================= */
  availableFloors() { return this.floors.slice(); }

  setFloor(floor) {
    this.floor = (floor === null || floor === undefined) ? null : Number(floor);
    this.invalidate();
  }

  setTypeFilter(set) {
    this.typeFilter = set || null;
    this.invalidate();
  }

  setShowEdges(on) {
    this.showEdges = !!on;
    this.invalidate();
  }

  setEndpoints(startId, goalId) {
    this.startId = startId || null;
    this.goalId = goalId || null;
    this.invalidate();
  }

  select(id) {
    this.selectedId = id || null;
    this.invalidate();
  }

  renderRoute(route) {
    this.route = route && route.found ? route : null;
    this.routeEdges = new Set();
    this.routeNodes = new Set();
    if (this.route) {
      this.route.path.forEach((id) => this.routeNodes.add(id));
      (this.route.links || []).forEach((l) => this.routeEdges.add(l.edge.index));
    }
    this.rebuildRouteGeometry();
    this._routeT0 = this._time;
    this.invalidate();
  }

  /**
   * แปลงลำดับโหนดของเส้นทางเป็นเส้นหักในพิกัดโลก พร้อมระยะสะสมของแต่ละจุด
   * ระยะสะสมนี้ใช้หาตำแหน่งของ "จุดที่วิ่ง" ให้เคลื่อนที่ด้วยความเร็วคงที่
   * ต้องเรียกใหม่ทุกครั้งที่ระยะห่างระหว่างชั้นเปลี่ยน เพราะแกน z ของทุกจุดขยับตาม
   */
  rebuildRouteGeometry() {
    this.routePts = [];
    this.routeCum = [];
    this.routeTotal = 0;
    if (!this.route) return;

    this.route.path.forEach((id) => {
      const node = this.graph.node(id);
      if (node) this.routePts.push(this.worldOf(node));
    });
    if (this.routePts.length < 2) { this.routePts = []; return; }

    let sum = 0;
    this.routeCum.push(0);
    for (let i = 1; i < this.routePts.length; i += 1) {
      const a = this.routePts[i - 1];
      const b = this.routePts[i];
      sum += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      this.routeCum.push(sum);
    }
    this.routeTotal = sum;
  }

  /** จุดบนเส้นทางที่ระยะ u (0 = ต้นทาง, 1 = ปลายทาง) */
  routePointAt(u) {
    const target = clamp(u, 0, 1) * this.routeTotal;
    const cum = this.routeCum;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i += 1;
    const span = cum[i] - cum[i - 1] || 1;
    const k = clamp((target - cum[i - 1]) / span, 0, 1);
    const a = this.routePts[i - 1];
    const b = this.routePts[i];
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      z: a.z + (b.z - a.z) * k,
    };
  }

  /**
   * จัดกล้องให้เห็นเส้นทางทั้งเส้นในคราวเดียว
   *   1) เลื่อนจุดหมุนไปกึ่งกลางกรอบของเส้นทาง
   *   2) หมุน yaw ให้แนวต้นทาง→ปลายทางวางขวางจอ เส้นจึงกางออกเต็มความกว้าง
   *      ไม่ทับกันเองเหมือนตอนที่มองมาตามแนวเส้น
   *   3) เส้นทางที่อยู่ชั้นเดียวจะกดมุมมองลงเกือบมองจากด้านบน (อ่านทางเลี้ยวง่าย)
   *      ส่วนเส้นทางที่ข้ามชั้นจะเอียงไว้ เพื่อให้เห็นการขึ้น-ลงชั้นด้วย
   *   4) ถอยกล้องออกให้ทุกจุดของเส้นทางอยู่ในจอพอดี
   */
  frameRoute() {
    if (this.routePts.length < 2) return;

    const b = {
      minX: Infinity, maxX: -Infinity,
      minY: Infinity, maxY: -Infinity,
      minZ: Infinity, maxZ: -Infinity,
    };
    this.routePts.forEach((p) => {
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
      b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
      b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
    });
    const center = {
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
      z: (b.minZ + b.maxZ) / 2,
    };

    const first = this.routePts[0];
    const last = this.routePts[this.routePts.length - 1];
    let dx = last.x - first.x;
    let dy = last.y - first.y;
    if (Math.hypot(dx, dy) < 0.001) { dx = 1; dy = 0; }
    // เลือก yaw ที่ทำให้ y1 = dx*sin(yaw) + dy*cos(yaw) เป็นศูนย์ แนวเส้นจึงนอนขวางจอ
    // และได้ x1 = +ระยะ เสมอ แปลว่าต้นทางอยู่ซ้าย ปลายทางอยู่ขวา อ่านตามสายตาได้ทันที
    const yaw = Math.atan2(-dy, dx);

    const crossesFloors = (b.maxZ - b.minZ) > 0.5;
    const pitch = crossesFloors ? 0.74 : 1.24;
    const dist = Math.max(80,
      this.distanceToFit(this.routePts, center, yaw, pitch, 0.7));

    this._anim = {
      from: Object.assign({}, this.target),
      to: center,
      distFrom: this.dist,
      distTo: dist,
      yawFrom: this.yaw,
      yawTo: this.yaw + wrapAngle(yaw - this.yaw),
      pitchFrom: this.pitch,
      pitchTo: clamp(pitch, 0.06, 1.52),
      t0: performance.now(),
      ms: 620,
    };
    this.invalidate();
  }

  /** เลื่อนกล้องไปที่โหนดแบบนุ่มนวล */
  focusNode(id, zoom) {
    const node = this.graph.node(id);
    if (!node) return;
    const to = this.worldOf(node);
    const from = Object.assign({}, this.target);
    const distFrom = this.dist;
    const distTo = zoom ? clamp(this.dist / zoom, 40, 4000) : this.dist;
    this._anim = { from, to, distFrom, distTo, t0: performance.now(), ms: 420 };
    this.invalidate();
  }

  /* =============================================================
   * ลูปวาดภาพ
   * ============================================================= */
  step() {
    if (this._anim) {
      const k = clamp((performance.now() - this._anim.t0) / this._anim.ms, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;   // ease-in-out
      const a = this._anim;
      this.target = {
        x: a.from.x + (a.to.x - a.from.x) * e,
        y: a.from.y + (a.to.y - a.from.y) * e,
        z: a.from.z + (a.to.z - a.from.z) * e,
      };
      this.dist = a.distFrom + (a.distTo - a.distFrom) * e;
      if (a.yawTo !== undefined) this.yaw = a.yawFrom + (a.yawTo - a.yawFrom) * e;
      if (a.pitchTo !== undefined) this.pitch = a.pitchFrom + (a.pitchTo - a.pitchFrom) * e;
      if (k >= 1) this._anim = null;
      this._dirty = true;
    }
    if (this.autoRotate) {
      this.yaw = (this.yaw + 0.0035) % TAU;
      this._dirty = true;
    }
    if (this.route) this._dirty = true;     // เส้นทางมีเส้นประวิ่ง จึงต้องวาดต่อเนื่อง
    if (!this._dirty) return;
    this._dirty = false;
    this.draw();
  }

  /** โหนดนี้ถูกซ่อนด้วยตัวกรองประเภทหรือไม่ */
  isHidden(node) {
    return !!(this.typeFilter && !this.typeFilter.has(node.type));
  }

  /** ความทึบของโหนด/เส้น ตามชั้นที่เลือกและเส้นทางที่ค้นหา */
  nodeAlpha(node) {
    if (this.isHidden(node)) return 0;
    if (this.routeNodes.has(node.id)) return 1;
    let a = 1;
    if (this.floor !== null && (node.floor || 0) !== this.floor) a *= 0.16;
    if (this.route) a *= 0.4;
    return a;
  }

  draw() {
    const ctx = this.ctx;
    const th = this._theme;
    const w = this.width;
    const h = this.height;

    /* ---- พื้นหลัง ---- */
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.bgTop);
    g.addColorStop(1, th.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* ---- คำนวณตำแหน่งบนจอของทุกโหนดครั้งเดียวต่อเฟรม ---- */
    this._projected.clear();
    this.nodes.forEach((n) => {
      const p = this.project(this.worldOf(n));
      if (p) this._projected.set(n.id, p);
    });

    if (this.showGrid) this.drawFloorPlanes();
    // ผนังด้านไกลวาดก่อน แล้วค่อยวาดเส้นทาง จากนั้นปิดทับด้วยผนังด้านใกล้
    // เส้นทางจึงดู "อยู่ภายใน" โมเดลอาคารโปร่งแสง
    this.drawBuildings('back');
    this.drawEdges();
    this.drawRouteFlow();
    this.drawBuildings('front');
    this.drawNodes();
    this.drawBuildingLabels();
    this.drawGizmo();
  }

  /* =============================================================
   * โมเดลอาคารโปร่งแสง
   * รูปทรง สี และทรงหลังคามาจาก buildings.js ของ https://github.com/ThTpk/3D_Map
   * ผ่าน data/buildings.json คีย์ model ทุกหน้าวาดด้วยความทึบ BUILDING_ALPHA
   * ============================================================= */

  /**
   * รูปทรงของอาคารแต่ละปีก แปลงจาก data/buildings.json ครั้งเดียวแล้วเก็บไว้
   * อาคารหนึ่งหลังมีได้หลายปีก (เช่น อาคารเชื่อมมีสามปีกต่อกัน)
   */
  buildingShapes() {
    if (this._shapes) return this._shapes;
    const shapes = [];

    this.buildings.forEach((b) => {
      let polys = Array.isArray(b.parts)
        ? b.parts.filter((r) => Array.isArray(r) && r.length >= 3)
        : [];
      if (!polys.length && Array.isArray(b.rect) && b.rect.length === 4) {
        const [x0, y0, x1, y1] = b.rect;
        polys = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
      }
      if (!polys.length) return;

      const floors = (b.floors && b.floors.length) ? b.floors.slice() : [1];
      const height = Number(b.height) > 0 ? Number(b.height) : floors.length * this.floorHeight;

      const model = b.model || {};
      polys.forEach((poly, idx) => {
        const ring = poly.map((pt) => ({ x: pt[0], y: pt[1] }));
        // บังคับลำดับจุดให้ทวนเข็มในพิกัดโลก ทุกหน้าจะได้มีทิศทางเดียวกัน
        let twice = 0;
        for (let k = 0; k < ring.length; k += 1) {
          const a = ring[k];
          const c = ring[(k + 1) % ring.length];
          twice += a.x * c.y - c.x * a.y;
        }
        if (twice < 0) ring.reverse();

        // สีและทรงหลังคาจากผัง 3 มิติ ปีกไหนไม่ได้กำหนดจะใช้ค่าของทั้งอาคาร
        const pm = (model.parts && model.parts[idx]) || {};
        const roofType = pm.roofType || model.roofType || 'flat';
        shapes.push({
          b, ring, floors, height,
          wallColor: pm.wall || model.wall || b.color || '#64748b',
          roofColor: pm.roof || model.roof || b.color || '#64748b',
          roof: roofGeometry(ring, roofType, pm.ends, pm.pitch),
          area: Math.abs(twice) / 2,
          cx: ring.reduce((t, q) => t + q.x, 0) / ring.length,
          cy: ring.reduce((t, q) => t + q.y, 0) / ring.length,
        });
      });
    });

    this._shapes = shapes;
    return shapes;
  }

  /** ความสูงเป็นเมตร -> หน่วยแกนตั้งบนภาพ (เท่ากันพอดีเมื่อ floorGap = floorHeight) */
  zFromMeters(m) {
    return (m * this.floorGap) / this.floorHeight;
  }

  /** ระดับพื้นดินบนภาพ (ชั้น 1 = พื้นดิน) */
  get groundZ() {
    return (1 - this.minFloor) * this.floorGap;
  }

  /** ระดับพื้นและระดับหลังคาของปีกอาคารบนภาพ */
  buildingSpan(shape) {
    const lo = this.groundZ;
    return { lo, hi: lo + this.zFromMeters(shape.height) };
  }

  /**
   * วาดโมเดลอาคารโปร่งแสง — ผนัง หลังคาจั่ว/ปั้นหยา และสีจริงจากผัง 3 มิติ
   * @param {'back'|'front'} pass  back = หน้าที่หันออกจากกล้อง (วาดก่อนเส้นทาง)
   *                               front = หน้าที่หันเข้าหากล้อง (วาดทับเส้นทาง)
   */
  drawBuildings(pass) {
    if (!this.showBuildings || !this.buildings.length) return;
    const ctx = this.ctx;
    const faces = [];

    this.buildingShapes().forEach((shape) => {
      const span = this.buildingSpan(shape);
      const bottom = shape.ring.map((q) => this.project({ x: q.x, y: q.y, z: span.lo }));
      const eave = shape.ring.map((q) => this.project({ x: q.x, y: q.y, z: span.hi }));
      if (bottom.some((q) => !q) || eave.some((q) => !q)) return;

      // หลังคาหันเข้าหากล้องเสมอเมื่อมองจากด้านบน ใช้เป็นตัวเทียบทิศของหน้าอื่น
      const faceSign = Math.sign(screenArea(eave)) || 1;
      const active = this.floor === null || shape.floors.includes(this.floor);

      const add = (pts, kind) => {
        if (pts.some((q) => !q)) return;
        const isFront = (Math.sign(screenArea(pts)) || 1) === faceSign;
        if ((pass === 'front') !== isFront) return;
        faces.push({
          pts, kind, shape, active,
          depth: pts.reduce((t, q) => t + q.depth, 0) / pts.length,
        });
      };

      add(bottom.slice().reverse(), 'floor');
      for (let i = 0; i < shape.ring.length; i += 1) {
        const j = (i + 1) % shape.ring.length;
        add([bottom[i], bottom[j], eave[j], eave[i]], 'wall');
      }

      const roof = shape.roof;
      if (!roof) {
        add(eave, 'roof');                       // หลังคาแบน
        return;
      }

      // หลังคาจั่ว/ปั้นหยา: สันอยู่สูงกว่าชายคาเท่ากับ rise
      const ridgeZ = span.hi + this.zFromMeters(roof.rise);
      const ra = this.project({ x: roof.a.x, y: roof.a.y, z: ridgeZ });
      const rb = this.project({ x: roof.b.x, y: roof.b.y, z: ridgeZ });
      if (!ra || !rb) { add(eave, 'roof'); return; }

      const e = (k) => eave[(roof.i + k) % 4];
      add([e(0), e(1), rb, ra], 'roof');          // ลาดหลังคาด้านยาวฝั่งหนึ่ง
      add([e(2), e(3), ra, rb], 'roof');          // อีกฝั่งหนึ่ง
      // ปลายปั้นหยา = หลังคาสามเหลี่ยม · ปลายจั่ว = ผนังสามเหลี่ยมใต้หน้าจั่ว
      add([e(3), e(0), ra], roof.ends[0] === 'hip' ? 'roof' : 'gable');
      add([e(1), e(2), rb], roof.ends[1] === 'hip' ? 'roof' : 'gable');
    });

    if (!faces.length) return;
    faces.sort((a, b) => b.depth - a.depth);

    ctx.save();
    ctx.lineJoin = 'round';
    faces.forEach((f) => {
      // สีผนัง/หลังคาจริงจากผัง 3 มิติ ทุกหน้าโปร่งแสงเท่ากันที่ BUILDING_ALPHA
      const color = f.kind === 'roof' ? f.shape.roofColor : f.shape.wallColor;
      const edge = f.shape.roofColor;
      const alpha = f.active ? BUILDING_ALPHA : BUILDING_ALPHA * 0.3;

      ctx.beginPath();
      f.pts.forEach((q, i) => (i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy)));
      ctx.closePath();
      ctx.fillStyle = rgba(color, alpha);
      ctx.fill();
      // เส้นขอบใช้สีหลังคาซึ่งเข้มกว่าสีผนัง อาคารจึงอ่านออกทั้งธีมสว่างและธีมมืด
      ctx.strokeStyle = rgba(edge, f.active ? 0.45 : 0.15);
      ctx.lineWidth = f.kind === 'roof' ? 1.3 : 1;
      ctx.stroke();
    });

    // เส้นแบ่งชั้นภายในกล่อง วาดตอนผ่าน back รอบเดียว จะได้ไม่ซ้อนกันสองชั้น
    if (pass === 'back') {
      this.buildingShapes().forEach((shape) => {
        const color = shape.roofColor;
        const levels = shape.b.modelFloors || shape.floors.length;
        for (let k = 1; k < levels; k += 1) {
          const z = this.groundZ + this.zFromMeters((shape.height * k) / levels);
          const ring = shape.ring.map((q) => this.project({ x: q.x, y: q.y, z }));
          if (ring.some((q) => !q)) continue;
          const walkable = shape.floors.includes(k + 1);
          const active = this.floor === null || this.floor === k + 1;
          ctx.beginPath();
          ring.forEach((q, i) => (i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy)));
          ctx.closePath();
          ctx.strokeStyle = rgba(color, walkable && active ? 0.45 : 0.15);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }
    ctx.restore();
  }

  /** ชื่ออาคารลอยอยู่เหนือหลังคา ช่วยให้รู้ว่าเส้นทางผ่านอาคารไหน */
  drawBuildingLabels() {
    if (!this.showBuildings || !this.buildings.length) return;
    const ctx = this.ctx;
    const th = this._theme;
    const items = [];

    ctx.save();
    ctx.font = '700 13px "IBM Plex Sans Thai", system-ui, sans-serif';

    // ปีกที่ใหญ่ที่สุดของอาคารหนึ่งหลัง คือจุดที่วางป้ายชื่อ
    const pick = new Map();
    this.buildingShapes().forEach((shape) => {
      const cur = pick.get(shape.b.id);
      if (!cur || shape.area > cur.area) pick.set(shape.b.id, shape);
    });

    pick.forEach((shape) => {
      const span = this.buildingSpan(shape);
      const p = this.project({ x: shape.cx, y: shape.cy, z: span.hi + this.floorGap * 0.45 });
      if (!p) return;

      // กล่องกว้างเท่าไรบนจอ ถ้าชื่อเต็มยาวกว่านั้นให้ใช้ชื่อย่อแทน
      const corners = shape.ring.map((q) => this.project({ x: q.x, y: q.y, z: span.hi }));
      let widest = 0;
      corners.forEach((a) => corners.forEach((c) => {
        if (a && c) widest = Math.max(widest, Math.abs(a.sx - c.sx));
      }));
      const full = shape.b.name;
      const short = shape.b.shortName || full;
      const text = ctx.measureText(full).width + 16 > widest ? short : full;

      items.push({
        p, text,
        color: shape.b.color || th.label,
        active: this.floor === null || shape.floors.includes(this.floor),
      });
    });

    items.sort((a, b) => b.p.depth - a.p.depth);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const used = [];
    items.forEach((it) => {
      const w = ctx.measureText(it.text).width;
      const box = {
        x0: it.p.sx - w / 2 - 7, x1: it.p.sx + w / 2 + 7,
        y0: it.p.sy - 10, y1: it.p.sy + 10,
      };
      const hit = used.some((u) => !(box.x1 < u.x0 || box.x0 > u.x1 || box.y1 < u.y0 || box.y0 > u.y1));
      if (hit) return;
      used.push(box);

      ctx.globalAlpha = it.active ? 1 : 0.35;
      ctx.fillStyle = th.labelHalo;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(box.x0, box.y0, box.x1 - box.x0, 20, 10);
      else ctx.rect(box.x0, box.y0, box.x1 - box.x0, 20);
      ctx.fill();
      ctx.strokeStyle = rgba(it.color, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, it.p.sx, it.p.sy);
    });
    ctx.restore();
  }


  /* ---- ระนาบอ้างอิงของแต่ละชั้น ช่วยให้ตาจับความสูงได้ ---- */
  drawFloorPlanes() {
    const ctx = this.ctx;
    const th = this._theme;
    const b = this.bounds();
    const pad = 8;
    const x0 = b.minX - pad;
    const x1 = b.maxX + pad;
    const y0 = b.minY - pad;
    const y1 = b.maxY + pad;

    // ชั้นอยู่ห่างกันแค่ความสูงจริง ถ้าวาดทุกระนาบจะทับกันจนอ่านไม่ออก
    // จึงวาดเฉพาะชั้นที่เลือก หรือชั้นล่างสุดเมื่อยังไม่ได้ดึงชั้นให้ห่างกัน
    const spread = this.floorGap >= this.floorHeight * 2;
    const shown = this.floor !== null
      ? [this.floor]
      : (spread ? this.floors : [this.minFloor]);

    // เส้นตารางถี่เท่าไรจึงพอดี ไม่ให้มีเส้นเป็นร้อยบนผังที่ยาวครึ่งกิโลเมตร
    const step = Math.max(13, Math.ceil((x1 - x0) / 26 / 13) * 13);

    shown.forEach((f) => {
      const z = (f - this.minFloor) * this.floorGap;
      const active = this.floor === null || this.floor === f;
      const corners = [
        this.project({ x: x0, y: y0, z }),
        this.project({ x: x1, y: y0, z }),
        this.project({ x: x1, y: y1, z }),
        this.project({ x: x0, y: y1, z }),
      ];
      if (corners.some((c) => !c)) return;

      ctx.save();
      ctx.strokeStyle = active ? th.gridStrong : th.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach((c, i) => (i ? ctx.lineTo(c.sx, c.sy) : ctx.moveTo(c.sx, c.sy)));
      ctx.closePath();
      ctx.stroke();

      // เส้นตารางภายใน ทุก 13 เมตร
      ctx.strokeStyle = th.grid;
      ctx.globalAlpha = active ? 0.55 : 0.25;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 0.1; x += step) {
        const a = this.project({ x, y: y0, z });
        const c = this.project({ x, y: y1, z });
        if (a && c) { ctx.moveTo(a.sx, a.sy); ctx.lineTo(c.sx, c.sy); }
      }
      for (let y = y0; y <= y1 + 0.1; y += step) {
        const a = this.project({ x: x0, y, z });
        const c = this.project({ x: x1, y, z });
        if (a && c) { ctx.moveTo(a.sx, a.sy); ctx.lineTo(c.sx, c.sy); }
      }
      ctx.stroke();

      // ป้ายบอกชั้นที่มุมระนาบ
      const tag = corners[0];
      ctx.globalAlpha = active ? 0.9 : 0.4;
      ctx.fillStyle = th.hud;
      ctx.font = '600 12px "IBM Plex Sans Thai", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`ชั้น ${f}`, tag.sx - 8, tag.sy);
      ctx.restore();
    });
  }

  /* ---- เส้นเชื่อม ---- */
  drawEdges() {
    const ctx = this.ctx;
    const list = [];

    this.edges.forEach((e) => {
      const a = this.graph.node(e.from);
      const b = this.graph.node(e.to);
      if (!a || !b) return;
      const pa = this._projected.get(a.id);
      const pb = this._projected.get(b.id);
      if (!pa || !pb) return;

      const onRoute = this.routeEdges.has(e.index);
      if (!this.showEdges && !onRoute) return;
      if (this.isHidden(a) || this.isHidden(b)) return;

      let alpha = 1;
      if (!onRoute) {
        if (this.floor !== null) {
          const onFloor = (a.floor || 0) === this.floor || (b.floor || 0) === this.floor;
          if (!onFloor) alpha *= 0.12;
        }
        if (this.route) alpha *= 0.28;
        else alpha *= 0.75;
      }
      list.push({ e, pa, pb, onRoute, alpha, depth: (pa.depth + pb.depth) / 2 });
    });

    // ไกลก่อน ใกล้ทีหลัง แล้วเส้นทางไว้บนสุดเสมอ
    list.sort((p, q) => (p.onRoute === q.onRoute ? q.depth - p.depth : (p.onRoute ? 1 : -1)));

    list.forEach((item) => {
      const style = EDGE_STYLE[item.e.type] || DEFAULT_EDGE_STYLE;
      ctx.save();
      ctx.lineCap = 'round';
      if (item.onRoute) {
        ctx.strokeStyle = rgba(ROUTE_COLOR, 0.28);
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(item.pa.sx, item.pa.sy);
        ctx.lineTo(item.pb.sx, item.pb.sy);
        ctx.stroke();

        ctx.strokeStyle = ROUTE_COLOR;
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -(this._time / 45) % 20;
      } else {
        ctx.strokeStyle = rgba(style.color, item.alpha);
        ctx.lineWidth = style.width;
        if (item.e.type === 'bridge') ctx.setLineDash([7, 5]);
      }
      ctx.beginPath();
      ctx.moveTo(item.pa.sx, item.pa.sy);
      ctx.lineTo(item.pb.sx, item.pb.sy);
      ctx.stroke();
      ctx.restore();
    });
  }

  /* ---- โหนด + ป้ายชื่อ ---- */
  drawNodes() {
    const ctx = this.ctx;
    const th = this._theme;
    const items = [];

    this.nodes.forEach((n) => {
      const p = this._projected.get(n.id);
      if (!p) return;
      const alpha = this.nodeAlpha(n);
      if (alpha <= 0.01) return;
      items.push({ node: n, p, alpha });
    });
    items.sort((a, b) => b.p.depth - a.p.depth);

    const labels = [];

    items.forEach(({ node, p, alpha }) => {
      const style = TYPE_STYLE[node.type] || DEFAULT_EDGE_STYLE;
      const isEnd = node.id === this.startId || node.id === this.goalId;
      const isSel = node.id === this.selectedId;
      const isHover = node.id === this.hoverId;
      const onRoute = this.routeNodes.has(node.id);

      let r = clamp(p.scale * 0.62, 2.4, 11);
      if (node.type !== 'classroom') r *= 1.25;
      if (node.type === 'corridor') r *= 0.45;   // จุดต่อทางเดินหน้าห้อง เป็นจุดเล็ก ๆ พอ
      if (isEnd) r *= 1.5;
      if (isSel || isHover) r *= 1.35;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (onRoute) {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r + 5, 0, TAU);
        ctx.fillStyle = rgba(ROUTE_COLOR, 0.22);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, TAU);
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.lineWidth = isSel || isHover ? 2.6 : 1.4;
      ctx.strokeStyle = isSel || isHover ? SELECT_COLOR : th.labelHalo;
      ctx.stroke();
      ctx.restore();

      // โหนดทางเดินหน้าห้องมีเยอะมาก ถ้าติดป้ายทุกตัวภาพจะอ่านไม่ออก
      const quiet = node.type === 'corridor' || node.type === 'classroom';
      const forced = isEnd || isSel || isHover || (onRoute && !quiet);
      const labelled = node.type !== 'corridor' || isSel || isHover;
      if (this.showLabels && labelled && (forced || (r > 4.2 && alpha > 0.5))) {
        labels.push({
          text: shortLabel(node),
          x: p.sx,
          y: p.sy - r - 4,
          depth: p.depth,
          alpha: forced ? 1 : Math.min(1, alpha),
          forced,
          size: forced ? 13 : clamp(r * 1.15, 10, 13),
        });
      }

      if (isEnd) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r + 7, 0, TAU);
        ctx.strokeStyle = node.id === this.startId ? '#22c55e' : ROUTE_COLOR;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = node.id === this.startId ? '#22c55e' : ROUTE_COLOR;
        ctx.font = '700 11px "IBM Plex Sans Thai", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id === this.startId ? 'A' : 'B', p.sx, p.sy + r + 16);
        ctx.restore();
      }
    });

    this.drawLabels(labels);
  }

  /** วาดป้ายชื่อ โดยข้ามป้ายที่ทับกัน ยกเว้นป้ายสำคัญ */
  drawLabels(labels) {
    const ctx = this.ctx;
    const th = this._theme;
    labels.sort((a, b) => (a.forced === b.forced ? a.depth - b.depth : (a.forced ? -1 : 1)));
    const used = [];

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    labels.forEach((l) => {
      ctx.font = `600 ${l.size}px "IBM Plex Sans Thai", system-ui, sans-serif`;
      const w = ctx.measureText(l.text).width + 8;
      const box = { x0: l.x - w / 2, x1: l.x + w / 2, y0: l.y - l.size - 2, y1: l.y + 2 };
      const hit = used.some((u) => !(box.x1 < u.x0 || box.x0 > u.x1 || box.y1 < u.y0 || box.y0 > u.y1));
      if (hit && !l.forced) return;
      used.push(box);

      ctx.globalAlpha = l.alpha;
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = th.labelHalo;
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillStyle = th.label;
      ctx.fillText(l.text, l.x, l.y);
    });
    ctx.restore();
  }

  /* =============================================================
   * ทิศทางการเดินบนเส้นทางที่ค้นหาได้
   *   - ลูกศรกลางแต่ละช่วง บอกทิศแม้ภาพจะหยุดนิ่ง
   *   - จุดเรืองแสงพร้อมหางวิ่งจากต้นทางไปปลายทางซ้ำเป็นรอบ
   * ============================================================= */
  drawRouteFlow() {
    if (!this.route || this.routePts.length < 2) return;
    const ctx = this.ctx;
    const screen = this.routePts.map((p) => this.project(p));

    /* ---- ลูกศรกลางช่วง ---- */
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < screen.length - 1; i += 1) {
      const a = screen[i];
      const c = screen[i + 1];
      if (!a || !c) continue;
      const dx = c.sx - a.sx;
      const dy = c.sy - a.sy;
      const len = Math.hypot(dx, dy);
      if (len < 24) continue;              // ช่วงสั้นเกินไป ใส่ลูกศรแล้วรก
      const ux = dx / len;
      const uy = dy / len;
      const mx = (a.sx + c.sx) / 2;
      const my = (a.sy + c.sy) / 2;
      const s = clamp(len * 0.16, 6, 11);
      ctx.beginPath();
      ctx.moveTo(mx + ux * s, my + uy * s);
      ctx.lineTo(mx - ux * s * 0.6 - uy * s * 0.66, my - uy * s * 0.6 + ux * s * 0.66);
      ctx.lineTo(mx - ux * s * 0.6 + uy * s * 0.66, my - uy * s * 0.6 - ux * s * 0.66);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ROUTE_COLOR;
      ctx.stroke();
    }
    ctx.restore();

    /* ---- จุดที่วิ่งจากต้นทางไปปลายทาง ----
     * ความเร็วคงที่ราว 26 หน่วยพิกัดต่อวินาที เส้นทางยาวจึงใช้เวลานานกว่า
     * แต่จำกัดไว้ที่ 3–14 วินาทีต่อรอบ ไม่ให้ช้าหรือเร็วจนดูไม่ทัน
     */
    const cycle = clamp((this.routeTotal / 26) * 1000, 3000, 14000);
    const head = (((this._time - this._routeT0) % cycle) + cycle) % cycle / cycle;
    const TRAIL = [
      { back: 0.075, size: 0.42, alpha: 0.28 },
      { back: 0.040, size: 0.62, alpha: 0.5 },
      { back: 0.000, size: 1.00, alpha: 1 },
    ];

    ctx.save();
    TRAIL.forEach((t) => {
      const u = head - t.back;
      if (u < 0) return;                   // หางยังไม่ออกจากต้นทาง
      const p = this.project(this.routePointAt(u));
      if (!p) return;
      const r = clamp(p.scale * 0.62, 2.4, 11) * 1.15 * t.size;

      if (t.size === 1) {
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 2.6, 0, TAU);
        ctx.fillStyle = rgba(ROUTE_COLOR, 0.5);
        ctx.fill();
      }

      ctx.globalAlpha = t.alpha;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.4 * t.size;
      ctx.strokeStyle = ROUTE_COLOR;
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---- ลูกศรบอกทิศของแกน X / Y / Z ที่มุมจอ ---- */
  drawGizmo() {
    const ctx = this.ctx;
    const th = this._theme;
    const ox = this.width - 52;
    const oy = this.height - 52;
    const len = 26;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    const axis = (vx, vy, vz, color, name) => {
      const x1 = vx * cy - vy * sy;
      const y1 = vx * sy + vy * cy;
      const up = y1 * sp + vz * cp;
      const ex = ox + x1 * len;
      const ey = oy - up * len;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, ox + x1 * (len + 9), oy - up * (len + 9));
    };

    ctx.save();
    ctx.globalAlpha = 0.85;
    axis(1, 0, 0, th.dim, 'X');
    axis(0, 1, 0, th.dim, 'Y');
    axis(0, 0, 1, '#f59e0b', 'ชั้น');
    ctx.restore();
  }

  /* =============================================================
   * การโต้ตอบด้วยเมาส์และการสัมผัส
   * ============================================================= */
  nodeAt(px, py) {
    let best = null;
    let bestDist = 18;
    this._projected.forEach((p, id) => {
      const node = this.graph.node(id);
      if (!node || this.nodeAlpha(node) < 0.3) return;
      const d = Math.hypot(p.sx - px, p.sy - py);
      if (d < bestDist) { bestDist = d; best = node; }
    });
    return best;
  }

  /**
   * ลากแผนที่: ตรึงจุดบนพื้นใต้เคอร์เซอร์ให้ติดนิ้วไปตลอด เหมือนการลากแผนที่
   * คืน false เมื่อรังสีจากกล้องไม่ตัดระนาบพื้น (มองเกือบขนานพื้น) ให้ผู้เรียกใช้ panBy แทน
   */
  grabPan(fromX, fromY, toX, toY) {
    const a = this.unprojectToPlane(fromX, fromY, this.groundZ);
    const b = this.unprojectToPlane(toX, toY, this.groundZ);
    if (!a || !b) return false;
    this.target.x += a.x - b.x;
    this.target.y += a.y - b.y;
    this.invalidate();
    return true;
  }

  panBy(dxPx, dyPx) {
    // เลื่อนไปบนระนาบพื้น กล้องจึงอยู่ระดับความสูงเดิมเสมอเหมือนแผนที่
    if (this.grabPan(this.width / 2, this.height / 2,
                     this.width / 2 + dxPx, this.height / 2 + dyPx)) return;

    // มองเกือบขนานพื้นจนหาจุดตัดไม่ได้ — ถอยไปเลื่อนในระนาบที่ตั้งฉากกับทิศมอง
    const k = (this.dist + 1) / this.focal;
    const right = { x: Math.cos(this.yaw), y: Math.sin(this.yaw) };
    const cp = Math.cos(this.pitch);
    const up = { x: -Math.sin(this.yaw) * cp, y: Math.cos(this.yaw) * cp };
    this.target.x -= (right.x * dxPx - up.x * dyPx) * k;
    this.target.y -= (right.y * dxPx - up.y * dyPx) * k;
    this.invalidate();
  }

  bindEvents() {
    const canvas = this.canvas;
    const pointers = new Map();
    let mode = null;
    let last = null;
    let moved = 0;
    let pinch = 0;
    let twist = 0;
    let mid = null;

    const pos = (evt) => {
      const r = canvas.getBoundingClientRect();
      return { x: evt.clientX - r.left, y: evt.clientY - r.top };
    };
    const twoFinger = () => {
      const [a, b] = [...pointers.values()];
      return {
        gap: Math.hypot(a.x - b.x, a.y - b.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };

    canvas.addEventListener('pointerdown', (evt) => {
      canvas.setPointerCapture(evt.pointerId);
      pointers.set(evt.pointerId, pos(evt));
      moved = 0;
      if (pointers.size === 2) {
        const t = twoFinger();
        pinch = t.gap;
        twist = t.angle;
        mid = t.mid;
        mode = 'pinch';
      } else {
        last = pos(evt);
        mode = isRotateDrag(evt) ? 'rotate' : 'pan';
      }
      canvas.classList.add('is-dragging');
      this._anim = null;
    });

    canvas.addEventListener('pointermove', (evt) => {
      const p = pos(evt);
      if (!pointers.has(evt.pointerId)) {
        // ไม่ได้ลาก — ตรวจว่าชี้อยู่บนโหนดไหน
        const node = this.nodeAt(p.x, p.y);
        const id = node ? node.id : null;
        if (id !== this.hoverId) {
          this.hoverId = id;
          canvas.style.cursor = id ? 'pointer' : '';
          canvas.title = node ? `${node.name} — ${(TYPE_STYLE[node.type] || {}).label || node.type}` : '';
          this.invalidate();
        }
        return;
      }
      pointers.set(evt.pointerId, p);

      if (mode === 'pinch' && pointers.size === 2) {
        // สองนิ้ว: หุบ-กาง = ซูม · บิด = หมุน · เลื่อนพร้อมกัน = เลื่อนแผนที่
        const t = twoFinger();
        if (pinch > 0 && t.gap > 0) this.zoomAt(pinch / t.gap, t.mid.x, t.mid.y);
        this.yaw = (this.yaw - wrapAngle(t.angle - twist)) % TAU;
        if (mid) this.panBy(t.mid.x - mid.x, t.mid.y - mid.y);
        pinch = t.gap;
        twist = t.angle;
        mid = t.mid;
        this.invalidate();
        return;
      }

      const prev = last;
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      last = p;
      moved += Math.abs(dx) + Math.abs(dy);

      if (mode === 'pan') {
        if (!this.grabPan(prev.x, prev.y, p.x, p.y)) this.panBy(dx, dy);
      } else {
        this.yaw = (this.yaw - dx * 0.008) % TAU;
        this.pitch = clamp(this.pitch + dy * 0.006, 0.06, 1.52);
        this.invalidate();
      }
    });

    const end = (evt) => {
      if (!pointers.has(evt.pointerId)) return;
      const p = pointers.get(evt.pointerId);
      pointers.delete(evt.pointerId);
      if (pointers.size === 0) {
        canvas.classList.remove('is-dragging');
        if (moved < 5 && mode !== 'pinch') {
          const node = this.nodeAt(p.x, p.y);
          if (node && this.onNodeClick) this.onNodeClick(node);
        }
        mode = null;
      } else if (pointers.size === 1) {
        mode = 'pan';
        last = [...pointers.values()][0];
        pinch = 0;
        mid = null;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (evt) => evt.preventDefault());

    canvas.addEventListener('wheel', (evt) => {
      evt.preventDefault();
      const p = pos(evt);
      this.zoomAt(Math.exp(evt.deltaY * 0.0012), p.x, p.y);
    }, { passive: false });

    /* คีย์บอร์ด: ลูกศร = เลื่อนแผนที่, Shift+ลูกศร = หมุน/เอียง,
     * + - = ซูม, F = พอดีจอ, C = กลับไปกึ่งกลางกราฟ */
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('keydown', (evt) => {
      const key = evt.key;
      const rot = 0.14;
      if (evt.shiftKey && key === 'ArrowLeft') this.rotateBy(-rot, 0);
      else if (evt.shiftKey && key === 'ArrowRight') this.rotateBy(rot, 0);
      else if (evt.shiftKey && key === 'ArrowUp') this.rotateBy(0, rot);
      else if (evt.shiftKey && key === 'ArrowDown') this.rotateBy(0, -rot);
      else if (key === 'ArrowLeft') this.panDirection('left');
      else if (key === 'ArrowRight') this.panDirection('right');
      else if (key === 'ArrowUp') this.panDirection('up');
      else if (key === 'ArrowDown') this.panDirection('down');
      else if (key === '+' || key === '=') this.zoomIn();
      else if (key === '-' || key === '_') this.zoomOut();
      else if (key === 'f' || key === 'F') this.fit();
      else if (key === 'c' || key === 'C') this.recenter();
      else if (key === 'r' || key === 'R') this.frameRoute();
      else return;
      evt.preventDefault();
      this.invalidate();
    });

    if (window.ResizeObserver) {
      new ResizeObserver(() => this.resize()).observe(canvas);
    } else {
      window.addEventListener('resize', () => this.resize());
    }
  }
}

window.Graph3DView = Graph3DView;
window.TYPE_STYLE = TYPE_STYLE;
window.EDGE_STYLE = EDGE_STYLE;
