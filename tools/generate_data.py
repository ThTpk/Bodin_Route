# -*- coding: utf-8 -*-
"""
generate_data.py
------------------------------------------------------------------
สร้างไฟล์ข้อมูลกราฟเริ่มต้นของแผนที่โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)

  data/buildings.json  - รูปทรงอาคาร / พื้นที่ ใช้วาดแผนที่
  data/nodes.json      - โหนด (ห้องเรียน บันได ห้องน้ำ ฯลฯ)
  data/edges.json      - เส้นเชื่อม (ระยะทาง / เวลา)

*** ใช้รันครั้งแรกเพื่อสร้างข้อมูลตั้งต้นเท่านั้น ***
หลังจากนั้นให้แก้ไฟล์ JSON ตรง ๆ หรือใช้หน้า editor.html
เพราะการรันสคริปต์นี้ซ้ำจะเขียนทับข้อมูลที่แก้ไว้

    python tools/generate_data.py            # สร้างใหม่ (ถามยืนยันถ้ามีไฟล์อยู่)
    python tools/generate_data.py --force    # เขียนทับทันที
------------------------------------------------------------------
ระบบพิกัด: หน่วยเป็น "เมตร" บนผังมองจากด้านบน (top-down)
    x  เพิ่มไปทาง ทิศตะวันออก
    y  เพิ่มไปทาง ทิศใต้
"""

import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# ความเร็วเดินเฉลี่ย (เมตร/วินาที) แยกตามชนิดเส้นทาง
SPEED = {
    "corridor": 1.30,      # ทางเดินในอาคาร
    "outdoor": 1.40,       # ทางเดินกลางแจ้ง
    "room": 1.10,          # เข้า-ออกห้อง
    "entrance": 1.20,      # ทางเข้าอาคาร
    "ramp": 0.90,          # ทางลาด
    "stairs_up": 0.42,     # ขึ้นบันได
    "stairs_down": 0.62,   # ลงบันได
    "elevator": 0.55,      # ลิฟต์
}

FLOOR_HEIGHT = 3.8          # ความสูงต่อชั้น (เมตร)
STAIR_RUN = 7.0             # ระยะเดินตามแนวราบของบันได 1 ช่วงชั้น
STATION_GAP = 11.0          # ระยะห่างจุดแยกบนทางเดิน


# ==================================================================
# 1) ผังอาคาร  (อ่านตำแหน่งสัมพัทธ์จากภาพ isometric + ภาพถ่ายทางอากาศ)
# ==================================================================
# rect = [x1, y1, x2, y2]   axis = แกนของทางเดินหลัก ('x' = แนวตะวันออก-ตะวันตก)
BUILDINGS = [
    {
        "id": "b5", "name": "อาคาร 5", "short": "อ.5",
        "rect": [90, 12, 240, 30], "axis": "x", "floors": 4, "color": "#3b82f6",
        "desc": "อาคารเรียนของนักเรียนชั้น ม.1 ห้องเรียนประจำ ม.1/1-ม.1/15 อยู่ที่ชั้น 2-4 (ยืนยันจากตารางเรียน ภาคเรียนที่ 1/2569)",
    },
    {
        "id": "b4", "name": "อาคาร 4", "short": "อ.4",
        "rect": [258, 12, 276, 96], "axis": "y", "floors": 5, "color": "#6366f1",
        "desc": "อาคารกลุ่มสาระวิทยาศาสตร์ (ห้อง 4203, 4302, 4303, 4404) และห้องศิลปะที่ชั้น 1 (ห้อง 4109, 4110)",
    },
    {
        "id": "b2", "name": "อาคาร 2", "short": "อ.2",
        "rect": [108, 56, 244, 74], "axis": "x", "floors": 4, "color": "#0ea5e9",
        "desc": "อาคารเรียนกลุ่มสาระวิทยาศาสตร์และเทคโนโลยี มีห้องปฏิบัติการวิทยาศาสตร์",
    },
    {
        "id": "b3", "name": "อาคาร 3", "short": "อ.3",
        "rect": [258, 100, 276, 172], "axis": "y", "floors": 4, "color": "#14b8a6",
        "desc": "อาคารเรียนกลุ่มสาระคณิตศาสตร์ และมีห้องพระ 1 (ห้อง 3406) ที่ชั้น 4",
    },
    {
        "id": "bwp", "name": "อาคารบดินทรพิพัฒน์", "short": "บดินทรพิพัฒน์",
        "rect": [14, 56, 96, 74], "axis": "x", "floors": 4, "color": "#f59e0b",
        "desc": "อาคารกิจกรรม กลุ่มสาระศิลปะ ดนตรี นาฏศิลป์ และหอประชุม",
    },
    {
        "id": "bad", "name": "อาคารอำนวยการ", "short": "อำนวยการ",
        "rect": [104, 100, 168, 116], "axis": "x", "floors": 2, "color": "#ef4444",
        "desc": "อาคารสำนักงาน ห้องวิชาการ ชั้น 1 ห้องผู้อำนวยการ และกลุ่มบริหารต่าง ๆ",
    },
    {
        "id": "b1", "name": "อาคาร 1", "short": "อ.1",
        "rect": [186, 178, 312, 196], "axis": "x", "floors": 4, "color": "#2563eb",
        "desc": "อาคารเรียนหลักด้านหน้าโรงเรียน มีห้องเรียนโครงการ English Programme (ห้อง 1207, 1301, 1401) หันหน้าเข้าหาสนามบาสเกตบอลและเสาธง",
    },
    {
        "id": "bcp", "name": "อาคารเฉลิมพระเกียรติ", "short": "เฉลิมพระเกียรติ",
        "rect": [14, 154, 92, 172], "axis": "x", "floors": 5, "color": "#a855f7",
        "desc": "อาคารเรียนรวม โรงอาหาร ห้องคอมพิวเตอร์ COM1-COM7 และห้องประชุมขนาดใหญ่",
    },
    {
        "id": "b7", "name": "อาคาร 7", "short": "อ.7",
        "rect": [14, 106, 96, 124], "axis": "x", "floors": 3, "color": "#65a30d",
        "desc": "อาคารปฏิบัติการกลุ่มสาระการงานอาชีพและศิลปะ "
                "(ยืนยันจากรหัสห้อง 7207 และ 7302 ในตารางเรียน แต่ตำแหน่งบนผังยังไม่ได้ตรวจสอบ)",
    },
]


