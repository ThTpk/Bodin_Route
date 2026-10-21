/*
 * directions.js — แปลงเส้นทางจากกราฟให้เป็นคำแนะนำการเดินทีละขั้น
 * ---------------------------------------------------------------
 * รวมเส้นเชื่อมที่ต่อกันเป็นแนวตรงเข้าเป็นขั้นตอนเดียว แล้วตรวจมุมเลี้ยว
 * ที่จุดต่อเพื่อบอกว่าต้องเลี้ยวซ้าย/ขวา ขึ้น/ลงบันได หรือเข้าอาคารใด
 */

'use strict';

/* มุม (องศา) ที่ถือว่าเป็นการเลี้ยว */
const TURN_SLIGHT = 25;
const TURN_SHARP = 118;

const VERTICAL_TYPES = new Set(['stairs', 'stairs_up', 'stairs_down', 'elevator']);

/** ชื่อประเภทโหนดภาษาไทย ใช้ในคำบรรยาย */
const TYPE_LABEL = {
  classroom: 'ห้องเรียน',
  lab: 'ห้องปฏิบัติการ',
  computer_lab: 'ห้องคอมพิวเตอร์',
  teacher_room: 'ห้องพักครู',
  office: 'ห้องสำนักงาน',
  library: 'ห้องสมุด',
  toilet: 'ห้องน้ำ',
  health_room: 'ห้องพยาบาล',
  canteen: 'โรงอาหาร',
  shop: 'ร้านค้า',
  meeting: 'ห้องประชุม',
  activity: 'ห้องกิจกรรม',
  stairs: 'บันได',
  bridge: 'ทางเชื่อมระหว่างอาคาร',
  elevator: 'ลิฟต์',
  entrance: 'ทางเข้าอาคาร',
  gate: 'ประตูโรงเรียน',
  corridor: 'ทางเดิน',
  junction: 'ทางแยก',
  landmark: 'จุดสังเกต',
  sport: 'สนาม/อาคารกีฬา',
  plaza: 'ลานกลางแจ้ง',
};

function typeLabel(type) {
  return TYPE_LABEL[type] || 'สถานที่';
}

