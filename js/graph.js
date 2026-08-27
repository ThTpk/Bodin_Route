/*
 * graph.js — โครงสร้างกราฟและอัลกอริทึมค้นหาเส้นทาง
 * ---------------------------------------------------------------
 * ทฤษฎีกราฟที่ใช้
 *   - กราฟถ่วงน้ำหนักแบบมีทิศทาง (weighted directed graph)
 *     โหนด = สถานที่ในโรงเรียน, เส้นเชื่อม = ระยะทาง/เวลาเดิน
 *     บันไดขึ้น-ลงใช้เวลาไม่เท่ากัน จึงเก็บเป็นเส้นเชื่อมแบบมีทิศทาง
 *   - Dijkstra's algorithm  : หาเส้นทางสั้นสุดจากจุดเดียวไปทุกจุด
 *   - A* search             : Dijkstra + ฟังก์ชันประมาณค่า (heuristic)
 *                             ใช้ระยะทางแบบยุคลิด 3 มิติซึ่ง admissible
 *   - Multi-target Dijkstra : หาสถานที่ประเภทที่ต้องการที่ใกล้ที่สุด
 *   - BFS                   : ตรวจความเชื่อมต่อของกราฟ
 */

'use strict';

/* ---------------------------------------------------------------
 * Binary min-heap — คิวลำดับความสำคัญสำหรับ Dijkstra / A*
 * ให้ pop() คืนค่าที่มี priority ต่ำสุดใน O(log n)
 * ------------------------------------------------------------- */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(value, priority) {
    const items = this.items;
    items.push({ value, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].priority < items[smallest].priority) smallest = l;
        if (r < items.length && items[r].priority < items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/* ความสูงต่อชั้น (เมตร) ใช้คำนวณระยะทางแบบ 3 มิติสำหรับ heuristic */
const FLOOR_HEIGHT = 3.8;

/* ความเร็วเดินสูงสุดที่เป็นไปได้ (ม./วินาที)
 * ใช้เป็นตัวหารใน heuristic ของโหมด "เวลา" เพื่อให้ค่าประมาณไม่เกินค่าจริง */
const MAX_SPEED = 1.45;

/* ชนิดเส้นเชื่อมที่ถือว่าเป็นบันได (ใช้กับตัวเลือก "เลี่ยงบันได") */
const STAIR_TYPES = new Set(['stairs', 'stairs_up', 'stairs_down']);

class Graph {
  /**
   * @param {Array} nodes  รายการโหนดจาก data/nodes.json
   * @param {Array} edges  รายการเส้นเชื่อมจาก data/edges.json
   */
  constructor(nodes, edges) {
    this.nodes = new Map();
    this.adjacency = new Map();
    this.edges = [];

    nodes.forEach((n) => {
      this.nodes.set(n.id, n);
      this.adjacency.set(n.id, []);
    });

    edges.forEach((e, index) => {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) {
        console.warn('ข้ามเส้นเชื่อมที่อ้างถึงโหนดที่ไม่มีอยู่:', e);
        return;
      }
      const record = Object.assign({ index }, e);
      this.edges.push(record);
      this.adjacency.get(e.from).push({ to: e.to, edge: record, reversed: false });
      if (e.bidirectional !== false) {
        this.adjacency.get(e.to).push({ to: e.from, edge: record, reversed: true });
      }
    });
  }

  get nodeCount() {
    return this.nodes.size;
  }

  get edgeCount() {
    return this.edges.length;
  }

  node(id) {
    return this.nodes.get(id) || null;
  }

  neighbors(id) {
    return this.adjacency.get(id) || [];
  }

  /* -------------------------------------------------------------
   * น้ำหนักของเส้นเชื่อมตามเกณฑ์ที่เลือก
   * metric = 'distance' (เมตร) หรือ 'time' (วินาที)
   * ----------------------------------------------------------- */
  static weight(edge, metric) {
    if (metric === 'time') {
      if (typeof edge.time === 'number' && edge.time > 0) return edge.time;
      return edge.distance / 1.3; // ประมาณจากระยะทางถ้าไม่ได้ระบุเวลา
    }
    return edge.distance;
  }

  /* -------------------------------------------------------------
   * ตัวกรองเส้นเชื่อมตามตัวเลือกผู้ใช้
   * ----------------------------------------------------------- */
  static allowed(edge, options) {
    if (options.avoidStairs && STAIR_TYPES.has(edge.type)) return false;
    if (options.avoidElevator && edge.type === 'elevator') return false;
    if (options.avoidOutdoor && edge.type === 'outdoor') return false;
    if (edge.closed === true) return false;
    return true;
  }

  /* -------------------------------------------------------------
   * ค่าประมาณระยะที่เหลือ (heuristic) สำหรับ A*
   * ระยะยุคลิด 3 มิติ — ไม่มีทางเกินระยะจริง จึงเป็น admissible
   * ทำให้ A* รับประกันว่าได้เส้นทางสั้นที่สุดเช่นเดียวกับ Dijkstra
   * ----------------------------------------------------------- */
  heuristic(fromId, toId, metric) {
    const a = this.nodes.get(fromId);
    const b = this.nodes.get(toId);
    if (!a || !b) return 0;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = ((a.floor || 0) - (b.floor || 0)) * FLOOR_HEIGHT;
    const straight = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return metric === 'time' ? straight / MAX_SPEED : straight;
  }

  /**
   * หาเส้นทางสั้นที่สุดระหว่างสองโหนด
   *
   * @param {string} startId
   * @param {string} goalId
   * @param {object} options
   *        metric       'distance' | 'time'   (ค่าเริ่มต้น 'distance')
   *        algorithm    'astar' | 'dijkstra'  (ค่าเริ่มต้น 'astar')
   *        avoidStairs  true = ไม่ใช้บันได (ใช้ลิฟต์/ทางลาดแทน)
   * @returns {object|null} รายละเอียดเส้นทาง หรือ null ถ้าไปไม่ถึง
   */
  shortestPath(startId, goalId, options = {}) {
    const metric = options.metric === 'time' ? 'time' : 'distance';
    const useAStar = options.algorithm !== 'dijkstra';
    const t0 = performance.now();

    if (!this.nodes.has(startId) || !this.nodes.has(goalId)) return null;
    if (startId === goalId) {
      return {
        found: true, path: [startId], steps: [],
        distance: 0, time: 0, floorChanges: 0,
        stats: { algorithm: useAStar ? 'A*' : 'Dijkstra', visited: 0, relaxed: 0, ms: 0 },
      };
    }

    const gScore = new Map([[startId, 0]]);
    const cameFrom = new Map();
    const settled = new Set();
    const open = new MinHeap();
    open.push(startId, useAStar ? this.heuristic(startId, goalId, metric) : 0);

    let visited = 0;
    let relaxed = 0;

    while (open.size > 0) {
      const current = open.pop().value;
      if (settled.has(current)) continue;   // ข้ามรายการค้างในคิว (lazy deletion)
      settled.add(current);
      visited += 1;

      if (current === goalId) break;

      const baseCost = gScore.get(current);
      for (const link of this.neighbors(current)) {
        if (settled.has(link.to)) continue;
        if (!Graph.allowed(link.edge, options)) continue;

        const tentative = baseCost + Graph.weight(link.edge, metric);
        relaxed += 1;
        if (tentative < (gScore.has(link.to) ? gScore.get(link.to) : Infinity)) {
          gScore.set(link.to, tentative);
          cameFrom.set(link.to, { from: current, link });
          const priority = useAStar
            ? tentative + this.heuristic(link.to, goalId, metric)
            : tentative;
          open.push(link.to, priority);
        }
      }
    }

    const ms = performance.now() - t0;
    if (!cameFrom.has(goalId)) {
      return {
        found: false, path: [], steps: [],
        distance: 0, time: 0, floorChanges: 0,
        stats: { algorithm: useAStar ? 'A*' : 'Dijkstra', visited, relaxed, ms },
      };
    }

    // ย้อนรอยเส้นทางกลับจากปลายทางไปจุดเริ่มต้น
    const path = [goalId];
    const links = [];
    let cursor = goalId;
    while (cameFrom.has(cursor)) {
      const prev = cameFrom.get(cursor);
      links.push(prev.link);
      cursor = prev.from;
      path.push(cursor);
    }
    path.reverse();
    links.reverse();

    let totalDistance = 0;
    let totalTime = 0;
    let floorChanges = 0;
    links.forEach((link) => {
      totalDistance += link.edge.distance;
      totalTime += Graph.weight(link.edge, 'time');
      if (STAIR_TYPES.has(link.edge.type) || link.edge.type === 'elevator') floorChanges += 1;
    });

    return {
      found: true,
      path,
      links,
      steps: links.map((link, i) => ({
        from: path[i], to: path[i + 1], edge: link.edge, reversed: link.reversed,
      })),
      distance: totalDistance,
      time: totalTime,
      floorChanges,
      stats: { algorithm: useAStar ? 'A*' : 'Dijkstra', visited, relaxed, ms },
    };
  }

  /**
   * Multi-target Dijkstra — หาสถานที่ที่ตรงเงื่อนไขและใกล้ที่สุด
   * เดิน Dijkstra จากจุดเริ่มเพียงรอบเดียว แล้วเก็บเป้าหมายที่พบตามลำดับ
   * เร็วกว่าการเรียก shortestPath ทีละเป้าหมายมาก
   *
   * @param {string} startId
   * @param {function(object): boolean} predicate  เงื่อนไขคัดเลือกโหนดปลายทาง
   * @param {object} options  เหมือน shortestPath + limit (จำนวนผลลัพธ์)
   * @returns {Array} [{ node, cost, distance, time, path }] เรียงจากใกล้ไปไกล
   */
  nearest(startId, predicate, options = {}) {
    const metric = options.metric === 'time' ? 'time' : 'distance';
    const limit = options.limit || 3;
    if (!this.nodes.has(startId)) return [];

    const gScore = new Map([[startId, 0]]);
    const cameFrom = new Map();
    const settled = new Set();
    const open = new MinHeap();
    open.push(startId, 0);
    const results = [];

    while (open.size > 0 && results.length < limit) {
      const current = open.pop().value;
      if (settled.has(current)) continue;
      settled.add(current);

      const node = this.nodes.get(current);
      if (current !== startId && predicate(node)) {
        results.push({ node, cost: gScore.get(current) });
      }

      const baseCost = gScore.get(current);
      for (const link of this.neighbors(current)) {
        if (settled.has(link.to)) continue;
        if (!Graph.allowed(link.edge, options)) continue;
        const tentative = baseCost + Graph.weight(link.edge, metric);
        if (tentative < (gScore.has(link.to) ? gScore.get(link.to) : Infinity)) {
          gScore.set(link.to, tentative);
          cameFrom.set(link.to, { from: current, link });
          open.push(link.to, tentative);
        }
      }
    }

    // สร้างเส้นทางเต็มของแต่ละผลลัพธ์จาก cameFrom ที่ได้มาแล้ว
    return results.map((r) => {
      const path = [r.node.id];
      const links = [];
      let cursor = r.node.id;
      while (cameFrom.has(cursor)) {
        const prev = cameFrom.get(cursor);
        links.push(prev.link);
        cursor = prev.from;
        path.push(cursor);
      }
      path.reverse();
      links.reverse();
      let distance = 0;
      let time = 0;
      links.forEach((l) => {
        distance += l.edge.distance;
        time += Graph.weight(l.edge, 'time');
      });
      return {
        node: r.node,
        cost: r.cost,
        distance,
        time,
        path,
        links,
        steps: links.map((link, i) => ({
          from: path[i], to: path[i + 1], edge: link.edge, reversed: link.reversed,
        })),
      };
    });
  }

  /**
   * ตรวจความเชื่อมต่อของกราฟด้วย BFS
   * คืนรายการโหนดที่เดินไปไม่ถึงจากจุดเริ่มต้น
   */
  unreachableFrom(startId) {
    const visited = new Set([startId]);
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const link of this.neighbors(current)) {
        if (!visited.has(link.to)) {
          visited.add(link.to);
          queue.push(link.to);
        }
      }
    }
    return [...this.nodes.values()].filter((n) => !visited.has(n.id));
  }

  /** สถิติของกราฟ ใช้แสดงในหน้า "เกี่ยวกับ" */
  statistics() {
    let degreeSum = 0;
    this.adjacency.forEach((list) => { degreeSum += list.length; });
    const byType = {};
    this.nodes.forEach((n) => { byType[n.type] = (byType[n.type] || 0) + 1; });
    return {
      nodes: this.nodeCount,
      edges: this.edgeCount,
      averageDegree: this.nodeCount ? degreeSum / this.nodeCount : 0,
      byType,
    };
  }
}

window.MinHeap = MinHeap;
window.Graph = Graph;
window.STAIR_TYPES = STAIR_TYPES;