# ==================================================================
# 2) รายการห้องในแต่ละอาคาร แยกตามชั้น
#    (kind, ชื่อห้อง, คำอธิบาย, ที่มาของข้อมูล)
#
# รหัสห้องใช้รูปแบบจริงของโรงเรียน คือ [อาคาร][ชั้น][เลขห้อง 2 หลัก]
#     5401 = อาคาร 5 ชั้น 4 ห้อง 01
#     4110 = อาคาร 4 ชั้น 1 ห้อง 10
#
# ค่าที่มาของข้อมูล (source) มีสองแบบ
#     SCHEDULE = ยืนยันรหัสห้องจากตารางเรียน ม.1 ภาคเรียนที่ 1/2569
#     TEMPLATE = ห้องตัวอย่างที่เติมให้ครบ ต้องตรวจสอบกับของจริงก่อนใช้งาน
# ==================================================================
SCHEDULE = "ตารางเรียน ม.1 ภาคเรียนที่ 1/2569"
TEMPLATE = "ข้อมูลตัวอย่าง (ยังไม่ได้ตรวจสอบ)"


def room(number, desc="", source=SCHEDULE, kind="classroom"):
    """ห้องที่ยืนยันรหัสจากตารางเรียนแล้ว"""
    return (kind, "ห้อง %s" % number, desc, source)


def cls(bno, floor, count, start=1, subject=""):
    """สร้างห้องเรียนตัวอย่างตามรหัสจริง เช่น อาคาร 2 ชั้น 3 -> ห้อง 2301, 2302, ..."""
    return [("classroom", "ห้อง %d%d%02d" % (bno, floor, i), subject, TEMPLATE)
            for i in range(start, start + count)]


