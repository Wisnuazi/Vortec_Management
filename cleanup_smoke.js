const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Find all smoke/legacy items in BOM
  const items = await p.bomItem.findMany({
    where: {
      OR: [
        { name: { contains: 'smoke', mode: 'insensitive' } },
        { name: { contains: 'smoke test', mode: 'insensitive' } },
        { name: { contains: 'DEC-0' } },
        { name: 'Smoke MBOM item' },
      ]
    },
    include: { submittedByUser: { select: { email: true } }, project: { select: { name: true } } }
  });
  console.log('=== BOM ITEMS TO DELETE ===');
  items.forEach(b => console.log('  [' + b.status + '] ' + b.name + ' (by ' + b.submittedByUser.email + ' in ' + b.project.name + ')'));
  console.log('  TOTAL:', items.length);

  for (const b of items) {
    await p.bomItem.delete({ where: { id: b.id } });
    console.log('  DELETED: ' + b.name);
  }

  // Verify
  const remaining = await p.bomItem.count();
  console.log('\nRemaining BOM items:', remaining);
  if (remaining > 0) {
    const rest = await p.bomItem.findMany({
      include: { submittedByUser: { select: { email: true } } }
    });
    rest.forEach(b => console.log('  [' + b.status + '] ' + b.name + ' (by ' + b.submittedByUser.email + ')'));
  }

  p.$disconnect();
}

main().catch(e => { console.error(e.message); p.$disconnect(); process.exit(1); });
