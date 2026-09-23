/**
 * Sanitises admin-authored HTML (widget header/footer) before it is rendered
 * inside the widget. The widget runs on the Clara origin and holds the embed
 * session, so event-handler attributes, scripts, iframes and javascript: URLs
 * must never survive.
 */

import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a", "b", "strong", "i", "em", "u", "small", "span", "div", "p", "br",
  "img", "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon",
];

export function sanitizeWidgetHtml(html: string | null | undefined): string {
  if (!html || typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title", "class", "style", "width", "height",
      "viewBox", "d", "fill", "stroke", "stroke-width", "cx", "cy", "r", "x", "y",
      "x1", "y1", "x2", "y2", "points", "xmlns",
    ],
    ALLOW_DATA_ATTR: false,
  });
}
