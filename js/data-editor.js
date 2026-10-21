/*
 * data-editor.js — ห้องทดลองป้อนข้อมูล JSON ทั้งสามไฟล์
 * ---------------------------------------------------------------
 * หน้านี้ให้ผู้ใช้พิมพ์/แก้ JSON ของ buildings.json, nodes.json, edges.json
 * บนหน้าเว็บโดยตรง แล้ววาดโหนดกับเส้นเชื่อมที่ได้เป็นภาพ 3 มิติทันที
 *
 * ใช้โมดูลเดียวกับหน้าแผนที่จริงทั้งหมด จึงมั่นใจได้ว่า
 * ถ้าข้อมูลผ่านหน้านี้แล้ว ก็ใช้กับ index.html ได้จริง
 *   - Graph       จาก js/graph.js    (โครงสร้างกราฟ + Dijkstra/A*)
 *   - Graph3DView จาก js/view3d.js   (ฉายภาพ 3 มิติ)
 *
 * การตรวจสอบใช้กติกาชุดเดียวกับ tools/validate_data.py
 *   ผิดพลาด (error)  = ข้อมูลใช้งานไม่ได้ ต้องแก้ก่อนจึงจะวาดภาพใหม่
 *   เตือน  (warning) = ใช้งานได้แต่น่าจะไม่ได้ตั้งใจ ยังวาดภาพให้ตามปกติ
 */

'use strict';

/* เปิดหน้ามาให้เริ่มที่ต้นเพจเสมอ เหมือนหน้าอธิบายอัลกอริทึม */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/* =============================================================
 * ข้อมูลตัวอย่างเริ่มต้น — 3 อาคาร อาคารละ 3 ชั้น ชั้นละ 2 ห้อง
 * บันได 2 ตำแหน่งต่อชั้น และทางเชื่อมระหว่างอาคาร 2 จุด
 * ============================================================= */
