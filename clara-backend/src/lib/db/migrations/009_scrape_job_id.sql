-- 009_scrape_job_id.sql
-- Store the BullMQ job ID on the scrape session so we can query crawl progress.
ALTER TABLE scrape_sessions ADD COLUMN IF NOT EXISTS job_id TEXT;
