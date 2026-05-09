import { FormEvent, useState } from "react";
import { apiPost } from "../lib/api";
import { t } from "../lib/i18n";

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const ui = t().login;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!login || !password) { setError(ui.missingFields); return; }
    setLoading(true);
    setError("");
    try {
      await apiPost("/auth/login", { login, password });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.failed);
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
            <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label className="text-muted text-sm mb-1.5 block">{ui.password}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <div className="text-danger text-sm bg-danger/10 border border-danger/20 rounded-md px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? ui.submitting : ui.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
