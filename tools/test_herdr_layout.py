# python tools/test_herdr_layout.py
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import herdr_layout as h
L = h.build_layout("t1", "t2")
json.dumps(L)
ids = {}
def walk(n):
    assert n["id"] not in ids, "duplicate id " + n["id"]; ids[n["id"]] = n
    for c in n.get("children", []): walk(c)
walk(L)
top = ids["top"]
assert top["type"] == "row" and [c["id"] for c in top["children"]] == ["orchestrator", "inbox"]  # orchestrator left, inbox right
assert ids["orchestrator"]["content"] == {"terminal": "t1"} and ids["inbox"]["content"] == {"terminal": "t2"}
assert L["type"] == "column" and [c["id"] for c in L["children"]] == ["top", "tabs", "workers"]  # worker tabs below
assert ids["workers"]["content"]["tab"] == "active"
print("ok")
