const BANNED_TAGS = [
  "script",
  "object",
  "embed",
  "form",
];

function removeBannedTags(html: string): string {
  let sanitized = html;
  for (const tag of BANNED_TAGS) {
    sanitized = sanitized.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      "",
    );
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }

  return sanitized;
}

function stripDangerousLinks(html: string): string {
  return html.replace(
    /<link\b([^>]*?)rel\s*=\s*["']?(?:preload|prefetch)["']?([^>]*)>/gi,
    "",
  );
}

function stripInlineHandlers(html: string): string {
  return html.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
}

function stripJavascriptUrls(html: string): string {
  return html.replace(
    /\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,
    "",
  );
}

export function sanitizeHtmlPreview(html: string): string {
  let sanitized = html;
  sanitized = removeBannedTags(sanitized);
  sanitized = stripDangerousLinks(sanitized);
  sanitized = stripInlineHandlers(sanitized);
  sanitized = stripJavascriptUrls(sanitized);
  return sanitized;
}
