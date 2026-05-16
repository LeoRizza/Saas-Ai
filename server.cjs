// server.cjs - Entry point para Hostinger (Passenger)
require("dotenv").config();
process.env.NODE_ENV = "production";

// Registramos ts-node y le decimos que ignore el tsconfig.json conflictivo
require("ts-node").register({
    transpileOnly: true,
    skipProject: true, // ¡ESTA ES LA CLAVE!
    compilerOptions: {
        module: "CommonJS",
        target: "ES2022",
        esModuleInterop: true,
    },
});

// Passenger inyecta el puerto en process.env.PORT
require("./server.ts");
