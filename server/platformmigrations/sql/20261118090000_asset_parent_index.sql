SET LOCAL lock_timeout = '5s';

-- Video posters and image derivatives are found by their parent asset, and
-- deleting an asset checks the self-referencing foreign key. Without this
-- index each of those reads scans the whole asset table.
CREATE INDEX "asset_parentAssetId_idx" ON "asset"("parentAssetId");
