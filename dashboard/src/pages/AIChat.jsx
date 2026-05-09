import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { Send, Loader2, Bot, User } from 'lucide-react'

export default function AIChat() {
  const { user } = useAuth()
  const [siteKey, setSiteKey] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [siteLoading, setSiteLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSiteKey(data?.site_key || null)
      setSiteLoading(false)
    }
    load()
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || loading || !siteKey) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const data = await fetchApi('/ai-chat', {
        method: 'POST',
        body: JSON.stringify({ question, site_key: siteKey })
      })

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        results: data.results
      }])
    } catch (err) {
      if (err.message === 'Subscription required') return
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.message || 'Failed to connect to server',
        isError: true
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (siteLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!siteKey) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">AI Chat</h2>
          <p className="text-gray-500 mt-2">Set up your site in Settings first</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">AI Chat</h2>
        <p className="text-sm text-gray-500 mt-1">Ask questions about your marketing data</p>
      </div>

      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            <p>Ask a question like:</p>
            <p className="text-sm mt-1">"What are my top traffic sources?"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.isError ? 'bg-red-100' : 'bg-indigo-100'}`}>
                <Bot className={`w-4 h-4 ${msg.isError ? 'text-red-600' : 'text-indigo-600'}`} />
              </div>
            )}

            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
              <div className={`rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : msg.isError
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-white border border-gray-200 text-gray-900'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>

              {msg.results && msg.results.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50">
                        {msg.results[0].map((_, ci) => (
                          <th key={ci} className="px-3 py-2 text-left font-medium text-gray-500 border-b border-gray-200">
                            Col {ci + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {msg.results.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 text-gray-700 border-b border-gray-100">
                              {cell === null ? '-' : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-gray-200 pt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your data..."
          disabled={loading}
          maxLength={500}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
