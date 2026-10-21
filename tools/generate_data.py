# -*- coding: utf-8 -*-
"""
generate_data.py
------------------------------------------------------------------
สร้างชุดข้อมูลกราฟ (nodes / edges / buildings) ของโรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)
โดยใช้รูปทรงอาคารจริงจากผัง 3 มิติ https://github.com/ThTpk/3D_Map

    node   tools/extract_3dmap.js     # แปลง buildings.js -> ref_data/3d_map_buildings.json
    python tools/generate_data.py     # สร้างไฟล์ใน data/

ที่มาของสัดส่วน
  ref_data/3d_map_buildings.json เก็บรูปทรงอาคารทุกหลัง (หลายปีกต่อหลัง)
  เป็นพิกัดเมตร x = ทิศตะวันออก, y = ทิศเหนือ พร้อมความสูงจริงและจำนวนชั้น
  สคริปต์นี้อ่านไฟล์นั้นแล้ว
    - หาแนวแกนยาวของปีกอาคาร ใช้เป็นแนวทางเดินของชั้น
    - วางโหนดทางเดินไว้ฝั่งหนึ่งของความกว้างอาคาร และวางห้องเรียนอีกฝั่งหนึ่ง
      (อาคารเรียนไทยส่วนใหญ่เป็นทางเดินเดี่ยว ห้องเรียนอยู่ด้านเดียว)
    - ความสูงของโหนดคิดจากชั้นจริง ชั้นละ floorHeight เมตร

โครงสร้างกราฟ
  อาคารเรียน (มีห้องเรียนและบันได)
        ตึก 1, 2, 3        4 ชั้น  แนวตะวันตก-ตะวันออก ยาว 105-106 ม. กว้าง 13 ม.
        ตึก 4              4 ชั้น  ยาว 67 ม.
        ตึก 5              4 ชั้น  แนวเหนือ-ใต้ ยาว 144 ม. ตึก 1-3 ต่อเข้าอาคารนี้
        อาคารเชื่อม         4 ชั้น  สามปีกต่อกันเป็นแนวเหนือ-ใต้ ยาวรวม 101 ม.
        ตึก 7              4 ชั้น  อยู่ด้านใต้ แยกจากกลุ่มตึก 1-5
        อาคารเฉลิมพระเกียรติ 2 ชั้น  ชั้นล่างเป็นหอสมุดคุณหญิงนครราชเสนี
  ทางเดินเชื่อม (ไม่มีห้อง)
        ทางเดินเชื่อม 2 ช่วง (ตึก 1-2 และ ตึก 2-3) มีเฉพาะชั้น 3-4
        ทางเดินซุ้มโค้ง เชื่อมอาคารบดินทรพิพัฒน์กับตึก 1 ชั้น 1-3
  สถานที่อื่น หอประชุม อาคารกีฬา สระว่ายน้ำ สนามกีฬา อัฒจันทร์ เรือนไทย ฯลฯ
  ทางเดินกลางแจ้ง ลานหน้าอาคารที่ระดับชั้น 1 เชื่อมทุกโซนเข้าด้วยกัน

บันไดอยู่ "ด้านข้างอาคาร" คือหัวและท้ายของแนวทางเดิน (ค่า STAIR_T)

** จำนวนห้องต่อชั้นในตาราง WINGS เป็นค่าตั้งต้น (ประมาณจากความยาวอาคาร) **
** ยังไม่ใช่ผังห้องจริง ให้แก้คีย์ "rooms" ของอาคารนั้นแล้วรันสคริปต์นี้ใหม่  **
------------------------------------------------------------------
รันสคริปต์นี้ใหม่ได้ทุกเมื่อ ไฟล์ใน data/ จะถูกเขียนทับทั้งหมด
"""

import json
import math
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
REF = os.path.join(ROOT, "ref_data", "3d_map_buildings.json")

SOURCE = "รูปทรงอาคารจาก https://github.com/ThTpk/3D_Map สร้างกราฟด้วย tools/generate_data.py"

# ------------------------------------------------------------------
# ค่าคงที่ของกราฟ
# ------------------------------------------------------------------
WALK_SPEED = 1.3          # ความเร็วเดินในอาคาร (เมตร/วินาที)
OUTDOOR_SPEED = 1.4       # ความเร็วเดินกลางแจ้ง (เมตร/วินาที)

STAIR_TIME_UP = 19        # วินาทีต่อหนึ่งช่วงชั้น
STAIR_TIME_DOWN = 14

STAIR_T = (0.0, 1.0)      # บันไดมาตรฐาน: หัวและท้ายอาคาร (ด้านข้างอาคาร)
ENTRANCE_OFFSET = 6.0     # ระยะที่โหนดทางเข้ายื่นออกจากตัวอาคาร (เมตร)
MIN_EDGE = 1.0            # ความยาวเส้นเชื่อมต่ำสุด กันเส้นยาวศูนย์เมตร
JUNCTION_MARGIN = 0.03    # ทางแยกที่ปลายอาคาร ดึงเข้ามาจากผนังหัว-ท้ายเล็กน้อย
STAIR_MARGIN = 0.025      # บันไดด้านข้าง อยู่ในช่วงปลายอาคาร ไม่ใช่บนผนัง
ROOM_MARGIN = 0.04        # ห้องแรก/ห้องสุดท้ายไม่ชิดผนังหัว-ท้ายอาคาร (ปรับรายอาคารได้ที่คีย์ roomMargin)

