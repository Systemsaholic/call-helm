import { z } from 'zod'

export const agentRoles = ['org_admin', 'team_lead', 'agent', 'billing_admin'] as const
export const agentStatuses = ['pending_invitation', 'invited', 'active', 'inactive', 'suspended'] as const

export const createAgentSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address'),
  full_name: z
    .string()
    .min(1, 'Full name is required')
    .max(255, 'Name is too long'),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/.test(val),
      'Invalid phone number'
    ),
  role: z.enum(agentRoles).default('agent'),
  extension: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[0-9]{1,10}$/.test(val),
      'Extension must be numeric'
    ),
  department: z.string().optional(),
  department_id: z.string().uuid().optional(),
  bio: z.string().max(500, 'Bio is too long').optional(),
})

export const updateAgentSchema = createAgentSchema.partial()

export const bulkInviteSchema = z.object({
  agentIds: z.array(z.string().uuid()).min(1, 'Select at least one agent'),
})

export const importAgentsSchema = z.object({
  agents: z.array(
    z.object({
      email: z.string().email('Invalid email address'),
      full_name: z.string().min(1, 'Name is required'),
      phone: z.string().optional(),
      role: z.enum(agentRoles).optional().default('agent'),
      department: z.string().optional(),
      extension: z.string().optional(),
      bio: z.string().optional(),
    })
  ),
})

export const agentFilterSchema = z.object({
  searchTerm: z.string().optional(),
  status: z.enum(['all', ...agentStatuses]).optional(),
  department: z.string().optional(),
  role: z.enum(['all', ...agentRoles]).optional(),
})

export type CreateAgentInput = z.infer<typeof createAgentSchema>
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>
export type BulkInviteInput = z.infer<typeof bulkInviteSchema>
export type ImportAgentsInput = z.infer<typeof importAgentsSchema>
export type AgentFilterInput = z.infer<typeof agentFilterSchema>