/** มุมเลี้ยวจากทิศทางเดิมไปทิศทางใหม่ (องศา) บวก = เลี้ยวขวา */
function turnAngle(prev, next) {
  const cross = prev.dx * next.dy - prev.dy * next.dx;
  const dot = prev.dx * next.dx + prev.dy * next.dy;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

function turnPhrase(angle) {
  const a = Math.abs(angle);
  if (a < TURN_SLIGHT) return { text: 'เดินตรงไป', icon: 'straight' };
  const side = angle > 0 ? 'ขวา' : 'ซ้าย';
  const icon = angle > 0 ? 'right' : 'left';
  if (a >= TURN_SHARP) return { text: `เลี้ยว${side}แบบหักศอก`, icon };
  if (a < 50) return { text: `เบี่ยง${side}`, icon: angle > 0 ? 'slight-right' : 'slight-left' };
  return { text: `เลี้ยว${side}`, icon };
}

function formatDistance(m) {
  if (m < 1) return 'ไม่ถึง 1 เมตร';
  // ระยะเดินในโรงเรียนไม่เกินหลักร้อยเมตร อ่านเป็นเมตรเข้าใจง่ายกว่ากิโลเมตร
  if (m < 1000) return `${Math.round(m)} เมตร`;
  return `${(m / 1000).toFixed(2)} กิโลเมตร`;
}

function formatDuration(seconds) {
  const s = Math.round(seconds);
  if (s < 60) return `${s} วินาที`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} นาที ${rest} วินาที` : `${m} นาที`;
  const h = Math.floor(m / 60);
  return `${h} ชั่วโมง ${m % 60} นาที`;
}

/** ชื่อสำหรับแสดงผล — โหนดทางเดินใช้ชื่ออาคารแทนเพื่อไม่ให้รกตา */
function displayName(node, buildingsById) {
  if (!node) return '';
  if (node.type === 'corridor' || node.type === 'junction') {
    const b = node.building && buildingsById ? buildingsById.get(node.building) : null;
    return b ? `ทางเดิน${b.name} ชั้น ${node.floor}` : node.name;
  }
  return node.name;
}

/**
 * สร้างคำแนะนำการเดินจากผลลัพธ์ของ Graph.shortestPath
 *
 * @param {Graph} graph
 * @param {object} route          ผลลัพธ์จาก graph.shortestPath()
 * @param {Map} buildingsById     Map ของข้อมูลอาคาร (id -> object)
 * @returns {Array} รายการขั้นตอน
 */
function buildDirections(graph, route, buildingsById) {
  if (!route || !route.found || route.steps.length === 0) return [];

  const steps = route.steps;
  const instructions = [];
  const startNode = graph.node(route.path[0]);

  instructions.push({
    icon: 'start',
    title: `เริ่มต้นที่ ${startNode.name}`,
    detail: startNode.building && buildingsById.has(startNode.building)
      ? `${buildingsById.get(startNode.building).name} ชั้น ${startNode.floor}`
      : (startNode.description || 'บริเวณกลางแจ้ง'),
    nodeId: startNode.id,
    floor: startNode.floor,
    building: startNode.building,
    distance: 0,
    time: 0,
  });

  let i = 0;
  let prevVector = null;

  while (i < steps.length) {
    const step = steps[i];

    // ---- เส้นเชื่อมแนวดิ่ง: บันได / ลิฟต์ -> เป็นขั้นตอนของตัวเอง ----
    if (VERTICAL_TYPES.has(step.edge.type)) {
      let distance = 0;
      let time = 0;
      const fromNode = graph.node(step.from);
      let j = i;
      while (j < steps.length && VERTICAL_TYPES.has(steps[j].edge.type)) {
        distance += steps[j].edge.distance;
        time += steps[j].edge.time || steps[j].edge.distance / 1.3;
        j += 1;
      }
      const toNode = graph.node(steps[j - 1].to);
      const isLift = step.edge.type === 'elevator';
      const up = (toNode.floor || 0) > (fromNode.floor || 0);
      const flights = Math.abs((toNode.floor || 0) - (fromNode.floor || 0));

      instructions.push({
        icon: isLift ? 'elevator' : (up ? 'stairs-up' : 'stairs-down'),
        title: isLift
          ? `ใช้ลิฟต์${up ? 'ขึ้น' : 'ลง'}ไปชั้น ${toNode.floor}`
          : `${up ? 'ขึ้น' : 'ลง'}บันไดไปชั้น ${toNode.floor}`,
        detail: `${fromNode.name} → ${toNode.name}${flights > 1 ? ` (ผ่าน ${flights} ชั้น)` : ''}`,
        nodeId: toNode.id,
        floor: toNode.floor,
        building: toNode.building,
        distance,
        time,
      });

      prevVector = null; // ทิศทางเดิมใช้ไม่ได้แล้วหลังเปลี่ยนชั้น
      i = j;
      continue;
    }

    // ---- รวมเส้นเชื่อมแนวราบที่ต่อกันเป็นแนวเดียว ----
    const fromNode = graph.node(step.from);
    let distance = 0;
    let time = 0;
    let j = i;
    let vectorAtStart = null;
    let crossedBridge = false;
    const passed = [];

    while (j < steps.length && !VERTICAL_TYPES.has(steps[j].edge.type)) {
      const a = graph.node(steps[j].from);
      const b = graph.node(steps[j].to);
      const vec = { dx: b.x - a.x, dy: b.y - a.y };
      const len = Math.hypot(vec.dx, vec.dy) || 1;
      vec.dx /= len;
      vec.dy /= len;

      if (vectorAtStart === null) {
        vectorAtStart = vec;
      } else if (Math.abs(turnAngle(vectorAtStart, vec)) >= TURN_SLIGHT) {
        break; // มุมเปลี่ยนมากพอ — ตัดเป็นขั้นตอนใหม่
      }

      distance += steps[j].edge.distance;
      time += steps[j].edge.time || steps[j].edge.distance / 1.3;
      if (steps[j].edge.type === 'bridge') crossedBridge = true;
      if (b.type !== 'corridor' && b.type !== 'junction' && j < steps.length - 1) {
        passed.push(b);
      }
      j += 1;
    }

    const toNode = graph.node(steps[j - 1].to);
    // โหนดสุดท้ายของช่วงคือปลายทางของขั้นตอนนี้ ไม่ใช่จุดที่ "เดินผ่าน"
    while (passed.length > 0 && passed[passed.length - 1].id === toNode.id) passed.pop();
    const isLast = j >= steps.length;
    const turn = prevVector ? turnPhrase(turnAngle(prevVector, vectorAtStart)) : { text: 'เดินตรงไป', icon: 'straight' };

    const outdoor = steps[i].edge.type === 'outdoor';
    const fromBuilding = fromNode.building;
    const toBuilding = toNode.building;

    let title;
    let icon = turn.icon;
    if (isLast) {
      title = `${turn.text === 'เดินตรงไป' ? 'เดินต่อไป' : turn.text} จนถึง ${toNode.name}`;
      icon = 'finish';
    } else if (toBuilding && toBuilding !== fromBuilding && toNode.type === 'entrance') {
      const b = buildingsById.get(toBuilding);
      const lead = turn.text === 'เดินตรงไป' ? 'เดินตรงไป' : `${turn.text} แล้วเดิน`;
      title = `${lead}เข้าสู่${b ? b.name : 'อาคาร'}`;
      icon = 'building';
    } else if (crossedBridge) {
      // ช่วงที่ผ่านทางเชื่อมระหว่างอาคาร บอกให้ชัดว่ากำลังข้ามไปอีกอาคาร
      const lead = turn.text === 'เดินตรงไป' ? 'เดินตรงไป' : `${turn.text} แล้ว`;
      const b = toBuilding ? buildingsById.get(toBuilding) : null;
      title = `${lead}ข้ามทางเชื่อมไป${b ? b.name : displayName(toNode, buildingsById)}`;
      icon = 'building';
    } else if (!toBuilding && fromBuilding) {
      const lead = turn.text === 'เดินตรงไป' ? 'เดินตรงไป' : `${turn.text} แล้วเดิน`;
      title = `${lead}ออกจากอาคารสู่ทางเดินกลางแจ้ง`;
      icon = 'outdoor';
    } else {
      title = `${turn.text} ${formatDistance(distance)}`;
      if (outdoor) icon = turn.icon === 'straight' ? 'outdoor' : turn.icon;
    }

    const detailParts = [];
    detailParts.push(`ถึง ${displayName(toNode, buildingsById)}`);
    if (passed.length > 0) {
      const names = passed.slice(0, 3).map((p) => p.name);
      detailParts.push(`ผ่าน ${names.join(' · ')}${passed.length > 3 ? ' ฯลฯ' : ''}`);
    }

    instructions.push({
      icon,
      title,
      detail: detailParts.join(' — '),
      nodeId: toNode.id,
      floor: toNode.floor,
      building: toNode.building,
      distance,
      time,
    });

    prevVector = vectorAtStart;
    i = j;
  }

  // รวมขั้นตอน "เดินตรงไป" ที่ติดกันและสั้นมากเข้าด้วยกัน
  const merged = [];
  instructions.forEach((ins) => {
    const last = merged[merged.length - 1];
    if (last && last.icon === 'straight' && ins.icon === 'straight' && ins.distance < 6) {
      last.distance += ins.distance;
      last.time += ins.time;
      last.title = `เดินตรงไป ${formatDistance(last.distance)}`;
      last.detail = ins.detail;
      last.nodeId = ins.nodeId;
      return;
    }
    merged.push(ins);
  });

  return merged;
}

window.Directions = {
  build: buildDirections,
  formatDistance,
  formatDuration,
  typeLabel,
  displayName,
  TYPE_LABEL,
};