const EXAMPLE = {
  buildings: `{
  "meta": {
    "school": "ผังตัวอย่าง 3 อาคาร",
    "unit": "meter",
    "note": "ตัวอย่างสำหรับฝึกป้อนข้อมูล: 3 อาคาร อาคารละ 3 ชั้น ชั้นละ 2 ห้อง บันได 2 ตำแหน่งต่อชั้น และทางเชื่อมระหว่างอาคาร 2 จุด",
    "floorHeight": 4.0,
    "floors": [
      1,
      2,
      3
    ],
    "extent": [
      -6.0,
      -6.0,
      18.0,
      58.0
    ]
  },
  "buildings": [
    {"id": "b1", "name": "อาคาร 1", "shortName": "อ.1", "code": "1", "floors": [1, 2, 3], "color": "#2563eb", "rect": [-2.0, -3.0, 14.0, 3.0], "axis": "x", "zone": "ตัวอย่าง", "description": "อาคาร 1 - 3 ชั้น ชั้นละ 2 ห้อง บันได 2 ตำแหน่งต่อชั้น"},
    {"id": "b2", "name": "อาคาร 2", "shortName": "อ.2", "code": "2", "floors": [1, 2, 3], "color": "#7c3aed", "rect": [-2.0, 23.0, 14.0, 29.0], "axis": "x", "zone": "ตัวอย่าง", "description": "อาคาร 2 - 3 ชั้น ชั้นละ 2 ห้อง บันได 2 ตำแหน่งต่อชั้น"},
    {"id": "b3", "name": "อาคาร 3", "shortName": "อ.3", "code": "3", "floors": [1, 2, 3], "color": "#0d9488", "rect": [-2.0, 49.0, 14.0, 55.0], "axis": "x", "zone": "ตัวอย่าง", "description": "อาคาร 3 - 3 ชั้น ชั้นละ 2 ห้อง บันได 2 ตำแหน่งต่อชั้น"}
  ],
  "areas": []
}`,
  nodes: `{
  "version": "2.0",
  "nodes": [
    {"id": "b1-f1-stA", "name": "บันได 1ก ชั้น 1", "type": "stairs", "building": "b1", "floor": 1, "x": 0.0, "y": 0.0, "description": "บันไดอาคาร 1 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได1ก", "stA1"]},
    {"id": "b1-f1-stB", "name": "บันได 1ข ชั้น 1", "type": "stairs", "building": "b1", "floor": 1, "x": 12.0, "y": 0.0, "description": "บันไดอาคาร 1 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได1ข", "stB1"]},
    {"id": "b1-f1-r01", "name": "ห้อง 1101", "type": "classroom", "building": "b1", "floor": 1, "x": 4.0, "y": 0.0, "description": "อาคาร 1 ชั้น 1 ห้องที่ 1 จาก 2", "aliases": ["1101"]},
    {"id": "b1-f1-r02", "name": "ห้อง 1102", "type": "classroom", "building": "b1", "floor": 1, "x": 8.0, "y": 0.0, "description": "อาคาร 1 ชั้น 1 ห้องที่ 2 จาก 2", "aliases": ["1102"]},
    {"id": "b1-f2-stA", "name": "บันได 1ก ชั้น 2", "type": "stairs", "building": "b1", "floor": 2, "x": 0.0, "y": 0.0, "description": "บันไดอาคาร 1 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได1ก", "stA1"]},
    {"id": "b1-f2-stB", "name": "บันได 1ข ชั้น 2", "type": "stairs", "building": "b1", "floor": 2, "x": 12.0, "y": 0.0, "description": "บันไดอาคาร 1 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได1ข", "stB1"]},
    {"id": "b1-f2-r01", "name": "ห้อง 1201", "type": "classroom", "building": "b1", "floor": 2, "x": 4.0, "y": 0.0, "description": "อาคาร 1 ชั้น 2 ห้องที่ 1 จาก 2", "aliases": ["1201"]},
    {"id": "b1-f2-r02", "name": "ห้อง 1202", "type": "classroom", "building": "b1", "floor": 2, "x": 8.0, "y": 0.0, "description": "อาคาร 1 ชั้น 2 ห้องที่ 2 จาก 2", "aliases": ["1202"]},
    {"id": "b1-f3-stA", "name": "บันได 1ก ชั้น 3", "type": "stairs", "building": "b1", "floor": 3, "x": 0.0, "y": 0.0, "description": "บันไดอาคาร 1 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได1ก", "stA1"]},
    {"id": "b1-f3-stB", "name": "บันได 1ข ชั้น 3", "type": "stairs", "building": "b1", "floor": 3, "x": 12.0, "y": 0.0, "description": "บันไดอาคาร 1 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได1ข", "stB1"]},
    {"id": "b1-f3-r01", "name": "ห้อง 1301", "type": "classroom", "building": "b1", "floor": 3, "x": 4.0, "y": 0.0, "description": "อาคาร 1 ชั้น 3 ห้องที่ 1 จาก 2", "aliases": ["1301"]},
    {"id": "b1-f3-r02", "name": "ห้อง 1302", "type": "classroom", "building": "b1", "floor": 3, "x": 8.0, "y": 0.0, "description": "อาคาร 1 ชั้น 3 ห้องที่ 2 จาก 2", "aliases": ["1302"]},
    {"id": "b2-f1-stA", "name": "บันได 2ก ชั้น 1", "type": "stairs", "building": "b2", "floor": 1, "x": 0.0, "y": 26.0, "description": "บันไดอาคาร 2 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได2ก", "stA2"]},
    {"id": "b2-f1-stB", "name": "บันได 2ข ชั้น 1", "type": "stairs", "building": "b2", "floor": 1, "x": 12.0, "y": 26.0, "description": "บันไดอาคาร 2 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได2ข", "stB2"]},
    {"id": "b2-f1-r01", "name": "ห้อง 2101", "type": "classroom", "building": "b2", "floor": 1, "x": 4.0, "y": 26.0, "description": "อาคาร 2 ชั้น 1 ห้องที่ 1 จาก 2", "aliases": ["2101"]},
    {"id": "b2-f1-r02", "name": "ห้อง 2102", "type": "classroom", "building": "b2", "floor": 1, "x": 8.0, "y": 26.0, "description": "อาคาร 2 ชั้น 1 ห้องที่ 2 จาก 2", "aliases": ["2102"]},
    {"id": "b2-f2-stA", "name": "บันได 2ก ชั้น 2", "type": "stairs", "building": "b2", "floor": 2, "x": 0.0, "y": 26.0, "description": "บันไดอาคาร 2 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได2ก", "stA2"]},
    {"id": "b2-f2-stB", "name": "บันได 2ข ชั้น 2", "type": "stairs", "building": "b2", "floor": 2, "x": 12.0, "y": 26.0, "description": "บันไดอาคาร 2 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได2ข", "stB2"]},
    {"id": "b2-f2-r01", "name": "ห้อง 2201", "type": "classroom", "building": "b2", "floor": 2, "x": 4.0, "y": 26.0, "description": "อาคาร 2 ชั้น 2 ห้องที่ 1 จาก 2", "aliases": ["2201"]},
    {"id": "b2-f2-r02", "name": "ห้อง 2202", "type": "classroom", "building": "b2", "floor": 2, "x": 8.0, "y": 26.0, "description": "อาคาร 2 ชั้น 2 ห้องที่ 2 จาก 2", "aliases": ["2202"]},
    {"id": "b2-f3-stA", "name": "บันได 2ก ชั้น 3", "type": "stairs", "building": "b2", "floor": 3, "x": 0.0, "y": 26.0, "description": "บันไดอาคาร 2 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได2ก", "stA2"]},
    {"id": "b2-f3-stB", "name": "บันได 2ข ชั้น 3", "type": "stairs", "building": "b2", "floor": 3, "x": 12.0, "y": 26.0, "description": "บันไดอาคาร 2 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได2ข", "stB2"]},
    {"id": "b2-f3-r01", "name": "ห้อง 2301", "type": "classroom", "building": "b2", "floor": 3, "x": 4.0, "y": 26.0, "description": "อาคาร 2 ชั้น 3 ห้องที่ 1 จาก 2", "aliases": ["2301"]},
    {"id": "b2-f3-r02", "name": "ห้อง 2302", "type": "classroom", "building": "b2", "floor": 3, "x": 8.0, "y": 26.0, "description": "อาคาร 2 ชั้น 3 ห้องที่ 2 จาก 2", "aliases": ["2302"]},
    {"id": "b3-f1-stA", "name": "บันได 3ก ชั้น 1", "type": "stairs", "building": "b3", "floor": 1, "x": 0.0, "y": 52.0, "description": "บันไดอาคาร 3 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได3ก", "stA3"]},
    {"id": "b3-f1-stB", "name": "บันได 3ข ชั้น 1", "type": "stairs", "building": "b3", "floor": 1, "x": 12.0, "y": 52.0, "description": "บันไดอาคาร 3 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได3ข", "stB3"]},
    {"id": "b3-f1-r01", "name": "ห้อง 3101", "type": "classroom", "building": "b3", "floor": 1, "x": 4.0, "y": 52.0, "description": "อาคาร 3 ชั้น 1 ห้องที่ 1 จาก 2", "aliases": ["3101"]},
    {"id": "b3-f1-r02", "name": "ห้อง 3102", "type": "classroom", "building": "b3", "floor": 1, "x": 8.0, "y": 52.0, "description": "อาคาร 3 ชั้น 1 ห้องที่ 2 จาก 2", "aliases": ["3102"]},
    {"id": "b3-f2-stA", "name": "บันได 3ก ชั้น 2", "type": "stairs", "building": "b3", "floor": 2, "x": 0.0, "y": 52.0, "description": "บันไดอาคาร 3 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได3ก", "stA3"]},
    {"id": "b3-f2-stB", "name": "บันได 3ข ชั้น 2", "type": "stairs", "building": "b3", "floor": 2, "x": 12.0, "y": 52.0, "description": "บันไดอาคาร 3 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได3ข", "stB3"]},
    {"id": "b3-f2-r01", "name": "ห้อง 3201", "type": "classroom", "building": "b3", "floor": 2, "x": 4.0, "y": 52.0, "description": "อาคาร 3 ชั้น 2 ห้องที่ 1 จาก 2", "aliases": ["3201"]},
    {"id": "b3-f2-r02", "name": "ห้อง 3202", "type": "classroom", "building": "b3", "floor": 2, "x": 8.0, "y": 52.0, "description": "อาคาร 3 ชั้น 2 ห้องที่ 2 จาก 2", "aliases": ["3202"]},
    {"id": "b3-f3-stA", "name": "บันได 3ก ชั้น 3", "type": "stairs", "building": "b3", "floor": 3, "x": 0.0, "y": 52.0, "description": "บันไดอาคาร 3 ตำแหน่งก่อนห้อง 01 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได3ก", "stA3"]},
    {"id": "b3-f3-stB", "name": "บันได 3ข ชั้น 3", "type": "stairs", "building": "b3", "floor": 3, "x": 12.0, "y": 52.0, "description": "บันไดอาคาร 3 ตำแหน่งหลังห้อง 02 เชื่อมชั้น 1 ถึงชั้น 3", "aliases": ["บันได3ข", "stB3"]},
    {"id": "b3-f3-r01", "name": "ห้อง 3301", "type": "classroom", "building": "b3", "floor": 3, "x": 4.0, "y": 52.0, "description": "อาคาร 3 ชั้น 3 ห้องที่ 1 จาก 2", "aliases": ["3301"]},
    {"id": "b3-f3-r02", "name": "ห้อง 3302", "type": "classroom", "building": "b3", "floor": 3, "x": 8.0, "y": 52.0, "description": "อาคาร 3 ชั้น 3 ห้องที่ 2 จาก 2", "aliases": ["3302"]},
    {"id": "br-b1b2-f2", "name": "ทางเชื่อมอาคาร 1-2 (ชั้น 2)", "type": "bridge", "building": null, "floor": 2, "x": 12.0, "y": 13.0, "description": "ทางเดินเชื่อมชั้น 2 ระหว่างบันได 1ข กับบันได 2ข", "aliases": ["ทางเชื่อม12"]},
    {"id": "br-b2b3-f3", "name": "ทางเชื่อมอาคาร 2-3 (ชั้น 3)", "type": "bridge", "building": null, "floor": 3, "x": 0.0, "y": 39.0, "description": "ทางเดินเชื่อมชั้น 3 ระหว่างบันได 2ก กับบันได 3ก", "aliases": ["ทางเชื่อม23"]}
  ]
}`,
  edges: `{
  "version": "2.0",
  "edges": [
    {"from": "b1-f1-stA", "to": "b1-f1-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f1-r01", "to": "b1-f1-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f1-r02", "to": "b1-f1-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f2-stA", "to": "b1-f2-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f2-r01", "to": "b1-f2-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f2-r02", "to": "b1-f2-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f3-stA", "to": "b1-f3-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f3-r01", "to": "b1-f3-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f3-r02", "to": "b1-f3-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f1-stA", "to": "b2-f1-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f1-r01", "to": "b2-f1-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f1-r02", "to": "b2-f1-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f2-stA", "to": "b2-f2-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f2-r01", "to": "b2-f2-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f2-r02", "to": "b2-f2-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f3-stA", "to": "b2-f3-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f3-r01", "to": "b2-f3-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b2-f3-r02", "to": "b2-f3-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f1-stA", "to": "b3-f1-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f1-r01", "to": "b3-f1-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f1-r02", "to": "b3-f1-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f2-stA", "to": "b3-f2-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f2-r01", "to": "b3-f2-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f2-r02", "to": "b3-f2-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f3-stA", "to": "b3-f3-r01", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f3-r01", "to": "b3-f3-r02", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b3-f3-r02", "to": "b3-f3-stB", "distance": 4.0, "time": 3, "type": "corridor", "bidirectional": true},
    {"from": "b1-f1-stA", "to": "b1-f2-stA", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b1-f2-stA", "to": "b1-f1-stA", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b1-f2-stA", "to": "b1-f3-stA", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b1-f3-stA", "to": "b1-f2-stA", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b1-f1-stB", "to": "b1-f2-stB", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b1-f2-stB", "to": "b1-f1-stB", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b1-f2-stB", "to": "b1-f3-stB", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b1-f3-stB", "to": "b1-f2-stB", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b2-f1-stA", "to": "b2-f2-stA", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b2-f2-stA", "to": "b2-f1-stA", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b2-f2-stA", "to": "b2-f3-stA", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b2-f3-stA", "to": "b2-f2-stA", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b2-f1-stB", "to": "b2-f2-stB", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b2-f2-stB", "to": "b2-f1-stB", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b2-f2-stB", "to": "b2-f3-stB", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b2-f3-stB", "to": "b2-f2-stB", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b3-f1-stA", "to": "b3-f2-stA", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b3-f2-stA", "to": "b3-f1-stA", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b3-f2-stA", "to": "b3-f3-stA", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b3-f3-stA", "to": "b3-f2-stA", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b3-f1-stB", "to": "b3-f2-stB", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b3-f2-stB", "to": "b3-f1-stB", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b3-f2-stB", "to": "b3-f3-stB", "distance": 7.5, "time": 20, "type": "stairs_up", "bidirectional": false},
    {"from": "b3-f3-stB", "to": "b3-f2-stB", "distance": 7.5, "time": 15, "type": "stairs_down", "bidirectional": false},
    {"from": "b1-f2-stB", "to": "br-b1b2-f2", "distance": 13.0, "time": 10, "type": "bridge", "bidirectional": true},
    {"from": "br-b1b2-f2", "to": "b2-f2-stB", "distance": 13.0, "time": 10, "type": "bridge", "bidirectional": true},
    {"from": "b2-f3-stA", "to": "br-b2b3-f3", "distance": 13.0, "time": 10, "type": "bridge", "bidirectional": true},
    {"from": "br-b2b3-f3", "to": "b3-f3-stA", "distance": 13.0, "time": 10, "type": "bridge", "bidirectional": true}
  ]
}`,
};

