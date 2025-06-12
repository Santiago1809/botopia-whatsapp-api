import { GoogleGenAI } from '@google/genai'
import type { Message } from '../interfaces/global'
import { config } from 'dotenv'

config()
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

export async function getAIResponse(
  prompt: string,
  userMsg: string,
  model = 'gemini-2.0-flash',
  chatHistory: Message[] = [],
) {
  try {
    let messages = chatHistory.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))
    // Asegura que el primer mensaje sea del usuario
    if (messages.length > 0 && messages[0]?.role !== 'user') {
      // Si no comienza con usuario, recorta desde el primer mensaje de usuario
      const firstUserIndex = messages.findIndex((m) => m.role === 'user')
      if (firstUserIndex === -1) {
        messages = []
      } else {
        messages = messages.slice(firstUserIndex)
      }
    }

    // Crea el chat
    const chat = ai.chats.create({
      model,
      history: messages,
      config: {
        temperature: 0,
        systemInstruction: prompt
      }
    })

    // Envía el mensaje del usuario
    const response = await chat.sendMessage({
      message: userMsg
    })

    return [response.text, response.usageMetadata?.candidatesTokenCount]
  } catch (error) {
    console.error('Error in getAIResponse:', error)
    throw new Error('Failed to get AI response')
  }
}
