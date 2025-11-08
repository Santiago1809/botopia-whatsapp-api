import * as contactsController from './whatsapp/contacts.controller.js'
import * as messagesController from './whatsapp/messages.controller.js'
import * as sessionController from './whatsapp/session.controller.js'

// Re-exportar todas las funciones de los controladores modulares
export const {
  getContacts,
  syncContacts,
  syncContactsToDB,
  getSyncedContacts,
  deleteSynced,
  updateAgenteHabilitado,
  bulkUpdateAgenteHabilitado
} = contactsController

export const { sendMessage, getMessageUsage, syncAllHistoriesBatch } =
  messagesController

export const { startWhatsApp, stopWhatsApp, setupSocketEvents } =
  sessionController
