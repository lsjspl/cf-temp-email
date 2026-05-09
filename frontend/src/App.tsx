import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./hooks/useConfirm";
import LoginPage from "./pages/LoginPage";
import SetupPage from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import InboxPage from "./pages/InboxPage";

export default function App() {
  const { user, requiresSetup, loading, refresh, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <LoginPage onSuccess={refresh} />}
        />
        <Route
          path="/setup"
          element={!requiresSetup ? <Navigate to={user ? "/app" : "/login"} replace /> : <SetupPage onSuccess={refresh} />}
        />
        <Route
          path="/app/*"
          element={!user ? <Navigate to={requiresSetup ? "/setup" : "/login"} replace /> : <DashboardPage user={user} onLogout={logout} />}
        />
        <Route path="/inbox/:token" element={<InboxPage />} />
        <Route path="*" element={<Navigate to={requiresSetup ? "/setup" : user ? "/app" : "/login"} replace />} />
      </Routes>
      </ConfirmProvider>
    </ToastProvider>
  );
}
