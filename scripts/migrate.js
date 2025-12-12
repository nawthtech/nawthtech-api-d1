// backend/worker/scripts/migrate.js
import { readFileSync } from 'fs';
import { join } from 'path';

export async function runMigrations(env) {
  try {
    const migrationPath = join(process.cwd(), 'migrations', '0001_initial.sql');
    const sql = readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolon for individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
    
    console.log('✅ Database migration completed successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return { success: false, error: error.message };
  }
}