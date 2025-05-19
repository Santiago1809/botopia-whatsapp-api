import * as contactsController from './whatsapp/contacts.controller'
import * as messagesController from './whatsapp/messages.controller'
import * as sessionController from './whatsapp/session.controller'

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

export const {
  sendMessage,
  syncAllHistoriesBatch
} = messagesController

export const {
  startWhatsApp,
  stopWhatsApp,
  setupSocketEvents
} = sessionController
