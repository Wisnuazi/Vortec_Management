SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE conrelid = '"Employee"'::regclass;
