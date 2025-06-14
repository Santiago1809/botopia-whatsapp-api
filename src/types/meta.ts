/**
 * Modelo de tipos para Meta API Integration
 */

// Tipos para MetaApiService
export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface MetaUserInfo {
  id: string;
  name: string;
  email?: string;
}

export interface MetaPermissions {
  [key: string]: boolean;
}

// WhatsApp Types
export interface WhatsappBusinessAccount {
  id: string;
  name: string;
  currency?: string;
  timezone_id?: string;
  message_template_namespace?: string;  analytics?: {
    phone_numbers?: {
      id: string;
      display_phone_number: string;
      verified_name: string;
      quality_rating?: string;
    }[];
    metrics?: Record<string, number>;
  };
  verification_status?: string;
  quality_score?: {
    score: number;
    rating: string;
  };
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: {
    type: string;
    format?: string;
    text?: string;
    buttons?: {
      type: string;
      text: string;
      url?: string;
      phone_number?: string;
      payload?: string;
    }[];
    example?: {
      header_text?: string[];
      body_text?: string[][];
      header_handle?: string[];
    };
  }[];
}

export interface WhatsAppMessageSendResult {
  messaging_product: string;
  contacts: {
    input: string;
    wa_id: string;
  }[];
  messages: {
    id: string;
  }[];
}

// Facebook Types
export interface FacebookPage {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
  link?: string;
  picture?: {
    data: {
      url: string;
    };
  };
  access_token?: string;
}

export interface FacebookPostResult {
  id: string;
  post_id?: string;
}

// Instagram Types
export interface InstagramBusinessAccount {
  id: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
  ig_id?: string;
  facebook_page_id?: string;
  facebook_page_name?: string;
}

export interface InstagramMediaResult {
  id: string;
  media_id?: string;
}

// Webhook Types
export interface WhatsappWebhookEntry {
  id: string;
  changes: {
    field: string;
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: {
        profile: {
          name: string;
        };
        wa_id: string;
      }[];
      messages?: {
        from: string;
        id: string;
        timestamp: string;
        text?: {
          body: string;
        };
        type: string;
        image?: {
          id: string;
          mime_type: string;
          sha256: string;
        };
        video?: {
          id: string;
        };
        audio?: {
          id: string;
        };
        document?: {
          id: string;
        };
      }[];
      statuses?: {
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
      }[];
    };
  }[];
}

export interface FacebookWebhookEntry {
  id: string;
  time: number;  changes?: {
    field: string;
    value: Record<string, unknown>;
  }[];
  messaging?: {
    sender: {
      id: string;
    };
    recipient: {
      id: string;
    };
    timestamp: number;
    message: {
      mid: string;
      text?: string;
      attachments?: {
        type: string;
        payload: {
          url: string;
        };
      }[];
    };
  }[];
}

export interface InstagramWebhookEntry {
  id: string;
  time: number;  changes: {
    field: string;
    value: Record<string, unknown>;
  }[];
}

// Analytics Types
export interface AnalyticsItem {
  name: string;
  count: number;
}

export interface WhatsappAnalytics {
  byType: AnalyticsItem[];
  byStatus: AnalyticsItem[];
  byDate: AnalyticsItem[];
  totals: {
    count: number;
  };
}

export interface FacebookAnalytics {
  byPage: AnalyticsItem[];
  byDate: AnalyticsItem[];
  totals: {
    count: number;
  };
}

export interface InstagramAnalytics {
  byAccount: AnalyticsItem[];
  byDate: AnalyticsItem[];
  totals: {
    count: number;
  };
}

// Database Tables
export interface MetaTokensTable {
  id?: number;
  userId: string;
  metaUserId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaAuthStateTable {
  id?: number;
  userId: string;
  state: string;
  createdAt: string;
}

export interface WhatsAppTemplatesTable {
  id?: number;
  userId: string;
  templateId: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: {
    type: string;
    format?: string;
    text?: string;
    buttons?: {
      type: string;
      text: string;
      url?: string;
      phone_number?: string;
      payload?: string;
    }[];
    example?: {
      header_text?: string[];
      body_text?: string[][];
      header_handle?: string[];
    };
  }[];
  createdAt: string;
}

export interface MessagesTable {
  id?: number;
  userId: string;
  platform: 'whatsapp' | 'facebook' | 'instagram';
  type: string;
  to: string;
  content?: string;
  templateName?: string;
  components?: {
    type: string;
    parameters?: {
      type: string;
      text?: string;
      currency?: {
        fallback_value: string;
        code: string;
        amount_1000: number;
      };
      date_time?: {
        fallback_value: string;
      };
      image?: {
        link: string;
      };
      document?: {
        link: string;
      };
    }[];
  }[];
  mediaUrl?: string;
  caption?: string;
  messageId?: string;
  status: string;
  sentAt: string;
}

export interface FacebookPageTokensTable {
  id?: number;
  userId: string;
  pageId: string;
  accessToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface FacebookPostsTable {
  id?: number;
  userId: string;
  pageId: string;
  postId: string;
  message?: string;
  link?: string;
  mediaUrl?: string;
  published: boolean;
  scheduledTime?: string | null;
  createdAt: string;
}

export interface InstagramPostsTable {
  id?: number;
  userId: string;
  igAccountId: string;
  postId: string;
  imageUrl: string;
  caption?: string;
  createdAt: string;
}

export interface WebhookEventsTable {
  id?: number;
  object: string;
  entry: string;
  timestamp: string;
  processed: boolean;
}

export interface WhatsAppIncomingMessagesTable {
  id?: number;
  wabaId: string;
  messageId: string;
  from: string;
  timestamp: string;
  type: string;
  text?: string;
  mediaId?: string;
  mediaType?: string | null;
  rawData: string;
  processed: boolean;
}

export interface WhatsAppMessageStatusTable {
  id?: number;
  wabaId: string;
  messageId: string;
  recipientId: string;
  status: string;
  timestamp: string;
  rawData: string;
}

export interface FacebookPageEventsTable {
  id?: number;
  pageId: string;
  field: string;
  value: string;
  timestamp: string;
}

export interface FacebookMessagesTable {
  id?: number;
  pageId: string;
  senderId: string;
  recipientId: string;
  timestamp: string;
  message: string;
  rawData: string;
  processed: boolean;
}

export interface InstagramEventsTable {
  id?: number;
  igUserId: string;
  field: string;
  value: string;
  timestamp: string;
}
