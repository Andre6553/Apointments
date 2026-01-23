import pg from 'pg'
const { Client } = pg
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function tryConnect(ip, region) {
    console.log(`Trying connection via ${region} pooler (${ip})...`)
    const client = new Client({
        host: ip,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: 'kGcCMPnlMRQZWDYb',
        ssl: {
            rejectUnauthorized: false,
            servername: 'db.wxwparezjiourhlvyalw.supabase.co'
        },
        connectionTimeoutMillis: 5000
    })

    try {
        await client.connect()
        console.log(`✅ Connected via ${region}!`)

        console.log('Reading migration file...')
        const migrationPath = path.join(__dirname, 'working_hours.sql')
        const migrationSql = fs.readFileSync(migrationPath, 'utf8')

        console.log('Applying migration...')
        await client.query(migrationSql)
        console.log('✅ Migration successful!')
        await client.end()
        return true
    } catch (err) {
        console.error(`❌ Failed via ${region}:`, err.message)
        await client.end().catch(() => { })
        return false
    }
}

async function run() {
    const regions = [
        { ip: '52.45.94.125', name: 'us-east-1' },
        { ip: '18.198.145.223', name: 'eu-central-1' }
    ]

    for (const r of regions) {
        const success = await tryConnect(r.ip, r.name)
        if (success) process.exit(0)
    }

    console.error('All regional pooler attempts failed.')
    process.exit(1)
}

run()
