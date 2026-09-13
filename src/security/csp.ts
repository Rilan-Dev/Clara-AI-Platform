export const CSP_HEADER_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' wss: https://*.up.railway.app https://api.openai.com https://realtime.openai.com https://*.vercel.app https://api.razorpay.com",
  "media-src 'self' blob:",
  "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com",
  "report-uri /api/csp-report",
].join("; ");

export const EMBED_WIDGET_CSP_HEADER_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' wss: https://*.up.railway.app https://api.openai.com https://realtime.openai.com https://*.vercel.app https://api.razorpay.com",
  "media-src 'self' blob:",
  "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com",
  "frame-ancestors *",
  "report-uri /api/csp-report",
].join("; ");

export const SECURITY_HEADERS = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "Content-Security-Policy": CSP_HEADER_VALUE,
} as const;

export const EMBED_WIDGET_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "Content-Security-Policy": EMBED_WIDGET_CSP_HEADER_VALUE,
} as const;
