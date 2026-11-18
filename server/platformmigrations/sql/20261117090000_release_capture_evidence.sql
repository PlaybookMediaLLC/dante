SET LOCAL lock_timeout = '5s';
-- A release-matched capture steers its recipe's AI navigation toward one change.
-- Older jobs keep NULL: they were never steered.
ALTER TABLE capture_job ADD COLUMN "objectiveEvidence" TEXT;
-- The observed actions an AI-navigated attempt took, shown beside its result.
ALTER TABLE capture ADD COLUMN "navigationActions" JSONB;
