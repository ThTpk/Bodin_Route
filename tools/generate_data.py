# -*- coding: utf-8 -*-
"""
generate_data.py
------------------------------------------------------------------
สร้างชุดข้อมูลกราฟ (nodes / edges / buildings) ตามโครงสร้างอาคารที่กำหนด

    python tools/generate_data.py

โครงสร้างที่สร้าง
  - อาคาร 7 หลัง แบ่งเป็นสองโซนวางขนานกัน
        โซนตะวันตก : อาคาร 1, 2, 3, 4   (เรียงตามแนวแกน Y)
        โซนตะวันออก: อาคาร 5, 6, 7      (เรียงตามแนวแกน Y ห่างออกไปตามแกน X)
  - แต่ละอาคารสูง 4 หรือ 5 ชั้น ชั้นละ 10 ห้อง
  - บันไดของแต่ละอาคาร 3 ตำแหน่ง
        ก = ก่อนห้อง 01
        ข = ระหว่างห้อง 05 กับ 06
        ค = หลังห้อง 10
    สร้างเป็นโหนดแยกทุกชั้น แล้วเชื่อมชั้นต่อชั้นด้วยเส้นเชื่อมชนิดบันได
  - ทางเชื่อมระหว่างอาคาร 7 จุด (ดูตาราง BRIDGES)
        ภายในโซน  : เชื่อมห้อง 10 ของอาคารหนึ่งกับห้อง 01 ของอาคารถัดไป ที่ชั้น 2
        ข้ามโซน    : เชื่อมบันได ค กับบันได ก ของอีกโซน ที่ชั้น 2 และชั้น 3
    ทางเชื่อมข้ามโซนทำให้กราฟมีวงรอบ (cycle) จึงมีหลายเส้นทางให้เลือกจริง ๆ

ผังพิกัด (หน่วยเมตร เป็นผังจำลองตามสัดส่วน ไม่ใช่แบบแปลนจริง)
  - แต่ละอาคารเป็นทางเดินยาวตามแนวแกน X มีโหนดเรียงเป็นสาย
        [บันได ก] 01 02 03 04 05 [บันได ข] 06 07 08 09 10 [บันได ค]
  - อาคารในโซนเดียวกันวางขนานกันตามแนวแกน Y ห่างกัน 26 เมตร
    และเรียงเลขห้องสลับทิศ (flip) เพื่อให้ห้อง 10 ของอาคารก่อนหน้า
    อยู่ตรงข้ามกับห้อง 01 ของอาคารถัดไปพอดี ทางเชื่อมจึงเป็นเส้นตรงสั้น ๆ
  - แกน Z (ความสูง) คำนวณจากชั้นตอนวาดภาพ 3 มิติ ไม่ได้เก็บในไฟล์
------------------------------------------------------------------
รันสคริปต์นี้ใหม่ได้ทุกเมื่อ ไฟล์ใน data/ จะถูกเขียนทับทั้งหมด
"""

import json
import math
import os
import sys

# คอนโซล Windows ใช้รหัสอักขระ cp874 ซึ่งพิมพ์ภาษาไทยบางตัวไม่ได้ จึงบังคับเป็น UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# ------------------------------------------------------------------
# ค่าคงที่ของผัง
# ------------------------------------------------------------------
ROOMS = 10
SLOTS = 12             # จำนวนช่วงบนทางเดินหนึ่งชั้น (13 ช่อง = 12 ช่วง)

SPACING = 4.0          # ระยะห่างระหว่างจุดบนทางเดิน (เมตร)
WING_GAP = 26.0        # ระยะห่างระหว่างอาคารในโซนเดียวกัน (เมตร)
ZONE_GAP = 28.0        # ระยะห่างระหว่างปลายอาคารของสองโซน (เมตร)
FLOOR_HEIGHT = 4.0     # ความสูงต่อชั้น (เมตร)
WALK_SPEED = 1.3       # ความเร็วเดินเฉลี่ย (เมตร/วินาที)

STAIR_DISTANCE = 7.5   # ระยะเดินจริงของบันไดหนึ่งช่วงชั้น (เมตร)
STAIR_TIME_UP = 20     # วินาที
STAIR_TIME_DOWN = 15   # วินาที

SPAN = SLOTS * SPACING            # ความยาวทางเดินหนึ่งชั้น = 48 เมตร
ZONE_X = SPAN + ZONE_GAP          # จุดเริ่มต้นของโซนตะวันออก = 76 เมตร

