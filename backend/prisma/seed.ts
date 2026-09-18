import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { hashPassword } from "../src/auth";

const prisma = new PrismaClient();

type RoleSeed = {
  id: string;
  title: string;
  parentId: string | null;
  jobDescription: string;
  jobdesk: string[];
  employees?: string[];
};

// Struktur & penempatan karyawan: assets/template/doc/organization_structure.md
// dan assets/template/doc/employees.md.
//
// Job description & jobdesk adalah DRAFT hasil generate berdasarkan judul role
// dan konteks bisnis (bengkel mekanik/electrical/QC/software — lihat
// assets/template/doc/layout_building.md) — belum final, menunggu review.
//
// Catatan struktur: Quality Control, Mechanical Engineer, Electrical Engineer, dan
// Software Development secara formal berada di bawah Operational Leader (single
// parent, sesuai "Struktur Utama"). Project Manager juga memiliki wewenang
// koordinasi teknis atas tim yang sama dalam konteks pelaksanaan project (dual
// supervision) — lihat docs/DECISIONS.md untuk keterbatasan model data saat ini.
const ROLES: RoleSeed[] = [
  {
    id: "director",
    title: "Director",
    parentId: null,
    jobDescription:
      "Bertanggung jawab atas keberlangsungan dan pertumbuhan perusahaan secara keseluruhan, termasuk pengambilan keputusan strategis lintas divisi.",
    jobdesk: [
      "Menentukan visi, misi, dan arah strategis perusahaan",
      "Mengawasi kinerja seluruh divisi (Finance, Sales, HR, Operational)",
      "Mengambil keputusan strategis dan investasi perusahaan",
      "Menjadi representasi perusahaan di hadapan klien dan mitra utama",
    ],
    employees: ["Joe"],
  },

  {
    id: "finance-manager",
    title: "Finance Manager",
    parentId: "director",
    jobDescription: "Mengelola perencanaan, pengendalian, dan pelaporan keuangan perusahaan.",
    jobdesk: [
      "Mengelola perencanaan dan pengendalian keuangan perusahaan",
      "Menyusun dan mengawasi anggaran (budget) perusahaan",
      "Mengawasi laporan keuangan dan arus kas",
      "Memastikan kepatuhan pajak dan administrasi keuangan",
    ],
    employees: ["Haidir"],
  },
  {
    id: "finance-staff",
    title: "Finance Staff",
    parentId: "finance-manager",
    jobDescription: "Menjalankan pencatatan transaksi dan administrasi keuangan harian.",
    jobdesk: [
      "Mencatat transaksi keuangan harian",
      "Menyiapkan invoice, penggajian, dan pembayaran",
      "Membantu penyusunan laporan keuangan bulanan",
      "Mengarsipkan dokumen keuangan dan bukti transaksi",
    ],
    employees: ["Heri", "Khalisa"],
  },

  {
    id: "sales-manager",
    title: "Sales Manager",
    parentId: "director",
    jobDescription: "Mengelola strategi penjualan dan hubungan dengan klien.",
    jobdesk: [
      "Menyusun strategi dan target penjualan",
      "Mengelola hubungan dengan klien dan calon klien",
      "Mengawasi proses penawaran dan negosiasi kontrak",
      "Melaporkan performa penjualan ke Direktur",
    ],
  },
  {
    id: "sales-admin",
    title: "Sales Admin",
    parentId: "sales-manager",
    jobDescription: "Mendukung administrasi dan operasional tim penjualan.",
    jobdesk: [
      "Menyiapkan dokumen penawaran dan kontrak penjualan",
      "Mengelola data pelanggan dan riwayat transaksi",
      "Mendukung koordinasi jadwal dan komunikasi dengan klien",
    ],
  },

  {
    id: "hr-manager",
    title: "HR Manager",
    parentId: "director",
    jobDescription:
      "Mengelola sumber daya manusia serta mengawasi fungsi Purchasing, Inventory, dan Assets.",
    jobdesk: [
      "Mengelola rekrutmen, penggajian, dan administrasi karyawan",
      "Menyusun kebijakan SDM dan tata tertib perusahaan",
      "Mengawasi fungsi Purchasing, Inventory, dan Assets",
      "Menangani hubungan industrial dan kesejahteraan karyawan",
    ],
    employees: ["Haidir"],
  },
  {
    id: "purchasing",
    title: "Purchasing",
    parentId: "hr-manager",
    jobDescription: "Mengelola pembelian bahan baku, komponen, dan kebutuhan operasional.",
    jobdesk: [
      "Melakukan pembelian bahan baku, komponen, dan kebutuhan operasional",
      "Mencari dan mengevaluasi supplier/vendor",
      "Mengelola dokumen pembelian (PO, invoice, tanda terima)",
    ],
    employees: ["Rafif"],
  },
  {
    id: "inventory",
    title: "Inventory",
    parentId: "hr-manager",
    jobDescription: "Mengelola stok barang dan material di gudang.",
    jobdesk: [
      "Mengelola stok barang dan material di gudang",
      "Mencatat keluar-masuk barang",
      "Melakukan stock opname secara berkala",
    ],
    employees: ["Wiyanto", "Kia"],
  },
  // The flat "Assets" role was split per floor (DEC-049) — see
  // ASSET_FLOOR_ROLES/seedAssetFloorRoles() below, seeded after Floors
  // exist since each of those 5 roles needs a real Floor.id.

  {
    id: "operational-manager",
    title: "Operational Manager",
    parentId: "director",
    jobDescription:
      "Membawahi Project Manager dan Operational Leader. Bertanggung jawab atas keseluruhan fungsi operasional, project execution, dan technical operation. Menjadi escalation point dan pemegang otoritas akhir apabila terjadi konflik prioritas antara kebutuhan project dan kebutuhan operasional.",
    jobdesk: [
      "Mengawasi keseluruhan fungsi operasional perusahaan",
      "Menjadi penghubung dan escalation point antara Project Manager dan Operational Leader",
      "Menyelaraskan prioritas project execution dengan kebutuhan operasional harian",
    ],
    employees: ["Wisnuazi"],
  },
  {
    id: "project-manager",
    title: "Project Manager",
    parentId: "operational-manager",
    jobDescription:
      "Mengelola pelaksanaan project. Mengkoordinasikan scope, timeline, resource, deliverable, dan project issue. Membawahi serta mengarahkan Technical & Quality Team dalam konteks pelaksanaan project (dual supervision bersama Operational Leader — lihat docs/DECISIONS.md).",
    jobdesk: [
      "Mengelola pelaksanaan project",
      "Mengkoordinasikan scope, timeline, resource, deliverable, dan project issue",
      "Mengarahkan Technical & Quality Team dalam konteks pelaksanaan project",
    ],
    employees: ["Angga"],
  },
  {
    id: "operational-leader",
    title: "Operational Leader",
    parentId: "operational-manager",
    jobDescription:
      "Mengelola aktivitas operasional harian tim teknis. Mengkoordinasikan resource, task execution, technical issue, dan aktivitas lapangan/produksi. Membawahi serta mengarahkan Technical & Quality Team dalam konteks operasional.",
    jobdesk: [
      "Mengelola aktivitas operasional harian tim teknis",
      "Mengkoordinasikan resource, task execution, technical issue, dan aktivitas lapangan/produksi",
      "Mengarahkan Technical & Quality Team dalam konteks operasional",
    ],
    employees: ["Wiyanto"],
  },

  {
    id: "quality-control",
    title: "Quality Control",
    parentId: "operational-leader",
    jobDescription: "Menjaga standar kualitas hasil pekerjaan mekanik, electrical, dan software.",
    jobdesk: [
      "Melakukan pemeriksaan kualitas produk/hasil pekerjaan",
      "Menyusun dan menjalankan standar QC",
      "Melaporkan temuan ketidaksesuaian (defect) dan tindak lanjutnya",
    ],
    employees: ["Wiyanto", "Firman", "Dirga"],
  },
  {
    id: "mechanical-engineer",
    title: "Mechanical Engineer",
    parentId: "operational-leader",
    jobDescription: "Mengerjakan perancangan, perakitan, dan finishing komponen mekanik.",
    jobdesk: [
      "Merancang dan mengerjakan komponen/struktur mekanik",
      "Melakukan perakitan dan pengujian mekanik",
      "Melakukan pengecatan & finishing sesuai kebutuhan project",
    ],
    employees: ["Wiyanto", "Tarmono", "Aryo"],
  },
  {
    id: "electrical-engineer",
    title: "Electrical Engineer",
    parentId: "operational-leader",
    jobDescription: "Mengerjakan perancangan dan perakitan sistem kelistrikan.",
    jobdesk: [
      "Merancang dan merakit sistem kelistrikan/electrical assembly",
      "Melakukan wiring, testing, dan troubleshooting kelistrikan",
      "Berkoordinasi dengan tim QC untuk pengujian sistem",
    ],
    employees: ["Agan", "Bayu", "Dirga"],
  },
  {
    id: "software-development",
    title: "Software Development",
    parentId: "operational-leader",
    jobDescription: "Mengembangkan software dan firmware untuk produk/sistem perusahaan.",
    jobdesk: [
      "Mengembangkan software fullstack dan firmware untuk produk",
      "Melakukan testing dan debugging sistem software/firmware",
      "Berkoordinasi dengan tim Electrical & Mechanical untuk integrasi sistem",
    ],
    employees: ["Firman", "Bayu", "Arya"],
  },
];