ROOMS = {
    # ---------- อาคาร 1 : ห้องเรียนโครงการ EP และงานสำนักงานด้านหน้า ----------
    "b1": {
        1: [("office", "ห้องธุรการ", "งานสารบรรณ รับ-ส่งเอกสาร", TEMPLATE),
            ("office", "ห้องประชาสัมพันธ์", "จุดสอบถามข้อมูลสำหรับผู้มาติดต่อ", TEMPLATE),
            ("health_room", "ห้องพยาบาล", "ปฐมพยาบาลเบื้องต้น", TEMPLATE),
            ("office", "ห้องกลุ่มบริหารงานบุคคล", "", TEMPLATE)],
        2: [room("1207", "ห้องเรียนประจำ ม.1/18 (English Programme)")]
           + cls(1, 2, 5, start=1),
        3: [room("1301", "ห้องเรียนประจำ ม.1/17 (English Programme)")]
           + cls(1, 3, 5, start=2)
           + [("teacher_room", "ห้องพักครูโครงการ EP", "", TEMPLATE)],
        4: [room("1401", "ห้องเรียนประจำ ม.1/16 (English Programme)")]
           + cls(1, 4, 6, start=2),
    },
    # ---------- อาคาร 2 : ยังไม่พบห้องของ ม.1 ในตารางเรียน ----------
    "b2": {
        1: [("lab", "ห้องปฏิบัติการฟิสิกส์ 1", "", TEMPLATE),
            ("lab", "ห้องปฏิบัติการเคมี 1", "", TEMPLATE),
            ("teacher_room", "ห้องพักครูวิทยาศาสตร์", "", TEMPLATE)] + cls(2, 1, 3, start=4),
        2: [("lab", "ห้องปฏิบัติการชีววิทยา", "", TEMPLATE)] + cls(2, 2, 6, start=2),
        3: cls(2, 3, 7),
        4: cls(2, 4, 7),
    },
    # ---------- อาคาร 3 : มีห้องพระ 1 (3406) ยืนยันจากตารางเรียน ----------
    "b3": {
        1: [("teacher_room", "ห้องพักครูคณิตศาสตร์", "", TEMPLATE),
            ("meeting", "ห้องศูนย์คณิตศาสตร์", "", TEMPLATE)] + cls(3, 1, 3, start=3),
        2: cls(3, 2, 5),
        3: cls(3, 3, 5),
        4: [room("3406", "ห้องพระ 1 — ใช้เรียนวิชาพระพุทธศาสนา (ส21111)",
                 kind="activity")] + cls(3, 4, 5, start=1),
    },
    # ---------- อาคาร 4 : กลุ่มสาระวิทยาศาสตร์ และห้องศิลปะชั้น 1 ----------
    "b4": {
        1: [room("4109", "ห้องศิลปะ — ใช้เรียนวิชาทัศนศิลป์ (ศ20101)", kind="activity"),
            room("4110", "ห้องศิลปะ — ใช้เรียนวิชาทัศนศิลป์ (ศ20101)", kind="activity"),
            ("office", "ห้องกลุ่มบริหารทั่วไป", "", TEMPLATE)] + cls(4, 1, 3, start=1),
        2: [room("4203", "ห้องเรียนวิทยาศาสตร์ (ว21181)", kind="lab"),
            ("library", "ห้องสมุด", "ยืม-คืนหนังสือ และพื้นที่อ่านหนังสือ", TEMPLATE)]
           + cls(4, 2, 4, start=4),
        3: [room("4302", "ห้องเรียนวิทยาศาสตร์ (ว21181)", kind="lab"),
            room("4303", "ห้องเรียนวิทยาศาสตร์ (ว21181)", kind="lab"),
            ("teacher_room", "ห้องพักครูวิทยาศาสตร์ อาคาร 4", "", TEMPLATE)]
           + cls(4, 3, 3, start=4),
        4: [room("4404", "ห้องเรียนวิทยาศาสตร์ (ว21181 / ว21191)", kind="lab")]
           + cls(4, 4, 3, start=1) + cls(4, 4, 2, start=5),
        5: cls(4, 5, 5),
    },
    # ---------- อาคาร 5 : ห้องเรียนประจำของนักเรียนชั้น ม.1 ----------
    "b5": {
        1: [("teacher_room", "ห้องพักครูสังคมศึกษา", "", TEMPLATE),
            ("activity", "ห้องจริยธรรม", "", TEMPLATE)] + cls(5, 1, 5, start=1),
        2: [room("5203", "ห้องเรียนประจำ ม.1/13"),
            room("5204", "ห้องเรียนประจำ ม.1/14"),
            room("5205", "ห้องเรียนประจำ ม.1/15")] + cls(5, 2, 3, start=6),
        3: [room("5301", "ห้องเรียนประจำ ม.1/7"),
            room("5302", "ห้องเรียนประจำ ม.1/8"),
            room("5303", "ห้องเรียนประจำ ม.1/9"),
            room("5304", "ห้องเรียนประจำ ม.1/10"),
            room("5305", "ห้องเรียนประจำ ม.1/11"),
            room("5306", "ห้องเรียนประจำ ม.1/12")],
        4: [room("5401", "ห้องเรียนประจำ ม.1/1"),
            room("5402", "ห้องเรียนประจำ ม.1/2"),
            room("5403", "ห้องเรียนประจำ ม.1/3"),
            room("5404", "ห้องเรียนประจำ ม.1/4"),
            room("5405", "ห้องเรียนประจำ ม.1/5"),
            room("5406", "ห้องเรียนประจำ ม.1/6")],
    },
    # ---------- อาคาร 7 : การงานอาชีพและศิลปะ ----------
    "b7": {
        1: [("teacher_room", "ห้องพักครูการงานอาชีพ", "", TEMPLATE),
            ("activity", "ห้องปฏิบัติการงานช่าง", "", TEMPLATE)],
        2: [room("7207", "ห้องปฏิบัติการงานอาชีพ (ง21101)", kind="activity")]
           + cls(7, 2, 3, start=1),
        3: [room("7302", "ห้องศิลปะ — ใช้เรียนวิชาทัศนศิลป์ (ศ20101)", kind="activity")]
           + cls(7, 3, 3, start=3),
    },
    # ---------- อาคารบดินทรพิพัฒน์ ----------
    "bwp": {
        1: [("activity", "หอประชุมบดินทรพิพัฒน์", "ใช้จัดกิจกรรมและประชุมนักเรียน", TEMPLATE),
            ("activity", "ห้องดนตรีไทย", "", TEMPLATE),
            ("activity", "ห้องนาฏศิลป์", "", TEMPLATE)],
        2: [("activity", "ห้องดนตรีสากล", "", TEMPLATE),
            ("activity", "ห้องศิลปะ 1", "", TEMPLATE),
            ("activity", "ห้องศิลปะ 2", "", TEMPLATE),
            ("teacher_room", "ห้องพักครูศิลปะ", "", TEMPLATE)],
        3: [("activity", "ห้องชมรม", "", TEMPLATE),
            ("activity", "ห้องซ้อมการแสดง", "", TEMPLATE)],
        4: [("meeting", "ห้องประชุมเล็กบดินทรพิพัฒน์", "", TEMPLATE),
            ("activity", "ห้องเก็บอุปกรณ์กิจกรรม", "", TEMPLATE)],
    },
    # ---------- อาคารอำนวยการ ----------
    "bad": {
        1: [("office", "ห้องวิชาการ", "กลุ่มบริหารวิชาการ ตารางเรียน ตารางสอบ", TEMPLATE),
            ("office", "ห้องทะเบียนและวัดผล", "ขอเอกสาร ปพ. และใบรับรอง", TEMPLATE),
            ("office", "ห้องการเงิน", "ชำระค่าบำรุงการศึกษา", TEMPLATE)],
        2: [("office", "ห้องผู้อำนวยการ", "", TEMPLATE),
            ("meeting", "ห้องประชุมระดับชั้น (PBL)",
             "ใช้ประชุมระดับชั้นทุกเช้าวันอังคาร", SCHEDULE),
            ("office", "ห้องกลุ่มบริหารงบประมาณ", "", TEMPLATE)],
    },
    # ---------- อาคารเฉลิมพระเกียรติ : ห้องคอมพิวเตอร์ COM1-COM7 ----------
    "bcp": {
        1: [("canteen", "โรงอาหาร", "โรงอาหารหลักของโรงเรียน", TEMPLATE),
            ("shop", "ร้านค้าสวัสดิการโรงเรียน", "", TEMPLATE)],
        2: [("computer_lab", "ห้อง COM1", "ห้องคอมพิวเตอร์ (ว21183 / ง21281)", SCHEDULE),
            ("computer_lab", "ห้อง COM2", "ห้องคอมพิวเตอร์ (ว21193 / ง21281)", SCHEDULE),
            ("computer_lab", "ห้อง COM3", "ห้องคอมพิวเตอร์ (ง21281)", SCHEDULE),
            ("teacher_room", "ห้องพักครูคอมพิวเตอร์", "", TEMPLATE)],
        3: [("computer_lab", "ห้อง COM4", "ห้องคอมพิวเตอร์ (ว21193 / ง21281)", SCHEDULE),
            ("computer_lab", "ห้อง COM5", "ห้องคอมพิวเตอร์ (ง21281)", SCHEDULE),
            ("computer_lab", "ห้อง COM6", "ห้องคอมพิวเตอร์ (ว21183 / ว21295)", SCHEDULE)],
        4: [("computer_lab", "ห้อง COM7", "ห้องคอมพิวเตอร์ (ว21183 / ว21193)", SCHEDULE),
            ("classroom", "ห้องเรียนรวมเฉลิมพระเกียรติ 1", "", TEMPLATE),
            ("classroom", "ห้องเรียนรวมเฉลิมพระเกียรติ 2", "", TEMPLATE)],
        5: [("meeting", "ห้องประชุมเฉลิมพระเกียรติ", "ห้องประชุมใหญ่", TEMPLATE),
            ("classroom", "ห้องเรียนรวมเฉลิมพระเกียรติ 3", "", TEMPLATE)],
    },
}