# ตำแหน่งตามความกว้างอาคาร คิดเป็นสัดส่วนของความกว้าง (0 = กลางอาคาร)
CORRIDOR_SHIFT = -0.20    # แนวทางเดิน
ROOM_SHIFT = 0.24         # แนวห้องเรียน


# ------------------------------------------------------------------
# ตารางอาคาร
#   src    : (รหัสอาคารใน 3D_Map, ดัชนีปีก) หรือ (รหัส, [ปีก, ปีก, ...])
#   rooms  : จำนวนห้องต่อชั้น (ค่าตั้งต้น) ใส่เป็น int หรือ dict ชั้น -> จำนวน
#   ends   : ชื่อเรียกปลายทั้งสองข้าง ใช้ตั้งชื่อบันได/ทางเข้า และกำหนดทิศของแนวแกน
#   stairs : ตำแหน่งบันไดตามแนวทางเดิน 0.0 = หัว, 1.0 = ท้าย (ค่าปริยาย STAIR_T)
# ------------------------------------------------------------------
WINGS = [
    {
        "id": "chalerm", "src": ("chalerm", 0), "code": "8",
        "short": "อ.เฉลิมฯ", "zone": "โซนเหนือ", "color": "#c026d3",
        "floors": [1, 2], "rooms": {1: 2, 2: 5},
        "ends": ("ตะวันตก", "ตะวันออก"),
        "extras": [
            {"suffix": "library", "name": "หอสมุดคุณหญิงนครราชเสนี", "type": "library",
             "floor": 1, "t": 0.55, "aliases": ["หอสมุด", "ห้องสมุด"]},
        ],
    },
    {
        "id": "b1", "src": ("b1", 0), "code": "1",
        "short": "ต.1", "zone": "กลุ่มอาคารเรียน", "color": "#2563eb",
        "floors": [1, 2, 3, 4], "rooms": {1: 9, 2: 9, 3: 12, 4: 12},
        "ends": ("ตะวันตก", "ตะวันออก"),
    },
    {
        "id": "b2", "src": ("b2", 0), "code": "2",
        "short": "ต.2", "zone": "กลุ่มอาคารเรียน", "color": "#7c3aed",
        "floors": [1, 2, 3, 4], "rooms": {1: 9, 2: 9, 3: 12, 4: 12},
        "ends": ("ตะวันตก", "ตะวันออก"),
    },
    {
        "id": "b3", "src": ("b3", 0), "code": "3",
        "short": "ต.3", "zone": "กลุ่มอาคารเรียน", "color": "#0d9488",
        "floors": [1, 2, 3, 4], "rooms": {1: 9, 2: 9, 3: 12, 4: 12},
        "ends": ("ตะวันตก", "ตะวันออก"),
    },
    {
        "id": "b4", "src": ("b4", 0), "code": "4",
        "short": "ต.4", "zone": "กลุ่มอาคารเรียน", "color": "#db2777",
        "floors": [1, 2, 3, 4], "rooms": 8,
        "ends": ("ตะวันตก", "ตะวันออก"),
    },
    {
        "id": "b5", "src": ("b5", 0), "code": "5",
        "short": "ต.5", "zone": "กลุ่มอาคารเรียน (แนวตะวันออก)", "color": "#0ea5e9",
        "floors": [1, 2, 3, 4], "rooms": 16,
        "ends": ("เหนือ", "ใต้"),
    },
    {
        "id": "link", "src": ("link", [0, 1, 2]), "code": "6",
        "short": "อ.เชื่อม", "zone": "กลุ่มอาคารเรียน (แนวกลาง)", "color": "#16a34a",
        "floors": [1, 2, 3, 4], "rooms": 10,
        "ends": ("เหนือ", "ใต้"),
    },
    {
        "id": "b7", "src": ("b7", 0), "code": "7",
        "short": "ต.7", "zone": "โซนใต้", "color": "#84cc16",
        "floors": [1, 2, 3, 4], "rooms": 6, "roomMargin": 0.12,
        "ends": ("ตะวันตก", "ตะวันออก"),
    },
    {
        "id": "wk1", "src": ("walkway", 0), "code": "",
        "name": "ทางเดินเชื่อม ตึก 1-2", "short": "ทช.1-2",
        "zone": "ทางเดินเชื่อม", "color": "#94a3b8",
        "floors": [3, 4], "rooms": 0, "stairs": (),
        "corridorType": "bridge",
        "ends": ("เหนือ", "ใต้"),
    },
    {
        "id": "wk2", "src": ("walkway", 1), "code": "",
        "name": "ทางเดินเชื่อม ตึก 2-3", "short": "ทช.2-3",
        "zone": "ทางเดินเชื่อม", "color": "#94a3b8",
        "floors": [3, 4], "rooms": 0, "stairs": (),
        "corridorType": "bridge",
        "ends": ("เหนือ", "ใต้"),
    },
    {
        "id": "arcade", "src": ("arcade", 0), "code": "",
        "short": "ซุ้มโค้ง", "zone": "ทางเดินเชื่อม", "color": "#64748b",
        "floors": [1, 2, 3], "rooms": 0, "stairs": (1.0,),
        "corridorType": "bridge",
        "ends": ("ใต้", "เหนือ"),
    },
]