/* ชนิดที่ระบบรู้จัก — ชนิดอื่นยังวาดได้แต่จะเตือนและใช้สีเทากลาง ๆ */
const KNOWN_NODE_TYPES = new Set(Object.keys(window.TYPE_STYLE));
const KNOWN_EDGE_TYPES = new Set([
  'corridor', 'bridge', 'outdoor', 'room', 'entrance', 'ramp',
  'stairs_up', 'stairs_down', 'stairs', 'elevator',
]);

const FILES = [
  { key: 'buildings', name: 'buildings.json', arrayKey: 'buildings' },
  { key: 'nodes', name: 'nodes.json', arrayKey: 'nodes' },
  { key: 'edges', name: 'edges.json', arrayKey: 'edges' },
];

const STORAGE_KEY = 'bodin-data-editor-v1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  active: 'nodes',
  view: null,
  graph: null,
  issues: [],
  drewOnce: false,
};

/* =============================================================
 * ตัวช่วยเรื่องข้อความ — หาบรรทัดของแต่ละรายการในอาร์เรย์
 * ============================================================= */

/** บรรทัดที่ตำแหน่งตัวอักษร index อยู่ (เริ่มนับที่ 1) */
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

/**
 * ตำแหน่งเริ่ม-จบของสมาชิกแต่ละตัวในอาร์เรย์ระดับบนสุดชื่อ arrayKey
 * เดินอ่านทีละตัวอักษรโดยข้ามเนื้อในสตริง จึงนับวงเล็บได้ถูกต้อง
 * คืน [{ start, end }] เรียงตามลำดับในไฟล์
 */
function itemRanges(text, arrayKey) {
  const head = new RegExp('"' + arrayKey + '"\\s*:\\s*\\[').exec(text);
  if (!head) return [];

  const out = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;

  for (let i = head.index + head[0].length; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; if (start < 0) start = i; continue; }
    if (ch === '{' || ch === '[') { if (start < 0) start = i; depth += 1; continue; }
    if (ch === '}' || ch === ']') {
      if (depth === 0) break;                 // ] ที่ปิดอาร์เรย์ตัวนอก
      depth -= 1;
      if (depth === 0 && start >= 0) { out.push({ start, end: i + 1 }); start = -1; }
      continue;
    }
    if (depth === 0 && ch === ',' && start >= 0) { out.push({ start, end: i }); start = -1; }
  }
  if (start >= 0) out.push({ start, end: text.length });
  return out;
}

