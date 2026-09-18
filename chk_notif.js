const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const total = await p.notification.count();
  console.log('total notifications:', total);

  if (total > 0) {
    const users = await p.user.findMany({ select: { id: true, email: true, name: true } });
    for (const u of users) {
      const unread = await p.notification.count({ where: { userId: u.id, readAt: null } });
      if (unread > 0) {
        console.log('UNREAD: ' + u.email + ' (' + u.name + '): ' + unread);
      }
    }

    const recent = await p.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, userId: true, type: true, title: true, readAt: true, createdAt: true }
    });
    console.log('\nRecent:');
    recent.forEach(function(n) {
      console.log('  [' + n.createdAt.toISOString() + '] ' + n.type + ' | ' + (n.title || '').substring(0, 60) + ' | read:' + (n.readAt ? 'YES' : 'NULL'));
    });
  }

  p.$disconnect();
}

main().catch(function(e) { console.error(e.message); p.$disconnect(); });
