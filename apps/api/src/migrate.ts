import { migrate } from "@relay/db";
import { pgMigrationClient } from "@relay/db/pg";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL não definida, copie .env.example para .env na raiz do projeto');
    process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
    const applied = await migrate(pgMigrationClient(pool));
    console.log(applied.length > 0 ? `migrations aplicadas: ${applied.join(', ')}` : 'nenhuma migration pendente');
} finnaly {
    await pool.end();
}