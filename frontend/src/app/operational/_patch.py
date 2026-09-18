"""Replace the old kasbon section + old export default in operational/page.tsx
with the new model from _new_kasbon.txt. Lines 437..end (1-indexed)
become the new content.
"""
import io
import sys

SRC = r"D:/Internal Vortec/Vortec Management/frontend/src/app/operational/page.tsx"
NEW = r"D:/Internal Vortec/Vortec Management/frontend/src/app/operational/_new_kasbon.txt"

with io.open(SRC, "r", encoding="utf-8") as f:
    lines = f.read().split("\n")

with io.open(NEW, "r", encoding="utf-8") as f:
    new_content = f.read()

# Find the line index of the marker
KEEP_UNTIL = "// --- Kasbon (per phase) ------------------------------------------------------"
idx = None
for i, line in enumerate(lines):
    if line.startswith(KEEP_UNTIL):
        idx = i
        break
if idx is None:
    sys.exit("Marker not found")

# Replace from idx (inclusive) to end with new content.
new_lines = lines[:idx] + new_content.split("\n")
with io.open(SRC, "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines))
print(f"OK, file now {len(new_lines)} lines")
