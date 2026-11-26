# Tests for the herdr sound settings (#27): python tools/runner/test_sounds.py
import os, sys, tempfile
os.environ["OREN_TEST"] = "1"   # #325 guard: set before importing runner modules
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sounds as S

# the two sound files exist, are mp3 and are different (blocked = short double beep, done = one soft chime)
b, d = S.SOUNDS / "blocked.mp3", S.SOUNDS / "done.mp3"
for f in (b, d):
    data = f.read_bytes()
    assert data[:3] == b"ID3" or data[0] == 0xFF, f
    assert 1000 < len(data) < 60000, (f, len(data))
assert b.read_bytes() != d.read_bytes()

# no config yet: [ui.sound] is written with herdr's keys (request = blocked/needs you, done = finished)
with tempfile.TemporaryDirectory() as t:
    cfg = Path(t) / "herdr" / "config.toml"
    assert S.apply(cfg) is True
    text = cfg.read_text()
    assert "[ui.sound]" in text and "enabled = true" in text, text
    assert f'request_path = "{b.as_posix()}"' in text, text
    assert f'done_path = "{d.as_posix()}"' in text, text
    assert S.apply(cfg) is False and cfg.read_text() == text          # idempotent: nothing changes the second time

# an existing config: other sections and other [ui.sound] keys stay; our two paths replace old ones, no duplicates
with tempfile.TemporaryDirectory() as t:
    cfg = Path(t) / "config.toml"
    cfg.write_text('[ui]\nmouse_capture = true\n\n[ui.sound]\nenabled = false\ndone_path = "old.mp3"\n\n'
                   '[ui.sound.agents]\nclaude = "on"\n\n[keys]\nnew_tab = "ctrl+t"\n')
    assert S.apply(cfg) is True
    text = cfg.read_text()
    assert "mouse_capture = true" in text and 'claude = "on"' in text and 'new_tab = "ctrl+t"' in text, text
    assert "old.mp3" not in text and text.count("done_path") == 1 and text.count("request_path") == 1, text
    assert text.count("[ui.sound]") == 1 and "enabled = true" in text and "enabled = false" not in text, text
    assert S.apply(cfg) is False                                              # idempotent here too
    sec = text.split("[ui.sound]\n", 1)[1].split("\n[", 1)[0]
    assert "request_path" in sec and "done_path" in sec, sec                  # inside [ui.sound], not in another table

# a header with a trailing comment is the same table (no second [ui.sound], which would be invalid TOML)
with tempfile.TemporaryDirectory() as t:
    cfg = Path(t) / "config.toml"
    cfg.write_text('[ui.sound]  # mine\nenabled = false\n')
    S.apply(cfg); text = cfg.read_text()
    assert text.count("[ui.sound]") == 1 and "enabled = false" not in text and "done_path" in text, text

# where herdr reads its config on Windows: %APPDATA%\herdr\config.toml (HERDR_CONFIG_PATH wins)
assert S.config_path({"APPDATA": "C:/Users/x/AppData/Roaming"}) == Path("C:/Users/x/AppData/Roaming/herdr/config.toml")
assert S.config_path({"HERDR_CONFIG_PATH": "D:/h.toml", "APPDATA": "C:/a"}) == Path("D:/h.toml")
print("test_sounds: ok")
