// Zero-install local Postgres for development (PGlite over the Postgres wire protocol).
// Data persists in backend/.devdb. Use a real Postgres (DATABASE_URL) in production.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.DEV_DB_PORT || 5433);
const db = await PGlite.create('./.devdb');
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`🐘 Dev Postgres (PGlite) on postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
