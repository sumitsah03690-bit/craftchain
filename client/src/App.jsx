// ──────────────────────────────────────────────
// CraftChain — Root App Component
// ──────────────────────────────────────────────
// Discord-style 3-panel layout with protected
// routes and Minecraft-themed visuals.
// ──────────────────────────────────────────────

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";

// ── Protected Route Wrapper ────────────────────
function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// ── App Shell Layout (with sidebar) ────────────
function AppShell({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        {children}
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      {/* ── Public auth routes (no sidebar) ────── */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* ── Protected routes (with sidebar) ────── */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell>
              <div className="main-content">
                <Dashboard />
              </div>
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <ProjectPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      {/* ── Default redirect ────────────────────── */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
