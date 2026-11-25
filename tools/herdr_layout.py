"""Herdr layout 'oren': orchestrator pane left, inbox pane right, worker tabs below.
Run by tools/orchestrator.cmd: python tools/herdr_layout.py  (starts the two terminals if needed, writes the layout, switches to it)."""
import json, os, subprocess, sys

HC = r"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe"
HERDR_APP = r"C:\Users\97254\AppData\Local\Programs\herdr-app\herdr-app.exe"
HOME = os.path.expanduser("~/.config/herdr-app")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def build_layout(orch, inbox):
    """orch / inbox = herdr terminal addresses (e.g. 't2p'). Top row: orchestrator | inbox. Below: tab bar + the active worker tab."""
    return {
        "id": "root", "type": "column", "gap": 6, "padding": [6, 6],
        "children": [
            {"id": "top", "type": "row", "size": {"weight": 3}, "gap": 6, "children": [
                {"id": "orchestrator", "type": "block", "size": {"weight": 3}, "content": {"terminal": orch}},
                {"id": "inbox", "type": "block", "size": {"weight": 2}, "content": {"terminal": inbox}},
            ]},
            {"id": "tabs", "type": "block", "size": {"px": 30}, "content": {"mod": "tabs"}},
            {"id": "workers", "type": "block", "size": {"weight": 2}, "content": {"tab": "active", "pane": {"gap": 6, "radius": 6}}},
        ],
    }


def live_terminals():
    out = subprocess.run([HC, "ls"], capture_output=True, text=True).stdout
    return {t["name"]: t["address"] for t in json.loads(out)["terminals"] if t.get("name") and t.get("state") == "live"}


def ensure(name, argv, have):
    if name in have:
        return have[name]
    subprocess.run([HC, "run", "--bg", "--no-parent", "--outlive-parent", "--name", name, "--cwd", REPO] + argv, check=True)
    return live_terminals()[name]


def main():
    have = live_terminals()
    prompt = open(os.path.join(REPO, "tools", "inbox-prompt.txt"), encoding="utf-8").read().strip()
    orch = ensure("orchestrator", ["claude", "--plugin-dir", os.path.join(REPO, "tools", "mods", "oren-lanes"),
                  "Read ORCHESTRATOR.md and continue as the orchestrator. Open the Oren lanes panel (/lanes)."], have)
    inbox = ensure("inbox", ["claude", prompt], have)
    os.makedirs(os.path.join(HOME, "layouts"), exist_ok=True)
    with open(os.path.join(HOME, "layouts", "oren.json"), "w", encoding="utf-8") as f:
        json.dump(build_layout(orch, inbox), f, indent=2)
    subprocess.run([HERDR_APP, "do", "layout.switch", json.dumps({"name": "oren"})])


if __name__ == "__main__":
    main()
