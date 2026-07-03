import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function agencyApiPlugin() {
  return {
    name: 'agency-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // GET /api/divisions -> returns divisions.json
        if (req.url === '/api/divisions' && req.method === 'GET') {
          try {
            const divisionsPath = path.resolve(__dirname, '../divisions.json')
            const divisionsData = fs.readFileSync(divisionsPath, 'utf-8')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(divisionsData)
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Error loading divisions: ' + err.message)
          }
          return
        }

        // GET /api/agents -> parses all agent MD files in category folders
        if (req.url === '/api/agents' && req.method === 'GET') {
          try {
            const rootDir = path.resolve(__dirname, '..')
            const divisionsPath = path.join(rootDir, 'divisions.json')
            if (!fs.existsSync(divisionsPath)) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify([]))
              return
            }
            
            const divisions = JSON.parse(fs.readFileSync(divisionsPath, 'utf-8')).divisions
            const agents = []
            
            for (const divisionKey of Object.keys(divisions)) {
              const dirPath = path.join(rootDir, divisionKey)
              if (!fs.existsSync(dirPath)) continue
              
              const files = fs.readdirSync(dirPath)
              for (const file of files) {
                if (!file.endsWith('.md')) continue
                const filePath = path.join(dirPath, file)
                try {
                  const content = fs.readFileSync(filePath, 'utf-8')
                  if (!content.startsWith('---')) continue
                  
                  const { data, content: body } = matter(content)
                  if (!data.name) continue
                  
                  agents.push({
                    slug: file.replace('.md', ''),
                    division: divisionKey,
                    name: data.name,
                    description: data.description || '',
                    color: data.color || 'gray',
                    emoji: data.emoji || '🤖',
                    vibe: data.vibe || '',
                    systemInstructions: body.trim()
                  })
                } catch (e) {
                  console.error('Error parsing agent file', filePath, e)
                }
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(agents))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Error loading agents: ' + err.message)
          }
          return
        }

        // POST /api/chat -> proxies streaming completion calls to Ollama or OpenRouter
        if (req.url.startsWith('/api/chat') && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body)
              const { provider, model, systemPrompt, messages, apiKey, ollamaHost } = payload

              let url = ''
              const headers = { 'Content-Type': 'application/json' }

              if (provider === 'ollama') {
                const host = ollamaHost || 'http://localhost:11434'
                url = `${host}/v1/chat/completions`
              } else if (provider === 'openrouter') {
                url = 'https://openrouter.ai/api/v1/chat/completions'
                headers['Authorization'] = `Bearer ${apiKey}`
                headers['HTTP-Referer'] = 'http://localhost:5173'
                headers['X-Title'] = 'Local Agency Client'
              } else {
                res.writeHead(400, { 'Content-Type': 'text/plain' })
                res.end('Unsupported provider: ' + provider)
                return
              }

              const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                  model: model,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages
                  ],
                  stream: true
                })
              })

              if (!response.ok) {
                const errMsg = await response.text()
                res.writeHead(response.status, { 'Content-Type': 'text/plain' })
                res.end(`API Error: ${errMsg}`)
                return
              }

              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
              })

              const reader = response.body.getReader()
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(value)
              }

              res.end()
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Error proxying chat: ' + err.message)
            }
          })
          return
        }

        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), agencyApiPlugin()],
  server: {
    port: 5173,
    host: true
  }
})