# ==================================================================
# 3) พื้นที่กลางแจ้ง (ใช้วาดแผนที่อย่างเดียว)
# ==================================================================
AREAS = [
    {"id": "field", "name": "สนามฟุตบอล / ลู่วิ่ง", "kind": "sport", "rect": [12, 6, 86, 48]},
    {"id": "garden", "name": "สวนหย่อม", "kind": "green", "rect": [96, 36, 244, 50]},
    {"id": "flagyard", "name": "ลานเสาธง", "kind": "yard", "rect": [96, 120, 176, 148]},
    {"id": "court", "name": "สนามบาสเกตบอล", "kind": "sport", "rect": [100, 156, 176, 198]},
    {"id": "parking", "name": "ลานจอดรถ", "kind": "parking", "rect": [188, 100, 248, 148]},
    {"id": "dome", "name": "โดมอเนกประสงค์", "kind": "roof", "rect": [190, 206, 292, 228]},
    {"id": "pool", "name": "สระว่ายน้ำ", "kind": "pool", "rect": [16, 128, 92, 148]},
]


# ==================================================================
# 4) โครงข่ายทางเดินกลางแจ้ง  (id, ชื่อ, x, y, ชนิด, คำอธิบาย)
# ==================================================================
# โครงข่ายเป็นตาราง: ทางเดินแนวตะวันออก-ตะวันตกที่ y = 42, 86, 152, 202
# ตัดกับทางเดินแนวเหนือ-ใต้ที่ x = 10, 55, 100, 182, 252
OUTDOOR_NODES = [
    ("out-gate2", "ประตู 2 (ถนนลาดพร้าว)", 316, 200, "gate", "ประตูทางเข้าหลักฝั่งถนนลาดพร้าว"),
    ("out-gate1", "ประตู 1 (รามคำแหง 43/1)", 6, 212, "gate", "ประตูทางเข้าฝั่งซอยรามคำแหง 43/1"),
    ("out-gate3", "ประตู 3 (ฝั่งสนามฟุตบอล)", 6, 28, "gate", "ประตูเล็กด้านทิศเหนือ ใกล้สนามฟุตบอล"),

    ("out-j-nw", "ทางแยกหน้าอาคาร 5 (ฝั่งตะวันตก)", 100, 42, "junction", ""),
    ("out-j-n", "ทางเดินหลังสวนหย่อม", 182, 42, "junction", ""),
    ("out-j-ne", "ทางแยกหน้าอาคาร 4", 252, 42, "junction", ""),

    ("out-j-w", "ทางแยกระหว่างอาคารบดินทรพิพัฒน์กับอาคาร 2", 100, 86, "junction", ""),
    ("out-j-c", "ลานกลางหน้าอาคารอำนวยการ", 182, 86, "junction", ""),
    ("out-j-e", "ทางเดินฝั่งตะวันออก (เหนือ)", 252, 86, "junction", ""),

    ("out-j-w2", "ทางแยกข้างลานเสาธง (ฝั่งตะวันตก)", 100, 152, "junction", ""),
    ("out-j-c2", "ทางแยกหน้าลานจอดรถ", 182, 152, "junction", ""),
    ("out-j-e2", "ทางเดินฝั่งตะวันออก (ใต้)", 252, 152, "junction", ""),

    ("out-j-sw", "ทางแยกหน้าอาคารเฉลิมพระเกียรติ", 100, 202, "junction", ""),
    ("out-j-s", "ลานหน้าอาคาร 1", 182, 202, "junction", ""),
    ("out-j-se", "ทางแยกหน้าโดมอเนกประสงค์", 252, 202, "junction", ""),

    ("out-j-ww", "ทางเดินริมรั้วตะวันตก (เหนือ)", 10, 86, "junction", ""),
    ("out-j-wm", "ทางเดินหลังอาคารบดินทรพิพัฒน์", 55, 86, "junction", ""),
    ("out-j-ww2", "ทางเดินริมรั้วตะวันตก (ใต้)", 10, 152, "junction", ""),
    ("out-j-wm2", "ทางเดินหน้าอาคารเฉลิมพระเกียรติ", 55, 152, "junction", ""),
    ("out-j-field", "ทางเข้าสนามฟุตบอล", 55, 52, "junction", ""),

    ("out-flagpole", "เสาธง", 137, 133, "landmark", "จุดเข้าแถวตอนเช้าและจุดนัดพบยอดนิยม"),
    ("out-wc-court", "ห้องน้ำข้างสนามกีฬา", 186, 162, "toilet", "ห้องน้ำกลางแจ้งใกล้สนามบาสเกตบอล"),
    ("out-pool", "สระว่ายน้ำ", 54, 138, "sport", "ใช้เรียนวิชาพลศึกษา (ว่ายน้ำ)"),
    ("out-field", "สนามฟุตบอล / ลู่วิ่ง", 49, 27, "sport", "ใช้เรียนพลศึกษาและกิจกรรมลูกเสือ-เนตรนารี"),
]

