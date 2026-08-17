import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MessageCircle, X, FileText } from "lucide-react";
import { useClientStore } from "../../../store/useClientStore";
import { useAuthStore } from "../../../store/useAuthStore";
import { useInventoryStore } from "../../../store/useInventoryStore";
import toast from "react-hot-toast";

// Interface para los items del carrito de cotización
interface QuoteLineItem {
    articulo: any;
    cantidad: number | '';
    descuento: number | '';
}

interface CotizadorModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientePreseleccionado?: any | null;
    onSaveQuote?: (quoteData: any) => void; // Callback opcional para guardar la cotización como pedido
}

export default function CotizadorModal({
    isOpen,
    onClose,
    clientePreseleccionado = null,
    onSaveQuote,
}: CotizadorModalProps) {
    const { empresa, token } = useAuthStore();
    const { clientes } = useClientStore();
    const { articulos, fetchInventory } = useInventoryStore();

        // Estados del cotizador
    const [selectedClient, setSelectedClient] = useState<any>(clientePreseleccionado);
    const [quoteCart, setQuoteCart] = useState<QuoteLineItem[]>([]);
    const [quoteSearch, setQuoteSearch] = useState("");
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [clientSearchInput, setClientSearchInput] = useState("");
    const [isProspectMode, setIsProspectMode] = useState(false);
    const [prospectNombre, setProspectNombre] = useState("");
    const [prospectEmail, setProspectEmail] = useState("");
    const [prospectTelefono, setProspectTelefono] = useState("");
    const [moneda, setMoneda] = useState("ARS");
    const [recargoPorcentaje, setRecargoPorcentaje] = useState<number | ''>('');
    const [aclaraciones, setAclaraciones] = useState("");

    // Sincronizar cliente preseleccionado cuando cambia
    useEffect(() => {
        if (clientePreseleccionado) {
            setSelectedClient(clientePreseleccionado);
        }
    }, [clientePreseleccionado]);

    // Cargar inventario si no está cargado
    useEffect(() => {
        if (articulos.length === 0) {
            fetchInventory();
        }
    }, [articulos.length, fetchInventory]);

    // Filtrar artículos por búsqueda
    const filteredArticulos = articulos.filter((a) => {
        const searchLower = quoteSearch.toLowerCase();
        return (
            a.nombre?.toLowerCase().includes(searchLower) ||
            a.codigoBarras?.toLowerCase().includes(searchLower) ||
            a.descripcion?.toLowerCase().includes(searchLower)
        );
    });

    // Filtrar clientes para seleccionar (si no hay cliente preseleccionado)
    const filteredClientes = clientes
        .filter((c) => c.empresaId === empresa?.id)
        .filter((c) =>
            c.nombre.toLowerCase().includes(clientSearchInput.toLowerCase()) ||
            (c.razonSocial && c.razonSocial.toLowerCase().includes(clientSearchInput.toLowerCase()))
        );

    // ============ FUNCIONES DEL CARRITO ============

        // Agregar artículo al carrito de cotización
    const addArticuloToQuoteCart = (articulo: any) => {
        const existe = quoteCart.find((item) => item.articulo.id === articulo.id);
        if (existe) {
            setQuoteCart(
                quoteCart.map((item) =>
                    item.articulo.id === articulo.id ? { ...item, cantidad: (typeof item.cantidad === 'number' ? item.cantidad : 0) + 1 } : item
                )
            );
        } else {
            setQuoteCart([...quoteCart, { articulo, cantidad: 1, descuento: 0 }]);
        }
        toast.success(`${articulo.nombre} agregado al cotizador`);
    };

            // Actualizar cantidad en carrito (acepta number | '' para permitir borrado)
    const updateQuantity = (articuloId: string, newQuantity: number | '') => {
        if (typeof newQuantity === 'number' && newQuantity < 1) return;
        setQuoteCart(
            quoteCart.map((item) =>
                item.articulo.id === articuloId ? { ...item, cantidad: newQuantity } : item
            )
        );
    };

        // Actualizar descuento en carrito (acepta number | '' para permitir borrado)
    const updateDiscount = (articuloId: string, newDiscount: number | '') => {
        if (typeof newDiscount === 'number' && (newDiscount < 0 || newDiscount > 100)) return;
        setQuoteCart(
            quoteCart.map((item) =>
                item.articulo.id === articuloId ? { ...item, descuento: newDiscount } : item
            )
        );
    };

    // Remover artículo del carrito
    const removeFromQuoteCart = (articuloId: string) => {
        setQuoteCart(quoteCart.filter((item) => item.articulo.id !== articuloId));
    };

    // ============ FUNCIONES DE CÁLCULO ============

    // Calcular subtotal de un item
    const calculateItemSubtotal = (precioUnitario: number, cantidad: number, descuento: number) => {
        const subtotal = precioUnitario * cantidad;
        const descuentoAplicado = subtotal * (descuento / 100);
        return subtotal - descuentoAplicado;
    };

                        // Calcular totales - Memoizado para evitar recálculos innecesarios
    const totals = useMemo(() => {
        const subtotal = quoteCart.reduce((sum, item) => {
            // Convertir cantidad y descuento vacíos a 0 antes de calcular
            const cantidad = typeof item.cantidad === 'number' ? item.cantidad : 0;
            const descuento = typeof item.descuento === 'number' ? item.descuento : 0;
            return sum + calculateItemSubtotal(item.articulo.precio || 0, cantidad, descuento);
        }, 0);

        // Calcular impuestos como recargo aplicado al subtotal
        const impuestos = subtotal * ((typeof recargoPorcentaje === 'number' ? recargoPorcentaje : 0) / 100);
        const total = subtotal + impuestos;

        return { subtotal, impuestos, total };
    }, [quoteCart, recargoPorcentaje]);

    // ============ FUNCIONES DE ENVÍO ============

    // Guardar cotización sin enviar
    const handleSaveOnly = async () => {
        const hasClient = selectedClient || (isProspectMode && prospectNombre.trim());
        if (!hasClient) {
            toast.error("Por favor selecciona un cliente o ingresa el nombre del prospecto");
            return;
        }

        if (quoteCart.length === 0) {
            toast.error("El carrito está vacío");
            return;
        }

                const { subtotal, impuestos, total } = totals;

                                if (onSaveQuote) {
            try {
                await onSaveQuote({
                    clienteId: isProspectMode ? null : selectedClient?.id,
                    nombre: isProspectMode ? prospectNombre : selectedClient?.nombre,
                    email: isProspectMode ? prospectEmail : selectedClient?.email,
                    telefono: isProspectMode ? prospectTelefono : selectedClient?.telefono,
                    items: quoteCart,
                    subtotal,
                    impuestos,
                    total,
                    tag: "PENDIENTE",
                    metodoEnvio: "SISTEMA",
                    moneda,
                    mensaje: aclaraciones || "Cotización guardada desde el sistema.",
                });
                toast.success("Pedido guardado correctamente");
                setQuoteCart([]);
                onClose();
            } catch (error) {
                console.error("Error al guardar:", error);
            }
        }
    };

    // Enviar cotización por WhatsApp y opcionalmente guardar como pedido
    const handleSendWhatsAppQuote = async () => {
        // Validaciones
        const hasClient = selectedClient || (isProspectMode && prospectNombre.trim());
        if (!hasClient) {
            toast.error("Por favor selecciona un cliente o ingresa el nombre del prospecto");
            return;
        }

        const telefono = isProspectMode ? prospectTelefono : selectedClient?.telefono;
        if (!telefono || !telefono.trim()) {
            toast.error("Por favor ingresa un teléfono");
            return;
        }

        if (quoteCart.length === 0) {
            toast.error("El carrito de cotización está vacío");
            return;
        }

        // Limpiar el número: remover espacios, guiones, paréntesis, dejando solo números
        const numeroLimpio = telefono.replace(/[\s\-()]/g, "");

        if (!numeroLimpio) {
            toast.error("El teléfono no contiene números válidos");
            return;
        }

                const { subtotal, impuestos, total } = totals;
        const nombreContacto = isProspectMode ? prospectNombre : selectedClient?.nombre;

        // Mapeo de símbolos de moneda
        const monedaSymbols: { [key: string]: string } = {
            "USD": "$",
            "EUR": "€",
            "ARS": "$"
        };
        const monedaSymbol = monedaSymbols[moneda] || "$";

        // Construir mensaje formateado para WhatsApp (Versión segura sin emojis complejos)
        let mensajeWhatsApp = `*COTIZACIÓN - ${empresa?.nombre || "Laris"}*\n\n`;
        mensajeWhatsApp += `Hola *${nombreContacto}*,\n\n`;
        mensajeWhatsApp += `Te comparto tu cotización con los siguientes detalles:\n\n`;
        mensajeWhatsApp += `*DETALLE DE PRODUCTOS:*\n`;

                quoteCart.forEach((item) => {
            // Convertir cantidad y descuento vacíos a 0 antes de calcular
            const cantidad = typeof item.cantidad === 'number' ? item.cantidad : 0;
            const descuento = typeof item.descuento === 'number' ? item.descuento : 0;
            const itemSubtotal = calculateItemSubtotal(item.articulo.precio || 0, cantidad, descuento);
            const descuentoText = descuento > 0 ? ` (Desc. ${descuento}%)` : "";
            mensajeWhatsApp += `- ${cantidad}x *${item.articulo.nombre}*\n`;
            mensajeWhatsApp += `   Precio: ${monedaSymbol}${(item.articulo.precio || 0).toFixed(2)}${descuentoText}\n`;
            mensajeWhatsApp += `   Subtotal: *${monedaSymbol}${itemSubtotal.toFixed(2)}*\n\n`;
        });

                mensajeWhatsApp += `-----------------------------------\n`;
        mensajeWhatsApp += `*SUBTOTAL:* ${monedaSymbol}${subtotal.toFixed(2)}\n`;
        if (impuestos > 0) mensajeWhatsApp += `*RECARGOS / OTROS:* ${monedaSymbol}${impuestos.toFixed(2)}\n`;
        mensajeWhatsApp += `*TOTAL:* *${monedaSymbol}${total.toFixed(2)}*\n`;
        mensajeWhatsApp += `-----------------------------------\n\n`;
        if (aclaraciones.trim()) mensajeWhatsApp += `*ACLARACIONES:*\n${aclaraciones}\n\n`;
        mensajeWhatsApp += `Si tiene preguntas o desea realizar cambios, no dude en contactarnos.\n\n`;
        mensajeWhatsApp += `Atentamente,\n*${empresa?.nombre || "Nuestro equipo de ventas"}*`;
        // Codificar el mensaje para la URL de WhatsApp
        const mensajeCodificado = encodeURIComponent(mensajeWhatsApp);

        // Construir y abrir el enlace de WhatsApp
        const urlWhatsApp = `https://wa.me/${numeroLimpio}?text=${mensajeCodificado}`;
        window.open(urlWhatsApp, "_blank");

                                // Guardar como pedido si hay callback
        if (onSaveQuote) {
            try {
                await onSaveQuote({
                    clienteId: isProspectMode ? null : selectedClient?.id,
                    nombre: isProspectMode ? prospectNombre : selectedClient?.nombre,
                    email: isProspectMode ? prospectEmail : selectedClient?.email,
                    telefono: isProspectMode ? prospectTelefono : selectedClient?.telefono,
                    items: quoteCart,
                    subtotal,
                    impuestos,
                    total,
                    tag: "COTIZADO",
                    metodoEnvio: "WHATSAPP",
                    moneda,
                    mensaje: aclaraciones || "Cotización enviada por WhatsApp.",
                });
            } catch (error) {
                console.error("Error al guardar la cotización como pedido:", error);
            }
        }

        toast.success("Abriendo WhatsApp... Revisa y envía la cotización.");
        onClose();
    };

    // Enviar cotización por correo y opcionalmente guardar como pedido
    const handleSendQuote = async () => {
        // Validaciones
        const hasClient = selectedClient || (isProspectMode && prospectNombre.trim());
        if (!hasClient) {
            toast.error("Por favor selecciona un cliente o ingresa el nombre del prospecto");
            return;
        }

        const email = isProspectMode ? prospectEmail : selectedClient?.email;
        if (!email) {
            toast.error("Por favor ingresa un email");
            return;
        }

        if (quoteCart.length === 0) {
            toast.error("El carrito de cotización está vacío");
            return;
        }

                const { subtotal, impuestos, total } = totals;

        try {
            setIsSendingEmail(true);

                        // Enviar cotización por correo
            await axios.post(
                "/api/mailer/quote",
                {
                    emailCliente: email,
                    nombreCliente: isProspectMode ? prospectNombre : selectedClient?.nombre,
                    items: quoteCart,
                    subtotal,
                    impuestos,
                    total,
                    empresaId: empresa?.id,
                    moneda,
                    mensaje: aclaraciones || "Cotización enviada por correo electrónico.",
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

                                                // Guardar como pedido si hay callback
            if (onSaveQuote) {
                await onSaveQuote({
                    clienteId: isProspectMode ? null : selectedClient?.id,
                    nombre: isProspectMode ? prospectNombre : selectedClient?.nombre,
                    email: isProspectMode ? prospectEmail : selectedClient?.email,
                    telefono: isProspectMode ? prospectTelefono : selectedClient?.telefono,
                    items: quoteCart,
                    subtotal,
                    impuestos,
                    total,
                    tag: "COTIZADO",
                    metodoEnvio: "EMAIL",
                    moneda,
                    mensaje: aclaraciones || "Cotización enviada por correo electrónico.",
                });
            }

            toast.success("Cotización enviada exitosamente");
            setQuoteCart([]);
            onClose();
        } catch (error) {
            console.error("Error al enviar la cotización:", error);
            toast.error("No se pudo enviar la cotización. Intenta de nuevo.");
        } finally {
            setIsSendingEmail(false);
        }
    };

    // ============ MANEJO DEL MODAL ============

        const handleClose = () => {
        // Resetear estados
        if (!clientePreseleccionado) {
            setSelectedClient(null);
            setClientSearchInput("");
            setIsProspectMode(false);
            setProspectNombre("");
            setProspectEmail("");
            setProspectTelefono("");
        }
        setQuoteCart([]);
        setQuoteSearch("");
        setIsSendingEmail(false);
        setRecargoPorcentaje('');
        setAclaraciones("");
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Cotizador Rápido
                        {selectedClient && ` - ${selectedClient.nombre}`}
                        {isProspectMode && prospectNombre && ` - ${prospectNombre}`}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* SELECTOR DE CLIENTE (si no viene preseleccionado) */}
                    {!clientePreseleccionado && (
                        <div className="border-b pb-4">
                            <Label className="mb-3 block font-semibold">Seleccionar Cliente *</Label>
                            {/* Botones tipo pestañas para alternar entre Cliente Existente y Nuevo Prospecto */}
                            <div className="flex gap-2 mb-4">
                                <Button
                                    onClick={() => {
                                        setIsProspectMode(false);
                                        setSelectedClient(null);
                                        setClientSearchInput("");
                                    }}
                                    variant={!isProspectMode ? "default" : "outline"}
                                    className="flex-1"
                                >
                                    Cliente Existente
                                </Button>
                                <Button
                                    onClick={() => {
                                        setIsProspectMode(true);
                                        setSelectedClient(null);
                                        setClientSearchInput("");
                                    }}
                                    variant={isProspectMode ? "default" : "outline"}
                                    className="flex-1"
                                >
                                    Nuevo Prospecto
                                </Button>
                            </div>
                            {/* MODO: Cliente Existente */}
                            {!isProspectMode ? (
                                <div>
                                    {selectedClient ? (
                                        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                            <div>
                                                <p className="font-medium">{selectedClient.nombre}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {selectedClient.email} | {selectedClient.telefono}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setSelectedClient(null);
                                                    setClientSearchInput("");
                                                }}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    type="search"
                                                    placeholder="Buscar cliente por nombre o razón social..."
                                                    className="pl-8"
                                                    value={clientSearchInput}
                                                    onChange={(e) => setClientSearchInput(e.target.value)}
                                                />
                                            </div>
                                            {clientSearchInput && filteredClientes.length > 0 && (
                                                <div className="border rounded-lg max-h-48 overflow-y-auto">
                                                    {filteredClientes.map((cliente) => (
                                                        <button
                                                            key={cliente.id}
                                                            className="w-full text-left p-3 hover:bg-muted/50 border-b last:border-b-0 transition-colors"
                                                            onClick={() => {
                                                                setSelectedClient(cliente);
                                                                setClientSearchInput("");
                                                            }}
                                                        >
                                                            <p className="font-medium text-sm">{cliente.nombre}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {cliente.email} | {cliente.telefono}
                                                            </p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {clientSearchInput && filteredClientes.length === 0 && (
                                                <div className="text-center text-muted-foreground text-sm py-4">
                                                    No se encontraron clientes
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* MODO: Nuevo Prospecto */
                                <div className="space-y-3 bg-slate-50 rounded-lg p-4">
                                    <div>
                                        <Label htmlFor="prospectNombre" className="text-sm font-medium mb-1 block">
                                            Nombre *
                                        </Label>
                                        <Input
                                            id="prospectNombre"
                                            placeholder="Nombre del prospecto"
                                            value={prospectNombre}
                                            onChange={(e) => setProspectNombre(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="prospectEmail" className="text-sm font-medium mb-1 block">
                                            Email
                                        </Label>
                                        <Input
                                            id="prospectEmail"
                                            type="email"
                                            placeholder="correo@ejemplo.com"
                                            value={prospectEmail}
                                            onChange={(e) => setProspectEmail(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="prospectTelefono" className="text-sm font-medium mb-1 block">
                                            Teléfono
                                        </Label>
                                        <Input
                                            id="prospectTelefono"
                                            type="tel"
                                            placeholder="342 4234567"
                                            value={prospectTelefono}
                                            onChange={(e) => setProspectTelefono(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CONTENIDO PRINCIPAL: Solo mostrar si hay cliente seleccionado O si estamos en modo prospecto con nombre */}
                    {selectedClient || (isProspectMode && prospectNombre.trim()) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* COLUMNA IZQUIERDA: BÚSQUEDA Y LISTADO DE ARTÍCULOS */}
                            <div className="border-r pr-6 space-y-4">
                                <div>
                                    <Label htmlFor="quoteSearch" className="mb-2 block font-semibold">
                                        Buscar Artículos
                                    </Label>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="quoteSearch"
                                            type="search"
                                            placeholder="Nombre, código o descripción..."
                                            className="pl-8"
                                            value={quoteSearch}
                                            onChange={(e) => setQuoteSearch(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-4 bg-muted/20">
                                    {filteredArticulos.length > 0 ? (
                                        filteredArticulos.map((articulo) => (
                                            <div
                                                key={articulo.id}
                                                className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                                            >
                                                <div className="flex-1">
                                                    <p className="font-medium text-sm">{articulo.nombre}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        ${(articulo.precio || 0).toFixed(2)} - {articulo.codigoBarras || "N/A"}
                                                    </p>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="ml-2"
                                                    onClick={() => addArticuloToQuoteCart(articulo)}
                                                    title="Agregar al carrito"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center text-muted-foreground text-sm py-8">
                                            {quoteSearch.length === 0 ? "Escribe para buscar artículos" : "No se encontraron artículos"}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* COLUMNA DERECHA: CARRITO Y TOTAL */}
                            <div className="space-y-4">
                                <div>
                                    <Label className="mb-2 block font-semibold">Carrito de Cotización</Label>
                                    {quoteCart.length > 0 ? (
                                        <div className="space-y-2 max-h-[350px] overflow-y-auto border rounded-lg p-4 bg-muted/20">
                                            <div className="space-y-3">
                                                                                                {quoteCart.map((item) => {
                                                    // Convertir cantidad y descuento vacíos a 0 antes de calcular
                                                    const cantidad = typeof item.cantidad === 'number' ? item.cantidad : 0;
                                                    const descuento = typeof item.descuento === 'number' ? item.descuento : 0;
                                                    const itemSubtotal = calculateItemSubtotal(
                                                        item.articulo.precio || 0,
                                                        cantidad,
                                                        descuento
                                                    );
                                                    return (
                                                        <div key={item.articulo.id} className="border-b pb-3 last:border-b-0">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="flex-1">
                                                                    <p className="font-medium text-sm">{item.articulo.nombre}</p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        ${(item.articulo.precio || 0).toFixed(2)} unitario
                                                                    </p>
                                                                </div>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="text-destructive hover:text-destructive ml-2"
                                                                    onClick={() => removeFromQuoteCart(item.articulo.id)}
                                                                    title="Eliminar del carrito"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2 text-sm">
                                                                <div>
                                                                    <label className="text-xs text-muted-foreground">Cantidad</label>
                                                                    <Input
                                                                        type="number"
                                                                        min="1"
                                                                        value={item.cantidad}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            updateQuantity(item.articulo.id, val === '' ? '' : parseInt(val, 10));
                                                                        }}
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-xs text-muted-foreground">Desc. %</label>
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        max="100"
                                                                        value={item.descuento}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            updateDiscount(item.articulo.id, val === '' ? '' : parseFloat(val));
                                                                        }}
                                                                        className="h-8 text-xs"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-xs text-muted-foreground">Subtotal</label>
                                                                    <div className="h-8 bg-green-50 border border-green-200 rounded px-2 py-1 flex items-center justify-center">
                                                                        <span className="text-xs font-semibold text-green-700">
                                                                            ${itemSubtotal.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
                                            El carrito está vacío. Agrega artículos desde la izquierda.
                                        </div>
                                    )}
                                </div>

                                                                {/* RESUMEN TOTALES */}
                                {quoteCart.length > 0 && (
                                    <div className="space-y-0 bg-slate-50 rounded-lg overflow-hidden border">
                                        <div className="flex items-center justify-between gap-4 p-4 border-b bg-white flex-wrap">
                                            <div className="flex items-center gap-4 flex-1 min-w-max">
                                                <div>
                                                    <Label className="font-semibold text-sm">Moneda de Cotización</Label>
                                                    <Select value={moneda} onValueChange={(value) => setMoneda(value ?? "ARS")}>
                                                        <SelectTrigger className="w-[140px] h-9">
                                                            <SelectValue placeholder="Seleccionar" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="USD">USD - Dólar</SelectItem>
                                                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                                                            <SelectItem value="ARS">ARS - Peso Arg.</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label htmlFor="recargoPorcentaje" className="font-semibold text-sm">Recargo / Otros (%)</Label>
                                                    <Input
                                                        id="recargoPorcentaje"
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        step="0.01"
                                                        placeholder="0"
                                                        value={recargoPorcentaje}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setRecargoPorcentaje(val === '' ? '' : parseFloat(val));
                                                        }}
                                                        className="h-9 w-24"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3 p-4">
                                                                                        <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Subtotal:</span>
                                                <span className="font-medium">{moneda === "EUR" ? "€" : "$"}{totals.subtotal.toFixed(2)}</span>
                                            </div>
                                                                                        <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Recargos / Otros:</span>
                                                <span className="font-medium">{moneda === "EUR" ? "€" : "$"}{totals.impuestos.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-lg border-t pt-3">
                                                <span className="font-bold">TOTAL:</span>
                                                <span className="font-bold text-green-600 text-2xl">
                                                    {moneda === "EUR" ? "€" : "$"}{totals.total.toFixed(2)}
                                                </span>
                                            </div>
                                                                                </div>
                                    </div>
                                )}

                                {/* ACLARACIONES */}
                                {quoteCart.length > 0 && (
                                    <div>
                                        <Label htmlFor="aclaraciones" className="mb-2 block font-semibold">Aclaraciones o Notas (Opcional)</Label>
                                        <textarea
                                            id="aclaraciones"
                                            placeholder="Ingresa cualquier aclaración, nota o especificación adicional..."
                                            value={aclaraciones}
                                            onChange={(e) => setAclaraciones(e.target.value)}
                                            className="w-full p-2 border rounded-lg bg-white text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            {!isProspectMode
                                ? "Selecciona un cliente para comenzar a cotizar"
                                : "Ingresa el nombre del prospecto para comenzar a cotizar"}
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-6 border-t pt-4 flex flex-col sm:flex-row gap-3 sm:justify-between items-center">
                    <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                        Cancelar
                    </Button>
                    {(selectedClient || (isProspectMode && prospectNombre.trim())) && quoteCart.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto justify-end">
                            {onSaveQuote && (
                                <Button
                                    onClick={handleSaveOnly}
                                    variant="secondary"
                                    className="gap-2 border-slate-300 shadow-sm w-full sm:w-auto hover:bg-slate-100"
                                >
                                    <FileText className="h-4 w-4" />
                                    Crear Pedido (Sin Enviar)
                                </Button>
                            )}
                            <Button
                                onClick={handleSendWhatsAppQuote}
                                className="gap-2 bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                            >
                                <MessageCircle className="h-4 w-4" />
                                WhatsApp
                            </Button>
                            <Button
                                onClick={handleSendQuote}
                                disabled={isSendingEmail}
                                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                            >
                                {isSendingEmail ? "Enviando..." : "Correo"}
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}