async function seedRoles() {
  const count = await prisma.role.count();
  if (count > 0) {
    console.log("Roles already exist, skipping role seed.");
    return;
  }

  for (const role of ROLES) {
    await prisma.role.create({
      data: {
        id: role.id,
        title: role.title,
        parentId: role.parentId,
        jobDescription: role.jobDescription,
        jobdesk: {
          create: role.jobdesk.map((text, order) => ({ text, order })),
        },
        employees: {
          create: (role.employees ?? []).map((name) => ({ name })),
        },
      },
    });
  }

  console.log(`Seed complete: ${ROLES.length} roles created.`);
}

// Additive "dual supervision" edges (DEC-019, supersedes DEC-003): the
// Technical & Quality Team roles formally sit under Operational Leader in
// the parentId tree, but Project Manager also coordinates them in the
// context of project execution — see organization_structure.md.
const ROLE_SUPERVISIONS: { roleId: string; supervisorId: string }[] = [
  { roleId: "quality-control", supervisorId: "project-manager" },
  { roleId: "mechanical-engineer", supervisorId: "project-manager" },
  { roleId: "electrical-engineer", supervisorId: "project-manager" },
  { roleId: "software-development", supervisorId: "project-manager" },
];

async function seedRoleSupervision() {
  const count = await prisma.roleSupervision.count();
  if (count > 0) {
    console.log("Role supervision edges already exist, skipping.");
    return;
  }
  for (const edge of ROLE_SUPERVISIONS) {
    await prisma.roleSupervision.create({ data: edge });
  }
  console.log(`Seed complete: ${ROLE_SUPERVISIONS.length} role supervision edges created.`);
}

