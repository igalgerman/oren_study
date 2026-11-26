# Run a command with no console window: python(w) quiet.py <argv...>. Used by the herdr panel mod (pythonw has no console).
import os, subprocess, sys

def _write(fd, stream, data):
    if not data: return
    if stream is not None and hasattr(stream, "buffer"):
        stream.buffer.write(data); stream.buffer.flush()
    else:
        try: os.write(fd, data)
        except OSError: pass

def main(argv):
    if not argv: return 2
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        p = subprocess.run(argv, capture_output=True, stdin=subprocess.DEVNULL, creationflags=flags)
    except OSError as e:
        _write(2, sys.stderr, f"quiet.py: {e}\n".encode()); return 127
    _write(1, sys.stdout, p.stdout); _write(2, sys.stderr, p.stderr)
    return p.returncode

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
