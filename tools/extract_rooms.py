# -*- coding: utf-8 -*-
"""
extract_rooms.py
------------------------------------------------------------------
อ่านตารางเรียน ม.1-ม.6 (ไฟล์ m*.pdf ใน ref_data/) แล้วสรุปว่า
อาคารไหน ชั้นไหน มีห้องอะไรที่ใช้ในการเรียนการสอนบ้าง

    python tools/extract_rooms.py     # เขียน ref_data/rooms_from_schedule.json

รหัสห้องในตารางเรียนเป็นเลขสี่หลัก BFRR
    B  = รหัสอาคาร (1-5, 7 ตรงกับคีย์ code ของอาคารใน generate_data.py)
    F  = ชั้น (1-4)
    RR = ลำดับห้องตามแนวทางเดินของชั้นนั้น

ไฟล์ผลลัพธ์เอาไปใช้ที่ตาราง WINGS ใน tools/generate_data.py
ต้องมี pypdf (pip install pypdf)
"""

import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import pypdf
except ImportError:
    sys.exit("ต้องติดตั้ง pypdf ก่อน: pip install pypdf")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "ref_data")
OUT = os.path.join(REF, "rooms_from_schedule.json")

# ตารางเรียนหนึ่งไฟล์ต่อหนึ่งระดับชั้น
SOURCES = ["m . 1.pdf", "m .2.pdf", "m . 3.pdf", "m . 4.pdf",
           "m . 5.pdf", "m . 6.pdf"]

ROOM_RE = re.compile(r"(?<![0-9])([1-9])([1-4])([0-9]{2})(?![0-9])")
YEAR_RE = re.compile(r"25[0-9]{2}")          # พ.ศ. ในหัว/ท้ายตาราง ไม่ใช่รหัสห้อง
HOMEROOM_RE = re.compile(r"ม\.\s*([1-6])/([0-9]+)\D{0,40}?([1-9][1-4][0-9]{2})")


def read_text(path):
    reader = pypdf.PdfReader(path)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def main():
    rooms = {}        # (อาคาร, ชั้น) -> {ห้อง: จำนวนคาบที่พบ}
    homerooms = {}    # "ม.1/1" -> "5401"
    seen = []

    for name in SOURCES:
        path = os.path.join(REF, name)
        if not os.path.exists(path):
            print("ข้าม (ไม่พบไฟล์):", name)
            continue
        text = read_text(path)
        seen.append(name)

        for m in ROOM_RE.finditer(text):
            if YEAR_RE.fullmatch(m.group(0)):
                continue
            key = (m.group(1), int(m.group(2)))
            rooms.setdefault(key, {})
            room = int(m.group(3))
            rooms[key][room] = rooms[key].get(room, 0) + 1

        for m in HOMEROOM_RE.finditer(re.sub(r"\s+", " ", text)):
            homerooms["ม.%s/%s" % (m.group(1), m.group(2))] = m.group(3)

    out = {
        "source": "ตารางเรียน ม.1-ม.6 ภาคเรียนที่ 2/2569 ใน ref_data/ " + ", ".join(seen),
        "note": "รหัสห้องสี่หลัก = อาคาร+ชั้น+ลำดับห้อง นับเฉพาะห้องที่ปรากฏในตารางเรียน "
                "สร้างด้วย python tools/extract_rooms.py อย่าแก้ไฟล์นี้ด้วยมือ",
        "buildings": {},
        "homerooms": dict(sorted(homerooms.items(),
                                 key=lambda kv: [int(n) for n in kv[0][2:].split("/")])),
    }

    for code in sorted({b for b, _f in rooms}):
        floors = {}
        for (b, f), hits in sorted(rooms.items()):
            if b != code:
                continue
            floors[str(f)] = {
                "rooms": sorted(hits),
                "periods": {str(r): hits[r] for r in sorted(hits)},
            }
        out["buildings"][code] = {
            "floors": floors,
            "maxRoom": max(r for (b, _f), hits in rooms.items() if b == code for r in hits),
        }

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)

    print("เขียน", os.path.relpath(OUT, ROOT))
    for code, info in out["buildings"].items():
        print("  อาคาร %s (ห้องสูงสุด %2d)" % (code, info["maxRoom"]))
        for f, d in info["floors"].items():
            print("     ชั้น %s: %2d ห้อง  %s"
                  % (f, len(d["rooms"]), " ".join("%02d" % r for r in d["rooms"])))
    print("  ห้องเรียนประจำ %d ห้องเรียน" % len(out["homerooms"]))


if __name__ == "__main__":
    main()
