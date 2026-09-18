-- DEC-062: add `price Float?` to BomItem for the dashboard BOM
-- summary and Purchasing budget glance. Nullable so legacy rows
-- stay intact (dashboard treats null as "not priced").
ALTER TABLE "BomItem" ADD COLUMN "price" DOUBLE PRECISION;
