const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Count unread notifications per user
  const users = await p.user.findMany({ select: { id: true, email: true, name: true } });
  for (const u of users) {
    const unread = await p.notification.count({ where: { userId: u.id, readAt: null } });
    if (unread > 0) {
      console.log(`User ${u.email} (${u.name}): ${unread} unread`);
    }
  }

  // Show all recent notifications (last 10)
  const recent = await p.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, userId: true, kind: true, message: true,
      entityType: true, entityId: true,
      readAt: true, createdAt: true
    }
  });
  console.log('\nRecent notifications:');
  recent.forEach(n => {
    console.log(`  [${n.createdAt.toISOString()}] ${n.kind} -> user:${n.userId} | ${n.message.substring(0,60)} | readAt:${n.readAt}`);
  });

  p.$disconnect();
}

main().catch(e => { console.error(e.message); p.$disconnect(); });