/** บรรทัดของสมาชิกลำดับที่ index ในอาร์เรย์ (null ถ้าหาไม่เจอ) */
function itemLine(text, arrayKey, index) {
  const ranges = itemRanges(text, arrayKey);
  if (index < 0 || index >= ranges.length) return null;
  return lineAt(text, ranges[index].start);
}

/** ดึงเลขบรรทัดจากข้อความผิดพลาดของ JSON.parse */
function parseErrorLine(err, text) {
  const byLine = /line (\d+)/i.exec(err.message);
  if (byLine) return Number(byLine[1]);
  const byPos = /position (\d+)/i.exec(err.message);
  if (byPos) return lineAt(text, Number(byPos[1]));
  // เบราว์เซอร์บางรุ่นบอกแค่ข้อความรอบ ๆ จุดที่ผิด เช่น  ..."]}\n  ,\n  ]\n}" is not valid JSON
  const around = /\.\.\."([\s\S]*)" is not valid JSON/.exec(err.message);
  if (around) {
    const at = text.indexOf(around[1]);
    if (at >= 0) return lineAt(text, at);
  }
  return null;
}

/**
 * เดาสาเหตุที่ JSON พังจากความผิดพลาดยอดฮิตสามอย่าง
 * ข้อความของ JSON.parse เป็นภาษาอังกฤษและอ่านยากสำหรับผู้เริ่มต้น
 * ถ้าเจอรูปแบบที่รู้จัก จะบอกเป็นภาษาไทยพร้อมเลขบรรทัดแทน
 * คืน { line, msg } หรือ null ถ้าเดาไม่ออก
 */
function guessJsonMistake(text) {
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }

    if (ch === "'") {
      return {
        line: lineAt(text, i),
        msg: 'JSON ใช้อัญประกาศคู่ " เท่านั้น — เครื่องหมาย \' ใช้ไม่ได้',
      };
    }
    if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      return {
        line: lineAt(text, i),
        msg: 'JSON ไม่รองรับคอมเมนต์ — ต้องลบ // หรือ /* */ ออก',
      };
    }
    if (ch === ',') {
      // คอมมาปิดท้าย: หลังจากนี้เจอวงเล็บปิดโดยไม่มีรายการคั่น
      const rest = text.slice(i + 1);
      const next = /^\s*([\]}])/.exec(rest);
      if (next) {
        return {
          line: lineAt(text, i),
          msg: `มีคอมมาเกินอยู่ก่อน "${next[1]}" — JSON ไม่ยอมให้ใส่คอมมาหลังรายการสุดท้าย`,
        };
      }
    }
  }

  if (inStr) {
    return { line: null, msg: 'มีข้อความที่เปิดอัญประกาศ " ไว้แล้วไม่ได้ปิด' };
  }
  return null;
}

/* =============================================================
 * ตรวจสอบข้อมูล
 * ============================================================= */

