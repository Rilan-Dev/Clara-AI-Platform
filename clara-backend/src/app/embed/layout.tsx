/**
 * /embed layout — renders without any admin chrome.
 * Widget pages need to be embeddable in iframes on external sites.
 */
export const metadata = { title: "Clara AI Widget" };

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        {/* Allow iframe embedding from any origin */}
        <style>{`*, *::before, *::after { box-sizing: border-box; } body { margin: 0; padding: 0; }`}</style>
      </head>
      <body style={{ margin: 0, padding: 0, height: "100vh", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