async function seedSuperAdmin() {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) {
    console.log("SUPER_ADMIN_EMAIL not set, skipping super admin seed.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super admin ${email} already exists, skipping.`);
    return;
  }

  const providedPassword = process.env.SUPER_ADMIN_PASSWORD;
  const password = providedPassword && providedPassword.length >= 8 ? providedPassword : randomPassword();

  await prisma.user.create({
    data: {
      email,
      name: "Super Admin",
      passwordHash: await hashPassword(password),
      isSuperAdmin: true,
    },
  });

  console.log(`Super admin created: ${email}`);
  if (!providedPassword) {
    console.log(`Generated password (save this now, it will not be shown again): ${password}`);
  }
}

function randomPassword() {
  return randomBytes(12).toString("base64url");
}

// Layout: assets/template/doc/layout_building.md. Deskripsi adalah DRAFT hasil
// generate berdasarkan fungsi tiap lantai — belum final, menunggu review.
const FLOORS = [
  {
    label: "Lantai 1 (LT1)",
    usage: "Bengkel Mekanik",
    description: "Area kerja utama untuk fabrikasi, perakitan, dan pengerjaan komponen mekanik.",
    order: 0,
  },
  {
    label: "Lantai 2 (LT2)",
    usage: "Gudang",
    description: "Tempat penyimpanan stok bahan baku, komponen, dan barang inventaris perusahaan.",
    order: 1,
  },
  {
    label: "Lantai 3 (LT3)",
    usage: "Ruang Meeting",
    description: "Ruang pertemuan untuk koordinasi tim, presentasi project, dan diskusi dengan klien.",
    order: 2,
  },
  {
    label: "Lantai 4 (LT4)",
    usage: "Bengkel Electrical Assembling & QC",
    description: "Area perakitan sistem kelistrikan serta pemeriksaan kualitas (quality control) hasil produksi.",
    order: 3,
  },
  {
    label: "Lantai 5 (LT5)",
    usage: "Bengkel Pengecatan & Finishing",
    description: "Area pengecatan dan penyelesaian akhir (finishing) produk sebelum siap dikirim.",
    order: 4,
  },
];

