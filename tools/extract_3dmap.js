/*
 * extract_3dmap.js
 * ------------------------------------------------------------------
 * อ่านไฟล์ ref_data/3d_map_buildings.js (สำเนาของ buildings.js จาก
 * https://github.com/ThTpk/3D_Map) แล้วแปลงรูปทรงอาคารทุกหลัง
 * จากพิกัดภูมิศาสตร์เป็นพิกัดเมตร เขียนลง ref_data/3d_map_buildings.json
 *
 *     node tools/extract_3dmap.js
 *
 * ไฟล์ JSON ที่ได้เป็น "ข้อมูลตั้งต้น" ของ tools/generate_data.py
 * ค่าคงที่ LON0 / LAT0 ต้องตรงกับในไฟล์ Python เสมอ
 * ------------------------------------------------------------------
 * อัปเดตสำเนาต้นทางได้ด้วย
 *     curl -o ref_data/3d_map_buildings.js \
 *       https://raw.githubusercontent.com/ThTpk/3D_Map/main/buildings.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'ref_data', '3d_map_buildings.js');
const OUT = path.join(ROOT, 'ref_data', '3d_map_buildings.json');

/* จุดกำเนิดของพิกัดเมตร — ต้องตรงกับ tools/generate_data.py */
const LON0 = 100.61525;
const LAT0 = 13.76730;
const M_PER_DEG_LAT = 111320.0;
const M_PER_DEG_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);

/* ความสูงต่อชั้นที่ผัง 3 มิติใช้ตอนไม่ได้ระบุความสูงมา */
const FLOOR_HEIGHT = 3.6;

const r2 = (v) => Math.round(v * 100) / 100;
const toXY = (ll) => [r2((ll[0] - LON0) * M_PER_DEG_LON), r2((ll[1] - LAT0) * M_PER_DEG_LAT)];

/* ---- โหลดไฟล์ต้นทางในแซนด์บ็อกซ์ที่มี window ให้ ---- */
const code = fs.readFileSync(SRC, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: SRC });

const raw = sandbox.window.SCHOOL_BUILDINGS;
if (!Array.isArray(raw) || !raw.length) {
  console.error('ไม่พบ window.SCHOOL_BUILDINGS ใน ' + SRC);
  process.exit(1);
}

/* ---- ตัวช่วยเรขาคณิต ---- */
function centroid(ring) {
  const x = ring.reduce((t, p) => t + p[0], 0) / ring.length;
  const y = ring.reduce((t, p) => t + p[1], 0) / ring.length;
  return [r2(x), r2(y)];
}

/** ความยาว/ความกว้าง และแนวแกนยาวของรูปสี่เหลี่ยม (ใช้กับปีกอาคาร) */
function wingAxis(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!best || len > best.len) best = { i, len };
  }
  if (!best || ring.length !== 4) return null;
  // ด้านยาวคู่ตรงข้ามกัน จุดกึ่งกลางของด้านสั้นสองด้านคือปลายแนวแกน
  const i = best.i;
  const p = (k) => ring[(i + k) % 4];
  const midA = [(p(0)[0] + p(3)[0]) / 2, (p(0)[1] + p(3)[1]) / 2];
  const midB = [(p(1)[0] + p(2)[0]) / 2, (p(1)[1] + p(2)[1]) / 2];
  const width = Math.hypot(p(3)[0] - p(0)[0], p(3)[1] - p(0)[1]);
  return {
    from: [r2(midA[0]), r2(midA[1])],
    to: [r2(midB[0]), r2(midB[1])],
    length: r2(best.len),
    width: r2(width),
  };
}

/* ---- แปลงอาคารทีละหลัง ---- */
const buildings = raw.map((b) => {
  const srcParts = (Array.isArray(b.parts) && b.parts.length)
    ? b.parts
    : (Array.isArray(b.footprint) ? [{ footprint: b.footprint }] : []);

  const parts = srcParts
    .filter((p) => Array.isArray(p.footprint) && p.footprint.length >= 3)
    .map((p) => {
      const ring = p.footprint.map(toXY);
      const out = { footprint: ring, centroid: centroid(ring) };
      const axis = wingAxis(ring);
      if (axis) out.axis = axis;
      if (p.roofType) out.roofType = p.roofType;
      if (p.roof) out.roof = p.roof;
      if (p.voids) out.voids = p.voids;
      if (p.walkway) out.walkway = p.walkway;
      if (p.bleachers) out.bleachers = p.bleachers;
      return out;
    });

  const floors = (typeof b.floors === 'number' && b.floors > 0) ? b.floors : null;
  let height = (typeof b.height === 'number' && b.height > 0) ? b.height : null;
  if (height === null && floors) height = r2(floors * FLOOR_HEIGHT);

  const all = parts.reduce((t, p) => t.concat(p.footprint), []);
  const center = b.center ? toXY(b.center) : (all.length ? centroid(all) : null);

  return {
    id: b.id,
    name: b.name,
    kind: b.kind || '',
    desc: b.desc || '',
    source: b.source || '',
    model: b.model !== false,
    floors,
    height,
    wall: b.wall || null,
    roof: b.roof || null,
    facade: b.facade || null,
    size: typeof b.size === 'number' ? b.size : null,
    center,
    parts,
    stairs: Array.isArray(b.stairs)
      ? b.stairs.map((s) => ({
        from: toXY(s.from), to: toXY(s.to),
        width: s.width || null, height: s.height || null,
      }))
      : [],
  };
});

const payload = {
  source: 'https://github.com/ThTpk/3D_Map (buildings.js)',
  note: 'รูปทรงอาคารแปลงเป็นพิกัดเมตร x = ทิศตะวันออก, y = ทิศเหนือ '
      + 'สร้างด้วย node tools/extract_3dmap.js อย่าแก้ไฟล์นี้ด้วยมือ',
  origin: { lon: LON0, lat: LAT0 },
  floorHeight: FLOOR_HEIGHT,
  buildings,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log('เขียน ' + OUT + ' แล้ว');
buildings.forEach((b) => {
  const a = b.parts.map((p) => (p.axis ? `${p.axis.length}x${p.axis.width}` : `poly${p.footprint.length}`));
  console.log(`    ${b.id.padEnd(11)} ${String(b.name).padEnd(24)} ชั้น ${String(b.floors ?? '-').padStart(2)}  สูง ${String(b.height ?? '-').padStart(5)} ม.  ปีก [${a.join(', ')}]`);
});
