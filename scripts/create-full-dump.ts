
import * as fs from 'fs';
import * as path from 'path';

const schemaPath = path.join(process.cwd(), 'db', 'consolidated_schema.sql');
const dataPath = path.join(process.cwd(), 'db', 'neon_dump.sql');
const fullPath = path.join(process.cwd(), 'db', 'full_neon_backup.sql');

if (fs.existsSync(schemaPath) && fs.existsSync(dataPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const data = fs.readFileSync(dataPath, 'utf-8');
    fs.writeFileSync(fullPath, schema + '\n\n' + data);
    console.log(`Full backup created at ${fullPath}`);
} else {
    console.error('Missing schema or data file');
}