async function seedFloors() {
  const count = await prisma.floor.count();
  if (count > 0) {
    console.log("Floors already exist, skipping floor seed.");
    return;
  }
  for (const floor of FLOORS) {
    await prisma.floor.create({ data: floor });
  }
  console.log(`Seed complete: ${FLOORS.length} floors created.`);
}

// The flat "Assets" role was split into one role per floor (DEC-049), each
// with Role.floorId set so it only grants access to that floor's asset
// data. Floor assignments come straight from
// assets/template/doc/employees.md's "Penanggungjawab Barang" column:
// Tarmono -> lt1, Wiyanto -> lt2 and lt5, Agan -> lt4. Nobody is assigned
// to Lantai 3 (the meeting room) since no assets are placed there.
const ASSET_FLOOR_ROLES: { id: string; title: string; floorLabel: string; employees: string[] }[] = [
  { id: "assets-lt1", title: "Assets Lantai 1", floorLabel: "Lantai 1 (LT1)", employees: ["Tarmono"] },
  { id: "assets-lt2", title: "Assets Lantai 2", floorLabel: "Lantai 2 (LT2)", employees: ["Wiyanto"] },
  { id: "assets-lt3", title: "Assets Lantai 3", floorLabel: "Lantai 3 (LT3)", employees: [] },
  { id: "assets-lt4", title: "Assets Lantai 4", floorLabel: "Lantai 4 (LT4)", employees: ["Agan"] },
  { id: "assets-lt5", title: "Assets Lantai 5", floorLabel: "Lantai 5 (LT5)", employees: ["Wiyanto"] },
];

async function seedAssetFloorRoles() {
  const count = await prisma.role.count({ where: { floorId: { not: null } } });
  if (count > 0) {
    console.log("Floor-scoped Assets roles already exist, skipping.");
    return;
  }
  for (const r of ASSET_FLOOR_ROLES) {
    const floor = await prisma.floor.findFirst({ where: { label: r.floorLabel } });
    if (!floor) {
      console.log(`Floor "${r.floorLabel}" not found, skipping role ${r.id}.`);
      continue;
    }
    await prisma.role.create({
      data: {
        id: r.id,
        title: r.title,
        parentId: "hr-manager",
        floorId: floor.id,
        jobDescription: `Mendata dan memelihara aset perusahaan di ${r.floorLabel}.`,
        jobdesk: {
          create: [
            { text: `Mendata dan memelihara aset perusahaan di ${r.floorLabel}`, order: 0 },
            { text: "Mengawasi kondisi dan pemeliharaan peralatan di lantai ini", order: 1 },
            { text: "Melaporkan kerusakan atau kebutuhan penggantian aset di lantai ini", order: 2 },
          ],
        },
        employees: { create: r.employees.map((name) => ({ name })) },
      },
    });
  }
  console.log(`Seed complete: ${ASSET_FLOOR_ROLES.length} floor-scoped Assets roles created.`);
}

