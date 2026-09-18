const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.attachment.deleteMany({
  where: { id: { in: ['cmtye3lx40007mw01nxiik8pl'] } }
})
  .then(r => {
    console.log('Deleted bad attachment, count:', r.count);
    p.$disconnect();
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    p.$disconnect();
  });
