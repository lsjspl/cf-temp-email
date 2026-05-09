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
  lang?: string;
}) {
  const pageClassName = options.pageClassName ? ` class="${escapeHtml(options.pageClassName)}"` : "";
  const lang = options.lang ? escapeHtml(options.lang) : "zh-CN";

  return `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/png" href="/logo.png" />
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .field-hint {
        color: var(--muted);
        font-size: 12px;
        opacity: 0.85;
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
        transition: border-color 140ms ease, box-shadow 140ms ease;
      }

      .input:hover,
      .select:hover,
      .textarea:hover {
        border-color: rgba(255, 255, 255, 0.22);
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

      .input[aria-invalid="true"],
      .select[aria-invalid="true"] {
        border-color: rgba(255, 125, 125, 0.55);
        box-shadow: 0 0 0 3px rgba(255, 125, 125, 0.12);
      }

      .password-wrap {
        position: relative;
      }

      .password-wrap .input {
        padding-right: 46px;
      }

      .password-toggle {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: 0;
        color: var(--muted);
        cursor: pointer;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 13px;
      }

      .password-toggle:hover {
        color: var(--text);
        background: rgba(255, 255, 255, 0.06);
      }

      .button-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .button {
        border: 0;
        border-radius: 6px;
        padding: 10px 16px;
        min-height: 38px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
        transition: background 120ms ease, transform 120ms ease, opacity 120ms ease, border-color 120ms ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        text-decoration: none;
        line-height: 1;
      }

      .button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.14);
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.06);
      }

      .button:active:not(:disabled) {
        transform: translateY(1px);
      }

      .button:disabled,
      .button.is-loading {
        cursor: not-allowed;
        opacity: 0.65;
      }

      .button.primary {
        background: linear-gradient(135deg, var(--accent-strong), var(--accent));
        color: #08110d;
        font-weight: 600;
      }

      .button.primary:hover:not(:disabled) {
        filter: brightness(1.15);
        box-shadow: 0 0 12px rgba(143, 247, 194, 0.3);
      }

      .button.danger {
        background: rgba(255, 125, 125, 0.16);
        color: #ffd5d5;
      }

      .button.danger:hover:not(:disabled) {
        background: rgba(255, 125, 125, 0.28);
        box-shadow: 0 0 8px rgba(255, 125, 125, 0.15);
      }

      .button.ghost {
        background: transparent;
        border: 1px solid var(--line-strong);
      }

      .button.ghost:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.22);
      }

      .button.sm {
        padding: 6px 10px;
        min-height: 30px;
        font-size: 12px;
      }

      .button .spinner {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid currentColor;
        border-top-color: transparent;
        animation: spin 720ms linear infinite;
        display: none;
      }

      .button.is-loading .spinner {
        display: inline-block;
      }

      .button.is-loading .button-label {
        opacity: 0.85;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 18px;
        margin-bottom: 22px;
        flex-wrap: wrap;
      }

      .page-title {
        display: grid;
        gap: 4px;
      }

      .dashboard-grid {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        gap: 16px;
      }

      .sidebar {
        padding: 10px;
        border-radius: 8px;
        position: sticky;
        top: 24px;
        align-self: start;
        display: grid;
        gap: 4px;
      }

      .nav-button {
        width: 100%;
        text-align: left;
        padding: 11px 14px;
        border-radius: 6px;
        background: transparent;
        border: 0;
        color: var(--muted);
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease, transform 140ms ease;
        font-size: 14px;
      }

      .nav-button:hover {
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
      }

      .nav-button:active {
        transform: translateX(2px);
      }

      .nav-button.active {
        background: rgba(143, 247, 194, 0.12);
        color: var(--accent);
        font-weight: 600;
        box-shadow: inset 3px 0 0 var(--accent);
      }

      .content-column {
        display: grid;
        gap: 16px;
      }

      .panel {
        border-radius: 8px;
        padding: 20px;
      }

      .panel.subpanel {
        background: rgba(255, 255, 255, 0.025);
        padding: 16px;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
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
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .split-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .metric {
        padding: 16px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--line);
        transition: border-color 140ms ease, transform 140ms ease;
      }

      .metric:hover {
        border-color: rgba(143, 247, 194, 0.18);
        transform: translateY(-1px);
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
        vertical-align: middle;
      }

      tbody tr {
        transition: background 140ms ease;
      }

      tbody tr:hover {
        background: rgba(255, 255, 255, 0.035);
      }

      th {
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.02);
      }

      tr:last-child td {
        border-bottom: 0;
      }

      .empty-cell {
        padding: 36px 16px !important;
        text-align: center !important;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        color: var(--muted);
      }

      .empty-state .empty-icon {
        font-size: 28px;
        opacity: 0.6;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--muted);
        background: rgba(255, 255, 255, 0.03);
        font-size: 12px;
      }

      .tag.good {
        border-color: rgba(143, 247, 194, 0.18);
        color: var(--accent);
        background: rgba(143, 247, 194, 0.08);
      }

      .tag.warn {
        border-color: rgba(255, 206, 109, 0.2);
        color: var(--warning);
        background: rgba(255, 206, 109, 0.08);
      }

      .tag.bad {
        border-color: rgba(255, 125, 125, 0.18);
        color: var(--danger);
        background: rgba(255, 125, 125, 0.08);
      }

      .notice {
        padding: 12px 14px;
        border-radius: 6px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
        color: var(--muted);
        line-height: 1.55;
      }

      .notice.error {
        border-color: rgba(255, 125, 125, 0.18);
        color: #ffd1d1;
        background: rgba(255, 125, 125, 0.06);
      }

      .notice.ok {
        border-color: rgba(143, 247, 194, 0.18);
        color: #c9ffe6;
        background: rgba(143, 247, 194, 0.06);
      }

      .notice.warn {
        border-color: rgba(255, 206, 109, 0.22);
        color: #ffe3a8;
        background: rgba(255, 206, 109, 0.06);
      }

      .mono {
        font-family: "Consolas", "SFMono-Regular", monospace;
        word-break: break-all;
      }

      .copy-group {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .copy-group .copy-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 0;
        border-radius: 4px;
        padding: 4px 8px;
        color: var(--muted);
        cursor: pointer;
        font-size: 11px;
        transition: background 140ms ease, color 140ms ease;
      }

      .copy-group .copy-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: var(--text);
      }

      .copy-group .copy-btn.copied {
        background: rgba(143, 247, 194, 0.16);
        color: var(--accent);
      }

      .inbox-shell {
        width: min(1200px, 100%);
        margin: 0 auto;
      }

      .inbox-layout {
        display: grid;
        grid-template-columns: 360px minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }

      .message-list {
        display: grid;
        gap: 10px;
        max-height: 70vh;
        overflow-y: auto;
        padding-right: 4px;
      }

      .message-item {
        width: 100%;
        text-align: left;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid var(--line);
        border-radius: 6px;
        color: inherit;
        padding: 12px 14px;
        cursor: pointer;
        transition: background 140ms ease, border-color 140ms ease, transform 120ms ease;
        display: grid;
        gap: 4px;
      }

      .message-item:hover {
        border-color: rgba(143, 247, 194, 0.3);
        background: rgba(143, 247, 194, 0.06);
        transform: translateY(-1px);
      }

      .message-item.active {
        border-color: rgba(143, 247, 194, 0.5);
        background: rgba(143, 247, 194, 0.1);
      }

      .message-item.active::before {
        content: "";
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent);
        margin-right: 6px;
        vertical-align: middle;
      }

      .message-item .new-badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(143, 247, 194, 0.18);
        color: var(--accent);
        border: 1px solid rgba(143, 247, 194, 0.3);
        margin-left: 6px;
      }

      .message-body {
        display: grid;
        gap: 12px;
      }

      .mail-html {
        width: 100%;
        min-height: 280px;
        background: #fff;
        color: #111;
        border-radius: 6px;
        overflow: hidden;
        border: 0;
        transition: height 200ms ease;
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
        transition: background 140ms ease, border-color 140ms ease;
      }

      .attachment-link:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.18);
      }

      .attachment-link::before {
        content: "📎";
        margin-right: 6px;
      }

      .hidden {
        display: none !important;
      }

      /* Toast */
      .toast-stack {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 9999;
        display: grid;
        gap: 10px;
        max-width: min(420px, calc(100vw - 48px));
      }

      .toast {
        background: var(--panel-strong);
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        padding: 12px 14px;
        box-shadow: var(--shadow);
        display: flex;
        gap: 10px;
        align-items: flex-start;
        color: var(--text);
        animation: toast-in 220ms ease;
      }

      .toast.leaving {
        animation: toast-out 180ms ease forwards;
      }

      @keyframes toast-in {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes toast-out {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-6px); }
      }

      .toast .toast-icon {
        font-size: 16px;
        line-height: 1.3;
      }

      .toast .toast-body {
        flex: 1;
        line-height: 1.45;
        font-size: 14px;
      }

      .toast .toast-close {
        background: transparent;
        border: 0;
        color: var(--muted);
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
      }

      .toast .toast-close:hover {
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
      }

      .toast.ok { border-color: rgba(143, 247, 194, 0.3); }
      .toast.ok .toast-icon { color: var(--accent); }
      .toast.error { border-color: rgba(255, 125, 125, 0.35); }
      .toast.error .toast-icon { color: var(--danger); }
      .toast.warn { border-color: rgba(255, 206, 109, 0.32); }
      .toast.warn .toast-icon { color: var(--warning); }
      .toast.info .toast-icon { color: #9fc4ff; }

      /* Modal */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(4, 6, 10, 0.72);
        backdrop-filter: blur(6px);
        z-index: 9998;
        display: grid;
        place-items: center;
        padding: 24px;
        animation: fade-in 160ms ease;
      }

      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .modal-card {
        background: var(--panel-strong);
        border: 1px solid var(--line-strong);
        border-radius: 10px;
        width: min(480px, 100%);
        box-shadow: var(--shadow);
        overflow: hidden;
        animation: modal-in 200ms ease;
      }

      @keyframes modal-in {
        from { opacity: 0; transform: translateY(8px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .modal-header {
        padding: 18px 20px 8px;
      }

      .modal-header h2 {
        margin: 0;
        font-size: 18px;
      }

      .modal-body {
        padding: 4px 20px 16px;
        color: var(--muted);
        line-height: 1.55;
        font-size: 14px;
      }

      .modal-body .mono {
        color: var(--text);
      }

      .modal-footer {
        padding: 12px 20px 18px;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }

      .modal-card.tone-danger {
        border-color: rgba(255, 125, 125, 0.35);
      }

      .modal-card.tone-danger .modal-header h2 {
        color: #ffd5d5;
      }

      /* Inbox expiry banner */
      .inbox-banner {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
        margin-bottom: 16px;
      }

      .inbox-banner.warn {
        border-color: rgba(255, 206, 109, 0.35);
        background: rgba(255, 206, 109, 0.08);
      }

      .inbox-banner.bad {
        border-color: rgba(255, 125, 125, 0.35);
        background: rgba(255, 125, 125, 0.08);
      }

      .live-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 0 0 rgba(143, 247, 194, 0.6);
        animation: pulse 1.8s infinite;
      }

      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(143, 247, 194, 0.5); }
        70% { box-shadow: 0 0 0 8px rgba(143, 247, 194, 0); }
        100% { box-shadow: 0 0 0 0 rgba(143, 247, 194, 0); }
      }

      /* Search box */
      .search-wrap {
        position: relative;
        margin-bottom: 12px;
      }

      .search-wrap .input {
        padding-left: 34px;
      }

      .search-wrap::before {
        content: "🔍";
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 13px;
        opacity: 0.65;
      }

      .inline-actions {
        display: inline-flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .toolbar-row {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }

      /* Custom select styling to match dark theme */
      .select,
      select.select,
      .page-size-select,
      .modal-card select {
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2397a4b5' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 32px;
      }

      .select option,
      select option {
        background: #1a1f28;
        color: var(--text);
        padding: 8px 12px;
      }

      .select:focus option:checked,
      select:focus option:checked {
        background: rgba(143, 247, 194, 0.2);
        color: var(--accent);
      }

      /* Dropdown menu for actions */
      .dropdown {
        position: relative;
        display: inline-block;
      }

      .dropdown-toggle {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        padding: 6px 10px;
        color: var(--text);
        cursor: pointer;
        font-size: 12px;
        transition: background 140ms ease, border-color 140ms ease;
      }

      .dropdown-toggle:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.22);
      }

      .dropdown-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 4px);
        min-width: 140px;
        background: var(--panel-strong);
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        box-shadow: var(--shadow);
        z-index: 1000;
        display: none;
        overflow: hidden;
      }

      .dropdown.open .dropdown-menu {
        display: block;
      }

      .dropdown-item {
        width: 100%;
        text-align: left;
        padding: 10px 14px;
        background: transparent;
        border: 0;
        color: var(--text);
        cursor: pointer;
        font-size: 13px;
        transition: background 140ms ease;
        display: block;
      }

      .dropdown-item:hover {
        background: rgba(143, 247, 194, 0.12);
        color: var(--accent);
      }

      .dropdown-item.danger {
        color: #ffd5d5;
      }

      .dropdown-item.danger:hover {
        background: rgba(255, 125, 125, 0.16);
        color: var(--danger);
      }

      .checkbox-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 140ms;
      }

      .checkbox-row:hover {
        background: rgba(255, 255, 255, 0.04);
      }

      .pagination {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-top: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.02);
      }

      .pagination-summary {
        color: var(--muted);
        font-size: 12px;
      }

      .pagination-controls {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }

      .pagination-controls .page-size-select {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--line-strong);
        color: var(--text);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
      }

      .pagination-controls .page-jump {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--line-strong);
        color: var(--text);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        width: 72px;
      }

      .pill-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        background: rgba(255, 255, 255, 0.05);
        color: var(--muted);
        border: 1px solid var(--line);
      }

      .kbd {
        font-family: "Consolas", "SFMono-Regular", monospace;
        font-size: 11px;
        padding: 1px 5px;
        border: 1px solid var(--line-strong);
        border-bottom-width: 2px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.04);
        color: var(--muted);
      }

      /* Mobile */
      @media (max-width: 980px) {
        body {
          padding: 16px;
        }

        .dashboard-grid,
        .inbox-layout,
        .metric-grid,
        .split-grid {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          grid-auto-flow: column;
          grid-auto-columns: max-content;
          overflow-x: auto;
          scrollbar-width: thin;
          -webkit-mask-image: linear-gradient(to right, black 90%, transparent 100%);
          mask-image: linear-gradient(to right, black 90%, transparent 100%);
        }

        .nav-button {
          white-space: nowrap;
        }

        .page-header {
          align-items: flex-start;
        }

        .message-list {
          max-height: none;
        }

        .toast-stack {
          top: 12px;
          right: 12px;
          left: 12px;
          max-width: none;
        }

        table {
          min-width: unset;
        }

        .table-wrap.mobile-cards table,
        .table-wrap.mobile-cards thead {
          display: none;
        }

        .table-wrap.mobile-cards {
          border: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      }

      /* Ops sub-tabs */
      .ops-tabs {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 8px;
      }

      .ops-tab {
        background: transparent;
        border: 0;
        border-radius: 6px;
        padding: 8px 14px;
        color: var(--muted);
        cursor: pointer;
        font-size: 13px;
        transition: background 140ms ease, color 140ms ease;
      }

      .ops-tab:hover {
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
      }

      .ops-tab.active {
        background: rgba(143, 247, 194, 0.12);
        color: var(--accent);
        font-weight: 600;
      }

      .ops-tab-content {
        display: none;
      }

      .ops-tab-content.active {
        display: block;
      }

      /* Shortcut hint */
      .shortcut-bar {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        align-items: center;
        padding: 8px 14px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--line);
        margin-top: 16px;
        font-size: 12px;
        color: var(--muted);
      }

      .shortcut-bar .shortcut-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      /* Time relative display */
      .time-relative {
        display: inline-flex;
        flex-direction: column;
        gap: 2px;
      }

      .time-relative .time-abs {
        font-size: 12px;
        color: var(--muted);
      }

      .time-relative .time-rel {
        font-size: 11px;
        color: var(--muted);
        opacity: 0.75;
      }
    </style>
    ${options.head ?? ""}
  </head>
  <body${pageClassName}>
    ${options.body}
  </body>
</html>`;
}
