import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Package,
  Factory,
  ShoppingCart,
  Users,
  FileText,
  LogOut,
  ClipboardList,
  Menu,
  ShieldAlert
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useState } from 'react';
import { RolUsuario } from '../types';
import { Toaster } from 'react-hot-toast';

export default function MainLayout() {
  const { user, empresa, logout } = useAuthStore();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Obtenemos los módulos activos de la empresa (si es array vacío, no tiene nada)
  const modulosActivos = (empresa?.config as any)?.modules || [];

  // Definimos TODOS los items posibles con sus requisitos
  const allNavItems = [
    {
      name: 'Inventario',
      path: '/inventory',
      icon: Package,
      roles: [RolUsuario.ADMIN, RolUsuario.VENDEDOR, RolUsuario.CAJA, RolUsuario.OPERARIO],
      moduloRequerido: 'INVENTARIO'
    },
    {
      name: 'Producción',
      path: '/production',
      icon: Factory,
      roles: [RolUsuario.ADMIN, RolUsuario.OPERARIO],
      moduloRequerido: 'PRODUCCION'
    },
    {
      name: 'Ventas',
      path: '/sales',
      icon: ShoppingCart,
      roles: [RolUsuario.ADMIN, RolUsuario.VENDEDOR, RolUsuario.CAJA],
      moduloRequerido: 'VENTAS'
    },
    {
      name: 'Pedidos',
      path: '/pedidos',
      icon: ClipboardList,
      roles: [RolUsuario.ADMIN, RolUsuario.VENDEDOR],
      moduloRequerido: 'PEDIDOS'
    },
    {
      name: 'Clientes',
      path: '/clients',
      icon: Users,
      roles: [RolUsuario.ADMIN, RolUsuario.VENDEDOR, RolUsuario.CAJA],
      moduloRequerido: null
    },
    {
      name: 'Auditoría',
      path: '/audit',
      icon: FileText,
      roles: [RolUsuario.ADMIN],
      moduloRequerido: null
    },
    {
      name: 'Super Admin',
      path: '/admin',
      icon: ShieldAlert,
      roles: [RolUsuario.SUPER_ADMIN],
      moduloRequerido: null
    }
  ];

  // Filtramos la lista según el rol y el plan de la empresa
  const navItems = allNavItems.filter(item => {
    // 1. Si el usuario no tiene el rol necesario, lo ocultamos
    if (!item.roles.includes(user?.rol as RolUsuario)) return false;
    // 2. El SUPER_ADMIN ve lo suyo sin importar módulos
    if (user?.rol === RolUsuario.SUPER_ADMIN) return true;
    // 3. Si el item requiere un módulo específico y la empresa no lo tiene, lo ocultamos
    if (item.moduloRequerido && !modulosActivos.includes(item.moduloRequerido)) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex h-24 items-center justify-center border-b border-slate-800 p-4">
          {empresa?.logoUrl ? (
            <img
              src={empresa.logoUrl}
              alt={empresa.nombre}
              className="max-h-24 w-full object-contain"
            />
          ) : (
            <h1 className="text-xl font-bold tracking-wider text-white truncate w-full text-center">
              {empresa?.nombre || 'LR|tech'}
            </h1>
          )}
        </div>

        <nav className="mt-6 flex flex-col gap-2 px-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full border-t border-slate-800 p-4 bg-slate-900">

          <div className="mb-4 flex flex-col items-center justify-center border-b border-slate-800 pb-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Powered by</span>
            <img
              src="/logo-default.svg"
              alt="LR Tech"
              className="h-14 w-auto object-contain"
            />
          </div>

          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 font-bold uppercase">
              {user?.nombre?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm font-medium">{user?.nombre}</p>
              <p className="text-xs text-slate-400">{user?.rol}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm lg:px-8">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="ml-auto flex items-center gap-4">
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
      <Toaster position="top-right" reverseOrder={false} />
    </div>
  );
}