WING_BY_ID = {w["id"]: w for w in WINGS}

# ------------------------------------------------------------------
# คู่อาคารที่แนวทางเดินบรรจบกัน -> โหนดชนิด junction หนึ่งตัวต่อคู่ต่อชั้น
# ------------------------------------------------------------------
JUNCTIONS = [
    ("b1", "link"), ("b2", "link"), ("b3", "link"), ("b4", "link"),
    ("b1", "b5"), ("b2", "b5"), ("b3", "b5"),
    ("b1", "wk1"), ("b2", "wk1"),
    ("b2", "wk2"), ("b3", "wk2"),
    ("b1", "arcade"),
]

# ------------------------------------------------------------------
# สถานที่อื่นที่เป็นโหนดเดียวที่ชั้น 1 (รหัสตรงกับใน 3D_Map)
#   (รหัส, ชนิดโหนด, สี, คำอธิบายเพิ่ม)
# ------------------------------------------------------------------
PLACES = [
    ("bodinpipat", "meeting",  "#8b5cf6", "หอประชุมของโรงเรียน เดินเข้าได้ทางทางเดินซุ้มโค้งจากตึก 1"),
    ("hall",       "sport",    "#14b8a6", "อาคารกีฬาในร่ม อยู่ระหว่างตึก 4 กับตึก 5"),
    ("sport",      "sport",    "#14b8a6", "อาคารศูนย์กีฬา อยู่ด้านใต้ของกลุ่มอาคารเรียน"),
    ("pool",       "sport",    "#0ea5e9", "สระว่ายน้ำมีหลังคาคลุม อยู่ด้านตะวันตกของตึก 7"),
    ("blue",       "landmark", "#1d4ed8", "อาคารหลังคาสีน้ำเงิน อยู่ระหว่างตึก 4 กับตึก 7"),
    ("field",      "sport",    "#22c55e", "สนามฟุตบอลพร้อมลู่วิ่ง อยู่ด้านเหนือของอาคารเฉลิมพระเกียรติ"),
    ("stand",      "landmark", "#a3a3a3", "อัฒจันทร์ริมสนามกีฬาด้านตะวันออก"),
    ("house",      "landmark", "#92400e", "เรือนไทยไม้สัก อาคารอนุรักษ์ด้านเหนือสุดของโรงเรียน"),
]

# ------------------------------------------------------------------
# ลาน / ทางเดินกลางแจ้ง (ชั้น 1) — พิกัดเมตร ประมาณจากภาพดาวเทียม
# ------------------------------------------------------------------
PLAZAS = [
    ("pz-house",   "ลานหน้าเรือนไทย",                  -4.0,  332.0),
    ("pz-field-n", "ลานสนามกีฬาด้านเหนือ",             -22.0,  282.0),
    ("pz-field-s", "ลานสนามกีฬาด้านใต้",               -22.0,  182.0),
    ("pz-chalerm", "ลานหน้าอาคารเฉลิมพระเกียรติ",      -24.0,  134.0),
    ("pz-bodin",   "ลานหน้าอาคารบดินทรพิพัฒน์",        -22.0,   96.0),
    ("pz-b5n",     "ลานหน้าตึก 5 ด้านเหนือ",            50.0,   92.0),
    ("pz-b1",      "ลานหน้าตึก 1",                     -70.0,   48.0),
    ("pz-b2",      "ลานหน้าตึก 2",                     -63.0,   12.0),
    ("pz-b3",      "ลานหน้าตึก 3",                     -56.0,  -23.0),
    ("pz-b4",      "ลานหน้าตึก 4",                     -50.0,  -60.0),
    ("pz-c12",     "ลานกลางระหว่างตึก 1 กับตึก 2",       28.0,   45.0),
    ("pz-c23",     "ลานกลางระหว่างตึก 2 กับตึก 3",       32.0,    9.0),
    ("pz-c34",     "ลานกลางระหว่างตึก 3 กับตึก 4",       25.0,  -30.0),
    ("pz-blue",    "ลานหน้าอาคารหลังคาสีน้ำเงิน",        -2.0,  -70.0),
    ("pz-sport",   "ลานหน้าอาคารกีฬา",                  44.0,  -76.0),
    ("pz-b7",      "ลานหน้าตึก 7",                      -8.0, -110.0),
    ("pz-pool",    "ลานหน้าสระว่ายน้ำ",                 -30.0, -116.0),
]