function issue(level, file, line, msg) {
  return { level, file, line, msg };
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validate(texts) {
  const issues = [];
  const docs = {};

  /* ---- 1) แปลงข้อความเป็น JSON ---- */
  for (const f of FILES) {
    try {
      docs[f.key] = JSON.parse(texts[f.key]);
    } catch (err) {
      const hint = guessJsonMistake(texts[f.key]);
      issues.push(hint
        ? issue('error', f.key, hint.line, 'JSON ผิดรูปแบบ — ' + hint.msg)
        : issue('error', f.key, parseErrorLine(err, texts[f.key]),
          'JSON ผิดรูปแบบ — ' + err.message));
      docs[f.key] = null;
    }
  }
  if (issues.length) return { issues, docs: null };

  /* ---- 2) รูปร่างระดับบนสุด ---- */
  const shape = [
    ['buildings', 'buildings', 'อาคาร'],
    ['nodes', 'nodes', 'โหนด'],
    ['edges', 'edges', 'เส้นเชื่อม'],
  ];
  shape.forEach(([key, arrayKey, thai]) => {
    const doc = docs[key];
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      issues.push(issue('error', key, 1, 'ไฟล์ต้องเป็นอ็อบเจกต์ { ... } ไม่ใช่อย่างอื่น'));
    } else if (!Array.isArray(doc[arrayKey])) {
      issues.push(issue('error', key, 1,
        `ไฟล์ต้องมีคีย์ "${arrayKey}" ที่เป็นอาร์เรย์ของ${thai}`));
    }
  });
  if (issues.length) return { issues, docs: null };

  const buildings = docs.buildings.buildings;
  const nodes = docs.nodes.nodes;
  const edges = docs.edges.edges;

  const bLine = (i) => itemLine(texts.buildings, 'buildings', i);
  const nLine = (i) => itemLine(texts.nodes, 'nodes', i);
  const eLine = (i) => itemLine(texts.edges, 'edges', i);

  /* ---- 3) อาคาร ---- */
  const buildingIds = new Set();
  buildings.forEach((b, i) => {
    const at = bLine(i);
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      issues.push(issue('error', 'buildings', at, `อาคารลำดับที่ ${i + 1} ต้องเป็นอ็อบเจกต์`));
      return;
    }
    if (typeof b.id !== 'string' || !b.id.trim()) {
      issues.push(issue('error', 'buildings', at, `อาคารลำดับที่ ${i + 1} ต้องมี "id" เป็นข้อความ`));
    } else if (buildingIds.has(b.id)) {
      issues.push(issue('error', 'buildings', at, `อาคาร id ซ้ำ: "${b.id}"`));
    } else {
      buildingIds.add(b.id);
    }
    if (typeof b.name !== 'string' || !b.name.trim()) {
      issues.push(issue('warn', 'buildings', at, `อาคาร "${b.id || i + 1}" ไม่มี "name" จะไม่มีชื่อให้แสดง`));
    }
    if (b.color !== undefined && !/^#[0-9a-f]{3,8}$/i.test(String(b.color))) {
      issues.push(issue('warn', 'buildings', at, `อาคาร "${b.id}" มี "color" ที่ไม่ใช่รหัสสีแบบ #rrggbb`));
    }
    if (b.floors !== undefined && (!Array.isArray(b.floors) || !b.floors.every(isNum))) {
      issues.push(issue('warn', 'buildings', at, `อาคาร "${b.id}" ควรมี "floors" เป็นอาร์เรย์ของตัวเลขชั้น`));
    }
  });

  /* ---- 4) โหนด ---- */
  const nodeById = new Map();
  nodes.forEach((n, i) => {
    const at = nLine(i);
    if (!n || typeof n !== 'object' || Array.isArray(n)) {
      issues.push(issue('error', 'nodes', at, `โหนดลำดับที่ ${i + 1} ต้องเป็นอ็อบเจกต์`));
      return;
    }
    const label = typeof n.id === 'string' && n.id ? `"${n.id}"` : `ลำดับที่ ${i + 1}`;

    if (typeof n.id !== 'string' || !n.id.trim()) {
      issues.push(issue('error', 'nodes', at, `โหนด${label} ต้องมี "id" เป็นข้อความที่ไม่ว่าง`));
    } else if (nodeById.has(n.id)) {
      issues.push(issue('error', 'nodes', at, `โหนด id ซ้ำ: "${n.id}" — id ต้องไม่ซ้ำกันทั้งไฟล์`));
    } else {
      nodeById.set(n.id, n);
    }
    if (typeof n.name !== 'string' || !n.name.trim()) {
      issues.push(issue('error', 'nodes', at, `โหนด${label} ขาดฟิลด์ "name"`));
    }
    if (typeof n.type !== 'string' || !n.type.trim()) {
      issues.push(issue('error', 'nodes', at, `โหนด${label} ขาดฟิลด์ "type"`));
    } else if (!KNOWN_NODE_TYPES.has(n.type)) {
      issues.push(issue('warn', 'nodes', at,
        `โหนด${label} มี type "${n.type}" ที่ระบบไม่รู้จัก จะวาดด้วยสีกลาง ๆ (ชนิดที่รู้จัก: ${[...KNOWN_NODE_TYPES].join(', ')})`));
    }
    if (!isNum(n.x) || !isNum(n.y)) {
      issues.push(issue('error', 'nodes', at, `โหนด${label} ต้องมี "x" และ "y" เป็นตัวเลข (หน่วยเมตร)`));
    }
    if (!isNum(n.floor)) {
      issues.push(issue('warn', 'nodes', at, `โหนด${label} ไม่มี "floor" ที่เป็นตัวเลข จะถูกวางไว้ชั้นล่างสุด`));
    }
    if (n.building !== undefined && n.building !== null) {
      if (!buildingIds.has(n.building)) {
        issues.push(issue('warn', 'nodes', at,
          `โหนด${label} อ้างถึงอาคาร "${n.building}" ที่ไม่มีใน buildings.json`));
      } else {
        const b = buildings.find((x) => x.id === n.building);
        if (Array.isArray(b.floors) && isNum(n.floor) && !b.floors.includes(n.floor)) {
          issues.push(issue('warn', 'nodes', at,
            `โหนด${label} อยู่ชั้น ${n.floor} แต่อาคาร "${n.building}" ระบุว่ามีเฉพาะชั้น ${b.floors.join(', ')}`));
        }
      }
    }
    if (n.aliases !== undefined && !Array.isArray(n.aliases)) {
      issues.push(issue('warn', 'nodes', at, `โหนด${label} มี "aliases" ที่ไม่ใช่อาร์เรย์`));
    }
  });
  if (nodes.length === 0) {
    issues.push(issue('error', 'nodes', 1, 'ต้องมีอย่างน้อย 1 โหนดจึงจะวาดภาพได้'));
  }

  /* ---- 5) เส้นเชื่อม ---- */
  const seenPairs = new Set();
  edges.forEach((e, i) => {
    const at = eLine(i);
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      issues.push(issue('error', 'edges', at, `เส้นเชื่อมลำดับที่ ${i + 1} ต้องเป็นอ็อบเจกต์`));
      return;
    }
    const label = `ลำดับที่ ${i + 1} (${e.from} → ${e.to})`;

    ['from', 'to'].forEach((side) => {
      if (typeof e[side] !== 'string' || !e[side].trim()) {
        issues.push(issue('error', 'edges', at, `เส้นเชื่อม${label} ขาดฟิลด์ "${side}"`));
      } else if (!nodeById.has(e[side])) {
        issues.push(issue('error', 'edges', at,
          `เส้นเชื่อม${label} อ้างถึงโหนด "${e[side]}" ที่ไม่มีใน nodes.json`));
      }
    });
    if (e.from && e.from === e.to) {
      issues.push(issue('warn', 'edges', at, `เส้นเชื่อม${label} วนกลับมาที่โหนดเดิม`));
    }
    if (!isNum(e.distance) || e.distance <= 0) {
      issues.push(issue('error', 'edges', at,
        `เส้นเชื่อม${label} ต้องมี "distance" เป็นตัวเลขมากกว่า 0 (พบ: ${JSON.stringify(e.distance)})`));
    }
    if (e.time !== undefined && (!isNum(e.time) || e.time <= 0)) {
      issues.push(issue('error', 'edges', at,
        `เส้นเชื่อม${label} มี "time" ที่ไม่ใช่ตัวเลขบวก (พบ: ${JSON.stringify(e.time)})`));
    }
    if (typeof e.type !== 'string' || !KNOWN_EDGE_TYPES.has(e.type)) {
      issues.push(issue('warn', 'edges', at,
        `เส้นเชื่อม${label} มี type ${JSON.stringify(e.type)} ที่ระบบไม่รู้จัก`));
    }
    if (e.bidirectional !== undefined && typeof e.bidirectional !== 'boolean') {
      issues.push(issue('warn', 'edges', at,
        `เส้นเชื่อม${label} มี "bidirectional" ที่ไม่ใช่ true/false (ค่าเริ่มต้นคือ true)`));
    }
    const pair = e.from + ' -> ' + e.to;
    if (seenPairs.has(pair)) {
      issues.push(issue('warn', 'edges', at, `เส้นเชื่อม${label} ซ้ำกับเส้นก่อนหน้า`));
    }
    seenPairs.add(pair);
  });

  if (issues.some((it) => it.level === 'error')) return { issues, docs: null };

  /* ---- 6) ตรวจกราฟทั้งก้อน ---- */
  const graph = new Graph(nodes, edges);

  const touched = new Set();
  edges.forEach((e) => { touched.add(e.from); touched.add(e.to); });
  const lonely = nodes.filter((n) => !touched.has(n.id));
  lonely.slice(0, 8).forEach((n) => {
    const i = nodes.indexOf(n);
    issues.push(issue('warn', 'nodes', nLine(i),
      `โหนด "${n.id}" (${n.name}) ไม่มีเส้นเชื่อมเลย จะเดินไปถึงไม่ได้`));
  });
  if (lonely.length > 8) {
    issues.push(issue('warn', 'nodes', null, `...และยังมีโหนดที่ไม่มีเส้นเชื่ออีก ${lonely.length - 8} โหนด`));
  }

  const unreachable = graph.unreachableFrom(nodes[0].id);
  if (unreachable.length) {
    issues.push(issue('warn', 'edges', null,
      `มี ${unreachable.length} โหนดที่เดินไปไม่ถึงจาก "${nodes[0].name}" — กราฟยังขาดออกเป็นหลายก้อน ` +
      `(เช่น ${unreachable.slice(0, 3).map((n) => n.id).join(', ')})`));
  }

  return { issues, docs: { buildings: docs.buildings, nodes: docs.nodes, edges: docs.edges }, graph };
}