OUTDOOR_EDGES = [
    # แนวตะวันออก-ตะวันตก
    ("out-j-nw", "out-j-n"), ("out-j-n", "out-j-ne"),
    ("out-j-ww", "out-j-wm"), ("out-j-wm", "out-j-w"),
    ("out-j-w", "out-j-c"), ("out-j-c", "out-j-e"),
    ("out-j-ww2", "out-j-wm2"), ("out-j-wm2", "out-j-w2"),
    ("out-j-w2", "out-j-c2"), ("out-j-c2", "out-j-e2"),
    ("out-j-sw", "out-j-s"), ("out-j-s", "out-j-se"),
    # แนวเหนือ-ใต้
    ("out-j-nw", "out-j-w"), ("out-j-w", "out-j-w2"), ("out-j-w2", "out-j-sw"),
    ("out-j-n", "out-j-c"), ("out-j-c", "out-j-c2"), ("out-j-c2", "out-j-s"),
    ("out-j-ne", "out-j-e"), ("out-j-e", "out-j-e2"), ("out-j-e2", "out-j-se"),
    ("out-j-ww", "out-j-ww2"),
    # ประตูและจุดสังเกต
    ("out-gate2", "out-j-se"),
    ("out-gate1", "out-j-ww2"), ("out-gate1", "out-j-sw"),
    ("out-gate3", "out-j-field"), ("out-j-field", "out-j-wm"), ("out-j-field", "out-j-nw"),
    ("out-flagpole", "out-j-w2"), ("out-flagpole", "out-j-c2"),
    ("out-wc-court", "out-j-c2"), ("out-wc-court", "out-j-s"),
    ("out-pool", "out-j-wm2"), ("out-pool", "out-j-ww2"),
    ("out-field", "out-j-field"), ("out-field", "out-gate3"),
]


