// One-shot verification script — kept for future "did the migration run?"
// smoke-tests. Safe to re-run; read-only.
const cp = require("child_process");
const verifyQuery = 'SELECT id, title, status, note FROM "Task" ORDER BY "createdAt" LIMIT 3;';
try {
  const out = cp.execSync(
    `docker exec vortec-management-postgres psql -U vortec -d vortec_management -t -A -c ${JSON.stringify(verifyQuery)}`,
    { encoding: "utf-8" }
  );
  console.log("=== TASK ROWS (id | title | status | note) ===");
  console.log(out);
} catch (err) {
  console.error("verify error:", err.message);
}
