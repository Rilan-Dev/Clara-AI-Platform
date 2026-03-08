import { load as loadHtml } from "cheerio";

export type WebDocument = {
  url: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
};

async function renderPageWithPlaywright(url: string): Promise<string | null> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.warn(
      "Playwright render fallback failed; continuing without rendered HTML.",
      error,
    );
    return null;
  }
}

function extractTitle($: ReturnType<typeof loadHtml>): string {
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;
  const headTitle = $("title").first().text().trim();
  if (headTitle) return headTitle;
  return "Untitled Page";
}

function sanitiseContent($: ReturnType<typeof loadHtml>): void {
  $("script, style, noscript, iframe, svg, nav, footer, header, form").remove();
}

function extractText($: ReturnType<typeof loadHtml>): string {
  const candidateRoots = $("article, main, [role='main']");
  const root = candidateRoots.length > 0 ? candidateRoots.first() : $("body");

  const paragraphs: string[] = [];
  root.find("p, li").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  });

  if (paragraphs.length === 0) {
    root.find("div").each((_, element) => {
      const text = $(element).text().replace(/\s+/g, " ").trim();
      if (text.length > 120) {
        paragraphs.push(text);
      }
    });
  }

  if (paragraphs.length === 0) {
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    if (bodyText.length > 0) {
      return bodyText;
    }
  }

  return paragraphs.join("\n\n");
}

export async function loadWebPage(url: string): Promise<WebDocument> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ClaraKnowledgeBot/1.0; +https://example.com/bot)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  const html = await response.text();
  let $ = loadHtml(html);
  sanitiseContent($);
  let text = extractText($);
  let strategy: "http-fetch" | "playwright-render" = "http-fetch";

  if (text.trim().length < 200) {
    const renderedHtml = await renderPageWithPlaywright(url);
    if (renderedHtml) {
      $ = loadHtml(renderedHtml);
      sanitiseContent($);
      const renderedText = extractText($);
      if (renderedText.trim().length > text.trim().length) {
        text = renderedText;
        strategy = "playwright-render";
      }
    }
  }

  const title = extractTitle($);
  const description = $("meta[name='description']").attr("content") ?? "";

  return {
    url,
    title,
    text,
    metadata: {
      description,
      retrievedAt: new Date().toISOString(),
      length: text.length,
      scrapeStrategy: strategy,
    },
  };
}