/* =============================================================
 * ช่องพิมพ์ JSON
 * ============================================================= */
const editors = {};
const gutters = {};

function readAll() {
  const out = {};
  FILES.forEach((f) => { out[f.key] = editors[f.key].value; });
  return out;
}

function setAll(texts) {
  FILES.forEach((f) => {
    if (typeof texts[f.key] === 'string') editors[f.key].value = texts[f.key];
  });
}

/** วาดเลขบรรทัดข้างช่องพิมพ์ พร้อมทำเครื่องหมายบรรทัดที่มีปัญหา */
function paintGutter(key) {
  const text = editors[key].value;
  const total = text.split('\n').length;
  const bad = new Set();
  state.issues.forEach((it) => {
    if (it.file === key && it.line) bad.add(it.line);
  });
  let html = '';
  for (let i = 1; i <= total; i++) {
    html += bad.has(i) ? `<b class="is-bad">${i}</b>` : `<b>${i}</b>`;
  }
  gutters[key].innerHTML = html;
  gutters[key].scrollTop = editors[key].scrollTop;
}

function paintAllGutters() {
  FILES.forEach((f) => paintGutter(f.key));
}

/** เขียนค่าเป็น JSON บรรทัดเดียว โดยเว้นวรรคหลัง : และ , ให้อ่านง่าย */
function stringifyInline(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stringifyInline).join(', ') + ']';
  return '{' + Object.keys(value)
    .map((k) => JSON.stringify(k) + ': ' + stringifyInline(value[k]))
    .join(', ') + '}';
}

/** จัดรูปแบบ JSON ให้สมาชิกในอาร์เรย์อยู่บรรทัดละหนึ่งรายการ (อ่านง่ายกว่า indent ปกติ) */
function formatDoc(doc, arrayKey) {
  const lines = ['{'];
  const keys = Object.keys(doc);
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    if (k === arrayKey && Array.isArray(doc[k])) {
      lines.push(`  ${JSON.stringify(k)}: [`);
      doc[k].forEach((item, j) => {
        lines.push('    ' + stringifyInline(item) + (j < doc[k].length - 1 ? ',' : ''));
      });
      lines.push(`  ]${comma}`);
    } else {
      const body = JSON.stringify(doc[k], null, 2).split('\n').join('\n  ');
      lines.push(`  ${JSON.stringify(k)}: ${body}${comma}`);
    }
  });
  lines.push('}');
  return lines.join('\n');
}

/* =============================================================
 * แท็บเลือกไฟล์
 * ============================================================= */
function showTab(key) {
  state.active = key;
  FILES.forEach((f) => {
    const on = f.key === key;
    $(`#tab-${f.key}`).classList.toggle('is-on', on);
    $(`#tab-${f.key}`).setAttribute('aria-selected', String(on));
    $(`#pane-${f.key}`).hidden = !on;
  });
  $$('#snippets [data-for]').forEach((btn) => {
    btn.hidden = btn.dataset.for !== key;
  });
  $('#current-file').textContent = FILES.find((f) => f.key === key).name;
  paintGutter(key);
}

/** เลื่อนไปที่บรรทัดที่ระบุแล้วเลือกข้อความทั้งบรรทัด */
function jumpTo(key, line) {
  showTab(key);
  const ta = editors[key];
  if (!line) { ta.focus(); return; }
  const lines = ta.value.split('\n');
  const n = Math.min(Math.max(1, line), lines.length);
  let start = 0;
  for (let i = 0; i < n - 1; i++) start += lines[i].length + 1;
  ta.focus();
  ta.setSelectionRange(start, start + lines[n - 1].length);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, (n - 1) * lh - ta.clientHeight / 2);
  gutters[key].scrollTop = ta.scrollTop;
}

/* =============================================================
 * รายงานผลตรวจ
 * ============================================================= */
function renderReport(result) {
  const errors = result.issues.filter((it) => it.level === 'error');
  const warns = result.issues.filter((it) => it.level === 'warn');

  const status = $('#report-status');
  status.classList.remove('is-ok', 'is-warn', 'is-bad');
  if (errors.length) {
    status.classList.add('is-bad');
    status.innerHTML = `<span class="dot"></span>พบข้อผิดพลาด ${errors.length} จุด
      <small>— แก้ให้ครบก่อน ภาพทางขวาจึงจะวาดใหม่</small>`;
  } else if (warns.length) {
    status.classList.add('is-warn');
    status.innerHTML = `<span class="dot"></span>ใช้งานได้ แต่มีข้อควรระวัง ${warns.length} จุด
      <small>— วาดภาพให้แล้ว</small>`;
  } else {
    status.classList.add('is-ok');
    status.innerHTML = '<span class="dot"></span>ข้อมูลถูกต้องครบถ้วน <small>— วาดภาพให้แล้ว</small>';
  }

  const list = $('#issues');
  list.innerHTML = '';
  result.issues.slice(0, 60).forEach((it) => {
    const li = document.createElement('li');
    if (it.level === 'warn') li.classList.add('warn');
    const file = FILES.find((f) => f.key === it.file);
    if (it.line) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'jump';
      jump.textContent = `${file.name}:${it.line}`;
      jump.title = 'ไปที่บรรทัดนี้';
      jump.addEventListener('click', () => jumpTo(it.file, it.line));
      li.appendChild(jump);
    } else {
      const where = document.createElement('span');
      where.className = 'where';
      where.textContent = file.name;
      li.appendChild(where);
    }
    const msg = document.createElement('span');
    msg.textContent = it.msg;
    li.appendChild(msg);
    list.appendChild(li);
  });
  if (result.issues.length > 60) {
    const li = document.createElement('li');
    li.className = 'warn';
    li.textContent = `...และอีก ${result.issues.length - 60} รายการ`;
    list.appendChild(li);
  }

  FILES.forEach((f) => {
    const badge = $(`#tab-${f.key} .badge`);
    const n = errors.filter((it) => it.file === f.key).length;
    badge.classList.toggle('is-bad', n > 0);
    badge.textContent = n > 0 ? String(n) : countItems(f.key);
  });
}

/** จำนวนสมาชิกในอาร์เรย์ของไฟล์นั้น (นับจากข้อความ ใช้ได้แม้ JSON ยังพัง) */
function countItems(key) {
  const f = FILES.find((x) => x.key === key);
  return String(itemRanges(editors[key].value, f.arrayKey).length);
}

/* =============================================================
 * วาดภาพ 3 มิติ
 * ============================================================= */
