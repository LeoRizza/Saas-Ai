import React, { useState, useEffect } from 'react';
import { useSuperAdminStore } from '../../store/useSuperAdminStore';
import { useInventariosStore } from '../../store/useInventariosStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RolUsuario } from '../../types';
import { Plus, Edit, Trash2, ShieldAlert, KeyRound, Package } from 'lucide-react';
import toast from 'react-hot-toast';

export function SuperAdminPanel() {
  const { empresas, usuarios, fetchData, addEmpresa, updateEmpresa, deleteEmpresa, addUsuario, updateUsuario, deleteUsuario } = useSuperAdminStore();
  const { inventarios, fetchInventarios, addInventario, updateInventario, deleteInventario } = useInventariosStore();

  useEffect(() => {
    fetchData();
    fetchInventarios();
  }, [fetchData, fetchInventarios]);

  const [isEmpresaModalOpen, setIsEmpresaModalOpen] = useState(false);
  const [isUsuarioModalOpen, setIsUsuarioModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isInventariosModalOpen, setIsInventariosModalOpen] = useState(false);
  const [editingEmpresaId, setEditingEmpresaId] = useState<string | null>(null);
  const [editingUsuarioId, setEditingUsuarioId] = useState<string | null>(null);
  const [selectedEmpresaForInventarios, setSelectedEmpresaForInventarios] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [empresaToDelete, setEmpresaToDelete] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [inventarioToDelete, setInventarioToDelete] = useState<string | null>(null);

  const [empresaForm, setEmpresaForm] = useState({
    nombre: '',
    activa: true,
    logoUrl: '',
    emailContacto: '',
    telefonoContacto: '',
    smtpUser: '',
    smtpPass: '',
    apiKey: '',
    config: { modules: [] as string[], maxImagenes: 4 }
  });

  const [usuarioForm, setUsuarioForm] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: RolUsuario.ADMIN,
    empresaId: ''
  });

  const [inventarioForm, setInventarioForm] = useState({
    id: '',
    nombre: ''
  });

  const openNewEmpresaModal = () => {
    setEditingEmpresaId(null);
    setEmpresaForm({
      nombre: '',
      activa: true,
      logoUrl: '',
      emailContacto: '',
      telefonoContacto: '',
      smtpUser: '',
      smtpPass: '',
      apiKey: '',
      config: { modules: ['INVENTARIO', 'VENTAS'], maxImagenes: 4 }
    });
    setIsEmpresaModalOpen(true);
  };

  const openEditEmpresaModal = (empresa: any) => {
    setEditingEmpresaId(empresa.id);
    setEmpresaForm({
      nombre: empresa.nombre,
      activa: empresa.activa,
      logoUrl: empresa.logoUrl || '',
      emailContacto: empresa.emailContacto || '',
      telefonoContacto: empresa.telefonoContacto || '',
      smtpUser: empresa.smtpUser || '',
      smtpPass: empresa.smtpPass || '',
      apiKey: empresa.apiKey || '',
      config: empresa.config || { modules: [] as string[], maxImagenes: 4 }
    });
    setIsEmpresaModalOpen(true);
  };

  const handleSaveEmpresa = async () => {
    try {
      if (editingEmpresaId) {
        await updateEmpresa(editingEmpresaId, empresaForm);
      } else {
        await addEmpresa(empresaForm);
      }
      setIsEmpresaModalOpen(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar la empresa');
    }
  };

  const openNewUsuarioModal = () => {
    setEditingUsuarioId(null);
    setUsuarioForm({
      nombre: '',
      email: '',
      password: '',
      rol: RolUsuario.ADMIN,
      empresaId: ''
    });
    setIsUsuarioModalOpen(true);
  };

  const openEditUsuarioModal = (usuario: any) => {
    setEditingUsuarioId(usuario.id);
    setUsuarioForm({
      nombre: usuario.nombre,
      email: usuario.email,
      password: '',
      rol: usuario.rol,
      empresaId: usuario.empresaId || ''
    });
    setIsUsuarioModalOpen(true);
  };

  const handleSaveUsuario = async () => {
    if (usuarioForm.rol !== RolUsuario.SUPER_ADMIN && !usuarioForm.empresaId) {
      toast.error("Debes seleccionar una empresa para este rol.");
      return;
    }
    if (!editingUsuarioId && !usuarioForm.password) {
      toast.error("La contraseña es obligatoria al crear un nuevo usuario.");
      return;
    }
    try {
      const dataToSave = { ...usuarioForm };
      if (dataToSave.rol === RolUsuario.SUPER_ADMIN) {
        delete (dataToSave as any).empresaId;
      }
      if (editingUsuarioId) {
        const { password, ...updateData } = dataToSave;
        await updateUsuario(editingUsuarioId, updateData);
      } else {
        await addUsuario(dataToSave);
      }
      setIsUsuarioModalOpen(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar el usuario');
    }
  };

  const openPasswordModal = (usuario: any) => {
    setEditingUsuarioId(usuario.id);
    setNewPassword('');
    setIsPasswordModalOpen(true);
  };

  const handleSavePassword = async () => {
    if (editingUsuarioId && newPassword) {
      await updateUsuario(editingUsuarioId, { password: newPassword });
      setIsPasswordModalOpen(false);
    }
  };

  const handleGenerateRandomPassword = () => {
    const randomPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    setNewPassword(randomPass);
  };

  const openInventariosModal = (empresa: any) => {
    setSelectedEmpresaForInventarios(empresa);
    setInventarioForm({ id: '', nombre: '' });
    setIsInventariosModalOpen(true);
  };

  const handleSaveInventario = async () => {
    if (!inventarioForm.nombre) return;
    try {
      if (inventarioForm.id) {
        await updateInventario(inventarioForm.id, inventarioForm.nombre);
      } else {
        await addInventario(inventarioForm.nombre, selectedEmpresaForInventarios.id);
      }
      setInventarioForm({ id: '', nombre: '' });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar el inventario');
    }
  };

  const handleDeleteInventario = async () => {
    if (inventarioToDelete) {
      try {
        await deleteInventario(inventarioToDelete);
        setInventarioToDelete(null);
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Error al eliminar el inventario');
      }
    }
  };

  const handleGenerateApiKey = () => {
    const randomPart = Math.random().toString(36).slice(2, 26) + Math.random().toString(36).slice(2, 10);
    const newApiKey = `lr_sk_${randomPart}`;
    setEmpresaForm({ ...empresaForm, apiKey: newApiKey });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-8 w-8 text-primary" />
            Super Admin Panel
          </h2>
          <p className="text-muted-foreground">Gestión global de Empresas y Usuarios.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Panel de Empresas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Empresas</CardTitle>
            <Button size="sm" onClick={openNewEmpresaModal}>
              <Plus className="h-4 w-4 mr-2" /> Nueva Empresa
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(empresas) ? empresas : []).map(empresa => (
                  <TableRow key={empresa.id}>
                    <TableCell className="font-medium">{empresa.nombre}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${empresa.activa ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {empresa.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" title="Gestionar Inventarios" onClick={() => openInventariosModal(empresa)}>
                        <Package className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditEmpresaModal(empresa)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setEmpresaToDelete(empresa.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Panel de Usuarios */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Usuarios Globales</CardTitle>
            <Button size="sm" onClick={openNewUsuarioModal}>
              <Plus className="h-4 w-4 mr-2" /> Nuevo Usuario
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(usuarios) ? usuarios : []).map(usuario => (
                  <TableRow key={usuario.id}>
                    <TableCell className="font-medium">{usuario.nombre}</TableCell>
                    <TableCell>{usuario.email}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-xs font-medium">
                        {usuario.rol}
                      </span>
                    </TableCell>
                    <TableCell>{empresas.find(e => e.id === usuario.empresaId)?.nombre || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" title="Cambiar Contraseña" onClick={() => openPasswordModal(usuario)}>
                        <KeyRound className="h-4 w-4 text-amber-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditUsuarioModal(usuario)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      {usuario.rol !== RolUsuario.SUPER_ADMIN && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setUserToDelete(usuario.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Modal Empresa */}
      <Dialog open={isEmpresaModalOpen} onOpenChange={setIsEmpresaModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEmpresaId ? 'Editar Empresa' : 'Nueva Empresa'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nombre de la Empresa</Label>
              <Input value={empresaForm.nombre} onChange={e => setEmpresaForm({ ...empresaForm, nombre: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Logo URL (Opcional)</Label>
              <Input value={empresaForm.logoUrl} onChange={e => setEmpresaForm({ ...empresaForm, logoUrl: e.target.value })} placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="activa" checked={empresaForm.activa} onChange={e => setEmpresaForm({ ...empresaForm, activa: e.target.checked })} className="h-4 w-4" />
              <Label htmlFor="activa">Empresa Activa (Permite login)</Label>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="grid gap-2">
                <Label>Email de Contacto</Label>
                <Input type="email" value={empresaForm.emailContacto} onChange={e => setEmpresaForm({ ...empresaForm, emailContacto: e.target.value })} placeholder="contacto@empresa.com" />
              </div>
              <div className="grid gap-2">
                <Label>Teléfono de Contacto</Label>
                <Input value={empresaForm.telefonoContacto} onChange={e => setEmpresaForm({ ...empresaForm, telefonoContacto: e.target.value })} placeholder="342 5678900" />
              </div>
            </div>
            <h4 className="font-semibold border-b pb-2 mt-4">Configuración de Correos (Opcional)</h4>
            <div className="grid gap-4 grid-cols-2">
              <div className="grid gap-2">
                <Label>Usuario SMTP (Email)</Label>
                <Input type="email" value={empresaForm.smtpUser} onChange={e => setEmpresaForm({ ...empresaForm, smtpUser: e.target.value })} placeholder="tu-email@gmail.com" />
              </div>
              <div className="grid gap-2">
                <Label>Contraseña SMTP</Label>
                <Input type="password" value={empresaForm.smtpPass} onChange={e => setEmpresaForm({ ...empresaForm, smtpPass: e.target.value })} placeholder="••••••••" />
              </div>
            </div>
            <h4 className="font-semibold border-b pb-2 mt-4">Integraciones Externas</h4>
            <div className="grid gap-2">
              <Label>API Key Secreta</Label>
              <div className="flex gap-2">
                <Input type="text" value={empresaForm.apiKey} readOnly placeholder="Se generará una nueva llave..." className="bg-muted cursor-not-allowed" />
                <Button type="button" variant="outline" onClick={handleGenerateApiKey}>Generar Nueva Llave</Button>
              </div>
            </div>
            <div className="grid gap-2 mt-4">
              <h4 className="font-semibold">Módulos Habilitados</h4>
              <div className="space-y-3">
                {['INVENTARIO', 'VENTAS', 'PRODUCCION', 'PEDIDOS'].map(moduleName => (
                  <div key={moduleName} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`module-${moduleName}`}
                      checked={empresaForm.config.modules?.includes(moduleName) || false}
                      onChange={e => {
                        const currentModules = empresaForm.config.modules || [];
                        const updatedModules = e.target.checked
                          ? [...currentModules, moduleName]
                          : currentModules.filter((m: string) => m !== moduleName);
                        setEmpresaForm({
                          ...empresaForm,
                          config: { ...empresaForm.config, modules: updatedModules }
                        });
                      }}
                      className="h-4 w-4"
                    />
                    <Label htmlFor={`module-${moduleName}`} className="font-normal cursor-pointer">
                      {moduleName}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <h4 className="font-semibold border-b pb-2 mt-4">Límites del Plan</h4>
            <div className="grid gap-2">
              <Label>Límite de Imágenes por Artículo</Label>
              <Input 
                type="number" 
                min="1"
                max="20"
                value={empresaForm.config.maxImagenes || 4} 
                onChange={e => setEmpresaForm({
                  ...empresaForm, 
                  config: { ...empresaForm.config, maxImagenes: parseInt(e.target.value) || 4 }
                })} 
              />
              <p className="text-xs text-muted-foreground">Define cuántas fotos puede subir esta empresa a un solo producto.</p>
            </div>
            <Button onClick={handleSaveEmpresa} className="mt-4">Guardar Empresa</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Inventarios */}
      <Dialog open={isInventariosModalOpen} onOpenChange={setIsInventariosModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inventarios de {selectedEmpresaForInventarios?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex gap-2 items-end">
              <div className="grid gap-2 flex-1">
                <Label>Nombre del Inventario</Label>
                <Input
                  value={inventarioForm.nombre}
                  onChange={e => setInventarioForm({ ...inventarioForm, nombre: e.target.value })}
                  placeholder="Ej: Depósito Central"
                />
              </div>
              <Button onClick={handleSaveInventario} disabled={!inventarioForm.nombre}>
                {inventarioForm.id ? 'Actualizar' : 'Agregar'}
              </Button>
              {inventarioForm.id && (
                <Button variant="outline" onClick={() => setInventarioForm({ id: '', nombre: '' })}>
                  Cancelar
                </Button>
              )}
            </div>

            <div className="mt-4 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventarios.filter(i => i.empresaId === selectedEmpresaForInventarios?.id).map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.nombre}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setInventarioForm({ id: inv.id, nombre: inv.nombre })}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setInventarioToDelete(inv.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {inventarios.filter(i => i.empresaId === selectedEmpresaForInventarios?.id).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-4 text-muted-foreground">
                        No hay inventarios registrados para esta empresa.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Usuario */}
      <Dialog open={isUsuarioModalOpen} onOpenChange={setIsUsuarioModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUsuarioId ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nombre</Label>
              <Input value={usuarioForm.nombre} onChange={e => setUsuarioForm({ ...usuarioForm, nombre: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={usuarioForm.email} onChange={e => setUsuarioForm({ ...usuarioForm, email: e.target.value })} />
            </div>
            {!editingUsuarioId && (
              <div className="grid gap-2">
                <Label>Contraseña (Cópiala para dársela al usuario)</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    autoComplete="new-password"
                    value={usuarioForm.password}
                    onChange={e => setUsuarioForm({ ...usuarioForm, password: e.target.value })}
                    placeholder="Escribe o genera una clave..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const randomPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
                      setUsuarioForm({ ...usuarioForm, password: randomPass });
                    }}
                  >
                    Generar
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Rol</Label>
              <Select
                value={usuarioForm.rol}
                onValueChange={v => setUsuarioForm({ ...usuarioForm, rol: v as RolUsuario })}
                disabled={usuarioForm.rol === RolUsuario.SUPER_ADMIN}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RolUsuario.ADMIN}>ADMIN</SelectItem>
                  <SelectItem value={RolUsuario.VENDEDOR}>Vendedor</SelectItem>
                  <SelectItem value={RolUsuario.CAJA}>Caja</SelectItem>
                  <SelectItem value={RolUsuario.OPERARIO}>Operario</SelectItem>
                  {usuarioForm.rol === RolUsuario.SUPER_ADMIN && (
                    <SelectItem value={RolUsuario.SUPER_ADMIN}>Super Admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {usuarioForm.rol !== RolUsuario.SUPER_ADMIN && (
              <div className="grid gap-2">
                <Label>Empresa Asignada</Label>
                <Select value={usuarioForm.empresaId} onValueChange={v => setUsuarioForm({ ...usuarioForm, empresaId: v || '' })}>
                  <SelectTrigger>
                    <SelectValue>
                      {usuarioForm.empresaId ? empresas.find(e => e.id === usuarioForm.empresaId)?.nombre : "Seleccionar empresa..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleSaveUsuario} className="mt-4">Guardar Usuario</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Contraseña */}
      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nueva Contraseña</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Ingrese nueva contraseña..."
                />
                <Button variant="outline" onClick={handleGenerateRandomPassword}>Generar</Button>
              </div>
            </div>
            <Button onClick={handleSavePassword} className="mt-4">Guardar Contraseña</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminar Empresa */}
      <Dialog open={!!empresaToDelete} onOpenChange={(open) => !open && setEmpresaToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>¿Estás seguro de que deseas eliminar esta empresa? Esta acción no se puede deshacer.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEmpresaToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              try {
                if (empresaToDelete) {
                  await deleteEmpresa(empresaToDelete);
                  toast.success("Empresa eliminada correctamente");
                }
                setEmpresaToDelete(null);
              } catch (error: any) {
                toast.error(error.response?.data?.message || "No se pudo eliminar la empresa");
              }
            }}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminar Inventario */}
      <Dialog open={!!inventarioToDelete} onOpenChange={(open) => !open && setInventarioToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>¿Estás seguro de que deseas eliminar este inventario? Esta acción no se puede deshacer.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInventarioToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteInventario}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminar Usuario */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUserToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              try {
                if (userToDelete) {
                  await deleteUsuario(userToDelete);
                  toast.success("Usuario eliminado correctamente");
                }
                setUserToDelete(null);
              } catch (error: any) {
                toast.error(error.response?.data?.message || "No se pudo eliminar el usuario");
              }
            }}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
