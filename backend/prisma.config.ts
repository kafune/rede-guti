import { defineConfig } from 'prisma/config'
import { readFileSync } from 'fs'
import { join } from 'path'

// Carregar manualmente o arquivo .env
const envPath = join(process.cwd(), '.env')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
} catch (error) {
  console.error('Failed to load .env file:', error)
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