function draw(result) {
  const graph = result.graph;
  const buildings = result.docs.buildings.buildings;
  const buildingsById = new Map(buildings.map((b) => [b.id, b]));
  const meta = result.docs.buildings.meta || {};
  const canvas = $('#scene');

  if (!state.view) {
    state.view = new Graph3DView(canvas, {
      graph, buildings, buildingsById, floorHeight: meta.floorHeight || 4,
    });
    state.view.onNodeClick = onPickNode;
    state.view.setFloorGap($('#floor-gap').value);
  } else {
    // เก็บมุมกล้องไว้ เพื่อไม่ให้ภาพเด้งกลับทุกครั้งที่พิมพ์แก้ JSON
    const cam = {
      yaw: state.view.yaw,
      pitch: state.view.pitch,
      dist: state.view.dist,
      target: Object.assign({}, state.view.target),
    };
    const keepFloor = state.view.floor;
    state.view.setGraph(graph, buildingsById);
    state.view.yaw = cam.yaw;
    state.view.pitch = cam.pitch;
    state.view.dist = cam.dist;
    state.view.target = cam.target;
    if (keepFloor !== null && state.view.availableFloors().includes(keepFloor)) {
      state.view.setFloor(keepFloor);
    }
    state.view.invalidate();
  }

  state.graph = graph;
  if (!state.drewOnce) { state.view.fit(); state.drewOnce = true; }

  buildFloorButtons();
  buildLegend(result);
  fillStats(result);
  fillTrialSelects();
  $('#picked').hidden = true;
}

function buildFloorButtons() {
  const box = $('#floor-list');
  const floors = state.view.availableFloors();
  box.innerHTML = '';

  const mk = (label, value, on) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.classList.toggle('is-on', on);
    btn.addEventListener('click', () => {
      state.view.setFloor(value);
      buildFloorButtons();
    });
    box.appendChild(btn);
  };

  mk('ทุกชั้น', null, state.view.floor === null);
  floors.forEach((f) => mk(`ชั้น ${f}`, f, state.view.floor === f));
}

function buildLegend(result) {
  const box = $('#legend');
  box.innerHTML = '';

  const nodeTypes = [...new Set(result.docs.nodes.nodes.map((n) => n.type))];
  nodeTypes.forEach((t) => {
    const style = window.TYPE_STYLE[t] || { color: '#94a3b8', label: t };
    const n = result.docs.nodes.nodes.filter((x) => x.type === t).length;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<i style="background:${style.color}"></i>${style.label || t} · ${n}`;
    box.appendChild(chip);
  });

  const edgeTypes = [...new Set(result.docs.edges.edges.map((e) => e.type))];
  edgeTypes.forEach((t) => {
    const style = window.EDGE_STYLE[t] || { color: '#94a3b8' };
    const n = result.docs.edges.edges.filter((x) => x.type === t).length;
    const chip = document.createElement('span');
    chip.className = 'chip edge';
    chip.innerHTML = `<i style="background:${style.color}"></i><code>${t}</code> · ${n}`;
    box.appendChild(chip);
  });
}

function fillStats(result) {
  const s = state.graph.statistics();
  $('#stat-nodes').textContent = s.nodes;
  $('#stat-edges').textContent = s.edges;
  $('#stat-buildings').textContent = result.docs.buildings.buildings.length;
  $('#stat-degree').textContent = s.averageDegree.toFixed(2);
}

function onPickNode(node) {
  state.view.select(node.id);

  const style = window.TYPE_STYLE[node.type] || { label: node.type };
  $('#picked').hidden = false;
  $('#picked-name').textContent = node.name;
  $('#picked-meta').textContent =
    `${style.label || node.type} · ชั้น ${node.floor} · พิกัด (${node.x}, ${node.y})`;

  const links = state.graph.neighbors(node.id);
  $('#picked-json').textContent = JSON.stringify(node, null, 2);
  $('#picked-links').textContent = links.length
    ? `เชื่อมกับ ${links.length} โหนด: ` + links.map((l) => l.to).join(', ')
    : 'ยังไม่มีเส้นเชื่อมใดต่อกับโหนดนี้';

  // เลื่อนช่องพิมพ์ไปที่บรรทัดของโหนดนี้ใน nodes.json
  const idx = [...state.graph.nodes.keys()].indexOf(node.id);
  const line = itemLine(editors.nodes.value, 'nodes', idx);
  if (line) jumpTo('nodes', line);
}

/* =============================================================
 * แผงทดลองหาเส้นทาง
 * ============================================================= */
function fillTrialSelects() {
  const nodes = [...state.graph.nodes.values()];
  ['#trial-from', '#trial-to'].forEach((sel, i) => {
    const el = $(sel);
    const keep = el.value;
    el.innerHTML = '';
    nodes.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = `${n.name} (${n.id})`;
      el.appendChild(opt);
    });
    if (nodes.some((n) => n.id === keep)) el.value = keep;
    else if (nodes.length) el.value = nodes[i === 0 ? 0 : nodes.length - 1].id;
  });
  $('#trial-out').textContent = 'เลือกจุดเริ่มกับจุดหมาย แล้วกด "หาเส้นทาง" เพื่อทดสอบว่าข้อมูลเดินถึงกันจริง';
}

function runTrial() {
  const from = $('#trial-from').value;
  const to = $('#trial-to').value;
  const route = state.graph.shortestPath(from, to, { metric: 'distance', algorithm: 'astar' });
  const out = $('#trial-out');

  if (!route || !route.found) {
    out.innerHTML = '<span style="color:var(--bad)">เดินจากจุดเริ่มไปจุดหมายไม่ได้</span> — ' +
      'แปลว่ายังขาดเส้นเชื่อมที่ต่อสองจุดนี้เข้าหากัน';
    state.view.renderRoute(null);
    return;
  }
  state.view.setEndpoints(from, to);
  state.view.renderRoute(route);
  out.innerHTML =
    `ระยะทางรวม <b>${route.distance.toFixed(1)} ม.</b> · ` +
    `เวลาราว <b>${Math.round(route.time)} วิ</b> · ` +
    `ผ่าน <b>${route.path.length}</b> โหนด · ` +
    `ขึ้น-ลงชั้น <b>${route.floorChanges}</b> ครั้ง · ` +
    `${route.stats.algorithm} สำรวจ <b>${route.stats.visited}</b> โหนด`;
}

/* =============================================================
 * ปุ่มต่าง ๆ
 * ============================================================= */
let toastTimer = null;
function toast(msg) {
  const box = $('#toast');
  box.textContent = msg;
  box.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('is-on'), 2200);
}

function download(key) {
  const f = FILES.find((x) => x.key === key);
  const blob = new Blob([editors[key].value.replace(/\n?$/, '\n')], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`บันทึก ${f.name} แล้ว — นำไปวางทับในโฟลเดอร์ data/ ได้เลย`);
}

async function copyActive() {
  const text = editors[state.active].value;
  try {
    await navigator.clipboard.writeText(text);
    toast('คัดลอกข้อความทั้งไฟล์แล้ว');
  } catch (err) {
    editors[state.active].select();
    toast('กด Ctrl+C เพื่อคัดลอก');
  }
}

function formatActive() {
  const key = state.active;
  const f = FILES.find((x) => x.key === key);
  try {
    const doc = JSON.parse(editors[key].value);
    editors[key].value = formatDoc(doc, f.arrayKey);
    toast(`จัดรูปแบบ ${f.name} แล้ว`);
    apply();
  } catch (err) {
    toast('จัดรูปแบบไม่ได้ เพราะ JSON ยังผิดรูปแบบอยู่');
  }
}

/** เติมตัวอย่างรายการใหม่ต่อท้ายอาร์เรย์ของไฟล์ที่เปิดอยู่ */
function insertSnippet(snippet) {
  const key = state.active;
  const f = FILES.find((x) => x.key === key);
  const ta = editors[key];
  const text = ta.value;
  const ranges = itemRanges(text, f.arrayKey);

  let at;
  let insert;
  if (ranges.length) {
    at = ranges[ranges.length - 1].end;
    insert = ',\n    ' + snippet;
  } else {
    const head = new RegExp('"' + f.arrayKey + '"\\s*:\\s*\\[').exec(text);
    if (!head) { toast(`ไม่พบอาร์เรย์ "${f.arrayKey}" ในไฟล์นี้`); return; }
    at = head.index + head[0].length;
    insert = '\n    ' + snippet + '\n  ';
  }

  ta.value = text.slice(0, at) + insert + text.slice(at);
  const line = lineAt(ta.value, at + insert.indexOf('{'));
  apply();
  jumpTo(key, line);
  toast('เพิ่มรายการตัวอย่างต่อท้ายแล้ว — แก้ค่าให้ตรงกับที่ต้องการได้เลย');
}

function resetExample() {
  setAll(EXAMPLE);
  state.drewOnce = false;
  apply();
  toast('คืนค่าตัวอย่างเริ่มต้นแล้ว');
}

async function loadRealData() {
  const btn = $('#btn-load-real');
  btn.disabled = true;
  btn.textContent = 'กำลังโหลด…';
  try {
    const texts = {};
    await Promise.all(FILES.map(async (f) => {
      const res = await fetch(`data/${f.name}?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
      texts[f.key] = await res.text();
    }));
    setAll(texts);
    state.drewOnce = false;
    apply();
    toast('โหลดข้อมูลจริงของโรงเรียนจากโฟลเดอร์ data/ แล้ว');
  } catch (err) {
    toast(location.protocol === 'file:'
      ? 'โหลดไม่ได้เพราะเปิดหน้าเว็บแบบ file:// — ให้เปิดผ่านเว็บเซิร์ฟเวอร์'
      : 'โหลดไม่สำเร็จ: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'โหลดข้อมูลจริง 7 อาคาร';
  }
}

