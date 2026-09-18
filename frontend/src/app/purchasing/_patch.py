"""Remove the dead VendorForm + VendorRow from the purchasing page since
the vendors tab is now a top-level menu (DEC-062)."""
import io
import sys

SRC = r"D:/Internal Vortec/Vortec Management/frontend/src/app/purchasing/page.tsx"
START = "function VendorForm("
END = "}\n\ntype Tab = \"queue\" | \"bom\";"

with io.open(SRC, "r", encoding="utf-8") as f:
    src = f.read()

start_idx = src.find(START)
if start_idx == -1:
    sys.exit("start marker not found")
end_idx = src.find(END, start_idx)
if end_idx == -1:
    sys.exit("end marker not found")

new_src = src[:start_idx] + src[end_idx:]
with io.open(SRC, "w", encoding="utf-8") as f:
    f.write(new_src)
print(f"Removed {end_idx - start_idx} chars, file now {len(new_src)} chars")