ENTRANCES = [
    ("ent-chalerm", "chalerm", 0.0),
    ("ent-b1",      "b1",      0.0),
    ("ent-b2",      "b2",      0.0),
    ("ent-b3",      "b3",      0.0),
    ("ent-b4",      "b4",      0.0),
    ("ent-b5n",     "b5",      0.0),
    ("ent-b5s",     "b5",      1.0),
    ("ent-b7w",     "b7",      0.0),
    ("ent-b7e",     "b7",      1.0),
    ("ent-arcade",  "arcade",  1.0),
]

OUTDOOR = [
    ("pz-b1", "pz-b2"), ("pz-b2", "pz-b3"), ("pz-b3", "pz-b4"),
    ("pz-b1", "ent-b1"), ("pz-b2", "ent-b2"), ("pz-b3", "ent-b3"), ("pz-b4", "ent-b4"),
    ("pz-b1", "pz-bodin"),
    ("pz-bodin", "poi-bodinpipat"), ("pz-bodin", "pz-chalerm"), ("pz-bodin", "pz-b5n"),
    ("pz-b5n", "ent-b5n"),
    ("pz-chalerm", "ent-chalerm"), ("pz-chalerm", "pz-field-s"),
    ("pz-field-s", "poi-field"), ("pz-field-s", "poi-stand"), ("pz-field-s", "pz-field-n"),
    ("pz-field-n", "poi-field"), ("pz-field-n", "pz-house"),
    ("pz-house", "poi-house"),
    ("pz-b4", "pz-blue"), ("pz-blue", "poi-blue"), ("pz-blue", "pz-b7"), ("pz-blue", "pz-sport"),
    ("pz-sport", "poi-sport"), ("pz-sport", "poi-hall"), ("pz-sport", "ent-b5s"),
    ("pz-sport", "pz-c34"), ("pz-c34", "poi-hall"),
    ("pz-b7", "ent-b7w"), ("pz-b7", "ent-b7e"), ("pz-b7", "pz-pool"), ("pz-pool", "poi-pool"),
    ("pz-c12", "pz-c23"), ("pz-c23", "pz-c34"),
    ("pz-c12", ("jn", "b1", "link", 1)), ("pz-c12", ("jn", "b2", "link", 1)),
    ("pz-c12", ("jn", "b1", "b5", 1)),   ("pz-c12", ("jn", "b2", "b5", 1)),
    ("pz-c23", ("jn", "b2", "link", 1)), ("pz-c23", ("jn", "b3", "link", 1)),
    ("pz-c23", ("jn", "b2", "b5", 1)),   ("pz-c23", ("jn", "b3", "b5", 1)),
    ("pz-c34", ("jn", "b3", "link", 1)), ("pz-c34", ("jn", "b4", "link", 1)),
    ("ent-arcade", "poi-bodinpipat"),
]


# ==================================================================
# เรขาคณิต
# ==================================================================
def load_ref():
    if not os.path.isfile(REF):
        raise SystemExit("ไม่พบ %s — รัน  node tools/extract_3dmap.js  ก่อน" % REF)
    with open(REF, "r", encoding="utf-8") as f:
        ref = json.load(f)
    ref["byId"] = {b["id"]: b for b in ref["buildings"]}
    return ref