/* =============================================================
 * บันทึกงานที่แก้ไว้ในเครื่อง (กันหายตอนรีเฟรช)
 * ============================================================= */
function save(texts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(texts));
  } catch (err) { /* โหมดส่วนตัวหรือพื้นที่เต็ม — ข้ามไป ไม่ใช่เรื่องคอขาดบาดตาย */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!FILES.every((f) => typeof saved[f.key] === 'string')) return false;
    setAll(saved);
    return true;
  } catch (err) {
    return false;
  }
}

/* =============================================================
 * วงจรหลัก: อ่านข้อความ → ตรวจ → รายงาน → วาด
 * ============================================================= */
function apply() {
  const texts = readAll();
  const result = validate(texts);
  state.issues = result.issues;

  renderReport(result);
  paintAllGutters();

  const hasError = result.issues.some((it) => it.level === 'error');
  $('#stage').classList.toggle('is-stale', hasError && state.drewOnce);
  if (!hasError && result.docs) draw(result);

  save(texts);
}

let applyTimer = null;
function applySoon() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(apply, 500);
}

/* =============================================================
 * เริ่มทำงาน
 * ============================================================= */
function main() {
  FILES.forEach((f) => {
    editors[f.key] = $(`#ed-${f.key}`);
    gutters[f.key] = $(`#gutter-${f.key}`);

    editors[f.key].addEventListener('input', () => {
      paintGutter(f.key);
      applySoon();
    });
    editors[f.key].addEventListener('scroll', () => {
      gutters[f.key].scrollTop = editors[f.key].scrollTop;
    });
    // Tab ในช่องพิมพ์ = เว้นวรรคสองตัว ไม่ใช่ย้ายโฟกัส
    editors[f.key].addEventListener('keydown', (evt) => {
      if (evt.key !== 'Tab' || evt.shiftKey) return;
      evt.preventDefault();
      const ta = evt.target;
      const { selectionStart: s, selectionEnd: e } = ta;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + 2;
      paintGutter(f.key);
      applySoon();
    });

    $(`#tab-${f.key}`).addEventListener('click', () => showTab(f.key));
    $(`#dl-${f.key}`).addEventListener('click', () => download(f.key));
  });

  $('#btn-apply').addEventListener('click', apply);
  $('#btn-format').addEventListener('click', formatActive);
  $('#btn-copy').addEventListener('click', copyActive);
  $('#btn-reset').addEventListener('click', resetExample);
  $('#btn-load-real').addEventListener('click', loadRealData);
  $$('#snippets button[data-snippet]').forEach((btn) => {
    btn.addEventListener('click', () => insertSnippet(btn.dataset.snippet));
  });

  /* ---- ปุ่มควบคุมภาพ 3 มิติ ---- */
  $('#btn-fit').addEventListener('click', () => state.view && state.view.fit());
  $('#btn-reset-view').addEventListener('click', () => state.view && state.view.resetView());
  const toggle = (id, fn, startOn) => {
    const btn = $(id);
    btn.classList.toggle('is-on', !!startOn);
    btn.addEventListener('click', () => {
      const on = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
      if (state.view) fn(on);
    });
  };
  toggle('#btn-grid', (on) => state.view.setShowGrid(on), true);
  toggle('#btn-labels', (on) => state.view.setShowLabels(on), true);
  toggle('#btn-spin', (on) => state.view.setAutoRotate(on), false);
  $('#floor-gap').addEventListener('input', (evt) => {
    if (state.view) state.view.setFloorGap(evt.target.value);
  });

  $('#trial-run').addEventListener('click', runTrial);
  $('#trial-clear').addEventListener('click', () => {
    if (!state.view) return;
    state.view.renderRoute(null);
    state.view.setEndpoints(null, null);
    $('#trial-out').textContent = 'ล้างเส้นทางแล้ว';
  });

  if (!restore()) setAll(EXAMPLE);
  showTab('nodes');
  apply();
}

document.addEventListener('DOMContentLoaded', main);
