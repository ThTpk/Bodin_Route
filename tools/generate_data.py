# -*- coding: utf-8 -*-
"""
generate_data.py
------------------------------------------------------------------
สร้างชุดข้อมูลกราฟ (nodes / edges / buildings) ของโรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)
ให้สอดคล้องกับผัง 3 มิติที่ https://thtpk.github.io/3D_Map/

    python tools/generate_data.py

ที่มาของผัง
  ตารางอาคารด้านล่างถอดมาจาก buildings.js ของเว็บ 3D Map โดยตรง
  โดยคิดเป็น "แนวทางเดินกลางอาคาร" (centerline) = จุดกึ่งกลางผนังหัวท้ายของอาคาร
  แล้วแปลงพิกัดภูมิศาสตร์ (lon/lat) เป็นพิกัดเมตรในระนาบ โดย
        x = ทิศตะวันออก (เมตร)   y = ทิศเหนือ (เมตร)
  จุดกำเนิด (0, 0) อยู่กลางกลุ่มอาคารเรียน ดูค่า LON0 / LAT0

โครงสร้างที่สร้าง
  อาคารเรียน (มีห้องเรียนและบันได)
        ตึก 1, 2, 3        4 ชั้น  ทอดตามแนวตะวันตก-ตะวันออก ยาวราว 105 ม.
        ตึก 4              4 ชั้น  ยาวราว 67 ม.
        ตึก 5              4 ชั้น  แนวเหนือ-ใต้ฝั่งตะวันออก ยาวราว 144 ม. ตึก 1-3 ต่อเข้าอาคารนี้
        อาคารเชื่อม         4 ชั้น  แนวเหนือ-ใต้ตรงกลาง เชื่อมตึก 1-4
        ตึก 7              4 ชั้น  แยกอยู่ด้านใต้ เดินถึงทางทางเดินกลางแจ้ง
        อาคารเฉลิมพระเกียรติ 2 ชั้น  ด้านเหนือ ชั้นล่างเป็นหอสมุดคุณหญิงนครราชเสนี
  ทางเดินเชื่อม (ไม่มีห้อง)
        ทางเดินเชื่อม ฝั่งตะวันตก 2 ช่วง (ตึก 1-2 และ ตึก 2-3) มีเฉพาะชั้น 3-4
        ทางเดินซุ้มโค้ง เชื่อมอาคารบดินทรพิพัฒน์กับตึก 1 ชั้น 1-3
  สถานที่อื่น (โหนดเดียวที่ชั้น 1)
        อาคารบดินทรพิพัฒน์ (หอประชุม), อาคารกีฬาในร่ม, อาคารศูนย์กีฬา,
        สระว่ายน้ำ, อาคารหลังคาสีน้ำเงิน, สนามกีฬา, อัฒจันทร์, เรือนไทย
  ทางเดินกลางแจ้ง
        ลานหน้าอาคารและลานกลางเชื่อมทุกโซนเข้าด้วยกันที่ระดับชั้น 1

บันไดอยู่ "ด้านข้างอาคาร" ตามที่กำหนด คือหัวและท้ายของแนวทางเดิน (ค่า STAIR_T)
ถ้าอาคารใดมีบันไดกลางอาคารเพิ่ม ใส่คีย์ "stairs" ของอาคารนั้นเป็นรายการตำแหน่งได้เลย

** จำนวนห้องต่อชั้นในตาราง WINGS เป็นค่าตั้งต้น (ประมาณจากความยาวอาคาร) **
** ยังไม่ใช่ผังห้องจริง ให้แก้คีย์ "rooms" ของอาคารนั้นแล้วรันสคริปต์นี้ใหม่  **
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

SOURCE = "ถอดจากผัง 3 มิติ https://thtpk.github.io/3D_Map/ (buildings.js) ด้วย tools/generate_data.py"

# ------------------------------------------------------------------
# การแปลงพิกัด lon/lat -> เมตร
# ------------------------------------------------------------------
LON0 = 100.61525          # จุดกำเนิดแกน x (ลองจิจูด)
LAT0 = 13.76730           # จุดกำเนิดแกน y (ละติจูด)
M_PER_DEG_LAT = 111320.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))


def to_xy(ll):
    """แปลง [lon, lat] เป็น (x, y) หน่วยเมตร"""
    return ((ll[0] - LON0) * M_PER_DEG_LON, (ll[1] - LAT0) * M_PER_DEG_LAT)


# ------------------------------------------------------------------
# ค่าคงที่ของกราฟ
# ------------------------------------------------------------------
FLOOR_HEIGHT = 3.6        # ความสูงต่อชั้น (เมตร) ตามที่ 3D Map ใช้
WALK_SPEED = 1.3          # ความเร็วเดินเฉลี่ยในอาคาร (เมตร/วินาที)
OUTDOOR_SPEED = 1.4       # ความเร็วเดินกลางแจ้ง (เมตร/วินาที)

STAIR_DISTANCE = 7.0      # ระยะเดินจริงของบันไดหนึ่งช่วงชั้น (เมตร)
STAIR_TIME_UP = 19        # วินาที
STAIR_TIME_DOWN = 14      # วินาที

STAIR_T = (0.0, 1.0)      # บันไดมาตรฐาน: หัวและท้ายอาคาร (ด้านข้างอาคาร)
ENTRANCE_OFFSET = 6.0     # ระยะที่โหนดทางเข้ายื่นออกจากตัวอาคาร (เมตร)
MIN_EDGE = 1.0            # ความยาวเส้นเชื่อมต่ำสุด กันเส้นยาวศูนย์เมตร


# ------------------------------------------------------------------
# ตารางอาคารที่มีแนวทางเดินเป็นเส้นตรง (wing)
#   line   : [lon, lat] ของจุดกึ่งกลางผนังหัว และ ท้ายอาคาร
#   ends   : ชื่อเรียกปลายทั้งสองข้าง ใช้ตั้งชื่อบันไดและทางเข้า
#   width  : ความกว้างอาคาร (เมตร) ใช้คำนวณกรอบอาคารในไฟล์ buildings.json
#   rooms  : จำนวนห้องต่อชั้น (ค่าตั้งต้น ปรับได้) ใส่เป็น dict ชั้น -> จำนวน หรือ int
#   voids  : ช่วงที่ชั้นล่างเปิดโล่งไม่มีห้อง (from_m/to_m วัดจากปลาย line[0])
#   stairs : ตำแหน่งบันไดตามแนวทางเดิน 0.0 = หัว, 1.0 = ท้าย (ค่าปริยาย STAIR_T)
#   corridorType : ชนิดเส้นเชื่อมภายในแนวทางเดิน
# ------------------------------------------------------------------
WINGS = [
    {
        "id": "chalerm", "code": "8", "name": "อาคารเฉลิมพระเกียรติ", "short": "อ.เฉลิมฯ",
        "kind": "อาคารเรียน / หอสมุด", "zone": "โซนเหนือ", "color": "#f59e0b",
        "floors": [1, 2], "rooms": {1: 2, 2: 5}, "width": 27.0,
        "line": [[100.6151832, 13.7684764], [100.6156313, 13.7685484]],
        "ends": ("ตะวันตก", "ตะวันออก"),
        "desc": "อาคารเฉลิมพระเกียรติ ๖๐ พรรษา ๕ ธันวาคม ๒๕๓๐ ชั้นล่างเป็นที่ตั้งของหอสมุดคุณหญิงนครราชเสนี",
        "extras": [
            {"suffix": "library", "name": "หอสมุดคุณหญิงนครราชเสนี", "type": "library",
             "floor": 1, "t": 0.5, "aliases": ["หอสมุด", "ห้องสมุด"]},
        ],
    },
    {
        "id": "b1", "code": "1", "name": "ตึก 1", "short": "ต.1",
        "kind": "อาคารเรียน", "zone": "กลุ่มอาคารเรียน", "color": "#2563eb",
        "floors": [1, 2, 3, 4], "rooms": {1: 9, 2: 9, 3: 12, 4: 12}, "width": 13.0,
        "line": [[100.61470605, 13.7677300], [100.61567260, 13.76789745]],
        "ends": ("ตะวันตก", "ตะวันออก"),
        "voids": [{"floors": [1, 2], "from_m": 76.5, "to_m": 100.4}],
        "desc": "อาคารเรียนแนวตะวันตก-ตะวันออก ปลายด้านตะวันออกต่อเข้าตึก 5 "
                "ช่วงระหว่างอาคารเชื่อมกับตึก 5 ชั้น 1-2 เปิดโล่งเป็นทางเดินผ่านไปลานกลาง",
    },
    {
        "id": "b2", "code": "2", "name": "ตึก 2", "short": "ต.2",
        "kind": "อาคารเรียน", "zone": "กลุ่มอาคารเรียน", "color": "#7c3aed",
        "floors": [1, 2, 3, 4], "rooms": {1: 9, 2: 9, 3: 12, 4: 12}, "width": 13.0,
        "line": [[100.61476815, 13.76740775], [100.61572870, 13.76757675]],
        "ends": ("ตะวันตก", "ตะวันออก"),
        "voids": [{"floors": [1, 2], "from_m": 75.9, "to_m": 99.7}],
        "desc": "อาคารเรียนแนวตะวันตก-ตะวันออก ปลายด้านตะวันออกต่อเข้าตึก 5 "
                "ช่วงระหว่างอาคารเชื่อมกับตึก 5 ชั้น 1-2 เปิดโล่งเป็นทางเดินผ่านไปลานกลาง",
    },
    {
        "id": "b3", "code": "3", "name": "ตึก 3", "short": "ต.3",
        "kind": "อาคารเรียน", "zone": "กลุ่มอาคารเรียน", "color": "#0d9488",
        "floors": [1, 2, 3, 4], "rooms": {1: 9, 2: 9, 3: 12, 4: 12}, "width": 13.0,
        "line": [[100.61483075, 13.76709110], [100.61578645, 13.76724715]],
        "ends": ("ตะวันตก", "ตะวันออก"),
        "voids": [{"floors": [1, 2], "from_m": 75.1, "to_m": 99.0}],
        "desc": "อาคารเรียนแนวตะวันตก-ตะวันออก ปลายด้านตะวันออกต่อเข้าตึก 5 "
                "ช่วงระหว่างอาคารเชื่อมกับตึก 5 ชั้น 1-2 เปิดโล่งเป็นทางเดินผ่านไปลานกลาง",
    },
    {
        "id": "b4", "code": "4", "name": "ตึก 4", "short": "ต.4",
        "kind": "อาคารเรียน", "zone": "กลุ่มอาคารเรียน", "color": "#db2777",
        "floors": [1, 2, 3, 4], "rooms": 8, "width": 13.0,
        "line": [[100.61488510, 13.76676000], [100.61549260, 13.76686440]],
        "ends": ("ตะวันตก", "ตะวันออก"),
        "desc": "อาคารเรียนแนวตะวันตก-ตะวันออกหลังใต้สุดของกลุ่มตึก 1-4 "
                "ปลายด้านตะวันออกจบที่อาคารเชื่อม",
    },
    {
        "id": "b5", "code": "5", "name": "ตึก 5", "short": "ต.5",
        "kind": "อาคารเรียน", "zone": "กลุ่มอาคารเรียน (แนวตะวันออก)", "color": "#ea580c",
        "floors": [1, 2, 3, 4], "rooms": 16, "width": 13.0,
        "line": [[100.61566895, 13.76799860], [100.61589255, 13.76672140]],
        "ends": ("เหนือ", "ใต้"),
        "desc": "อาคารเรียนยาวแนวเหนือ-ใต้ฝั่งตะวันออก เป็นแกนที่ตึก 1, 2 และ 3 ต่อเข้ามา",
    },
    {
        "id": "link", "code": "6", "name": "อาคารเชื่อม", "short": "อ.เชื่อม",
        "kind": "อาคารเรียน (แนวเหนือ-ใต้)", "zone": "กลุ่มอาคารเรียน (แนวกลาง)", "color": "#0891b2",
        "floors": [1, 2, 3, 4], "rooms": 10, "width": 13.0,
        "line": [[100.61533840, 13.76782585], [100.61550395, 13.76688000]],
        "ends": ("เหนือ", "ใต้"),
        "desc": "อาคารแนวเหนือ-ใต้ที่เชื่อมตึก 1 ถึงตึก 4 เข้าด้วยกันตรงกลางอาคาร "
                "รหัสห้อง 6 เป็นค่าตั้งต้น เพราะผัง 3 มิติไม่มีตึก 6",
    },
    {
        "id": "b7", "code": "7", "name": "ตึก 7", "short": "ต.7",
        "kind": "อาคารเรียน", "zone": "โซนใต้", "color": "#65a30d",
        "floors": [1, 2, 3, 4], "rooms": 6, "width": 28.0,
        "line": [[100.6151760, 13.7661442], [100.6155275, 13.7661818]],
        "ends": ("ตะวันตก", "ตะวันออก"),
        "desc": "อาคารเรียนด้านใต้ของโรงเรียน แยกจากกลุ่มตึก 1-5 เดินถึงได้ทางทางเดินกลางแจ้ง",
    },
    {
        "id": "wk1", "code": "", "name": "ทางเดินเชื่อม ตึก 1-2", "short": "ทช.1-2",
        "kind": "ทางเดินเชื่อมอาคาร", "zone": "ทางเดินเชื่อม", "color": "#94a3b8",
        "floors": [3, 4], "rooms": 0, "width": 6.0, "stairs": (),
        "corridorType": "bridge",
        "line": [[100.61486890, 13.76774450], [100.61492075, 13.76744830]],
        "ends": ("เหนือ", "ใต้"),
        "desc": "ทางเดินเชื่อมฝั่งตะวันตกระหว่างตึก 1 กับตึก 2 "
                "ชั้นล่าง 2 ชั้นเป็นเสาสูงโล่ง มีทางเดินเฉพาะชั้น 3 และชั้น 4",
    },
    {
        "id": "wk2", "code": "", "name": "ทางเดินเชื่อม ตึก 2-3", "short": "ทช.2-3",
        "kind": "ทางเดินเชื่อมอาคาร", "zone": "ทางเดินเชื่อม", "color": "#94a3b8",
        "floors": [3, 4], "rooms": 0, "width": 6.0, "stairs": (),
        "corridorType": "bridge",
        "line": [[100.61496415, 13.76742855], [100.61501555, 13.76713490]],
        "ends": ("เหนือ", "ใต้"),
        "desc": "ทางเดินเชื่อมฝั่งตะวันตกระหว่างตึก 2 กับตึก 3 "
                "ชั้นล่าง 2 ชั้นเป็นเสาสูงโล่ง มีทางเดินเฉพาะชั้น 3 และชั้น 4",
    },
    {
        "id": "arcade", "code": "", "name": "ทางเดินซุ้มโค้ง", "short": "ซุ้มโค้ง",
        "kind": "ทางเดินเชื่อมอาคาร", "zone": "ทางเดินเชื่อม", "color": "#2b3a66",
        "floors": [1, 2, 3], "rooms": 0, "width": 5.0, "stairs": (1.0,),
        "corridorType": "bridge",
        "line": [[100.61535535, 13.76789785], [100.61534020, 13.76800920]],
        "ends": ("ใต้", "เหนือ"),
        "desc": "ทางเดินเชื่อมระหว่างอาคารบดินทรพิพัฒน์กับตึก 1 ชั้นล่างเป็นทางเดินโล่ง "
                "ชั้น 2-3 เป็นระเบียงทางเดินซุ้มโค้ง บันไดอยู่ปลายด้านอาคารบดินทรพิพัฒน์",
    },
]

WING_BY_ID = {w["id"]: w for w in WINGS}

# ------------------------------------------------------------------
# จุดที่แนวทางเดินของสองอาคารตัดกัน (ทางแยกเชื่ออาคาร)
#   สร้างโหนดชนิด junction หนึ่งตัวต่อหนึ่งคู่หนึ่งชั้น ใช้ร่วมกันทั้งสองแนว
#   ชั้นที่เกิดทางแยก = ชั้นที่ทั้งสองอาคารมีร่วมกัน
# ------------------------------------------------------------------
JUNCTIONS = [
    ("b1", "link"), ("b2", "link"), ("b3", "link"), ("b4", "link"),
    ("b1", "b5"), ("b2", "b5"), ("b3", "b5"),
    ("b1", "wk1"), ("b2", "wk1"),
    ("b2", "wk2"), ("b3", "wk2"),
    ("b1", "arcade"),
]

# ------------------------------------------------------------------
# สถานที่อื่นที่เป็นโหนดเดียว (ชั้น 1) — พิกัดจากจุดกลางอาคารในผัง 3 มิติ
#   (id, ชื่อ, ชนิดโหนด, lon, lat, ขนาดกรอบอาคาร (เมตร), คำอธิบาย)
# ------------------------------------------------------------------
PLACES = [
    ("bodin", "อาคารบดินทรพิพัฒน์", "meeting", 100.6154275, 13.7681634, 45.0,
     "หอประชุมของโรงเรียน อยู่ด้านเหนือของตึก 1 เดินเข้าได้ทางทางเดินซุ้มโค้ง", "#8b5cf6"),
    ("hall", "อาคารกีฬาในร่ม", "sport", 100.6155976, 13.7669113, 34.0,
     "อาคารกีฬาในร่ม อยู่ระหว่างตึก 4 กับตึก 5", "#14b8a6"),
    ("sport", "อาคารศูนย์กีฬา", "sport", 100.6156963, 13.7665159, 42.0,
     "อาคารศูนย์กีฬา อยู่ด้านใต้ของกลุ่มอาคารเรียน", "#14b8a6"),
    ("pool", "สระว่ายน้ำ", "sport", 100.6150132, 13.7661442, 34.0,
     "สระว่ายน้ำมีหลังคาคลุม อยู่ด้านตะวันตกของตึก 7", "#0ea5e9"),
    ("blue", "อาคารหลังคาสีน้ำเงิน", "landmark", 100.6152579, 13.7665637, 30.0,
     "อาคารหลังคาสีน้ำเงิน อยู่ระหว่างตึก 4 กับตึก 7", "#1d4ed8"),
    ("field", "สนามกีฬา", "sport", 100.6150355, 13.7693944, 80.0,
     "สนามฟุตบอลพร้อมลู่วิ่ง อยู่ด้านเหนือของอาคารเฉลิมพระเกียรติ", "#22c55e"),
    ("stand", "อัฒจันทร์", "landmark", 100.6154748, 13.7693850, 20.0,
     "อัฒจันทร์ริมสนามกีฬาด้านตะวันออก", "#a3a3a3"),
    ("house", "เรือนไทย", "landmark", 100.6152286, 13.7705345, 22.0,
     "เรือนไทยไม้สัก อาคารอนุรักษ์ด้านเหนือสุดของโรงเรียน", "#92400e"),
]

# ------------------------------------------------------------------
# ลาน / ทางเดินกลางแจ้ง (ชั้น 1) — พิกัดเมตร เป็นค่าประมาณจากผังดาวเทียม
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

# ------------------------------------------------------------------
# ทางเข้าอาคาร (ชั้น 1) — ยื่นออกจากปลายแนวทางเดินของอาคาร
#   (id, ชื่อ, อาคาร, ตำแหน่งปลาย 0.0 หรือ 1.0)
# ------------------------------------------------------------------
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

# ------------------------------------------------------------------
# เส้นเชื่อมกลางแจ้ง — คู่ของไอดีโหนด ระยะทางคำนวณจากพิกัดจริง
#   ("jn", อาคาร ก, อาคาร ข, ชั้น) = โหนดทางแยกของสองอาคารที่ชั้นนั้น
# ------------------------------------------------------------------
OUTDOOR = [
    # แกนทางเดินฝั่งตะวันตกหน้าตึก 1-4
    ("pz-b1", "pz-b2"), ("pz-b2", "pz-b3"), ("pz-b3", "pz-b4"),
    ("pz-b1", "ent-b1"), ("pz-b2", "ent-b2"), ("pz-b3", "ent-b3"), ("pz-b4", "ent-b4"),
    # ด้านเหนือ: หอประชุม สนามกีฬา เรือนไทย
    ("pz-b1", "pz-bodin"),
    ("pz-bodin", "poi-bodin"), ("pz-bodin", "pz-chalerm"), ("pz-bodin", "pz-b5n"),
    ("pz-b5n", "ent-b5n"),
    ("pz-chalerm", "ent-chalerm"), ("pz-chalerm", "pz-field-s"),
    ("pz-field-s", "poi-field"), ("pz-field-s", "poi-stand"), ("pz-field-s", "pz-field-n"),
    ("pz-field-n", "poi-field"), ("pz-field-n", "pz-house"),
    ("pz-house", "poi-house"),
    # ด้านใต้: อาคารกีฬา สระว่ายน้ำ ตึก 7
    ("pz-b4", "pz-blue"), ("pz-blue", "poi-blue"), ("pz-blue", "pz-b7"), ("pz-blue", "pz-sport"),
    ("pz-sport", "poi-sport"), ("pz-sport", "poi-hall"), ("pz-sport", "ent-b5s"),
    ("pz-sport", "pz-c34"), ("pz-c34", "poi-hall"),
    ("pz-b7", "ent-b7w"), ("pz-b7", "ent-b7e"), ("pz-b7", "pz-pool"), ("pz-pool", "poi-pool"),
    # ลานกลางระหว่างตึก เดินลอดช่องเปิดโล่งใต้อาคารถึงกันได้
    ("pz-c12", "pz-c23"), ("pz-c23", "pz-c34"),
    ("pz-c12", ("jn", "b1", "link", 1)), ("pz-c12", ("jn", "b2", "link", 1)),
    ("pz-c12", ("jn", "b1", "b5", 1)),   ("pz-c12", ("jn", "b2", "b5", 1)),
    ("pz-c23", ("jn", "b2", "link", 1)), ("pz-c23", ("jn", "b3", "link", 1)),
    ("pz-c23", ("jn", "b2", "b5", 1)),   ("pz-c23", ("jn", "b3", "b5", 1)),
    ("pz-c34", ("jn", "b3", "link", 1)), ("pz-c34", ("jn", "b4", "link", 1)),
    # ทางเดินซุ้มโค้งลงไปที่หอประชุม
    ("ent-arcade", "poi-bodin"),
]


# ------------------------------------------------------------------
# เรขาคณิตของแนวทางเดิน
# ------------------------------------------------------------------
def prepare_wings():
    """เติมพิกัดเมตร ทิศทาง และความยาวให้อาคารทุกหลัง"""
    for w in WINGS:
        a = to_xy(w["line"][0])
        b = to_xy(w["line"][1])
        w["_a"] = a
        w["_b"] = b
        w["_len"] = math.hypot(b[0] - a[0], b[1] - a[1])
        w["_dir"] = ((b[0] - a[0]) / w["_len"], (b[1] - a[1]) / w["_len"])


def point_at(w, t):
    """พิกัดบนแนวทางเดินที่ตำแหน่ง t (0 = ปลาย line[0], 1 = ปลาย line[1])"""
    a, b = w["_a"], w["_b"]
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def intersect_t(w1, w2):
    """ค่า t บนแนวทางเดินทั้งสองที่เส้นตรงสองเส้นตัดกัน"""
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
    """จำนวนห้องของชั้นนั้น"""
    rooms = w.get("rooms", 0)
    if isinstance(rooms, dict):
        return rooms.get(floor, 0)
    return rooms


def room_positions(w, floor, n):
    """ตำแหน่ง t ของห้องทั้ง n ห้อง กระจายเท่ากันโดยเว้นช่วงที่เปิดโล่ง"""
    if n <= 0:
        return []
    length = w["_len"]
    blocked = sorted(
        (v["from_m"] / length, v["to_m"] / length)
        for v in w.get("voids", []) if floor in v["floors"]
    )
    segments, cur = [], 0.0
    for lo, hi in blocked:
        if lo > cur:
            segments.append((cur, lo))
        cur = max(cur, hi)
    if cur < 1.0:
        segments.append((cur, 1.0))
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
    """ชื่อเรียกตำแหน่งบันไดจากปลายที่ใกล้ที่สุด"""
    return w["ends"][0] if t < 0.5 else w["ends"][1]


# ------------------------------------------------------------------
# ไอดีของโหนด
# ------------------------------------------------------------------
def room_id(w, f, i):
    return "%s-f%d-r%02d" % (w["id"], f, i)


def room_code(w, f, i):
    return "%s%d%02d" % (w["code"], f, i) if w["code"] else "%s-%d-%02d" % (w["id"], f, i)


def stair_id(w, f, k):
    return "%s-f%d-st%s" % (w["id"], f, "ABCDEF"[k])


def junction_id(a, b, f):
    return "jn-%s-%s-f%d" % (a, b, f)


def place_id(key):
    return "poi-%s" % key


def extra_id(w, spec):
    return "%s-f%d-%s" % (w["id"], spec["floor"], spec["suffix"])


# ------------------------------------------------------------------
# ตัวช่วยสร้างโหนด / เส้นเชื่อม
# ------------------------------------------------------------------
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
        "from": a,
        "to": b,
        "distance": round(distance, 2),
        "time": max(1, int(round(time if time is not None else distance / speed))),
        "type": etype,
        "bidirectional": bidirectional,
    }


# ------------------------------------------------------------------
# สร้างทางแยกระหว่างอาคาร
# ------------------------------------------------------------------
def build_junctions():
    """คืน dict (a, b, floor) -> {'id','t_a','t_b','x','y'}"""
    result = {}
    for a, b in JUNCTIONS:
        wa, wb = WING_BY_ID[a], WING_BY_ID[b]
        ta, tb = intersect_t(wa, wb)
        ta = min(max(ta, 0.0), 1.0)
        tb = min(max(tb, 0.0), 1.0)
        x, y = point_at(wa, ta)
        for f in sorted(set(wa["floors"]) & set(wb["floors"])):
            result[(a, b, f)] = {
                "id": junction_id(a, b, f), "t_a": ta, "t_b": tb, "x": x, "y": y,
            }
    return result


def junctions_of(junctions, wing_id, floor):
    """รายการ (t, id, คู่อาคาร) ของทางแยกบนแนวทางเดินอาคารนี้ที่ชั้นนั้น"""
    out = []
    for (a, b, f), j in junctions.items():
        if f != floor:
            continue
        if a == wing_id:
            out.append((j["t_a"], j["id"], b))
        elif b == wing_id:
            out.append((j["t_b"], j["id"], a))
    return out


# ------------------------------------------------------------------
# สร้างโหนดและเส้นเชื่อมทั้งหมด
# ------------------------------------------------------------------
def build_graph():
    prepare_wings()
    junctions = build_junctions()

    nodes = []
    edges = []
    by_id = {}

    def add(n):
        nodes.append(n)
        by_id[n["id"]] = n
        return n

    # --- โหนดทางแยกระหว่างอาคาร (ใช้ร่วมกันทั้งสองแนว) ---
    for (a, b, f), j in sorted(junctions.items(), key=lambda kv: kv[0]):
        wa, wb = WING_BY_ID[a], WING_BY_ID[b]
        add(node(
            id=j["id"],
            name="ทางแยก%s × %s ชั้น %d" % (wa["name"], wb["name"], f),
            type="junction",
            building=a,
            floor=f,
            x=j["x"], y=j["y"],
            description="จุดที่แนวทางเดิน%sบรรจบกับ%s ที่ชั้น %d" % (wa["name"], wb["name"], f),
            aliases=["ทางแยก%s%s" % (wa["short"] or a, wb["short"] or b)],
        ))

    # --- โหนดในแต่ละอาคาร แต่ละชั้น แล้วร้อยเป็นสายทางเดิน ---
    for w in WINGS:
        for f in w["floors"]:
            chain = []

            # บันไดด้านข้างอาคาร
            for k, t in enumerate(stair_positions(w)):
                x, y = point_at(w, t)
                where = stair_label(w, t)
                sid = stair_id(w, f, k)
                add(node(
                    id=sid,
                    name="บันได%s ฝั่ง%s ชั้น %d" % (w["name"], where, f),
                    type="stairs",
                    building=w["id"],
                    floor=f,
                    x=x, y=y,
                    description="บันไดด้านข้าง%s ฝั่ง%s เชื่อมชั้น %d ถึงชั้น %d"
                                % (w["name"], where, w["floors"][0], w["floors"][-1]),
                    aliases=["บันได%s%s" % (w["short"] or w["id"], where),
                             "st-%s-%s" % (w["id"], "ABCDEF"[k])],
                ))
                chain.append((t, sid))

            # ห้องเรียน (จำนวนต่อชั้นเป็นค่าตั้งต้น ปรับได้ที่ตาราง WINGS)
            count = rooms_on(w, f)
            for i, t in enumerate(room_positions(w, f, count), start=1):
                x, y = point_at(w, t)
                rid = room_id(w, f, i)
                code = room_code(w, f, i)
                add(node(
                    id=rid,
                    name="ห้อง %s" % code,
                    type="classroom",
                    building=w["id"],
                    floor=f,
                    x=x, y=y,
                    description="%s ชั้น %d ห้องที่ %d จาก %d (จำนวนห้องเป็นค่าตั้งต้น รอผังห้องจริง)"
                                % (w["name"], f, i, count),
                    aliases=[code, "%s/%d/%d" % (w["short"] or w["id"], f, i)],
                ))
                chain.append((t, rid))

            # ห้องเฉพาะที่ระบุไว้เอง เช่น หอสมุด
            for spec in w.get("extras", []):
                if spec["floor"] != f:
                    continue
                t = spec["t"]
                x, y = point_at(w, t)
                eid = extra_id(w, spec)
                add(node(
                    id=eid,
                    name=spec["name"],
                    type=spec["type"],
                    building=w["id"],
                    floor=f,
                    x=x, y=y,
                    description=spec.get("desc", "%s ชั้น %d" % (w["name"], f)),
                    aliases=spec.get("aliases", []),
                ))
                chain.append((t, eid))

            # ทางแยกไปอาคารอื่น
            for t, jid, _other in junctions_of(junctions, w["id"], f):
                chain.append((t, jid))

            # ร้อยสายทางเดินตามตำแหน่งจริง
            chain.sort(key=lambda item: item[0])
            ctype = w.get("corridorType", "corridor")
            for (t1, id1), (t2, id2) in zip(chain, chain[1:]):
                edges.append(edge(id1, id2, abs(t2 - t1) * w["_len"], ctype))

        # --- บันได: เชื่อมชั้นต่อชั้น แยกทิศขึ้น/ลง เพราะใช้เวลาไม่เท่ากัน ---
        for k, _t in enumerate(stair_positions(w)):
            floors = w["floors"]
            for f1, f2 in zip(floors, floors[1:]):
                low, high = stair_id(w, f1, k), stair_id(w, f2, k)
                steps = f2 - f1
                edges.append(edge(low, high, STAIR_DISTANCE * steps, "stairs_up",
                                  time=STAIR_TIME_UP * steps, bidirectional=False))
                edges.append(edge(high, low, STAIR_DISTANCE * steps, "stairs_down",
                                  time=STAIR_TIME_DOWN * steps, bidirectional=False))

    # --- สถานที่อื่นที่เป็นโหนดเดียว ---
    for key, name, ntype, lon, lat, _size, desc, _color in PLACES:
        x, y = to_xy([lon, lat])
        add(node(
            id=place_id(key),
            name=name,
            type=ntype,
            building=key,
            floor=1,
            x=x, y=y,
            description=desc,
            aliases=[name.replace("อาคาร", "").strip()],
        ))

    # --- ลาน / ทางเดินกลางแจ้ง ---
    for pid, name, x, y in PLAZAS:
        add(node(
            id=pid,
            name=name,
            type="plaza",
            building=None,
            floor=1,
            x=x, y=y,
            description="ลานและทางเดินกลางแจ้งที่ระดับพื้นดิน (ตำแหน่งประมาณจากภาพดาวเทียม)",
            aliases=[name.replace("ลาน", "").strip()],
        ))

    # --- ทางเข้าอาคาร: ยื่นออกจากปลายแนวทางเดิน แล้วเชื่อมเข้าบันไดปลายนั้น ---
    for eid, wing_id, t in ENTRANCES:
        w = WING_BY_ID[wing_id]
        sign = -1.0 if t < 0.5 else 1.0
        bx, by = point_at(w, t)
        x = bx + w["_dir"][0] * ENTRANCE_OFFSET * sign
        y = by + w["_dir"][1] * ENTRANCE_OFFSET * sign
        where = stair_label(w, t)
        add(node(
            id=eid,
            name="ทางเข้า%s ฝั่ง%s" % (w["name"], where),
            type="entrance",
            building=wing_id,
            floor=1,
            x=x, y=y,
            description="ทางเข้า%s ด้าน%s ที่ระดับพื้นดิน" % (w["name"], where),
            aliases=["ทางเข้า%s" % (w["short"] or wing_id)],
        ))
        # เชื่อมกับโหนดที่ปลายแนวทางเดินชั้น 1 (บันไดปลายนั้น ถ้าไม่มีใช้ทางแยกที่ใกล้สุด)
        inner = None
        stairs = stair_positions(w)
        for k, st in enumerate(stairs):
            if abs(st - t) < 1e-6 and 1 in w["floors"]:
                inner = stair_id(w, 1, k)
        if inner is None:
            cands = junctions_of(junctions, wing_id, 1)
            if cands:
                inner = min(cands, key=lambda c: abs(c[0] - t))[1]
        if inner is None:
            raise ValueError("ทางเข้า %s ไม่มีโหนดในอาคารให้เชื่อม" % eid)
        edges.append(edge(eid, inner, ENTRANCE_OFFSET, "entrance"))

    # --- เส้นเชื่อมกลางแจ้ง ---
    def resolve(ref):
        if isinstance(ref, tuple):
            _kind, a, b, f = ref
            return junctions[(a, b, f)]["id"]
        return ref

    for ref_a, ref_b in OUTDOOR:
        id_a, id_b = resolve(ref_a), resolve(ref_b)
        na, nb = by_id[id_a], by_id[id_b]
        dist = math.hypot(nb["x"] - na["x"], nb["y"] - na["y"])
        edges.append(edge(id_a, id_b, dist, "outdoor"))

    return nodes, edges


# ------------------------------------------------------------------
# ข้อมูลอาคาร (ชื่อ/สี/จำนวนชั้น/กรอบอาคารในภาพ 3 มิติ)
# ------------------------------------------------------------------
def wing_rect(w):
    """กรอบสี่เหลี่ยมครอบอาคาร คิดจากแนวทางเดินและความกว้าง"""
    half = w["width"] / 2.0
    nx, ny = -w["_dir"][1], w["_dir"][0]
    corners = [
        (w["_a"][0] + nx * half, w["_a"][1] + ny * half),
        (w["_a"][0] - nx * half, w["_a"][1] - ny * half),
        (w["_b"][0] + nx * half, w["_b"][1] + ny * half),
        (w["_b"][0] - nx * half, w["_b"][1] - ny * half),
    ]
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    return ([round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
            [[round(c[0], 2), round(c[1], 2)] for c in (corners[0], corners[2], corners[3], corners[1])])


def build_buildings():
    out = []
    for w in WINGS:
        rect, footprint = wing_rect(w)
        axis = "x" if abs(w["_dir"][0]) >= abs(w["_dir"][1]) else "y"
        out.append({
            "id": w["id"],
            "name": w["name"],
            "shortName": w["short"] or w["name"],
            "code": w["code"],
            "kind": w["kind"],
            "floors": list(w["floors"]),
            "color": w["color"],
            "rect": rect,
            "footprint": footprint,
            "axis": axis,
            "zone": w["zone"],
            "description": "%s · %d ชั้น · ยาวราว %d เมตร · %s"
                           % (w["kind"], len(w["floors"]), round(w["_len"]), w["desc"]),
            "photo": "",
        })
    for key, name, _ntype, lon, lat, size, desc, color in PLACES:
        x, y = to_xy([lon, lat])
        half = size / 2.0
        out.append({
            "id": key,
            "name": name,
            "shortName": name,
            "code": "",
            "kind": "สถานที่",
            "floors": [1],
            "color": color,
            "rect": [round(x - half, 2), round(y - half, 2), round(x + half, 2), round(y + half, 2)],
            "footprint": [],
            "axis": "x",
            "zone": "สถานที่อื่น",
            "description": desc,
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

    nodes, edges = build_graph()
    buildings = build_buildings()

    xs = [n["x"] for n in nodes]
    ys = [n["y"] for n in nodes]
    floor_list = sorted({n["floor"] for n in nodes if n["floor"]})

    write("buildings.json", {
        "meta": {
            "school": "โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)",
            "unit": "meter",
            "note": "ผังเส้นทางถอดจากผัง 3 มิติ https://thtpk.github.io/3D_Map/ "
                    "อาคารเรียน %d หลัง ทางเดินเชื่อม %d เส้น และสถานที่อื่น %d แห่ง "
                    "บันไดอยู่ด้านข้างอาคาร (หัว-ท้ายของแนวทางเดิน) "
                    "จำนวนห้องต่อชั้นยังเป็นค่าตั้งต้น รอปรับตามผังห้องจริง"
                    % (sum(1 for w in WINGS if rooms_on(w, w["floors"][0]) or w.get("extras")),
                       sum(1 for w in WINGS if not w.get("rooms")),
                       len(PLACES)),
            "origin": {"lon": LON0, "lat": LAT0},
            "floorHeight": FLOOR_HEIGHT,
            "floors": floor_list,
            "extent": [round(min(xs) - 10, 1), round(min(ys) - 10, 1),
                       round(max(xs) + 10, 1), round(max(ys) + 10, 1)],
            "source": SOURCE,
        },
        "buildings": buildings,
        "areas": [],
    })
    write("nodes.json", {"version": "3.0", "nodes": nodes})
    write("edges.json", {"version": "3.0", "edges": edges})

    counts = {}
    for n in nodes:
        counts[n["type"]] = counts.get(n["type"], 0) + 1
    print("รวม %d โหนด และ %d เส้นเชื่อม" % (len(nodes), len(edges)))
    for t, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print("    %-12s %d" % (t, c))
    print("อาคารในไฟล์ buildings.json: %d รายการ" % len(buildings))
    for w in WINGS:
        print("    %-9s %-22s %d ชั้น  ยาว %6.1f ม.  ห้อง/ชั้น %s"
              % (w["id"], w["name"], len(w["floors"]), w["_len"],
                 ", ".join("ช%d=%d" % (f, rooms_on(w, f)) for f in w["floors"])))


if __name__ == "__main__":
    main()
