import OpenAI from 'openai'

const MODEL_CONFIGS = {
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat'
  },
  kimi: {
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey: process.env.KIMI_API_KEY,
    model: 'moonshot-v1-8k'
  },
  openai: {
    baseURL: undefined,
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  },
  anthropic: {
    // TODO: confirm anthropic-compatible endpoint before enabling
  }
}

export async function callAI(systemPrompt, userMessage) {
  const provider = process.env.AI_PROVIDER || 'deepseek'
  const config = MODEL_CONFIGS[provider]

  if (!config || !config.apiKey) {
    throw new Error(`Unknown or unconfigured AI provider: ${provider}`)
  }

  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  })

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  })

  const message = completion.choices[0]?.message
  if (!message) {
    throw new Error('AI returned empty response')
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter(part => part.type === 'text' || typeof part === 'string')
      .map(part => typeof part === 'string' ? part : part.text)
      .join('')
  }

  return String(message.content)
}
