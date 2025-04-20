import { GoogleGenAI } from '@google/genai'
import type { User } from '../../generated/prisma'
import type { Message } from '../interfaces/global'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

export async function getAIResponse(
  prompt: string,
  userMsg: string,
  model = 'gemini-1.5-turbo',
  chatHistory: Message[] = [],
  user: User | null = null
) {
  try {
    const maxTokens =
      user && user.tokensPerResponse ? user.tokensPerResponse : 120
    let messages = []
    if (prompt) {
      const hasSystemMessage = chatHistory.some(
        (msg) => msg.role === 'model' && msg.content === prompt
      )
      if (!hasSystemMessage) {
        messages.push({
          role: 'model',
          content: prompt,
          timestamp: Date.now()
        })
      }
    }
    if (chatHistory && chatHistory.length > 0) {
      const formattedHistory = chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content
      }))
      messages = [...messages, ...formattedHistory]
    }

    const chat = ai.chats.create({
      model,
      history: messages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })),
      config: {
        maxOutputTokens: maxTokens,
        temperature: 0.1,
        systemInstruction: prompt
      }
    })
    const response = await chat.sendMessage({
      message: userMsg,
      config: { systemInstruction: prompt }
    })
    return [response.text, response.usageMetadata?.candidatesTokenCount]
  } catch (error) {
    console.error('Error in getAIResponse:', error)
    throw new Error('Failed to get AI response')
  }
}
