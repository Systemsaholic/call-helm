import { z } from 'zod'

// Common schemas
export const phoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
  .max(20, 'Phone number too long')

export const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email too long')

export const uuidSchema = z.string()
  .uuid('Invalid UUID format')

// Call initiation schema
export const initiateCallSchema = z.object({
  contactId: uuidSchema.optional(),
  phoneNumber: phoneNumberSchema,
  callListId: uuidSchema.optional(),
  scriptId: uuidSchema.optional(),
  provider: z.enum(['twilio', 'telnyx', 'mock']).default('telnyx')
})

// Agent invitation schema
export const inviteAgentsSchema = z.object({
  agentIds: z.array(uuidSchema).min(1, 'At least one agent ID required')
})

// Phone number management schemas
export const createPhoneNumberSchema = z.object({
  number: phoneNumberSchema,
  friendly_name: z.string().min(1).max(255),
  capabilities: z.object({
    voice: z.boolean(),
    sms: z.boolean(),
    mms: z.boolean(),
    fax: z.boolean()
  }).optional(),
  is_primary: z.boolean().optional()
})

export const updatePhoneNumberSchema = z.object({
  id: uuidSchema,
  friendly_name: z.string().min(1).max(255).optional(),
  capabilities: z.object({
    voice: z.boolean(),
    sms: z.boolean(),
    mms: z.boolean(),
    fax: z.boolean()
  }).optional(),
  is_primary: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
})

// Voice webhook schemas
export const voiceWebhookSchema = z.object({
  event_type: z.string().optional(),
  EventType: z.string().optional(),
  call_sid: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  duration: z.string().optional(),
  call_status: z.string().optional(),
  recording_url: z.string().url().optional(),
  recording_sid: z.string().optional()
})

// Voice number provision schema
export const provisionPhoneNumberSchema = z.object({
  phoneNumber: phoneNumberSchema,
  forwardingNumber: phoneNumberSchema,
  organizationId: uuidSchema
})

// Create test user schema
export const createTestUserSchema = z.object({
  email: emailSchema.optional(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .optional(),
  organizationId: uuidSchema.optional()
})

// Type exports
export type InitiateCallInput = z.infer<typeof initiateCallSchema>
export type InviteAgentsInput = z.infer<typeof inviteAgentsSchema>
export type CreatePhoneNumberInput = z.infer<typeof createPhoneNumberSchema>
export type UpdatePhoneNumberInput = z.infer<typeof updatePhoneNumberSchema>
export type VoiceWebhookInput = z.infer<typeof voiceWebhookSchema>
export type ProvisionPhoneNumberInput = z.infer<typeof provisionPhoneNumberSchema>
export type CreateTestUserInput = z.infer<typeof createTestUserSchema>