import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Crear empresa por defecto
  const empresa = await prisma.empresa.create({
    data: {
      nombre: 'Mi Empresa SaaS',
      activa: true,
    },
  });

  // Crear inventarios por defecto
  const inventario1 = await prisma.inventario.create({
    data: {
      nombre: 'Depósito',
      empresaId: empresa.id,
    }
  });

  const inventario2 = await prisma.inventario.create({
    data: {
      nombre: 'Local',
      empresaId: empresa.id,
    }
  });

  // Crear Super Admins
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@miempresa.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const superAdminPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.usuario.createMany({
    data: [
      {
        nombre: 'Super Admin',
        email: adminEmail,
        password: superAdminPassword,
        rol: 'SUPER_ADMIN',
      },
      {
        nombre: 'Super Admin LRTech',
        email: 'lrtech.soluciones@gmail.com',
        password: superAdminPassword,
        rol: 'SUPER_ADMIN',
      }
    ]
  });

  // Crear Cliente de prueba
  const cliente = await prisma.cliente.create({
    data: {
      nombre: 'Cliente de Prueba',
      razonSocial: 'Prueba S.A.',
      empresaId: empresa.id,
    }
  });

  // Crear algunos artículos para que la API de ventas y catálogo funcione
  await prisma.articulo.createMany({
    data: [
      {
        id: '1',
        nombre: 'STRETCH 20mm',
        precio: 1500.50,
        inventarioId: inventario1.id,
        stockUnidades: 2000,
        stockKilos: 807.7,
        empresaId: empresa.id
      },
      {
        id: '2',
        nombre: 'STRETCH 25mm',
        precio: 1800.00,
        inventarioId: inventario1.id,
        stockUnidades: 59,
        empresaId: empresa.id
      },
      {
        id: 'prod-1',
        nombre: 'STRETCH CON MANGO 20',
        precio: 2500.00,
        inventarioId: inventario2.id,
        stockUnidades: 100,
        unidadesPorCaja: 4,
        empresaId: empresa.id
      }
    ]
  });

  console.log('Base de datos inicializada con éxito.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
