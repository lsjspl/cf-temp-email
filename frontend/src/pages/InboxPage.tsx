import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "../lib/api";
import { copyText, relativeTime } from "../lib/utils";
import Spinner from "../components/Spinner";

interface Message {
  id: string;
  from_address: string | null;
  subject: string | null;
  received_at: string;
  attachment_count: number;
}

interface MessageDetail {
  id: string;
  from_address: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  received_at: string;
  attachments: Array<{ id: string; filename: string | null; content_type: string | null; size: number | null }>;
}

interface Mailbox {
  email_address: string;
  expires_at: string;
}

export default function InboxPage() {
  const { token } = useParams<{ token: string }>();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState("");
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!token) return;
    loadMessages();
    refreshRef.current = setInterval(loadMessages, 30000);
    return () => clearInterval(refreshRef.current);
  }, [token]);

  // 过期倒计时
  useEffect(() => {
    if (!mailbox?.expires_at) return;
    const timer = setInterval(() => {
      const diff = new Date(mailbox.expires_at).getTime() - Date.now();
      if (diff <= 0) { setCountdown("已过期"); clearInterval(timer); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, [mailbox?.expires_at]);

  async function loadMessages() {
    try {
      const data = await apiGet<{ mailbox: Mailbox; messages: Message[] }>(
        `/inbox/${encodeURIComponent(token!)}/messages`,
      );
      setMailbox(data.mailbox);
      setMessages(data.messages);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(messageId: string) {
    setSelectedId(messageId);
    setDetailLoading(true);
    try {
      const data = await apiGet<{ message: MessageDetail }>(
        `/inbox/${encodeURIComponent(token!)}/messages/${messageId}`,
      );
      setDetail(data.message);
      // 渲染 HTML 到 iframe
      setTimeout(() => {
        if (iframeRef.current && data.message.html_body) {
          const doc = iframeRef.current.contentDocument;
          if (doc) { doc.open(); doc.write(data.message.html_body); doc.close(); }
        }
      }, 50);
    } catch (err) {
      setDetail(null);
    }
    setDetailLoading(false);
  }

  async function handleCopyAddress() {
    if (mailbox) {
      await copyText(mailbox.email_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-lg font-semibold text-danger mb-2">收件箱不可用</h1>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <header className="card p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <h1 className="font-mono text-lg font-semibold">{mailbox?.email_address}</h1>
              <button className="btn-ghost !px-2 !py-1 !min-h-0 text-xs" onClick={handleCopyAddress}>
                {copied ? "✓ 已复制" : "复制"}
              </button>
            </div>
            <p className="text-sm text-muted mt-1">
              过期倒计时：<span className={`font-mono ${countdown === "已过期" ? "text-danger" : "text-accent"}`}>{countdown || "..."}</span>
            </p>
          </div>
          <button className="btn-default text-sm" onClick={loadMessages}>↻ 刷新</button>
        </div>
      </header>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Message list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <span className="text-sm font-medium">邮件 ({messages.length})</span>
            <span className="text-xs text-muted ml-2">每 30 秒自动刷新</span>
          </div>
          {messages.length === 0 ? (
            <div className="p-8 text-center text-muted">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">等待邮件到达...</p>
            </div>
          ) : (
            <div className="divide-y divide-line max-h-[60vh] overflow-y-auto">
              {messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => loadDetail(msg.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selectedId === msg.id ? "bg-accent/10 border-l-2 border-accent" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <p className="text-sm font-medium truncate">{msg.subject || "(无主题)"}</p>
                  <p className="text-xs text-muted truncate mt-0.5">{msg.from_address || "未知发件人"}</p>
                  <p className="text-xs text-muted mt-1">{relativeTime(msg.received_at)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Message detail */}
        <div className="card overflow-hidden">
          {!selectedId ? (
            <div className="p-12 text-center text-muted">
              <div className="text-3xl mb-2">👈</div>
              <p>选择一封邮件查看详情</p>
            </div>
          ) : detailLoading ? (
            <div className="p-12 flex justify-center"><Spinner /></div>
          ) : detail ? (
            <div>
              <div className="px-4 py-3 border-b border-line">
                <h2 className="font-medium">{detail.subject || "(无主题)"}</h2>
                <p className="text-sm text-muted mt-1">来自：{detail.from_address || "未知"}</p>
                <p className="text-xs text-muted">{new Date(detail.received_at).toLocaleString()}</p>
              </div>
              {detail.html_body ? (
                <iframe ref={iframeRef} className="w-full min-h-[400px] bg-white border-0" sandbox="allow-same-origin" title="邮件内容" />
              ) : detail.text_body ? (
                <pre className="p-4 text-sm whitespace-pre-wrap font-sans">{detail.text_body}</pre>
              ) : (
                <p className="p-4 text-muted text-sm">无正文内容</p>
              )}
              {detail.attachments.length > 0 && (
                <div className="px-4 py-3 border-t border-line">
                  <p className="text-xs text-muted mb-2">附件 ({detail.attachments.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/inbox/${encodeURIComponent(token!)}/attachments/${att.id}`}
                        className="btn-ghost !px-3 !py-1.5 !min-h-0 text-sm"
                        download
                      >
                        📎 {att.filename || att.id}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-muted">加载失败</div>
          )}
        </div>
      </div>
    </div>
  );
}
