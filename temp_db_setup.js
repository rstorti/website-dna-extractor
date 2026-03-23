const dns = require('dns');
const { Client } = require('pg');
const fs = require('fs');

async function runSetup() {
    dns.lookup('db.wuvimbtowfbwpuvcyfhg.supabase.co', 4, async (err, address) => {
        if (err) {
            console.error('DNS lookup failed:', err);
            return;
        }

        console.log('Resolved to IPv4:', address);

        const client = new Client({
            host: address,
            port: 5432,
            user: 'postgres',
            password: 'DNAExtractor111!!',
            database: 'postgres',
            ssl: { rejectUnauthorized: false }
        });

        try {
            await client.connect();
            const sql = fs.readFileSync('supabase_setup.sql', 'utf8');
            await client.query(sql);
            console.log('Successfully executed database setup script!');
        } catch (e) {
            console.error('Database setup failed:', e);
        } finally {
            await client.end();
        }
    });
}

runSetup();
