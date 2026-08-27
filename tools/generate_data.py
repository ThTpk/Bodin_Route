# -*- coding: utf-8 -*-
"""
generate_data.py
------------------------------------------------------------------
สร้างชุดข้อมูลกราฟ (nodes / edges / buildings) ตามโครงสร้างอาคารที่กำหนด

    python tools/generate_data.py

โครงสร้างที่สร้าง
  - อาคาร 3 หลัง : อาคาร 1, 2, 3
  - อาคารละ 3 ชั้น ชั้นละ 10 ห้อง
  - บันไดของแต่ละอาคาร 3 ตำแหน่ง
        ก = ก่อนห้อง 01
        ข = ระหว่างห้อง 05 กับ 06
        ค = หลังห้อง 10
    สร้างเป็นโหนดแยกทุกชั้น แล้วเชื่อมชั้นต่อชั้นด้วยเส้นเชื่อมชนิดบันได
  - ทางเชื่อมระหว่างอาคาร 1-2 และ 2-3 ที่ชั้น 2
    เชื่อมบริเวณห้อง 10 ของอาคารหนึ่งกับห้อง 01 ของอีกอาคาร
    สร้างเป็นโหนดชนิด bridge อยู่กึ่งกลางระหว่างสองอาคาร

ผังพิกัด (หน่วยเมตร เป็นผังจำลองตามสัดส่วน ไม่ใช่แบบแปลนจริง)
  - แต่ละอาคารเป็นทางเดินยาวตามแนวแกน X มีโหนดเรียงเป็นสาย
        [บันได ก] 01 02 03 04 05 [บันได ข] 06 07 08 09 10 [บันได ค]
  - อาคารวางขนานกันตามแนวแกน Y ห่างกัน 26 เมตร
    อาคาร 2 เรียงเลขห้องกลับทิศ เพื่อให้ห้อง 10 ของอาคารก่อนหน้า
    อยู่ตรงข้ามกับห้อง 01 ของอาคารถัดไปพอดี ทางเชื่อมจึงเป็นเส้นสั้น ๆ
  - แกน Z (ความสูง) คำนวณจากชั้นตอนวาดภาพ 3 มิติ ไม่ได้เก็บในไฟล์
------------------------------------------------------------------
รันสคริปต์นี้ใหม่ได้ทุกเมื่อ ไฟล์ใน data/ จะถูกเขียนทับทั้งหมด
"""

import json
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
BUILDINGS = [1, 2, 3]
FLOORS = [1, 2, 3]
ROOMS = 10

SPACING = 4.0          # ระยะห่างระหว่างจุดบนทางเดิน (เมตร)
WING_GAP = 26.0        # ระยะห่างระหว่างอาคาร (เมตร)
FLOOR_HEIGHT = 4.0     # ความสูงต่อชั้น (เมตร)
WALK_SPEED = 1.3       # ความเร็วเดินเฉลี่ย (เมตร/วินาที)

STAIR_DISTANCE = 7.5   # ระยะเดินจริงของบันไดหนึ่งช่วงชั้น (เมตร)
STAIR_TIME_UP = 20     # วินาที
STAIR_TIME_DOWN = 15   # วินาที

BRIDGE_FLOOR = 2       # ทางเชื่อมระหว่างอาคารอยู่ชั้น 2

# บันไดสามตำแหน่ง: (รหัส, ชื่อไทย, ตำแหน่งในสาย, คำอธิบาย)
STAIRS = [
    ("A", "ก", 0, "ก่อนห้อง 01"),
    ("B", "ข", 6, "ระหว่างห้อง 05 กับห้อง 06"),
    ("C", "ค", 12, "หลังห้อง 10"),
]

# ตำแหน่งของห้องแต่ละเลขในสายทางเดิน (ช่อง 0-12 รวมบันไดสามจุด)
ROOM_SLOT = {r: (r if r <= 5 else r + 1) for r in range(1, ROOMS + 1)}

