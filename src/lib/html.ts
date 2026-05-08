function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderDocument(options: {
  title: string;
  body: string;
  head?: string;
  pageClassName?: string;
}) {
  const pageClassName = options.pageClassName ? ` class="${escapeHtml(options.pageClassName)}"` : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0d10;
        --panel: rgba(16, 19, 24, 0.88);
        --panel-strong: rgba(21, 25, 32, 0.96);
        --line: rgba(255, 255, 255, 0.08);
        --line-strong: rgba(255, 255, 255, 0.14);
        --text: #edf1f7;
        --muted: #97a4b5;
        --accent: #8ff7c2;
        --accent-strong: #49d697;
        --danger: #ff7d7d;
        --warning: #ffce6d;
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(73, 214, 151, 0.14), transparent 30%),
          radial-gradient(circle at top right, rgba(87, 127, 255, 0.12), transparent 26%),
          linear-gradient(180deg, #091016 0%, #0b0d10 100%);
        color: var(--text);
        font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
      }

      body {
        padding: 32px;
      }

      a {
        color: inherit;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      .shell {
        width: min(1280px, 100%);
        margin: 0 auto;
      }

      .auth-shell {
        min-height: calc(100vh - 64px);
        display: grid;
        place-items: center;
      }

      .auth-card,
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
        backdrop-filter: blur(24px);
      }

      .auth-card {
        width: min(480px, 100%);
        border-radius: 8px;
        overflow: hidden;
      }

      .auth-header {
        padding: 28px 28px 20px;
        border-bottom: 1px solid var(--line);
      }

      .auth-header h1,
      .page-title h1,
      .panel h2,
      .panel h3 {
        margin: 0;
        font-weight: 600;
        letter-spacing: 0;
      }

      .auth-header p,
      .page-title p,
      .meta,
      .muted {
        margin: 10px 0 0;
        color: var(--muted);
      }

      .auth-body {
        padding: 28px;
      }

      .field-grid {
        display: grid;
        gap: 14px;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field label {
        color: var(--muted);
        font-size: 13px;
      }

      .input,
      .select,
      .textarea {
        width: 100%;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        color: var(--text);
        padding: 12px 14px;
        outline: none;
      }

      .textarea {
        min-height: 120px;
        resize: vertical;
      }

      .input:focus,
      .select:focus,
      .textarea:focus {
        border-color: rgba(143, 247, 194, 0.7);
        box-shadow: 0 0 0 3px rgba(143, 247, 194, 0.12);
      }

      .button-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .button {
        border: 0;
        border-radius: 6px;
        padding: 12px 16px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
        transition: background 120ms ease, transform 120ms ease;
      }

      .button:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .button:active {
        transform: translateY(1px);
      }

      .button.primary {
        background: linear-gradient(135deg, var(--accent-strong), var(--accent));
        color: #08110d;
        font-weight: 600;
      }

      .button.danger {
        background: rgba(255, 125, 125, 0.14);
        color: #ffd5d5;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 18px;
        margin-bottom: 22px;
      }

      .page-title {
        display: grid;
        gap: 4px;
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        gap: 16px;
      }

      .sidebar {
        padding: 10px;
        border-radius: 8px;
        position: sticky;
        top: 24px;
        align-self: start;
      }

      .nav-button {
        width: 100%;
        text-align: left;
        padding: 12px 14px;
        border-radius: 6px;
        background: transparent;
        border: 0;
        color: var(--muted);
        cursor: pointer;
      }

      .nav-button.active,
      .nav-button:hover {
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
      }

      .content-column {
        display: grid;
        gap: 16px;
      }

      .panel {
        border-radius: 8px;
        padding: 18px;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .metric-grid,
      .split-grid,
      .card-grid {
        display: grid;
        gap: 12px;
      }

      .metric-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .card-grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }

      .split-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .metric {
        padding: 16px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--line);
      }

      .metric strong {
        display: block;
        font-size: 28px;
        margin-top: 8px;
      }

      .table-wrap {
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 6px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 720px;
      }

      th,
      td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }

      th {
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--muted);
        background: rgba(255, 255, 255, 0.03);
      }

      .tag.good {
        border-color: rgba(143, 247, 194, 0.18);
        color: var(--accent);
      }

      .tag.warn {
        border-color: rgba(255, 206, 109, 0.2);
        color: var(--warning);
      }

      .tag.bad {
        border-color: rgba(255, 125, 125, 0.18);
        color: var(--danger);
      }

      .notice {
        padding: 12px 14px;
        border-radius: 6px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
        color: var(--muted);
      }

      .notice.error {
        border-color: rgba(255, 125, 125, 0.18);
        color: #ffd1d1;
      }

      .notice.ok {
        border-color: rgba(143, 247, 194, 0.18);
        color: #c9ffe6;
      }

      .mono {
        font-family: "Consolas", "SFMono-Regular", monospace;
        word-break: break-all;
      }

      .inbox-shell {
        width: min(1200px, 100%);
        margin: 0 auto;
      }

      .inbox-layout {
        display: grid;
        grid-template-columns: 360px minmax(0, 1fr);
        gap: 16px;
      }

      .message-list {
        display: grid;
        gap: 10px;
      }

      .message-item {
        width: 100%;
        text-align: left;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid var(--line);
        border-radius: 6px;
        color: inherit;
        padding: 14px;
        cursor: pointer;
      }

      .message-item.active,
      .message-item:hover {
        border-color: rgba(143, 247, 194, 0.3);
        background: rgba(143, 247, 194, 0.06);
      }

      .message-body {
        display: grid;
        gap: 12px;
      }

      .mail-html {
        min-height: 280px;
        background: #fff;
        color: #111;
        border-radius: 6px;
        overflow: hidden;
      }

      .attachments {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .attachment-link {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 0 12px;
        border-radius: 6px;
        text-decoration: none;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--line);
      }

      .hidden {
        display: none !important;
      }

      @media (max-width: 980px) {
        body {
          padding: 18px;
        }

        .dashboard-grid,
        .inbox-layout,
        .metric-grid,
        .split-grid {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
        }
      }
    </style>
    ${options.head ?? ""}
  </head>
  <body${pageClassName}>
    ${options.body}
  </body>
</html>`;
}
