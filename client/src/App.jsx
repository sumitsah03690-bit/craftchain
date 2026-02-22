// ──────────────────────────────────────────────
// CraftChain — Root App Component
// ──────────────────────────────────────────────
// Discord-style 3-panel layout with protected
// routes, server hierarchy, and Minecraft-themed
// visuals.
// ──────────────────────────────────────────────

import { Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { useAuth } from "./contexts/AuthContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import ServerListPage from "./pages/ServerListPage.jsx";
import ServerPage from "./pages/ServerPage.jsx";

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
    <>
      <Routes>
        {/* ── Public landing page ──────────────── */}
        <Route path="/" element={<HomePage />} />

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
        <Route
          path="/servers"
          element={
            <ProtectedRoute>
              <AppShell>
                <div className="main-content">
                  <ServerListPage />
                </div>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/servers/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <ServerPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* ── Default redirect ────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Analytics />
    </>
  );
}

export default App;