BUILDING_COLOR = {1: "#2563eb", 2: "#7c3aed", 3: "#0d9488"}

SOURCE = "สร้างจาก tools/generate_data.py ตามโครงสร้างอาคารที่กำหนด"


def wing_y(building):
    """พิกัด Y ของแนวทางเดินของอาคาร"""
    return (building - 1) * WING_GAP


def slot_x(building, slot):
    """พิกัด X ของช่องที่ slot ในอาคาร (อาคารเลขคู่เรียงกลับทิศ)"""
    span = 12 * SPACING
    x = slot * SPACING
    return span - x if building % 2 == 0 else x


def room_code(building, floor, room):
    """รหัสห้องแบบ [อาคาร][ชั้น][เลขห้อง] เช่น 1101 = อาคาร 1 ชั้น 1 ห้อง 01"""
    return "%d%d%02d" % (building, floor, room)


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
    for b in BUILDINGS:
        y = wing_y(b)
        for f in FLOORS:
            # --- บันไดสามตำแหน่งของชั้นนี้ ---
            for code, thai, slot, where in STAIRS:
                nodes.append(node(
                    id="b%d-f%d-st%s" % (b, f, code),
                    name="บันได %d%s ชั้น %d" % (b, thai, f),
                    type="stairs",
                    building="b%d" % b,
                    floor=f,
                    x=slot_x(b, slot),
                    y=y,
                    description="บันไดอาคาร %d ตำแหน่ง%s เชื่อมชั้น %d ถึงชั้น %d"
                                % (b, where, FLOORS[0], FLOORS[-1]),
                    aliases=["บันได%d%s" % (b, thai), "st%s%d" % (code, b)],
                ))
            # --- ห้องเรียน 10 ห้องของชั้นนี้ ---
            for r in range(1, ROOMS + 1):
                code = room_code(b, f, r)
                nodes.append(node(
                    id="b%d-f%d-r%02d" % (b, f, r),
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
    for a, b in [(1, 2), (2, 3)]:
        x_a = slot_x(a, ROOM_SLOT[ROOMS])   # ตำแหน่งห้อง 10 ของอาคารแรก
        x_b = slot_x(b, ROOM_SLOT[1])       # ตำแหน่งห้อง 01 ของอาคารถัดไป
        nodes.append(node(
            id="br-b%db%d-f%d" % (a, b, BRIDGE_FLOOR),
            name="ทางเชื่อมอาคาร %d-%d (ชั้น %d)" % (a, b, BRIDGE_FLOOR),
            type="bridge",
            building=None,
            floor=BRIDGE_FLOOR,
            x=(x_a + x_b) / 2,
            y=(wing_y(a) + wing_y(b)) / 2,
            description="ทางเดินเชื่อมชั้น %d ระหว่างห้อง %s กับห้อง %s"
                        % (BRIDGE_FLOOR,
                           room_code(a, BRIDGE_FLOOR, ROOMS),
                           room_code(b, BRIDGE_FLOOR, 1)),
            aliases=["ทางเชื่อม%d%d" % (a, b), "สะพาน%d-%d" % (a, b)],
        ))
    return nodes


# ------------------------------------------------------------------
# สร้างเส้นเชื่อม
# ------------------------------------------------------------------
def chain_ids(b, f):
    """ไอดีของโหนดบนทางเดินชั้น f ของอาคาร b เรียงตามตำแหน่งจริง"""
    ids = [None] * 13
    for code, _thai, slot, _where in STAIRS:
        ids[slot] = "b%d-f%d-st%s" % (b, f, code)
    for r in range(1, ROOMS + 1):
        ids[ROOM_SLOT[r]] = "b%d-f%d-r%02d" % (b, f, r)
    return ids


def build_edges():
    edges = []

    # --- ทางเดินในแต่ละชั้น: บันได ก - ห้อง 01..05 - บันได ข - ห้อง 06..10 - บันได ค ---
    for b in BUILDINGS:
        for f in FLOORS:
            ids = chain_ids(b, f)
            for i in range(len(ids) - 1):
                edges.append(edge(ids[i], ids[i + 1], SPACING, "corridor"))

    # --- บันได: เชื่อมชั้นต่อชั้น แยกทิศขึ้น/ลง เพราะใช้เวลาต่างกัน ---
    for b in BUILDINGS:
        for code, _thai, _slot, _where in STAIRS:
            for f in FLOORS[:-1]:
                low = "b%d-f%d-st%s" % (b, f, code)
                high = "b%d-f%d-st%s" % (b, f + 1, code)
                edges.append(edge(low, high, STAIR_DISTANCE, "stairs_up",
                                  time=STAIR_TIME_UP, bidirectional=False))
                edges.append(edge(high, low, STAIR_DISTANCE, "stairs_down",
                                  time=STAIR_TIME_DOWN, bidirectional=False))

    # --- ทางเชื่อมระหว่างอาคารที่ชั้น 2 ---
    for a, b in [(1, 2), (2, 3)]:
        bridge = "br-b%db%d-f%d" % (a, b, BRIDGE_FLOOR)
        end_a = "b%d-f%d-r%02d" % (a, BRIDGE_FLOOR, ROOMS)   # ห้อง 10 ของอาคารแรก
        end_b = "b%d-f%d-r%02d" % (b, BRIDGE_FLOOR, 1)       # ห้อง 01 ของอาคารถัดไป
        half = WING_GAP / 2
        edges.append(edge(end_a, bridge, half, "bridge"))
        edges.append(edge(bridge, end_b, half, "bridge"))

    return edges


# ------------------------------------------------------------------
# ข้อมูลอาคาร (ใช้เป็นชื่อ/สีของกลุ่มโหนดในภาพ 3 มิติ)
# ------------------------------------------------------------------
def build_buildings():
    span = 12 * SPACING
    out = []
    for b in BUILDINGS:
        y = wing_y(b)
        out.append({
            "id": "b%d" % b,
            "name": "อาคาร %d" % b,
            "shortName": "อ.%d" % b,
            "code": str(b),
            "floors": list(FLOORS),
            "color": BUILDING_COLOR[b],
            "rect": [-2.0, y - 3.0, span + 2.0, y + 3.0],
            "axis": "x",
            "description": "อาคาร %d - %d ชั้น ชั้นละ %d ห้อง บันได %d ตำแหน่งต่อชั้น"
                           % (b, len(FLOORS), ROOMS, len(STAIRS)),
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
    span = 12 * SPACING

    write("buildings.json", {
        "meta": {
            "school": "ผังจำลองอาคารเรียน 3 อาคาร",
            "unit": "meter",
            "note": "ผังจำลองตามโครงสร้างที่กำหนด: 3 อาคาร อาคารละ 3 ชั้น "
                    "ชั้นละ 10 ห้อง บันได 3 ตำแหน่งต่อชั้น "
                    "และทางเชื่อมระหว่างอาคารที่ชั้น 2",
            "floorHeight": FLOOR_HEIGHT,
            "extent": [-6.0, -6.0, span + 6.0, wing_y(BUILDINGS[-1]) + 6.0],
        },
        "buildings": buildings,
        "areas": [],
    })
    write("nodes.json", {"version": "2.0", "nodes": nodes})
    write("edges.json", {"version": "2.0", "edges": edges})

    print("รวม %d โหนด (%d ห้อง + %d บันได + %d ทางเชื่อม) และ %d เส้นเชื่อม" % (
        len(nodes),
        len(BUILDINGS) * len(FLOORS) * ROOMS,
        len(BUILDINGS) * len(FLOORS) * len(STAIRS),
        2,
        len(edges),
    ))


if __name__ == "__main__":
    main()
