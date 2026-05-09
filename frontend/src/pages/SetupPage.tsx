import { FormEvent, useState } from "react";
import { apiPost } from "../lib/api";
import { t } from "../lib/i18n";

export default function SetupPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const ui = t().setup;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError(ui.passwordTooShort); return; }
    if (password !== confirm) { setError(ui.passwordMismatch); return; }
    setLoading(true);
    setError("");
    try {
      await apiPost("/setup/initialize", { email, username, password });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="logo" className="w-12 h-12 mx-auto mb-3 rounded-lg" />
          <h1 className="text-xl font-semibold">{ui.heading}</h1>
          <p className="text-muted text-sm mt-1">{ui.subtitle}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-muted text-sm mb-1.5 block">{ui.email}</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-muted text-sm mb-1.5 block">{ui.username}</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="text-muted text-sm mb-1.5 block">{ui.password}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="text-muted text-sm mb-1.5 block">{ui.confirmPassword}</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <div className="text-danger text-sm bg-danger/10 border border-danger/20 rounded-md px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">{ui.submit}</button>
        </form>
      </div>
    </div>
  );
}
