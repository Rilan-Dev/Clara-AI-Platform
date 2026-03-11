/**
 * src/modules/ingest/crawlers/index.ts
 * Barrel exports for the web crawling module.
 */

export {
  crawlWebsite,
  type CrawlOptions,
  type CrawlResult,
  type CrawlProgress,
  type CrawlError,
  type DiscoveredUrl,
} from "./web-crawler";

export {
  fetchRobotsTxt,
  parseRobotsTxt,
  isUrlAllowed,
  type RobotsRules,
} from "./robots-parser";