def oriented_axis(ring):
    """แนวแกนยาวของรูปหลายเหลี่ยม หาโดยลองหมุนตามทิศของทุกด้าน
    แล้วเลือกกรอบสี่เหลี่ยมที่มีพื้นที่น้อยที่สุด"""
    best = None
    n = len(ring)
    for i in range(n):
        ax, ay = ring[i]
        bx, by = ring[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        if length < 1e-6:
            continue
        ux, uy = dx / length, dy / length
        us = [p[0] * ux + p[1] * uy for p in ring]
        vs = [-p[0] * uy + p[1] * ux for p in ring]
        du, dv = max(us) - min(us), max(vs) - min(vs)
        area = du * dv
        if best is None or area < best[0]:
            best = (area, (ux, uy), min(us), max(us), min(vs), max(vs))

    _area, (ux, uy), u0, u1, v0, v1 = best
    if (u1 - u0) < (v1 - v0):                      # ให้แกน u เป็นด้านยาวเสมอ
        ux, uy = -uy, ux
        u0, u1, v0, v1 = v0, v1, -u1, -u0
    vm = (v0 + v1) / 2.0
    start = (ux * u0 - uy * vm, uy * u0 + ux * vm)
    end = (ux * u1 - uy * vm, uy * u1 + ux * vm)
    return {"from": [start[0], start[1]], "to": [end[0], end[1]],
            "length": u1 - u0, "width": v1 - v0}


def part_axis(part):
    if part.get("axis"):
        return part["axis"]
    return oriented_axis([tuple(p) for p in part["footprint"]])


def prepare_wings(ref):
    """เติมแนวทางเดิน ความกว้าง และช่วงที่ชั้นล่างเปิดโล่ง ให้อาคารทุกหลัง"""
    for w in WINGS:
        map_id, idx = w["src"]
        src = ref["byId"][map_id]
        idxs = idx if isinstance(idx, list) else [idx]
        parts = [src["parts"][i] for i in idxs]
        w["_parts"] = parts
        w["_src"] = src
        if "name" not in w:
            w["name"] = src["name"]
        if not w.get("kind"):
            w["kind"] = src.get("kind") or ""
        w["_desc"] = src.get("desc", "")
        w["_height"] = src.get("height") or (len(w["floors"]) * ref["floorHeight"])
        w["_modelFloors"] = src.get("floors") or len(w["floors"])

        axes = [part_axis(p) for p in parts]
        if len(axes) == 1:
            a, b = tuple(axes[0]["from"]), tuple(axes[0]["to"])
        else:
            # หลายปีกต่อกัน: เอาปลายคู่ที่ห่างกันที่สุด
            pts = [tuple(ax["from"]) for ax in axes] + [tuple(ax["to"]) for ax in axes]
            a, b = max(((p, q) for p in pts for q in pts),
                       key=lambda pq: math.dist(pq[0], pq[1]))
        width = sum(ax["width"] for ax in axes) / len(axes)

        # จัดทิศให้ตรงกับชื่อปลายที่ประกาศไว้
        flipped = False
        if w["ends"][0] in ("ตะวันตก",) and a[0] > b[0]:
            flipped = True
        elif w["ends"][0] in ("ตะวันออก",) and a[0] < b[0]:
            flipped = True
        elif w["ends"][0] in ("เหนือ",) and a[1] < b[1]:
            flipped = True
        elif w["ends"][0] in ("ใต้",) and a[1] > b[1]:
            flipped = True
        if flipped:
            a, b = b, a

        length = math.dist(a, b)
        w["_a"], w["_b"], w["_len"] = a, b, length
        w["_dir"] = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        w["_nrm"] = (-w["_dir"][1], w["_dir"][0])
        w["_w"] = width

        # ช่วงที่ชั้นล่างเปิดโล่งไม่มีห้อง (ระยะวัดจากปลาย footprint[0] ของปีกแรก)
        voids = []
        for v in parts[0].get("voids", []):
            lo, hi = v["from"] / length, v["to"] / length
            if flipped:
                lo, hi = 1.0 - hi, 1.0 - lo
            floors = [f for f in w["floors"] if f <= v.get("floors", 0)]
            if floors:
                voids.append({"floors": floors, "from": lo, "to": hi})
        w["_voids"] = voids


def point_at(w, t, shift=0.0):
    """พิกัดบนแนวอาคารที่ตำแหน่ง t และเยื้องออกข้างเป็นสัดส่วนของความกว้าง"""
    a, b = w["_a"], w["_b"]
    off = w["_w"] * shift
    return (a[0] + (b[0] - a[0]) * t + w["_nrm"][0] * off,
            a[1] + (b[1] - a[1]) * t + w["_nrm"][1] * off)


def intersect_t(w1, w2):
    (x1, y1), (x2, y2) = w1["_a"], w1["_b"]
    (x3, y3), (x4, y4) = w2["_a"], w2["_b"]
    r = (x2 - x1, y2 - y1)
    s = (x4 - x3, y4 - y3)
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        raise ValueError("แนวทางเดินของ %s กับ %s ขนานกัน" % (w1["id"], w2["id"]))
    t = ((x3 - x1) * s[1] - (y3 - y1) * s[0]) / den
    u = ((x3 - x1) * r[1] - (y3 - y1) * r[0]) / den
    return t, u


def rooms_on(w, floor):
    rooms = w.get("rooms", 0)
    return rooms.get(floor, 0) if isinstance(rooms, dict) else rooms


def room_positions(w, floor, n):
    """ตำแหน่ง t ของห้องทั้ง n ห้อง กระจายเท่ากันโดยเว้นช่วงที่เปิดโล่ง"""
    if n <= 0:
        return []
    margin = w.get("roomMargin", ROOM_MARGIN)
    blocked = sorted((v["from"], v["to"]) for v in w["_voids"] if floor in v["floors"])
    segments, cur = [], margin
    for lo, hi in blocked:
        if lo > cur:
            segments.append((cur, lo))
        cur = max(cur, hi)
    if cur < 1.0 - margin:
        segments.append((cur, 1.0 - margin))
    segments = [(max(lo, margin), min(hi, 1.0 - margin)) for lo, hi in segments]
    segments = [seg for seg in segments if seg[1] - seg[0] > 1e-6]
    total = sum(hi - lo for lo, hi in segments)

    out = []
    for i in range(n):
        target = total * (i + 0.5) / n
        acc = 0.0
        for lo, hi in segments:
            if acc + (hi - lo) >= target - 1e-9:
                out.append(lo + (target - acc))
                break
            acc += hi - lo
    return out


def stair_positions(w):
    return w["stairs"] if "stairs" in w else STAIR_T


def stair_label(w, t):
    return w["ends"][0] if t < 0.5 else w["ends"][1]


# ==================================================================
# ไอดีของโหนด
# ==================================================================
def room_id(w, f, i):    return "%s-f%d-r%02d" % (w["id"], f, i)
def access_id(w, f, i):  return "%s-f%d-c%02d" % (w["id"], f, i)
def stair_id(w, f, k):   return "%s-f%d-st%s" % (w["id"], f, "ABCDEF"[k])
def junction_id(a, b, f): return "jn-%s-%s-f%d" % (a, b, f)
def place_id(key):       return "poi-%s" % key


def room_code(w, f, i):
    return "%s%d%02d" % (w["code"], f, i) if w["code"] else "%s-%d-%02d" % (w["id"], f, i)


# ==================================================================
# ตัวช่วยสร้างโหนด / เส้นเชื่อม
# ==================================================================
def node(**kw):
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
    distance = max(MIN_EDGE, float(distance))
    speed = OUTDOOR_SPEED if etype == "outdoor" else WALK_SPEED
    return {
        "from": a, "to": b,
        "distance": round(distance, 2),
        "time": max(1, int(round(time if time is not None else distance / speed))),
        "type": etype,
        "bidirectional": bidirectional,
    }


def build_junctions():
    result = {}
    for a, b in JUNCTIONS:
        wa, wb = WING_BY_ID[a], WING_BY_ID[b]
        ta, tb = intersect_t(wa, wb)
        # ดึงเข้ามาจากปลายเล็กน้อย ให้โหนดทางแยกอยู่ในรูปอาคารจริง ไม่ใช่บนผนัง
        ta = min(max(ta, JUNCTION_MARGIN), 1.0 - JUNCTION_MARGIN)
        tb = min(max(tb, JUNCTION_MARGIN), 1.0 - JUNCTION_MARGIN)
        x, y = point_at(wa, ta)
        for f in sorted(set(wa["floors"]) & set(wb["floors"])):
            result[(a, b, f)] = {"id": junction_id(a, b, f), "t_a": ta, "t_b": tb, "x": x, "y": y}
    return result


def junctions_of(junctions, wing_id, floor):
    out = []
    for (a, b, f), j in junctions.items():
        if f != floor:
            continue
        if a == wing_id:
            out.append((j["t_a"], j["id"], b))
        elif b == wing_id:
            out.append((j["t_b"], j["id"], a))
    return out


# ==================================================================
# สร้างกราฟ
# ==================================================================
def build_graph(ref):
    junctions = build_junctions()
    nodes, edges, by_id = [], [], {}

    def add(n):
        nodes.append(n)
        by_id[n["id"]] = n
        return n

    # --- ทางแยกระหว่างอาคาร (โหนดเดียวใช้ร่วมกันสองแนว) ---
    for (a, b, f), j in sorted(junctions.items(), key=lambda kv: kv[0]):
        wa, wb = WING_BY_ID[a], WING_BY_ID[b]
        add(node(
            id=j["id"],
            name="ทางแยก%s × %s ชั้น %d" % (wa["name"], wb["name"], f),
            type="junction", building=a, floor=f, x=j["x"], y=j["y"],
            description="จุดที่แนวทางเดิน%sบรรจบกับ%s ที่ชั้น %d" % (wa["name"], wb["name"], f),
            aliases=["ทางแยก%s%s" % (wa["short"], wb["short"])],
        ))

    # --- แต่ละอาคาร แต่ละชั้น ---
    for w in WINGS:
        stub = w["_w"] * (ROOM_SHIFT - CORRIDOR_SHIFT)     # ระยะจากทางเดินเข้าห้อง
        for f in w["floors"]:
            chain = []

            for k, t in enumerate(stair_positions(w)):
                # ขยับเข้ามาจากผนังหัว-ท้ายเล็กน้อย ให้โหนดอยู่ในรูปอาคารจริง
                tt = min(max(t, STAIR_MARGIN), 1.0 - STAIR_MARGIN)
                x, y = point_at(w, tt, CORRIDOR_SHIFT)
                where = stair_label(w, t)
                sid = stair_id(w, f, k)
                add(node(
                    id=sid, name="บันได%s ฝั่ง%s ชั้น %d" % (w["name"], where, f),
                    type="stairs", building=w["id"], floor=f, x=x, y=y,
                    description="บันไดด้านข้าง%s ฝั่ง%s เชื่อมชั้น %d ถึงชั้น %d"
                                % (w["name"], where, w["floors"][0], w["floors"][-1]),
                    aliases=["บันได%s%s" % (w["short"], where), "st-%s-%s" % (w["id"], "ABCDEF"[k])],
                ))
                chain.append((t, sid))

            # ห้องเรียน: โหนดห้องอยู่ในแนวห้อง ต่อเข้าทางเดินด้วยเส้นเชื่อมสั้น ๆ
            count = rooms_on(w, f)
            for i, t in enumerate(room_positions(w, f, count), start=1):
                cx, cy = point_at(w, t, CORRIDOR_SHIFT)
                rx, ry = point_at(w, t, ROOM_SHIFT)
                cid, rid = access_id(w, f, i), room_id(w, f, i)
                code = room_code(w, f, i)
                add(node(
                    id=cid, name="ทางเดินหน้าห้อง %s" % code, type="corridor",
                    building=w["id"], floor=f, x=cx, y=cy,
                    description="จุดบนทางเดิน%s ชั้น %d หน้าห้อง %s" % (w["name"], f, code),
                ))
                add(node(
                    id=rid, name="ห้อง %s" % code, type="classroom",
                    building=w["id"], floor=f, x=rx, y=ry,
                    description="%s ชั้น %d ห้องที่ %d จาก %d (จำนวนห้องเป็นค่าตั้งต้น รอผังห้องจริง)"
                                % (w["name"], f, i, count),
                    aliases=[code, "%s/%d/%d" % (w["short"], f, i)],
                ))
                edges.append(edge(cid, rid, stub, "room"))
                chain.append((t, cid))

            for spec in w.get("extras", []):
                if spec["floor"] != f:
                    continue
                t = spec["t"]
                cx, cy = point_at(w, t, CORRIDOR_SHIFT)
                rx, ry = point_at(w, t, ROOM_SHIFT)
                cid = "%s-f%d-c-%s" % (w["id"], f, spec["suffix"])
                eid = "%s-f%d-%s" % (w["id"], f, spec["suffix"])
                add(node(id=cid, name="ทางเดินหน้า%s" % spec["name"], type="corridor",
                         building=w["id"], floor=f, x=cx, y=cy,
                         description="จุดบนทางเดิน%s ชั้น %d" % (w["name"], f)))
                add(node(id=eid, name=spec["name"], type=spec["type"],
                         building=w["id"], floor=f, x=rx, y=ry,
                         description=spec.get("desc", "%s ชั้น %d" % (w["name"], f)),
                         aliases=spec.get("aliases", [])))
                edges.append(edge(cid, eid, stub, "room"))
                chain.append((t, cid))

            for t, jid, _other in junctions_of(junctions, w["id"], f):
                chain.append((t, jid))

            # ร้อยทางเดินตามตำแหน่งจริง (ระยะคิดจากพิกัดของโหนดจริง)
            chain.sort(key=lambda item: item[0])
            ctype = w.get("corridorType", "corridor")
            for (_t1, id1), (_t2, id2) in zip(chain, chain[1:]):
                n1, n2 = by_id[id1], by_id[id2]
                edges.append(edge(id1, id2, math.dist((n1["x"], n1["y"]), (n2["x"], n2["y"])), ctype))

        # --- บันไดเชื่อมชั้นต่อชั้น ---
        rise = ref["floorHeight"]
        for k, _t in enumerate(stair_positions(w)):
            floors = w["floors"]
            for f1, f2 in zip(floors, floors[1:]):
                low, high = stair_id(w, f1, k), stair_id(w, f2, k)
                steps = f2 - f1
                run = round(math.hypot(rise, rise * 1.6) * steps, 2)   # ชันราว 1:1.6
                edges.append(edge(low, high, run, "stairs_up",
                                  time=STAIR_TIME_UP * steps, bidirectional=False))
                edges.append(edge(high, low, run, "stairs_down",
                                  time=STAIR_TIME_DOWN * steps, bidirectional=False))

    # --- สถานที่อื่น ---
    for key, ntype, _color, desc in PLACES:
        src = ref["byId"][key]
        x, y = src["center"]
        add(node(
            id=place_id(key), name=src["name"], type=ntype, building=key, floor=1,
            x=x, y=y, description=desc or src.get("desc", ""),
            aliases=[src["name"].replace("อาคาร", "").strip()],
        ))

    # --- ลาน / ทางเดินกลางแจ้ง ---
    for pid, name, x, y in PLAZAS:
        add(node(
            id=pid, name=name, type="plaza", building=None, floor=1, x=x, y=y,
            description="ลานและทางเดินกลางแจ้งที่ระดับพื้นดิน (ตำแหน่งประมาณจากภาพดาวเทียม)",
            aliases=[name.replace("ลาน", "").strip()],
        ))

    # --- ทางเข้าอาคาร ---
    for eid, wing_id, t in ENTRANCES:
        w = WING_BY_ID[wing_id]
        sign = -1.0 if t < 0.5 else 1.0
        bx, by = point_at(w, t, CORRIDOR_SHIFT)
        x = bx + w["_dir"][0] * ENTRANCE_OFFSET * sign
        y = by + w["_dir"][1] * ENTRANCE_OFFSET * sign
        where = stair_label(w, t)
        add(node(
            id=eid, name="ทางเข้า%s ฝั่ง%s" % (w["name"], where), type="entrance",
            building=wing_id, floor=1, x=x, y=y,
            description="ทางเข้า%s ด้าน%s ที่ระดับพื้นดิน" % (w["name"], where),
            aliases=["ทางเข้า%s" % w["short"]],
        ))
        inner = None
        for k, st in enumerate(stair_positions(w)):
            if abs(st - t) < 1e-6 and w["floors"][0] == 1:
                inner = stair_id(w, 1, k)
        if inner is None:
            cands = junctions_of(junctions, wing_id, 1)
            if cands:
                inner = min(cands, key=lambda c: abs(c[0] - t))[1]
        if inner is None:
            raise ValueError("ทางเข้า %s ไม่มีโหนดในอาคารให้เชื่อม" % eid)
        edges.append(edge(eid, inner, ENTRANCE_OFFSET, "entrance"))

    # --- เส้นเชื่อมกลางแจ้ง ---
    def resolve(ref_id):
        if isinstance(ref_id, tuple):
            _kind, a, b, f = ref_id
            return junctions[(a, b, f)]["id"]
        return ref_id

    for ref_a, ref_b in OUTDOOR:
        id_a, id_b = resolve(ref_a), resolve(ref_b)
        na, nb = by_id[id_a], by_id[id_b]
        edges.append(edge(id_a, id_b,
                          math.hypot(nb["x"] - na["x"], nb["y"] - na["y"]), "outdoor"))

    return nodes, edges


# ==================================================================
# ไฟล์อาคาร (รูปทรงจริงสำหรับวาดโมเดล 3 มิติ)
# ==================================================================
def bbox(polys):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    return [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)]


