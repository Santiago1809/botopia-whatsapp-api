export enum Role {
  user = 'user',
  admin = 'admin'
}
export interface User {
  active: boolean
  countryCode: string | null
  createdAt: string
  email: string
  id: number
  password: string
  phoneNumber: string | null
  role: Role
  tokensPerResponse: number
  updatedAt: string
  username: string
}

export interface Agent {
  id: number
  isGlobal: boolean
  ownerId: number
  prompt: string
  title: string
}
export interface Payment {
  amount: number
  createdAt: string
  currency: string
  id: number
  reference: string | null
  status: string
  userId: number | null
}
export interface UserCredits {
  createdAt: string
  creditsLimit: number
  id: number
  month: number
  totalCredits: number
  updatedAt: string
  usedCredits: number
  userId: number
  year: number
}
export interface WhatsAppNumber {
  aiEnabled: boolean
  aiModel: string
  aiPrompt: string
  id: number
  name: string
  number: string
  responseGroups: boolean
  userId: number
}

export interface SyncedContact {
  id: number
  userId: number
  numberId: number
  contactId: string
  type: 'contact' | 'group'
  createdAt: string
}

export interface Contact {
  id: string
  isGroup: boolean
  isMyContact: boolean
  name: string
  number: string | null
  wa_id: string
}

export interface Group extends Contact {
  number: string | null
}