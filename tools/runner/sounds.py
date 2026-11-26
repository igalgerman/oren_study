"""Herdr sound settings (#27): blocked (needs you) and done sound different.
Owner's pick (26 Nov 2026): blocked = a short double beep (tools/herdr/sounds/blocked.mp3), done = one soft chime (done.mp3).
Herdr reads [ui.sound] from %APPDATA%\\herdr\\config.toml (HERDR_CONFIG_PATH wins); request_path = the 'needs input' sound,
done_path = the 'agent finished' sound; mp3 only. recover.py calls apply() at every start (idempotent).
Usage: python sounds.py   (writes the setting and prints the config path)

The two files were made with ffmpeg:
  blocked: two 0.12 s 880 Hz beeps, 0.09 s apart, volume 0.6
  done:    1047 + 1568 Hz (C6 + G6), 1.2 s, exponential fade out, volume 0.5"""
import os, re, sys
from pathlib import Path

SOUNDS = Path(__file__).resolve().parents[1] / "herdr" / "sounds"
KEYS = {"enabled": "true",
        "request_path": f'"{(SOUNDS / "blocked.mp3").as_posix()}"',
        "done_path": f'"{(SOUNDS / "done.mp3").as_posix()}"'}

def config_path(env=os.environ):
    if env.get("HERDR_CONFIG_PATH"): return Path(env["HERDR_CONFIG_PATH"])
    base = env.get("APPDATA") or str(Path.home() / ".config")
    return Path(base) / "herdr" / "config.toml"

def merged(text):
    """`text` with [ui.sound] holding KEYS (other keys and tables kept)."""
    lines = text.splitlines()
    head = next((i for i, l in enumerate(lines) if l.strip() == "[ui.sound]"), None)
    new = [f"{k} = {v}" for k, v in KEYS.items()]
    if head is None:
        return (text.rstrip("\n") + "\n\n" if text.strip() else "") + "[ui.sound]\n" + "\n".join(new) + "\n"
    end = next((i for i in range(head + 1, len(lines)) if lines[i].lstrip().startswith("[")), len(lines))
    keep = [l for l in lines[head + 1:end] if not re.match(r"\s*(%s)\s*=" % "|".join(KEYS), l)]
    while keep and not keep[-1].strip(): keep.pop()
    body = lines[:head + 1] + new + keep + ([""] if end < len(lines) else []) + lines[end:]
    return "\n".join(body) + "\n"

def apply(path=None):
    """Write the sound setting into herdr's config. True when the file changed."""
    path = Path(path) if path else config_path()
    old = path.read_text(encoding="utf-8") if path.exists() else ""
    new = merged(old)
    if new == old: return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(new, encoding="utf-8")
    return True

if __name__ == "__main__":
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else config_path()
    print(("updated " if apply(p) else "already set ") + str(p))
