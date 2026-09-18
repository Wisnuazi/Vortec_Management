# CURRENT TASK

## Task ID
TASK-009

## Title
DEC-068 — Lock/Unlock Pengajuan Bahan Baku + Jenis BOM dropdown + status panel filter

## Status
COMPLETE — backend live (DEC-068 migration applied), E2E lock flow verified, frontend rebuilt and serving.

## Scope

1. **`Project.materialRequestLocked` + audit fields.** PM/OM toggle
   per-project lock that blocks new `POST /material-requests`.
2. **New route `POST /api/projects/:id/material-requests/lock`** with
   `{ locked: boolean }` body. No typed verification (soft, reversible
   toggle).
3. **`POST /api/projects/:id/material-requests` enforcement:**
   - Reject (400) when `project.materialRequestLocked` is true.
   - Validate `bomType` (if provided) is in the caller's effective
     `allowedBomTypes` (DEC-067 helper).
4. **`MaterialRequest.bomType: BomType?`** — new column, nullable on
   legacy rows.
5. **Frontend SubmitForm:** adds a Jenis BOM dropdown restricted to
   the user's allowedTypes. The form hides + shows a yellow
   "Pengajuan di-lock" hint when the project is locked.
6. **Frontend MaterialRequests header:** lock/unlock toggle button
   (PM/OM only) with state-aware label + colour.
7. **Frontend status panel filter:** row of clickable tabs above the
   list (Semua / Submitted / Approved / Processing / Completed /
   Rejected) with per-status counts.

## Files Changed

### Backend
- `backend/prisma/schema.prisma` — `MaterialRequest.bomType`,
  `Project.materialRequestLocked` + `materialRequestLockedAt` +
  `materialRequestLockedByUserId`, `User.projectsMaterialRequestLocked`
- `backend/prisma/migrations/20260917050000_dec068_material_request_lock_bomtype/migration.sql`
- `backend/src/routes/bom.ts` — exported `BOM_TYPES`, `BomType`,
  `allowedBomTypesFor` for cross-route reuse
- `backend/src/routes/projects.ts` — `import BOM_TYPES + allowedBomTypesFor`,
  `serializeProject` includes lock state, `serializeMaterialRequest`
  includes `bomType`, `POST /material-requests` validates + writes
  `bomType`, new `POST /:id/material-requests/lock` route

### Frontend
- `frontend/src/lib/projects-api.ts` — `ApiMaterialRequest.bomType`,
  `ApiProject.materialRequestLocked*`, `submitMaterialRequest` accepts
  `bomType`, new `lockMaterialRequest` method
- `frontend/src/hooks/useProjects.ts` — `submitMaterialRequest` now
  takes `bomType`, new `lockMaterialRequest` hook method
- `frontend/src/app/projects/[id]/MaterialRequests.tsx` — SubmitForm
  adds Jenis BOM dropdown + locked hint, RequestCard shows Jenis BOM
  badge, header has lock toggle (PM/OM only), status panel filter
- `frontend/src/app/projects/[id]/page.module.css` — `sectionHeader`,
  `lockToggle` + `lockToggleOn`, `lockedHint`, `statusPanels` +
  `statusPanel_*` per-status variants, `cardTypeBadge` with
  `data-bomtype` color variants
- `frontend/src/lib/i18n.ts` — 10 new keys under `materialRequests.*`
  (bomTypeLabel, lockToggle, lockedLabel/unlockedLabel, lockedHint,
  lockedSuccess/unlockedSuccess, noAllowedTypes, statusFilterAria,
  statusAll, emptyFiltered)

## Verification

- Migration applied: now 39/39 (was 38/38 after DEC-067).
- Schema generate clean, `tsc` clean (after one iteration to fix
  missing `bomType` in inline `materialRequests` type).
- E2E smoke (super admin):
  - POST `/material-requests` with `bomType=MBOM` → 200, row has
    `bomType=MBOM`
  - POST `/material-requests` with `bomType=QBOM` → 200 (super admin
    gets all)
  - POST `/material-requests/lock` `{locked:true}` → 200,
    `materialRequestLocked=true`,
    `materialRequestLockedByUserName=Super Admin`
  - POST `/material-requests` while locked → 400 with Indonesian error
    `"Pengajuan Bahan Baku untuk project ini sedang di-lock oleh PM/OM..."`
  - POST `/material-requests/lock` `{locked:false}` → 200,
    `materialRequestLocked=false`
- DB verify: legacy MaterialRequest rows show `bomType=null`; new
  rows show their chosen type.
- Frontend rebuild: 21 routes prerendered (no schema changes to the
  page tree).
- Frontend serve smoke: `/projects`, `/bom` 200.

## Risks / Known Issues
- The smoke test left an extra "DEC-068 smoke pengajuan" +
  "DEC-068 smoke bad" entry on the Prima 2 project. Delete them via
  Prisma Studio or the UI to clean up:
  `prisma.materialRequest.delete({where:{id:"..."}})`.

## Verification status
**DONE** — all DEC-068 acceptance criteria verified end-to-end.