// Source: assets/template/doc/asset_vortec_aug_2026.xlsx ("Sumarry" sheet).
// Quantities are per floor as given in the sheet's LT1/LT2/LT4/LT5 columns
// (no assets are placed on Lantai 3, the meeting room). Unit price goes to
// Asset.price directly; unit (Pcs/Set/Roll/...) has no dedicated column so
// it's folded into `notes` as "Satuan: <unit>".
// "Staker Listrik" (qty 0 everywhere in the source) was dropped as an
// abandoned duplicate of "Steker Listrik", which has real data.
type AssetSeed = { name: string; unit: string; price: number; qty: [number, number, number, number] };
const ASSETS_AUG_2026: AssetSeed[] = [
  { name: "Bor Baterai", unit: "Unit", price: 1428800, qty: [2, 0, 1, 1] },
  { name: "Center Drill 3 X 60°", unit: "Pcs", price: 37021, qty: [3, 0, 0, 0] },
  { name: "Center Drill 6 X 60°", unit: "Pcs", price: 82683, qty: [3, 0, 0, 0] },
  { name: "Colet Set Genap", unit: "Set", price: 311150, qty: [1, 0, 0, 0] },
  { name: "Countainer Gede", unit: "Pcs", price: 150000, qty: [2, 5, 2, 1] },
  { name: "Cutter", unit: "Pcs", price: 25760, qty: [2, 0, 2, 1] },
  { name: "Cutter Acrilic", unit: "Pcs", price: 33000, qty: [2, 0, 0, 0] },
  { name: "Dudukan Solder", unit: "Pcs", price: 39900, qty: [0, 0, 2, 0] },
  { name: "Dumy Load 100W", unit: "Pcs", price: 835000, qty: [0, 0, 2, 0] },
  { name: "Dumy Load 20W", unit: "Pcs", price: 170000, qty: [0, 0, 4, 0] },
  { name: "Dumy Load 50W", unit: "Pcs", price: 220000, qty: [0, 0, 2, 0] },
  { name: "Endmill V-BIT LEXEES 0.1X20°", unit: "Pcs", price: 33960, qty: [5, 0, 0, 0] },
  { name: "Geinda Tangan", unit: "Pcs", price: 402000, qty: [1, 0, 0, 1] },
  { name: "Gelas Takar", unit: "Unit", price: 30000, qty: [0, 0, 0, 3] },
  { name: "Gerinda duduk", unit: "Unit", price: 2861500, qty: [1, 0, 0, 0] },
  { name: "Gunting", unit: "Pcs", price: 19500, qty: [2, 0, 2, 1] },
  { name: "HDMI", unit: "Pcs", price: 55000, qty: [0, 0, 2, 0] },
  { name: "Kabel Lan 1 Meter", unit: "Pcs", price: 15034, qty: [0, 0, 10, 0] },
  { name: "Kabel Listrik", unit: "Roll", price: 707916, qty: [0, 0, 1, 0] },
  { name: "Kawat 3mm", unit: "Kg", price: 30000, qty: [0, 0, 0, 3] },
  { name: "Kikir Set", unit: "Set", price: 51297, qty: [2, 0, 1, 1] },
  { name: 'Klem C2"', unit: "Pcs", price: 22093, qty: [6, 0, 2, 2] },
  { name: 'Klem C6"', unit: "Pcs", price: 87802, qty: [6, 0, 2, 2] },
  { name: "Kompresor", unit: "Unit", price: 1910000, qty: [0, 0, 0, 1] },
  { name: "Konci Pas", unit: "Set", price: 44500, qty: [2, 0, 1, 1] },
  { name: "Kunci L", unit: "Set", price: 38100, qty: [2, 0, 2, 1] },
  { name: "Lampu Belajar", unit: "Pcs", price: 59900, qty: [0, 0, 2, 0] },
  { name: "Lampu Tembak 50W", unit: "Pcs", price: 141000, qty: [0, 0, 0, 3] },
  { name: "Magnetic Mounting Tools", unit: "Pcs", price: 83300, qty: [8, 0, 4, 0] },
  { name: "Mata Endmill 1mm", unit: "Pcs", price: 92960, qty: [5, 0, 0, 0] },
  { name: "Mata Endmill 2mm", unit: "Pcs", price: 92960, qty: [5, 0, 0, 0] },
  { name: "Mata Endmill 3mm", unit: "Pcs", price: 92960, qty: [5, 0, 0, 0] },
  { name: "Mata Endmill 4mm", unit: "Pcs", price: 92960, qty: [5, 0, 0, 0] },
  { name: "Mata Endmill 5mm", unit: "Pcs", price: 215000, qty: [5, 0, 0, 0] },
  { name: "Mata Bor Besi Set", unit: "Set", price: 59000, qty: [2, 0, 1, 1] },
  { name: "Mata Bor L", unit: "Set", price: 40000, qty: [2, 0, 1, 1] },
  { name: "Mata Gerinda diamon 240", unit: "Pcs", price: 64275, qty: [1, 0, 0, 0] },
  { name: "Mata Gerinda diamon 400", unit: "Pcs", price: 64275, qty: [1, 0, 0, 0] },
  { name: "Mata Tap 3MMx0.5", unit: "Pcs", price: 36300, qty: [5, 0, 0, 0] },
  { name: "Mata Tap 4MMx0.7", unit: "Pcs", price: 39600, qty: [5, 0, 0, 0] },
  { name: "Mata Tap 5MMx0.8", unit: "Pcs", price: 700, qty: [5, 0, 0, 0] },
  { name: "Mata Tap 8MMx1.25", unit: "Pcs", price: 9500, qty: [5, 0, 0, 0] },
  { name: "Meteran 5m", unit: "Pcs", price: 38000, qty: [1, 0, 1, 1] },
  { name: "Meteran Siku", unit: "Pcs", price: 25000, qty: [1, 0, 1, 1] },
  { name: "Monitor Kecil", unit: "Pcs", price: 759000, qty: [0, 0, 2, 0] },
  { name: "Obeng set", unit: "Set", price: 58000, qty: [2, 0, 2, 1] },
  { name: "Osiloskop", unit: "Unit", price: 6559000, qty: [0, 0, 1, 0] },
  { name: "Palu Besi", unit: "Pcs", price: 36125, qty: [1, 0, 1, 1] },
  { name: "Pegboard", unit: "Pcs", price: 340000, qty: [2, 0, 2, 0] },
  { name: "Penyedot Timah", unit: "Pcs", price: 56000, qty: [0, 0, 2, 0] },
  { name: "Power Suply", unit: "Pcs", price: 1135000, qty: [0, 0, 1, 0] },
  { name: "Resistor 2 watt 330k", unit: "Pack", price: 6900, qty: [0, 0, 5, 0] },
  { name: "Saringan Cat", unit: "Box", price: 36400, qty: [0, 0, 0, 2] },
  { name: "Socket Female Skun Jumper Cable Housing Pin", unit: "Pcs", price: 2000, qty: [0, 0, 100, 0] },
  { name: "Solasi Bakar 10mm", unit: "Meter", price: 6500, qty: [0, 0, 5, 0] },
  { name: "Solder", unit: "Pcs", price: 29500, qty: [0, 0, 2, 0] },
  { name: "Spray Gun", unit: "Pcs", price: 252500, qty: [0, 0, 0, 1] },
  { name: "Steker Listrik", unit: "Pcs", price: 13001, qty: [1, 0, 4, 0] },
  { name: "Switch Hub 8 port", unit: "Pcs", price: 193800, qty: [0, 0, 2, 0] },
  { name: "Tang", unit: "Pcs", price: 26000, qty: [2, 0, 1, 1] },
  { name: "Tang Kupas", unit: "Pcs", price: 121000, qty: [0, 0, 2, 0] },
  { name: "Tang Lancip", unit: "Pcs", price: 26400, qty: [1, 0, 2, 1] },
  { name: "Tang Rifet", unit: "Pcs", price: 72670, qty: [2, 0, 0, 0] },
  { name: "Tang Rifet Nut", unit: "Pcs", price: 129000, qty: [2, 0, 0, 0] },
  { name: "Terminal Listrik 6 Lobang", unit: "Pcs", price: 41350, qty: [1, 0, 4, 0] },
  { name: "Thermal Cam", unit: "Pcs", price: 3810000, qty: [0, 0, 1, 0] },
  { name: "Timah", unit: "Roll", price: 139500, qty: [0, 0, 4, 0] },
];

