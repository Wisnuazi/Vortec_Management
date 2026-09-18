const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const TEST_EMAILS = [
  'eng-test@vortecsystem.com',
  'pm-test@vortecsystem.com',
  'pur-test@vortecsystem.com',
  'ol-test@vortecsystem.com'
];
const ARYO_GARBAGE_NAMES = ['sad', 'ewq', 'qwee', 'qwe'];

async function main() {
  const testUsers = await p.user.findMany({
    where: { email: { in: TEST_EMAILS } },
    select: { id: true, email: true, name: true }
  });

  console.log('=== TEST USERS TO DELETE ===');
  testUsers.forEach(u => console.log('  ' + u.email + ' id=' + u.id));

  // Inventory of related data per test user
  console.log('\n=== RELATED DATA (per test user) ===');
  let totalRelated = { userRoles: 0, notifications: 0, kasbonSubmissions: 0, materialRequests: 0, bomItems: 0, dailyReports: 0, tasks: 0, attachments: 0, activityLogs: 0 };
  for (const u of testUsers) {
    const [ur, nf, ks, mr, bi, dr, tk, at, al] = await Promise.all([
      p.userRole.count({ where: { userId: u.id } }),
      p.notification.count({ where: { userId: u.id } }),
      p.kasbonSubmission.count({ where: { submittedByUserId: u.id } }),
      p.materialRequest.count({ where: { requestedByUserId: u.id } }),
      p.bomItem.count({ where: { submittedByUserId: u.id } }),
      p.dailyReport.count({ where: { userId: u.id } }),
      p.attachment.count({ where: { uploadedByUserId: u.id } }),
      p.activityLog.count({ where: { userId: u.id } }),
    ]);
    console.log('  ' + u.email + ': UserRoles=' + ur + ' Notifs=' + nf + ' Kasbon=' + ks + ' MaterialReq=' + mr + ' BOM=' + bi + ' DailyReports=' + dr + ' Attachments=' + at + ' ActivityLogs=' + al);
    totalRelated.userRoles += ur;
    totalRelated.notifications += nf;
    totalRelated.kasbonSubmissions += ks;
    totalRelated.materialRequests += mr;
    totalRelated.bomItems += bi;
    totalRelated.dailyReports += dr;
    totalRelated.attachments += at;
    totalRelated.activityLogs += al;
  }
  console.log('  TOTAL: ' + JSON.stringify(totalRelated));

  // Aryo garbage items
  const aryoItems = await p.bomItem.findMany({
    where: { name: { in: ARYO_GARBAGE_NAMES }, submittedByUser: { email: 'aryo@vortecsystem.com' } },
    select: { id: true, name: true, status: true }
  });
  console.log('\n=== ARYO GARBAGE BOM ITEMS TO DELETE ===');
  aryoItems.forEach(b => console.log('  [' + b.status + '] ' + b.name + ' id=' + b.id));
  console.log('  TOTAL:', aryoItems.length);

  console.log('\n=== STARTING CASCADE DELETE ===\n');

  // === PASS 1: Test user data ===
  console.log('[1] Deleting test user-related data...');
  for (const u of testUsers) {
    // Order matters — delete dependents before parent
    await p.activityLog.deleteMany({ where: { userId: u.id } });
    await p.notification.deleteMany({ where: { userId: u.id } });
    await p.userRole.deleteMany({ where: { userId: u.id } });

    // Reassign Kasbon submissions to the system user or delete (no FK to test users we keep)
    // Delete test user-created kasbon submissions
    const ksubs = await p.kasbonSubmission.findMany({ where: { submittedByUserId: u.id }, select: { id: true } });
    for (const k of ksubs) {
      // Delete items under the submission first
      await p.kasbonItem.deleteMany({ where: { submissionId: k.id } });
    }
    await p.kasbonSubmission.deleteMany({ where: { submittedByUserId: u.id } });

    // Material requests by test users: delete items + attachments
    const mrs = await p.materialRequest.findMany({ where: { requestedByUserId: u.id }, select: { id: true } });
    for (const m of mrs) {
      await p.materialRequestItem.deleteMany({ where: { materialRequestId: m.id } });
      const mAtts = await p.attachment.findMany({ where: { materialRequestId: m.id }, select: { id: true, diskPath: true } });
      for (const a of mAtts) {
        if (a.diskPath) {
          try { require('fs').unlinkSync(a.diskPath); } catch(e) {}
        }
      }
      await p.attachment.deleteMany({ where: { materialRequestId: m.id } });
    }
    await p.materialRequest.deleteMany({ where: { requestedByUserId: u.id } });

    // BOM items: detach submittedByUserId to null then... actually delete them since they are test items
    const testBomItems = await p.bomItem.findMany({ where: { submittedByUserId: u.id }, select: { id: true } });
    for (const b of testBomItems) {
      await p.bomItem.delete({ where: { id: b.id } });
    }

    // Tasks don't have createdByUserId — skip this section.

    // Daily reports by test users
    const testReports = await p.dailyReport.findMany({ where: { userId: u.id }, select: { id: true } });
    for (const r of testReports) {
      const rAtts = await p.attachment.findMany({ where: { dailyReportId: r.id }, select: { id: true, diskPath: true } });
      for (const a of rAtts) {
        if (a.diskPath) {
          try { require('fs').unlinkSync(a.diskPath); } catch(e) {}
        }
      }
      await p.attachment.deleteMany({ where: { dailyReportId: r.id } });
    }
    await p.dailyReport.deleteMany({ where: { userId: u.id } });

    // Standalone attachments uploaded by test users
    const standAloneAtts = await p.attachment.findMany({ where: { uploadedByUserId: u.id }, select: { id: true, diskPath: true } });
    for (const a of standAloneAtts) {
      if (a.diskPath) {
        try { require('fs').unlinkSync(a.diskPath); } catch(e) {}
      }
    }
    await p.attachment.deleteMany({ where: { uploadedByUserId: u.id } });

    // Finally, delete the user
    await p.user.delete({ where: { id: u.id } });
    console.log('  DELETED: ' + u.email);
  }

  // === PASS 2: Aryo garbage items ===
  console.log('\n[2] Deleting aryo garbage BOM items...');
  for (const b of aryoItems) {
    // BomItems don't have a direct attachment relation (attachments are on
    // Task/Document/MaterialRequest, not BOM items). Just delete the row.
    await p.bomItem.delete({ where: { id: b.id } });
    console.log('  DELETED: ' + b.name);
  }

  // === Verify ===
  console.log('\n=== VERIFICATION ===');
  const remainingTest = await p.user.count({ where: { email: { in: TEST_EMAILS } } });
  const remainingBom = await p.bomItem.count({ where: { name: { in: ARYO_GARBAGE_NAMES } } });
  console.log('  Remaining test users: ' + remainingTest);
  console.log('  Remaining aryo garbage BOM: ' + remainingBom);

  // Show final BOM items
  const finalBom = await p.bomItem.findMany({
    include: {
      project: { select: { name: true } },
      submittedByUser: { select: { email: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log('\n=== FINAL BOM ITEMS ===');
  if (finalBom.length === 0) {
    console.log('  (none)');
  } else {
    finalBom.forEach(b => console.log('  [' + b.status + '] ' + b.name + ' (by ' + b.submittedByUser.email + ')'));
  }

  p.$disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); p.$disconnect(); process.exit(1); });