# บันไดสามตำแหน่ง: (รหัส, ชื่อไทย, ตำแหน่งในสาย, คำอธิบาย)
STAIRS = [
    ("A", "ก", 0, "ก่อนห้อง 01"),
    ("B", "ข", 6, "ระหว่างห้อง 05 กับห้อง 06"),
    ("C", "ค", 12, "หลังห้อง 10"),
]

# ตำแหน่งของห้องแต่ละเลขในสายทางเดิน (ช่อง 0-12 รวมบันไดสามจุด)
ROOM_SLOT = {r: (r if r <= 5 else r + 1) for r in range(1, ROOMS + 1)}

# ------------------------------------------------------------------
# ตารางอาคาร
#   floors = จำนวนชั้น (4 หรือ 5)
#   x0     = พิกัด X ของช่องแรกของอาคาร
#   y      = พิกัด Y ของแนวทางเดิน
#   flip   = True ให้เรียงเลขห้องกลับทิศ (ห้อง 01 อยู่ปลายด้าน X มาก)
# ------------------------------------------------------------------
BUILDINGS = [
    {"id": 1, "floors": 5, "x0": 0.0,    "y": 0.0 * WING_GAP, "flip": False,
     "color": "#2563eb", "zone": "ตะวันตก"},
    {"id": 2, "floors": 4, "x0": 0.0,    "y": 1.0 * WING_GAP, "flip": True,
     "color": "#7c3aed", "zone": "ตะวันตก"},
    {"id": 3, "floors": 5, "x0": 0.0,    "y": 2.0 * WING_GAP, "flip": False,
     "color": "#0d9488", "zone": "ตะวันตก"},
    {"id": 4, "floors": 4, "x0": 0.0,    "y": 3.0 * WING_GAP, "flip": True,
     "color": "#db2777", "zone": "ตะวันตก"},
    {"id": 5, "floors": 5, "x0": ZONE_X, "y": 0.0 * WING_GAP, "flip": False,
     "color": "#ea580c", "zone": "ตะวันออก"},
    {"id": 6, "floors": 4, "x0": ZONE_X, "y": 1.0 * WING_GAP, "flip": True,
     "color": "#65a30d", "zone": "ตะวันออก"},
    {"id": 7, "floors": 5, "x0": ZONE_X, "y": 2.0 * WING_GAP, "flip": False,
     "color": "#0891b2", "zone": "ตะวันออก"},
]

BUILDING_BY_ID = {b["id"]: b for b in BUILDINGS}

# ------------------------------------------------------------------
# ตารางทางเชื่อมระหว่างอาคาร
#   (อาคาร ก, อาคาร ข, ชั้น, ปลายทางฝั่ง ก, ปลายทางฝั่ง ข)
#   ปลายทางเป็น ("room", เลขห้อง) หรือ ("stair", รหัสบันได)
# ------------------------------------------------------------------
BRIDGES = [
    (1, 2, 2, ("room", ROOMS), ("room", 1)),
    (2, 3, 2, ("room", ROOMS), ("room", 1)),
    (3, 4, 2, ("room", ROOMS), ("room", 1)),
    (5, 6, 2, ("room", ROOMS), ("room", 1)),
    (6, 7, 2, ("room", ROOMS), ("room", 1)),
    (1, 5, 2, ("stair", "C"), ("stair", "A")),
    (3, 7, 3, ("stair", "C"), ("stair", "A")),
]

SOURCE = "สร้างจาก tools/generate_data.py ตามโครงสร้างอาคารที่กำหนด"


# ------------------------------------------------------------------
# ตัวช่วยคำนวณพิกัดและไอดี
# ------------------------------------------------------------------
def floors_of(b):
    return list(range(1, BUILDING_BY_ID[b]["floors"] + 1))


def wing_y(b):
    """พิกัด Y ของแนวทางเดินของอาคาร"""
    return BUILDING_BY_ID[b]["y"]


def slot_x(b, slot):
    """พิกัด X ของช่องที่ slot ในอาคาร (อาคารที่ flip เรียงกลับทิศ)"""
    info = BUILDING_BY_ID[b]
    x = slot * SPACING
    return info["x0"] + (SPAN - x if info["flip"] else x)


def room_code(building, floor, room):
    """รหัสห้องแบบ [อาคาร][ชั้น][เลขห้อง] เช่น 1101 = อาคาร 1 ชั้น 1 ห้อง 01"""
    return "%d%d%02d" % (building, floor, room)


def room_id(b, f, r):
    return "b%d-f%d-r%02d" % (b, f, r)


def stair_id(b, f, code):
    return "b%d-f%d-st%s" % (b, f, code)


def stair_thai(code):
    return next(t for c, t, _s, _w in STAIRS if c == code)


