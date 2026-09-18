cd /app/.next
for f in $(find . -name "*.js" -exec grep -l "basicUsers" {} \; 2>/dev/null); do
  if grep -q "basicUsers.length\|basicUsers.filter" "$f"; then
    echo "=== $f ==="
    grep -o "basicUsers.length\|basicUsers.filter((.)=>.\{0,80\})" "$f" | head -5
    echo "---"
  fi
done