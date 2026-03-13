ALTER TABLE scrape_sessions
  DROP CONSTRAINT IF EXISTS scrape_sessions_status_check;

ALTER TABLE scrape_sessions
  ADD CONSTRAINT scrape_sessions_status_check
  CHECK (status IN (
    'discovering',
    'awaiting_confirmation',
    'scraping',
    'ingesting',
    'completed',
    'failed'
  ));