def stair_slot(code):
    return next(s for c, _t, s, _w in STAIRS if c == code)


def endpoint(b, floor, spec):
    """แปลงปลายทางของทางเชื่อมเป็น (id, x, y, ชื่อที่อ่านออก)"""
    kind, key = spec
    if kind == "room":
        return (room_id(b, floor, key),
                slot_x(b, ROOM_SLOT[key]),
                wing_y(b),
                "ห้อง %s" % room_code(b, floor, key))
    return (stair_id(b, floor, key),
            slot_x(b, stair_slot(key)),
            wing_y(b),
            "บันได %d%s" % (b, stair_thai(key)))


def bridge_id(a, b, floor):
    return "br-b%db%d-f%d" % (a, b, floor)


def node(**kw):
    """โหนดหนึ่งตัวพร้อมฟิลด์มาตรฐานครบทุกช่อง"""
    base = {
        "id": "", "name": "", "type": "", "building": None, "floor": 0,
        "x": 0.0, "y": 0.0, "description": "", "photo": "",
        "aliases": [], "source": SOURCE,
    }
    base.update(kw)
    base["x"] = round(float(base["x"]), 2)
    base["y"] = round(float(base["y"]), 2)
    return base


def edge(a, b, distance, etype, time=None, bidirectional=True):
    return {
        "from": a,
        "to": b,
        "distance": round(float(distance), 2),
        "time": int(round(time if time is not None else distance / WALK_SPEED)),
        "type": etype,
        "bidirectional": bidirectional,
    }


# ------------------------------------------------------------------
# สร้างโหนด
# ------------------------------------------------------------------
def build_nodes():
    nodes = []
    for info in BUILDINGS:
        b = info["id"]
        y = wing_y(b)
        floors = floors_of(b)
        for f in floors:
            # --- บันไดสามตำแหน่งของชั้นนี้ ---
            for code, thai, slot, where in STAIRS:
                nodes.append(node(
                    id=stair_id(b, f, code),
                    name="บันได %d%s ชั้น %d" % (b, thai, f),
                    type="stairs",
                    building="b%d" % b,
                    floor=f,
                    x=slot_x(b, slot),
                    y=y,
                    description="บันไดอาคาร %d ตำแหน่ง%s เชื่อมชั้น %d ถึงชั้น %d"
                                % (b, where, floors[0], floors[-1]),
                    aliases=["บันได%d%s" % (b, thai), "st%s%d" % (code, b)],
                ))
            # --- ห้องเรียน 10 ห้องของชั้นนี้ ---
            for r in range(1, ROOMS + 1):
                code = room_code(b, f, r)
                nodes.append(node(
                    id=room_id(b, f, r),
                    name="ห้อง %s" % code,
                    type="classroom",
                    building="b%d" % b,
                    floor=f,
                    x=slot_x(b, ROOM_SLOT[r]),
                    y=y,
                    description="อาคาร %d ชั้น %d ห้องที่ %d จาก %d" % (b, f, r, ROOMS),
                    aliases=[code, "%d/%d/%d" % (b, f, r)],
                ))

    # --- โหนดทางเชื่อมระหว่างอาคาร ---
    for a, b, floor, spec_a, spec_b in BRIDGES:
        _id_a, x_a, y_a, name_a = endpoint(a, floor, spec_a)
        _id_b, x_b, y_b, name_b = endpoint(b, floor, spec_b)
        nodes.append(node(
            id=bridge_id(a, b, floor),
            name="ทางเชื่อมอาคาร %d-%d (ชั้น %d)" % (a, b, floor),
            type="bridge",
            building=None,
            floor=floor,
            x=(x_a + x_b) / 2,
            y=(y_a + y_b) / 2,
            description="ทางเดินเชื่อมชั้น %d ระหว่าง%s อาคาร %d กับ%s อาคาร %d"
                        % (floor, name_a, a, name_b, b),
            aliases=["ทางเชื่อม%d%d" % (a, b), "สะพาน%d-%d" % (a, b)],
        ))
    return nodes


# ------------------------------------------------------------------
# สร้างเส้นเชื่อม
# ------------------------------------------------------------------
def chain_ids(b, f):
    """ไอดีของโหนดบนทางเดินชั้น f ของอาคาร b เรียงตามตำแหน่งจริง"""
    ids = [None] * (SLOTS + 1)
    for code, _thai, slot, _where in STAIRS:
        ids[slot] = stair_id(b, f, code)
    for r in range(1, ROOMS + 1):
        ids[ROOM_SLOT[r]] = room_id(b, f, r)
    return ids


