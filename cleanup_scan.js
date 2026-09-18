const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Test users
  const testUsers = await p.user.findMany({
    where: { OR: [
      { email: { contains: '-test@' } },
      { email: { startsWith: 'eng-test' } },
      { email: { startsWith: 'pm-test' } },
      { email: { startsWith: 'pur-test' } },
    ]},
    select: { id: true, email: true, name: true }
  });
  console.log('=== TEST USERS ===');
  testUsers.forEach(u => console.log('  ' + u.email + ' (' + u.name + ') id=' + u.id));
  console.log('  TOTAL:', testUsers.length);

  // BomItems (all of them — user mentioned leftover from DEC-063)
  const bomItems = await p.bomItem.findMany({
    include: {
      project: { select: { name: true } },
      submittedByUser: { select: { email: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log('\n=== BOM ITEMS ===');
  bomItems.forEach(b => {
    console.log('  [' + b.status + '] ' + b.name + ' qty=' + b.quantity + ' ' + b.unit + ' (project: ' + b.project.name + ', by: ' + b.submittedByUser.email + ') id=' + b.id);
  });
  console.log('  TOTAL:', bomItems.length);

  // Kasbon submissions (check for leftover test data)
  const kasbon = await p.kasbonSubmission.count();
  console.log('\n=== KASBON SUBMISSIONS ===');
  console.log('  TOTAL:', kasbon);

  // Notifications
  const notifs = await p.notification.count();
  console.log('\n=== NOTIFICATIONS ===');
  console.log('  TOTAL:', notifs);

  p.$disconnect();
}

main().catch(e => { console.error(e.message); p.$disconnect(); });