async function seedAssetsAug2026() {
  const count = await prisma.asset.count();
  if (count > 0) {
    console.log("Assets already exist, skipping asset seed.");
    return;
  }

  const floors = await prisma.floor.findMany({ orderBy: { order: "asc" } });
  if (floors.length < 5) {
    console.log("Fewer than 5 floors found, skipping asset seed.");
    return;
  }
  // qty index -> floor order: 0 = Lantai 1, 1 = Lantai 2, 2 = Lantai 4, 3 = Lantai 5.
  const floorIdByQtyIndex = [floors[0].id, floors[1].id, floors[3].id, floors[4].id];

  let created = 0;
  for (const asset of ASSETS_AUG_2026) {
    const notes = `Satuan: ${asset.unit}`;
    for (let i = 0; i < asset.qty.length; i++) {
      const quantity = asset.qty[i];
      if (quantity <= 0) continue;
      await prisma.asset.create({
        data: { name: asset.name, quantity, notes, price: asset.price, floorId: floorIdByQtyIndex[i] },
      });
      created++;
    }
  }

  console.log(`Seed complete: ${created} asset rows created from asset_vortec_aug_2026.xlsx.`);
}

async function main() {
  await seedRoles();
  await seedRoleSupervision();
  await seedFloors();
  await seedAssetFloorRoles();
  await seedAssetsAug2026();
  await seedSuperAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
