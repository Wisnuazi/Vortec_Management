const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.attachment.findFirst()
  .then(a => {
    console.log('diskPath column:', a ? a.diskPath : 'no rows');
    p.$disconnect();
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    p.$disconnect();
  });
