"""#310: the Hebrew page opens in the owner's browser even from a background window: on Windows os.startfile (the shell's
default browser), else webbrowser.open; a failed open falls back to the other. Run: python3 tools/ask/test/browser_test.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import ask

calls = []
ask.webbrowser.open = lambda u: (calls.append(("wb", u)), True)[1]
ask.os.startfile = lambda u: calls.append(("start", u))
assert ask.open_browser("http://x/", win=True) and calls == [("start", "http://x/")], calls
calls.clear()
def bad(u): raise OSError("no shell")
ask.os.startfile = bad
assert ask.open_browser("http://x/", win=True) and calls == [("wb", "http://x/")], calls
calls.clear()
assert ask.open_browser("http://y/", win=False) and calls == [("wb", "http://y/")], calls
ask.webbrowser.open = lambda u: False
assert not ask.open_browser("http://y/", win=False)
print("ok ask browser opens")
