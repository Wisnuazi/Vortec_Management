-- DEC-061 fix: the migration set the new schema (with purchaseDate
-- nullable) but the migration did not explicitly drop the NOT NULL
-- constraint that DEC-045 had put on the column. Apply the
-- matching DROP NOT NULL so the new "submit items without
-- purchaseDate, realise later" flow works.
ALTER TABLE "KasbonItem" ALTER COLUMN "purchaseDate" DROP NOT NULL;