# ==================================================================
# ตัวช่วย
# ==================================================================
def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def r2(v):
    return round(float(v), 2)


def walk_time(distance, kind):
    return max(1, int(round(distance / SPEED[kind])))


class Builder(object):
    def __init__(self):
        self.nodes = []
        self.edges = []
        self._pos = {}

    def node(self, nid, name, ntype, building, floor, x, y, desc="", source=None):
        if nid in self._pos:
            raise ValueError("duplicate node id: " + nid)
        self._pos[nid] = (r2(x), r2(y))
        self.nodes.append({
            "id": nid,
            "name": name,
            "type": ntype,
            "building": building,
            "floor": floor,
            "x": r2(x),
            "y": r2(y),
            "description": desc,
            "photo": "",
            "aliases": [],
            "source": source or TEMPLATE,
        })
        return nid

    def link(self, a, b, kind, distance=None, time=None, bidirectional=True, note=""):
        if distance is None:
            distance = dist(self._pos[a], self._pos[b])
        distance = max(1.0, distance)
        if time is None:
            time = walk_time(distance, kind if kind in SPEED else "corridor")
        e = {
            "from": a, "to": b,
            "distance": r2(distance),
            "time": int(time),
            "type": kind,
            "bidirectional": bool(bidirectional),
        }
        if note:
            e["note"] = note
        self.edges.append(e)

    def pos(self, nid):
        return self._pos[nid]


