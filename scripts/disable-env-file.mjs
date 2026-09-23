// Preloader de tests: evita que server.js cargue el .env local (que apunta a
// Supabase produccion) para que los tests sigan aislados con sus mocks y
// llaves explicitas. Se inyecta con node --import antes de los tests.
process.env.ARIAD_SKIP_ENV_FILE = "1";
