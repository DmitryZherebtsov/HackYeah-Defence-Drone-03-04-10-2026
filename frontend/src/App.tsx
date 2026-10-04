import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PendingVerificationPage } from './pages/PendingVerificationPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminAuditLogsPage } from './pages/AdminAuditLogsPage';
import { DronesPage } from './pages/DronesPage';
import { MissionsPage } from './pages/MissionsPage';
import { MissionPage } from './pages/MissionPage';
import { MissionReportPage } from './pages/MissionReportPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          {/* Strony uwierzytelniania (bez bocznego menu) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pending" element={<PendingVerificationPage />} />

          {/* Główna powłoka aplikacji z Sidebar i Topbar (Layout) */}
          <Route element={<Layout />}>
            {/* Strona startowa – Centrum Dowodzenia C2 */}
            <Route path="/" element={<Navigate to="/dashboard/missions" replace />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/missions" replace />} />

            {/* Operacje dronowe */}
            <Route
              path="/dashboard/drones"
              element={
                <ProtectedRoute>
                  <DronesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/missions"
              element={
                <ProtectedRoute>
                  <MissionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/missions/:id"
              element={
                <ProtectedRoute>
                  <MissionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/missions/:id/report"
              element={
                <ProtectedRoute>
                  <MissionReportPage />
                </ProtectedRoute>
              }
            />

            {/* Trasy dla administratora */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminAuditLogsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin/logs"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminAuditLogsPage />
                </ProtectedRoute>
              }
            />

            {/* Przekierowanie fallback */}
            <Route path="*" element={<Navigate to="/dashboard/missions" replace />} />
          </Route>
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
