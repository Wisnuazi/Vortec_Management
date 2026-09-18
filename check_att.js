const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
// Find the most recent attachment
p.attachment.findMany({ orderBy: { createdAt: 'desc' }, take: 3 })
  .then(rows => {
    rows.forEach(r => {
      console.log('id:', r.id, 'diskPath:', r.diskPath, 'kind:', r.kind, 'fileName:', r.fileName);
    });
    p.$disconnect();
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    p.$disconnect();
  });