def build_buildings(ref):
    out = []
    for w in WINGS:
        polys = [p["footprint"] for p in w["_parts"]]
        out.append({
            "id": w["id"],
            "name": w["name"],
            "shortName": w["short"],
            "code": w["code"],
            "kind": w["kind"],
            "floors": list(w["floors"]),
            "modelFloors": w["_modelFloors"],
            "height": round(w["_height"], 2),
            "color": w["color"],
            "parts": polys,
            "rect": bbox(polys),
            "axis": "x" if abs(w["_dir"][0]) >= abs(w["_dir"][1]) else "y",
            "zone": w["zone"],
            "description": "%s · %d ชั้น · ยาว %d ม. กว้าง %.1f ม. · %s"
                           % (w["kind"], len(w["floors"]), round(w["_len"]), w["_w"], w["_desc"]),
            "photo": "",
            "source": w["_src"].get("source", ""),
        })

    for key, _ntype, color, desc in PLACES:
        src = ref["byId"][key]
        polys = [p["footprint"] for p in src["parts"]]
        if not polys:                                   # เช่น สนามกีฬา ที่ไม่มีรูปทรง
            cx, cy = src["center"]
            half = (src.get("size") or 40) / 2.0
            polys = [[[cx - half, cy - half], [cx + half, cy - half],
                      [cx + half, cy + half], [cx - half, cy + half]]]
        floors = src.get("floors") or 1
        out.append({
            "id": key,
            "name": src["name"],
            "shortName": src["name"],
            "code": "",
            "kind": src.get("kind", "สถานที่"),
            "floors": [1],
            "modelFloors": floors,
            "height": round(src.get("height") or 0.4, 2),
            "color": color,
            "parts": polys,
            "rect": bbox(polys),
            "axis": "x",
            "zone": "สถานที่อื่น",
            "description": desc or src.get("desc", ""),
            "photo": "",
            "source": src.get("source", ""),
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

    ref = load_ref()
    prepare_wings(ref)
    nodes, edges = build_graph(ref)
    buildings = build_buildings(ref)

    xs = [n["x"] for n in nodes] + [p[0] for b in buildings for poly in b["parts"] for p in poly]
    ys = [n["y"] for n in nodes] + [p[1] for b in buildings for poly in b["parts"] for p in poly]
    floor_list = sorted({n["floor"] for n in nodes if n["floor"]})

    write("buildings.json", {
        "meta": {
            "school": "โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)",
            "unit": "meter",
            "note": "รูปทรงและสัดส่วนอาคารจากผัง 3 มิติ https://github.com/ThTpk/3D_Map "
                    "โหนดห้องเรียนวางอยู่ในแนวห้องภายในอาคาร ทางเดินอยู่อีกฝั่งของความกว้าง "
                    "บันไดอยู่ด้านข้างอาคาร จำนวนห้องต่อชั้นยังเป็นค่าตั้งต้น รอปรับตามผังห้องจริง",
            "origin": ref["origin"],
            "floorHeight": ref["floorHeight"],
            "floors": floor_list,
            "extent": [round(min(xs) - 10, 1), round(min(ys) - 10, 1),
                       round(max(xs) + 10, 1), round(max(ys) + 10, 1)],
            "source": SOURCE,
        },
        "buildings": buildings,
        "areas": [],
    })
    write("nodes.json", {"version": "3.1", "nodes": nodes})
    write("edges.json", {"version": "3.1", "edges": edges})

    counts = {}
    for n in nodes:
        counts[n["type"]] = counts.get(n["type"], 0) + 1
    print("รวม %d โหนด และ %d เส้นเชื่อม" % (len(nodes), len(edges)))
    for t, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print("    %-12s %d" % (t, c))
    print("")
    for w in WINGS:
        print("    %-9s %-22s %d ชั้น  ยาว %6.1f ม.  กว้าง %4.1f ม.  สูง %5.1f ม.  ห้อง/ชั้น %s"
              % (w["id"], w["name"], len(w["floors"]), w["_len"], w["_w"], w["_height"],
                 ", ".join("ช%d=%d" % (f, rooms_on(w, f)) for f in w["floors"])))


if __name__ == "__main__":
    main()
