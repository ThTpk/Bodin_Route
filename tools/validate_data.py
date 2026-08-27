# -*- coding: utf-8 -*-
"""
validate_data.py
------------------------------------------------------------------
ตรวจสอบความถูกต้องของ data/nodes.json และ data/edges.json

    python tools/validate_data.py

ตรวจ:
  1. id ของโหนดซ้ำกันหรือไม่
  2. edge อ้างถึงโหนดที่ไม่มีอยู่หรือไม่
  3. ค่า distance / time เป็นจำนวนบวกหรือไม่
  4. กราฟเชื่อมต่อกันทั้งหมดหรือไม่ (มีโหนดที่เดินไปไม่ถึงไหม)
  5. โหนดที่ไม่มี edge เชื่อมเลย
------------------------------------------------------------------
รันสคริปต์นี้ทุกครั้งหลังแก้ไฟล์ JSON ด้วยมือ
"""

import collections
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

VALID_EDGE_TYPES = {
    "corridor", "outdoor", "room", "entrance", "ramp",
    "stairs_up", "stairs_down", "stairs", "elevator",
}


def load(name):
    with open(os.path.join(DATA, name), "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    errors, warnings = [], []

    nodes = load("nodes.json")["nodes"]
    edges = load("edges.json")["edges"]

    # 1) id ซ้ำ
    seen = {}
    for n in nodes:
        if n["id"] in seen:
            errors.append("โหนด id ซ้ำ: %s" % n["id"])
        seen[n["id"]] = n
        for key in ("name", "type", "x", "y"):
            if key not in n:
                errors.append("โหนด %s ขาดฟิลด์ '%s'" % (n["id"], key))

    # 2) 3) edge
    adj = collections.defaultdict(set)
    for i, e in enumerate(edges):
        for side in ("from", "to"):
            if e.get(side) not in seen:
                errors.append("edge[%d] อ้างถึงโหนดที่ไม่มีอยู่: %s" % (i, e.get(side)))
        if not isinstance(e.get("distance"), (int, float)) or e["distance"] <= 0:
            errors.append("edge[%d] (%s -> %s) distance ไม่ถูกต้อง: %r"
                          % (i, e.get("from"), e.get("to"), e.get("distance")))
        if "time" in e and (not isinstance(e["time"], (int, float)) or e["time"] <= 0):
            errors.append("edge[%d] (%s -> %s) time ไม่ถูกต้อง: %r"
                          % (i, e.get("from"), e.get("to"), e.get("time")))
        if e.get("type") not in VALID_EDGE_TYPES:
            warnings.append("edge[%d] type ไม่รู้จัก: %r" % (i, e.get("type")))
        if e.get("from") in seen and e.get("to") in seen:
            adj[e["from"]].add(e["to"])
            if e.get("bidirectional", True):
                adj[e["to"]].add(e["from"])

    # 5) โหนดโดดเดี่ยว
    touched = set()
    for e in edges:
        touched.add(e.get("from"))
        touched.add(e.get("to"))
    for n in nodes:
        if n["id"] not in touched:
            warnings.append("โหนด %s (%s) ไม่มีเส้นเชื่อมเลย" % (n["id"], n["name"]))

    # 4) ความเชื่อมต่อ (BFS จากประตู 2)
    start = "out-gate2" if "out-gate2" in seen else (nodes[0]["id"] if nodes else None)
    if start:
        q = collections.deque([start])
        vis = {start}
        while q:
            cur = q.popleft()
            for nxt in adj[cur]:
                if nxt not in vis:
                    vis.add(nxt)
                    q.append(nxt)
        unreachable = [n for n in nodes if n["id"] not in vis]
        if unreachable:
            errors.append("มี %d โหนดที่เดินไปไม่ถึงจาก '%s'" % (len(unreachable), seen[start]["name"]))
            for n in unreachable[:15]:
                errors.append("    - %s (%s)" % (n["id"], n["name"]))
            if len(unreachable) > 15:
                errors.append("    ... และอีก %d โหนด" % (len(unreachable) - 15))

    # สรุป
    by_type = collections.Counter(n["type"] for n in nodes)
    print("โหนดทั้งหมด : %d" % len(nodes))
    print("เส้นเชื่อม   : %d" % len(edges))
    print("แยกตามชนิด  :")
    for t, c in by_type.most_common():
        print("    %-14s %d" % (t, c))
    print("")

    for w in warnings:
        print("[เตือน] %s" % w)
    for e in errors:
        print("[ผิดพลาด] %s" % e)

    if errors:
        print("\nไม่ผ่านการตรวจสอบ (%d ข้อผิดพลาด)" % len(errors))
        return 1
    print("ผ่านการตรวจสอบทั้งหมด%s" % (" (มีคำเตือน %d ข้อ)" % len(warnings) if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