def build_edges():
    edges = []

    # --- ทางเดินในแต่ละชั้น: บันได ก - ห้อง 01..05 - บันได ข - ห้อง 06..10 - บันได ค ---
    for info in BUILDINGS:
        b = info["id"]
        for f in floors_of(b):
            ids = chain_ids(b, f)
            for i in range(len(ids) - 1):
                edges.append(edge(ids[i], ids[i + 1], SPACING, "corridor"))

    # --- บันได: เชื่อมชั้นต่อชั้น แยกทิศขึ้น/ลง เพราะใช้เวลาต่างกัน ---
    for info in BUILDINGS:
        b = info["id"]
        floors = floors_of(b)
        for code, _thai, _slot, _where in STAIRS:
            for f in floors[:-1]:
                low = stair_id(b, f, code)
                high = stair_id(b, f + 1, code)
                edges.append(edge(low, high, STAIR_DISTANCE, "stairs_up",
                                  time=STAIR_TIME_UP, bidirectional=False))
                edges.append(edge(high, low, STAIR_DISTANCE, "stairs_down",
                                  time=STAIR_TIME_DOWN, bidirectional=False))

    # --- ทางเชื่อมระหว่างอาคาร ---
    for a, b, floor, spec_a, spec_b in BRIDGES:
        node_id = bridge_id(a, b, floor)
        id_a, x_a, y_a, _na = endpoint(a, floor, spec_a)
        id_b, x_b, y_b, _nb = endpoint(b, floor, spec_b)
        half = math.hypot(x_b - x_a, y_b - y_a) / 2
        edges.append(edge(id_a, node_id, half, "bridge"))
        edges.append(edge(node_id, id_b, half, "bridge"))

    return edges


# ------------------------------------------------------------------
# ข้อมูลอาคาร (ใช้เป็นชื่อ/สีของกลุ่มโหนดในภาพ 3 มิติ)
# ------------------------------------------------------------------
def build_buildings():
    out = []
    for info in BUILDINGS:
        b = info["id"]
        y = wing_y(b)
        x0 = info["x0"]
        out.append({
            "id": "b%d" % b,
            "name": "อาคาร %d" % b,
            "shortName": "อ.%d" % b,
            "code": str(b),
            "floors": floors_of(b),
            "color": info["color"],
            "rect": [x0 - 2.0, y - 3.0, x0 + SPAN + 2.0, y + 3.0],
            "axis": "x",
            "zone": info["zone"],
            "description": "อาคาร %d (โซน%s) - %d ชั้น ชั้นละ %d ห้อง บันได %d ตำแหน่งต่อชั้น"
                           % (b, info["zone"], info["floors"], ROOMS, len(STAIRS)),
            "photo": "",
        })
    return out


def write(name, payload):
    path = os.path.join(DATA, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("เขียน %s แล้ว" % path)


def main():
    if not os.path.isdir(DATA):
        os.makedirs(DATA)

    nodes = build_nodes()
    edges = build_edges()
    buildings = build_buildings()

    max_x = max(b["x0"] for b in BUILDINGS) + SPAN
    max_y = max(b["y"] for b in BUILDINGS)
    floor_list = sorted({f for b in BUILDINGS for f in floors_of(b["id"])})

    write("buildings.json", {
        "meta": {
            "school": "ผังจำลองอาคารเรียน 7 อาคาร",
            "unit": "meter",
            "note": "ผังจำลองตามโครงสร้างที่กำหนด: 7 อาคาร แบ่งเป็นสองโซน "
                    "อาคารละ 4-5 ชั้น ชั้นละ 10 ห้อง บันได 3 ตำแหน่งต่อชั้น "
                    "และทางเชื่อมระหว่างอาคาร %d จุด" % len(BRIDGES),
            "floorHeight": FLOOR_HEIGHT,
            "floors": floor_list,
            "extent": [-6.0, -6.0, max_x + 6.0, max_y + 6.0],
        },
        "buildings": buildings,
        "areas": [],
    })
    write("nodes.json", {"version": "2.0", "nodes": nodes})
    write("edges.json", {"version": "2.0", "edges": edges})

    total_floors = sum(b["floors"] for b in BUILDINGS)
    print("รวม %d โหนด (%d ห้อง + %d บันได + %d ทางเชื่อม) และ %d เส้นเชื่อม" % (
        len(nodes),
        total_floors * ROOMS,
        total_floors * len(STAIRS),
        len(BRIDGES),
        len(edges),
    ))
    print("อาคาร %d หลัง รวม %d ชั้น (สูงสุด %d ชั้น)" % (
        len(BUILDINGS), total_floors, max(b["floors"] for b in BUILDINGS)))


if __name__ == "__main__":
    main()
