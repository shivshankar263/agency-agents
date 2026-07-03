import React, { useState, useEffect, useRef } from 'react'

export default function App() {
  // Catalog & Navigation State
  const [divisions, setDivisions] = useState({})
  const [agents, setAgents] = useState([])
  const [selectedDivision, setSelectedDivision] = useState(null) // null = All, 'settings' = Settings
  const [selectedAgent, setSelectedAgent] = useState(null)
  
  // Settings State (loaded from localStorage)
  const [ollamaHost, setOllamaHost] = useState(() => localStorage.getItem('agency_ollamaHost') || 'http://localhost:11434')
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('agency_ollamaModel') || 'qwen-uncensored')
  const [openRouterKey, setOpenRouterKey] = useState(() => localStorage.getItem('agency_openRouterKey') || '')
  const [openRouterModel, setOpenRouterModel] = useState(() => localStorage.getItem('agency_openRouterModel') || 'meta-llama/llama-3-8b-instruct:free')
  const [freeOnly, setFreeOnly] = useState(() => {
    const saved = localStorage.getItem('agency_freeOnly')
    return saved === null ? true : saved === 'true'
  })
  
  // Model Overrides State
  const [modelOverrides, setModelOverrides] = useState(() => {
    const saved = localStorage.getItem('agency_modelOverrides')
    return saved ? JSON.parse(saved) : {}
  })

  // List of local models fetched from Ollama
  const [localModels, setLocalModels] = useState([])
  
  // Conversation History state: { [agentSlug]: [{ role, content }] }
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('agency_conversations')
    return saved ? JSON.parse(saved) : {}
  })

  // UI inputs
  const [inputMessage, setInputMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  const chatEndRef = useRef(null)

  // Save settings when changed
  useEffect(() => {
    localStorage.setItem('agency_ollamaHost', ollamaHost)
    localStorage.setItem('agency_ollamaModel', ollamaModel)
    localStorage.setItem('agency_openRouterKey', openRouterKey)
    localStorage.setItem('agency_openRouterModel', openRouterModel)
    localStorage.setItem('agency_freeOnly', String(freeOnly))
  }, [ollamaHost, ollamaModel, openRouterKey, openRouterModel, freeOnly])

  useEffect(() => {
    localStorage.setItem('agency_modelOverrides', JSON.stringify(modelOverrides))
  }, [modelOverrides])

  useEffect(() => {
    localStorage.setItem('agency_conversations', JSON.stringify(conversations))
  }, [conversations])

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversations, selectedAgent, isStreaming])

  // Fetch divisions and agents from middleware API
  useEffect(() => {
    async function fetchData() {
      try {
        const divRes = await fetch('/api/divisions')
        const divData = await divRes.json()
        setDivisions(divData.divisions || {})
        
        const agRes = await fetch('/api/agents')
        const agData = await agRes.json()
        setAgents(agData || [])
      } catch (err) {
        console.error('Error fetching data from API:', err)
      }
    }
    fetchData()
  }, [])

  // Fetch local models from Ollama
  useEffect(() => {
    async function fetchOllamaModels() {
      try {
        const res = await fetch(`${ollamaHost}/api/tags`)
        if (res.ok) {
          const data = await res.json()
          if (data.models) {
            setLocalModels(data.models.map(m => m.name.split(':')[0]))
          }
        }
      } catch (e) {
        console.warn('Could not fetch tags from local Ollama host:', e)
      }
    }
    fetchOllamaModels()
  }, [ollamaHost])

  // List of OpenRouter models (filtered based on freeOnly setting)
  const openRouterModelList = freeOnly 
    ? [
        { id: 'meta-llama/llama-3-8b-instruct:free', name: 'Llama 3 8B Instruct (Free)' },
        { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B IT (Free)' },
        { id: 'qwen/qwen-2-7b-instruct:free', name: 'Qwen 2 7B Instruct (Free)' },
        { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct (Free)' },
        { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Phi 3 Medium (Free)' }
      ]
    : [
        { id: 'meta-llama/llama-3-8b-instruct:free', name: 'Llama 3 8B Instruct (Free)' },
        { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B IT (Free)' },
        { id: 'qwen/qwen-2-7b-instruct:free', name: 'Qwen 2 7B Instruct (Free)' },
        { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct (Free)' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Paid)' },
        { id: 'openai/gpt-4o', name: 'GPT-4o (Paid)' }
      ]

  // Get active model settings for selected agent
  const getAgentModelSettings = (agentSlug) => {
    if (modelOverrides[agentSlug]) {
      return modelOverrides[agentSlug]
    }
    // Fallback: If agent is in engineering, default to Ollama (local), else OpenRouter (or vice versa)
    const agent = agents.find(a => a.slug === agentSlug)
    if (agent && agent.division === 'engineering') {
      return { provider: 'ollama', model: ollamaModel }
    }
    return { provider: openRouterKey ? 'openrouter' : 'ollama', model: openRouterKey ? openRouterModel : ollamaModel }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!inputMessage.trim() || !selectedAgent || isStreaming) return

    const agentSlug = selectedAgent.slug
    const agentSettings = getAgentModelSettings(agentSlug)
    
    const userMsg = { role: 'user', content: inputMessage }
    
    // Add user message to history
    const currentHistory = conversations[agentSlug] || []
    const updatedHistory = [...currentHistory, userMsg]
    
    setConversations(prev => ({
      ...prev,
      [agentSlug]: updatedHistory
    }))
    setInputMessage('')
    setIsStreaming(true)

    // Append a placeholder assistant message
    const assistantPlaceholder = { role: 'assistant', content: '' }
    setConversations(prev => ({
      ...prev,
      [agentSlug]: [...updatedHistory, assistantPlaceholder]
    }))

    try {
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: agentSettings.provider,
          model: agentSettings.model,
          systemPrompt: selectedAgent.systemInstructions,
          messages: updatedHistory,
          apiKey: openRouterKey,
          ollamaHost: ollamaHost
        })
      })

      if (!chatRes.ok) {
        const errorText = await chatRes.text()
        throw new Error(errorText || 'Server error')
      }

      const reader = chatRes.body.getReader()
      const decoder = new TextDecoder()
      let streamContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // keep partial line in buffer

        for (const line of lines) {
          const cleaned = line.trim()
          if (!cleaned.startsWith('data: ')) continue
          const jsonStr = cleaned.slice(6)
          if (jsonStr === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(jsonStr)
            const chunkText = parsed.choices[0]?.delta?.content || ''
            streamContent += chunkText
            
            // Update streaming state live
            setConversations(prev => {
              const hist = prev[agentSlug] || []
              if (hist.length === 0) return prev
              const updated = [...hist]
              updated[updated.length - 1] = { role: 'assistant', content: streamContent }
              return { ...prev, [agentSlug]: updated }
            })
          } catch (err) {
            // silent parse error (incomplete JSON chunk)
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err)
      setConversations(prev => {
        const hist = prev[agentSlug] || []
        const updated = [...hist]
        updated[updated.length - 1] = { 
          role: 'assistant', 
          content: `⚠️ Error running agent: ${err.message}. Please check your connection settings.` 
        }
        return { ...prev, [agentSlug]: updated }
      })
    } finally {
      setIsStreaming(false)
    }
  }

  const clearChatHistory = (agentSlug) => {
    setConversations(prev => {
      const updated = { ...prev }
      delete updated[agentSlug]
      return updated
    })
  }

  // Filter agents based on search query and selected division
  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          agent.description.toLowerCase().includes(searchQuery.toLowerCase())
    if (selectedDivision === null) return matchesSearch
    if (selectedDivision === 'settings') return false
    return agent.division === selectedDivision && matchesSearch
  })

  const currentAgentSettings = selectedAgent ? getAgentModelSettings(selectedAgent.slug) : null

  return (
    <div className="app-container">
      {/* 1. SIDEBAR PANEL */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">🎭</span>
          <span className="sidebar-title">The Agency</span>
        </div>
        
        <div className="sidebar-scroll">
          <div 
            className={`division-item ${selectedDivision === null ? 'active' : ''}`}
            onClick={() => { setSelectedDivision(null); setSelectedAgent(null); }}
          >
            <span className="division-icon">🏢</span>
            <span>All Divisions</span>
          </div>

          <div className="panel-section-title" style={{ padding: '12px 14px 4px' }}>Divisions</div>
          {Object.entries(divisions).map(([key, value]) => (
            <div 
              key={key}
              className={`division-item ${selectedDivision === key ? 'active' : ''}`}
              onClick={() => { setSelectedDivision(key); setSelectedAgent(null); }}
            >
              <span className="division-icon" style={{ color: value.color }}>●</span>
              <span>{value.label}</span>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button 
            className={`btn-footer ${selectedDivision === 'settings' ? 'active' : ''}`}
            onClick={() => { setSelectedDivision('settings'); setSelectedAgent(null); }}
          >
            <span>⚙️</span> Settings & Models
          </button>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="main-workspace">
        {selectedDivision === 'settings' ? (
          /* SETTINGS VIEW */
          <div className="settings-container">
            <header className="settings-header">
              <h1>Settings & Model Configuration</h1>
              <p>Configure local Ollama options, remote API keys, and model routes.</p>
            </header>

            <div className="settings-card">
              <h2 className="settings-card-title">🔌 Global Provider Settings</h2>
              
              <div className="toggle-group">
                <div className="toggle-label-wrapper">
                  <span className="toggle-title">Only Show Free Models</span>
                  <span className="toggle-desc">Hides paid models and features to guarantee zero costs.</span>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={freeOnly}
                    onChange={(e) => setFreeOnly(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="form-group">
                <label>Ollama API Host Endpoint</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={ollamaHost}
                  onChange={(e) => setOllamaHost(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>

              <div className="form-group">
                <label>Default Local Ollama Model</label>
                {localModels.length > 0 ? (
                  <select 
                    className="form-select"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                  >
                    {localModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    className="form-input" 
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="e.g. qwen-uncensored"
                  />
                )}
                <span className="toggle-desc" style={{ marginTop: 2 }}>
                  {localModels.length > 0 ? "✓ Connected to Ollama" : "⚠️ Ollama offline. Enter model name manually."}
                </span>
              </div>

              <div className="form-group">
                <label>OpenRouter API Key (Optional)</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={openRouterKey}
                  onChange={(e) => setOpenRouterKey(e.target.value)}
                  placeholder="sk-or-..."
                />
              </div>

              <div className="form-group">
                <label>Default OpenRouter Model</label>
                <select 
                  className="form-select"
                  value={openRouterModel}
                  onChange={(e) => setOpenRouterModel(e.target.value)}
                >
                  {openRouterModelList.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="settings-card">
              <h2 className="settings-card-title">💡 Running Free Models</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                1. <strong>Local Ollama</strong>: Runs completely offline and cost-free. To import GGUF models like your <code>qwen-uncensored</code>, create a <code>Modelfile</code> with <code>FROM &lt;filepath&gt;.gguf</code> and run <code>ollama create qwen-uncensored</code>.
                <br/><br/>
                2. <strong>OpenRouter Free Tier</strong>: Connects to public free models like Llama 3 8B. Requires an API key, but billing charges stay at $0.00.
              </p>
            </div>
          </div>
        ) : selectedAgent ? (
          /* CHAT CONVERSATION VIEW */
          <div className="chat-container">
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <header className="workspace-header">
                <div className="workspace-header-title">
                  <h2>{selectedAgent.emoji} {selectedAgent.name}</h2>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>• {divisions[selectedAgent.division]?.label}</span>
                </div>
                <button 
                  className="btn-footer" 
                  style={{ width: 'auto', padding: '6px 12px' }}
                  onClick={() => clearChatHistory(selectedAgent.slug)}
                >
                  🗑️ Clear History
                </button>
              </header>

              {/* Chat Message Lists */}
              <div className="chat-history">
                {(conversations[selectedAgent.slug] || []).length === 0 ? (
                  <div className="chat-welcome">
                    <span className="chat-welcome-emoji">{selectedAgent.emoji}</span>
                    <h2>Hello, I am your {selectedAgent.name}</h2>
                    <p>{selectedAgent.description}</p>
                    <div className="badge-free" style={{ marginTop: 8 }}>
                      Vibe: {selectedAgent.vibe || 'Ready to assist'}
                    </div>
                  </div>
                ) : (
                  (conversations[selectedAgent.slug] || []).map((msg, i) => (
                    <div key={i} className={`message-bubble ${msg.role}`}>
                      <div className="message-avatar">
                        {msg.role === 'user' ? '👤' : selectedAgent.emoji}
                      </div>
                      <div className="message-content-wrapper">
                        <span className="message-sender">{msg.role === 'user' ? 'User' : selectedAgent.name}</span>
                        <div className="message-content">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              <div className="chat-input-area">
                <form onSubmit={handleSendMessage} className="chat-input-container">
                  <textarea 
                    className="chat-input"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={`Message ${selectedAgent.name}...`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage(e)
                      }
                    }}
                  />
                  <button 
                    type="submit" 
                    className="btn-send"
                    disabled={!inputMessage.trim() || isStreaming}
                  >
                    🚀
                  </button>
                </form>
              </div>
            </div>

            {/* Right Information & Routing Control Panel */}
            <aside className="agent-info-panel">
              <div className="agent-profile">
                <div className="agent-profile-emoji">{selectedAgent.emoji}</div>
                <div className="agent-profile-name">{selectedAgent.name}</div>
                <p className="agent-profile-desc">{selectedAgent.description}</p>
              </div>

              <div>
                <h3 className="panel-section-title">⚙️ Model Routing (Overrides)</h3>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Provider</label>
                  <select 
                    className="form-select"
                    value={currentAgentSettings?.provider}
                    onChange={(e) => {
                      const prov = e.target.value
                      const defaultMod = prov === 'ollama' ? ollamaModel : openRouterModel
                      setModelOverrides(prev => ({
                        ...prev,
                        [selectedAgent.slug]: { provider: prov, model: defaultMod }
                      }))
                    }}
                  >
                    <option value="ollama">Ollama (Local/Free)</option>
                    {openRouterKey && <option value="openrouter">OpenRouter (API)</option>}
                  </select>
                </div>

                <div className="form-group">
                  <label>Model</label>
                  {currentAgentSettings?.provider === 'ollama' ? (
                    localModels.length > 0 ? (
                      <select 
                        className="form-select"
                        value={currentAgentSettings.model}
                        onChange={(e) => {
                          setModelOverrides(prev => ({
                            ...prev,
                            [selectedAgent.slug]: { ...prev[selectedAgent.slug], model: e.target.value }
                          }))
                        }}
                      >
                        {localModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        className="form-input" 
                        value={currentAgentSettings.model}
                        onChange={(e) => {
                          setModelOverrides(prev => ({
                            ...prev,
                            [selectedAgent.slug]: { ...prev[selectedAgent.slug], model: e.target.value }
                          }))
                        }}
                      />
                    )
                  ) : (
                    <select 
                      className="form-select"
                      value={currentAgentSettings?.model}
                      onChange={(e) => {
                        setModelOverrides(prev => ({
                          ...prev,
                          [selectedAgent.slug]: { ...prev[selectedAgent.slug], model: e.target.value }
                        }))
                      }}
                    >
                      {openRouterModelList.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                  {currentAgentSettings?.provider === 'ollama' ? (
                    <span className="badge-local">Local Node</span>
                  ) : (
                    <span className="badge-free">Free Cloud Tier</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="panel-section-title">📋 System Directives</h3>
                <div className="instructions-box">
                  {selectedAgent.systemInstructions.substring(0, 1000)}...
                </div>
              </div>
            </aside>
          </div>
        ) : (
          /* DIRECTORY CATALOG GRID VIEW */
          <div className="catalog-container">
            <header className="catalog-title-section">
              <h1>
                {selectedDivision === null 
                  ? 'Agency Specialist Roster' 
                  : `${divisions[selectedDivision]?.label} Division`}
              </h1>
              <p>Select a specialist from the directory to start a chat and deploy their specific directives.</p>
              
              <input 
                type="text" 
                className="form-input" 
                style={{ marginTop: 16, maxWidth: 400 }}
                placeholder="Search specialists by role or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </header>

            <div className="agent-grid">
              {filteredAgents.map(agent => (
                <div 
                  key={agent.slug}
                  className="agent-card"
                  style={{ '--agent-accent': divisions[agent.division]?.color }}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <div className="agent-card-header">
                    <span className="agent-card-emoji">{agent.emoji}</span>
                    <span className="agent-card-name">{agent.name}</span>
                  </div>
                  <p className="agent-card-desc">{agent.description}</p>
                  {agent.vibe && (
                    <div className="agent-card-vibe">Vibe: {agent.vibe}</div>
                  )}
                </div>
              ))}
              {filteredAgents.length === 0 && (
                <div style={{ color: 'var(--text-muted)', padding: '24px 0' }}>
                  No specialists found. Try adjusting your search query.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
