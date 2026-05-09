import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "../lib/api";

interface Message {
  id: string;
  from_address: string | null;
  subject: string | null;
  received_at: string;
  attachment_count: number;
}

interface Mailbox {
  email_address: string;
  expires_at: string;
}

export default function InboxPage() {
  const { token } = useParams<{ token: string }>();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    loadMessages();
    const interval = setInterval(loadMessages, 30000);
    return () => clearInterval(interval);
  }, [token]);

  async function loadMessages() {
    try {
      const data = await apiGet<{ mailbox: Mailbox; messages: Message[] }>(
        `/inbox/${encodeURIComponent(token!)}/messages`,
      );
      setMailbox(data.mailbox);
      setMessages(data.messages);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <h1 className="text-lg font-semibold text-danger mb-2">收件箱不可用</h1>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-lg font-semibold font-mono">{mailbox?.email_address}</h1>
        <p className="text-muted text-sm">过期时间：{mailbox?.expires_at ? new Date(mailbox.expires_at).toLocaleString() : "-"}</p>
      </header>
      <div className="card">
        {messages.length === 0 ? (
          <div className="p-12 text-center text-muted">
            <div className="text-3xl mb-2">📭</div>
            <p>暂无邮件，等待中...</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {messages.map((msg) => (
              <div key={msg.id} className="px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{msg.subject || "(无主题)"}</p>
                    <p className="text-xs text-muted truncate">{msg.from_address || "-"}</p>
                  </div>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {new Date(msg.received_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
