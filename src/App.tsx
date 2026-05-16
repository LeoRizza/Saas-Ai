// src/App.tsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Inventory from './features/inventory/Inventory';
import Production from './features/production/Production';
import Clients from './features/clients/Clients';
import Sales from './features/sales/Sales';
import Audit from './features/audit/Audit';
import { SuperAdminPanel } from './features/admin/SuperAdminPanel';
import { Login } from './features/auth/Login';
import PedidosList from './features/pedidos/components/PedidosList';
import { useAuthStore } from './store/useAuthStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleProtectedRoute({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { user } = useAuthStore();
  if (!user || !allowedRoles.includes(user.rol)) {
    return <Navigate to="/inventory" replace />;
  }
  return <>{children}</>;
}

function IndexRedirect() {
  const { user } = useAuthStore();
  if (user?.rol === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to="/inventory" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<IndexRedirect />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="production" element={<Production />} />
          <Route path="sales" element={<Sales />} />
          <Route path="clients" element={<Clients />} />
          <Route path="audit" element={<Audit />} />
          <Route path="pedidos" element={<RoleProtectedRoute allowedRoles={['ADMIN', 'VENDEDOR']}><PedidosList /></RoleProtectedRoute>} />
          <Route path="admin" element={<SuperAdminPanel />} />
        </Route>
        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