def build():
    B = Builder()
    index = {}

    # ---------- โหนดกลางแจ้ง ----------
    for nid, name, x, y, ntype, desc in OUTDOOR_NODES:
        B.node(nid, name, ntype, None, 0, x, y, desc)
    for a, b in OUTDOOR_EDGES:
        B.link(a, b, "outdoor")

    # ---------- อาคาร ----------
    for bd in BUILDINGS:
        bid = bd["id"]
        x1, y1, x2, y2 = bd["rect"]
        axis = bd["axis"]
        along_min, along_max = (x1, x2) if axis == "x" else (y1, y2)
        cross_mid = (y1 + y2) / 2.0 if axis == "x" else (x1 + x2) / 2.0
        half = ((y2 - y1) if axis == "x" else (x2 - x1)) / 2.0
        offset = max(3.0, half - 1.5)

        def place(along, cross, _axis=axis):
            return (along, cross) if _axis == "x" else (cross, along)

        margin = 7.0
        s_lo, s_hi = along_min + margin, along_max - margin
        entrances = []

        for floor in range(1, bd["floors"] + 1):
            rooms = list(ROOMS.get(bid, {}).get(floor, []))
            rooms.append(("toilet", "ห้องน้ำชาย %s ชั้น %d" % (bd["short"], floor), ""))
            rooms.append(("toilet", "ห้องน้ำหญิง %s ชั้น %d" % (bd["short"], floor), ""))

            span = s_hi - s_lo
            stations = max(2, int(math.ceil(len(rooms) / 2.0)))
            if span / float(stations - 1) > STATION_GAP * 1.6:
                stations = int(math.ceil(span / STATION_GAP)) + 1
            step = span / float(stations - 1)

            corridor_ids = []
            for i in range(stations):
                cx, cy = place(s_lo + i * step, cross_mid)
                cid = "%s-f%d-c%d" % (bid, floor, i + 1)
                B.node(cid, "ทางเดิน %s ชั้น %d จุดที่ %d" % (bd["short"], floor, i + 1),
                       "corridor", bid, floor, cx, cy)
                corridor_ids.append(cid)
            for i in range(stations - 1):
                B.link(corridor_ids[i], corridor_ids[i + 1], "corridor")

            # บันได 2 ตัว หัว-ท้ายอาคาร
            floor_stairs = {}
            for tag, along, near in (("A", along_min + 3.0, corridor_ids[0]),
                                     ("B", along_max - 3.0, corridor_ids[-1])):
                sx, sy = place(along, cross_mid)
                sid = "%s-f%d-stair%s" % (bid, floor, tag)
                B.node(sid, "บันได %s %s ชั้น %d" % (tag, bd["short"], floor),
                       "stairs", bid, floor, sx, sy,
                       "บันไดฝั่ง%sของ%s" % ("ต้น" if tag == "A" else "ท้าย", bd["name"]))
                B.link(sid, near, "corridor")
                floor_stairs[tag] = sid
            index["%s-f%d" % (bid, floor)] = {"corridor": corridor_ids, "stairs": floor_stairs}

            # ห้องต่าง ๆ
            for idx, item in enumerate(rooms):
                kind, rname = item[0], item[1]
                rdesc = item[2] if len(item) > 2 else ""
                rsource = item[3] if len(item) > 3 else TEMPLATE
                st = corridor_ids[min(idx // 2, stations - 1)]
                sp = B.pos(st)
                side = 1 if idx % 2 else -1
                nudge = 2.5 if idx % 2 else -2.5
                if axis == "x":
                    rx, ry = sp[0] + nudge, sp[1] + side * offset
                else:
                    rx, ry = sp[0] + side * offset, sp[1] + nudge
                rid = "%s-f%d-r%d" % (bid, floor, idx + 1)
                B.node(rid, rname, kind, bid, floor, rx, ry, rdesc, rsource)
                B.link(rid, st, "room")

            # ทางเข้าอาคาร (เฉพาะชั้น 1)
            if floor == 1:
                for tag in ("A", "B"):
                    along = (along_min - 4.0) if tag == "A" else (along_max + 4.0)
                    ex, ey = place(along, cross_mid)
                    eid = "%s-entrance%s" % (bid, tag)
                    B.node(eid, "ทางเข้า%s ฝั่ง %s" % (bd["name"], tag),
                           "entrance", bid, 1, ex, ey, "")
                    B.link(eid, floor_stairs[tag], "entrance")
                    entrances.append(eid)

        # บันไดระหว่างชั้น (กราฟระบุทิศทาง: ขึ้นช้ากว่าลง)
        for floor in range(1, bd["floors"]):
            for tag in ("A", "B"):
                lo = index["%s-f%d" % (bid, floor)]["stairs"][tag]
                hi = index["%s-f%d" % (bid, floor + 1)]["stairs"][tag]
                d = math.hypot(STAIR_RUN, FLOOR_HEIGHT) + STAIR_RUN
                B.link(lo, hi, "stairs_up", distance=d, bidirectional=False,
                       note="ขึ้นบันไดไปชั้น %d" % (floor + 1))
                B.link(hi, lo, "stairs_down", distance=d, bidirectional=False,
                       note="ลงบันไดไปชั้น %d" % floor)

        bd["_entrances"] = entrances

    # ---------- เชื่อมทางเข้าอาคารเข้ากับทางเดินกลางแจ้ง ----------
    outdoor = [n for n in B.nodes if n["building"] is None and n["type"] in ("junction", "gate")]
    for bd in BUILDINGS:
        for eid in bd["_entrances"]:
            ep = B.pos(eid)
            ranked = sorted(outdoor, key=lambda n: dist(ep, (n["x"], n["y"])))
            for n in ranked[:2]:
                d = dist(ep, (n["x"], n["y"]))
                if d <= 95:
                    B.link(eid, n["id"], "outdoor", distance=d)

    # ---------- ทางเชื่อมระหว่างอาคาร ----------
    def bridge(a_bid, b_bid, floor, note, limit=85):
        a = index.get("%s-f%d" % (a_bid, floor))
        b = index.get("%s-f%d" % (b_bid, floor))
        if not a or not b:
            return
        best = None
        for ida in a["stairs"].values():
            for idb in b["stairs"].values():
                d = dist(B.pos(ida), B.pos(idb))
                if best is None or d < best[0]:
                    best = (d, ida, idb)
        if best and best[0] <= limit:
            B.link(best[1], best[2], "corridor", distance=best[0], note=note)

    bridge("b5", "b2", 2, "ทางเชื่อมอาคาร 5 - อาคาร 2 ชั้น 2")
    bridge("b5", "b4", 2, "ทางเชื่อมอาคาร 5 - อาคาร 4 ชั้น 2")
    bridge("b2", "b4", 2, "ทางเชื่อมอาคาร 2 - อาคาร 4 ชั้น 2")
    bridge("b3", "b4", 2, "ทางเชื่อมอาคาร 3 - อาคาร 4 ชั้น 2")
    bridge("b1", "b3", 2, "ทางเชื่อมอาคาร 1 - อาคาร 3 ชั้น 2")
    bridge("bad", "b2", 2, "ทางเชื่อมอาคารอำนวยการ - อาคาร 2 ชั้น 2")

    # ---------- ลิฟต์ อาคารเฉลิมพระเกียรติ ----------
    prev = None
    for floor in range(1, 6):
        near = index["bcp-f%d" % floor]["corridor"][0]
        p = B.pos(near)
        eid = "bcp-f%d-lift" % floor
        B.node(eid, "ลิฟต์อาคารเฉลิมพระเกียรติ ชั้น %d" % floor, "elevator",
               "bcp", floor, p[0] + 4.0, p[1] + 3.0,
               "ลิฟต์สำหรับผู้ที่เดินขึ้นบันไดไม่สะดวก")
        B.link(eid, near, "corridor")
        if prev:
            B.link(prev, eid, "elevator", distance=FLOOR_HEIGHT, time=28,
                   note="ลิฟต์ (รวมเวลารอโดยประมาณ)")
        prev = eid

    return B


def main():
    force = "--force" in sys.argv
    if not os.path.isdir(DATA):
        os.makedirs(DATA)

    targets = ["nodes.json", "edges.json", "buildings.json"]
    existing = [t for t in targets if os.path.exists(os.path.join(DATA, t))]
    if existing and not force:
        print("พบไฟล์เดิมอยู่แล้ว: %s" % ", ".join(existing))
        print("ถ้าต้องการเขียนทับให้รันด้วย  python tools/generate_data.py --force")
        return 1

    B = build()

    buildings = {
        "meta": {
            "school": "โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)",
            "unit": "meter",
            "note": "พิกัดเป็นผังจำลองมองจากด้านบน อ้างอิงตำแหน่งสัมพัทธ์จากภาพแผนผังสนามสอบแบบ isometric",
            "extent": [0, 0, 320, 232],
        },
        "buildings": [{
            "id": b["id"], "name": b["name"], "shortName": b["short"],
            "floors": list(range(1, b["floors"] + 1)),
            "color": b["color"], "rect": b["rect"], "axis": b["axis"],
            "description": b["desc"], "photo": "",
        } for b in BUILDINGS],
        "areas": [dict(a) for a in AREAS],
    }

    def dump(name, obj):
        p = os.path.join(DATA, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        print("เขียน %s (%d bytes)" % (p, os.path.getsize(p)))

    dump("buildings.json", buildings)
    dump("nodes.json", {"version": "1.0", "nodes": B.nodes})
    dump("edges.json", {"version": "1.0", "edges": B.edges})
    print("\nสรุป: โหนด %d จุด, เส้นเชื่อม %d เส้น" % (len(B.nodes), len(B.edges)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
