/**
 * Script Template Variable Replacement System
 *
 * Supports Handlebars-style variables with optional fallbacks:
 * - {{contact.name}} - replaced with contact's full name
 * - {{contact.first_name::friend}} - uses "friend" if first_name is null/empty
 *
 * Available variables:
 * - contact: name, first_name, last_name, phone, email, company
 * - agent: name, email
 * - campaign: name
 * - organization: name
 * - date: today, time, datetime
 */

export interface ScriptVariables {
  contact: {
    name: string | null
    first_name: string | null
    last_name: string | null
    phone: string | null
    email: string | null
    company: string | null
  }
  agent: {
    name: string | null
    email: string | null
  }
  campaign: {
    name: string | null
  }
  organization: {
    name: string | null
  }
  date: {
    today: string
    time: string
    datetime: string
  }
}

/**
 * All available template variables with descriptions
 * Used for the variable inserter UI
 */
export const TEMPLATE_VARIABLES = [
  {
    category: 'Contact',
    variables: [
      { key: 'contact.name', label: 'Full Name', description: 'Contact\'s full name' },
      { key: 'contact.first_name', label: 'First Name', description: 'Contact\'s first name' },
      { key: 'contact.last_name', label: 'Last Name', description: 'Contact\'s last name' },
      { key: 'contact.phone', label: 'Phone', description: 'Contact\'s phone number' },
      { key: 'contact.email', label: 'Email', description: 'Contact\'s email address' },
      { key: 'contact.company', label: 'Company', description: 'Contact\'s company name' },
    ]
  },
  {
    category: 'Agent',
    variables: [
      { key: 'agent.name', label: 'Agent Name', description: 'Current agent\'s name' },
      { key: 'agent.email', label: 'Agent Email', description: 'Current agent\'s email' },
    ]
  },
  {
    category: 'Campaign',
    variables: [
      { key: 'campaign.name', label: 'Campaign Name', description: 'Name of the current campaign' },
    ]
  },
  {
    category: 'Organization',
    variables: [
      { key: 'organization.name', label: 'Organization Name', description: 'Your organization\'s name' },
    ]
  },
  {
    category: 'Date & Time',
    variables: [
      { key: 'date.today', label: 'Today\'s Date', description: 'Current date (e.g., January 13, 2026)' },
      { key: 'date.time', label: 'Current Time', description: 'Current time (e.g., 2:30 PM)' },
      { key: 'date.datetime', label: 'Date & Time', description: 'Full date and time' },
    ]
  },
] as const

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue({ contact: { name: 'John' } }, 'contact.name') => 'John'
 */
function getNestedValue(obj: Record<string, any>, path: string): string | null {
  const keys = path.split('.')
  let current: any = obj

  for (const key of keys) {
    if (current === null || current === undefined) {
      return null
    }
    current = current[key]
  }

  // Return null for empty strings too
  if (current === '' || current === null || current === undefined) {
    return null
  }

  return String(current)
}

/**
 * Process a script template by replacing all variables with their values
 *
 * @param template - The script template with {{variable}} placeholders
 * @param variables - Object containing all variable values
 * @returns The processed script with variables replaced
 *
 * @example
 * processScriptTemplate(
 *   "Hello {{contact.first_name::friend}}, this is {{agent.name}} from {{organization.name}}",
 *   { contact: { first_name: "John", ... }, agent: { name: "Sarah", ... }, ... }
 * )
 * // Returns: "Hello John, this is Sarah from Acme Corp"
 */
export function processScriptTemplate(
  template: string | null | undefined,
  variables: ScriptVariables
): string {
  if (!template) return ''

  // Regex to match {{variable}} or {{variable::fallback}}
  // Captures: variable path and optional fallback
  const variableRegex = /\{\{([^}:]+)(?:::([^}]*))?\}\}/g

  return template.replace(variableRegex, (match, variablePath, fallback) => {
    const trimmedPath = variablePath.trim()
    const value = getNestedValue(variables as Record<string, any>, trimmedPath)

    if (value !== null) {
      return value
    }

    // Use fallback if provided, otherwise keep the original placeholder
    if (fallback !== undefined) {
      return fallback
    }

    // Keep original placeholder if no value and no fallback
    return match
  })
}

/**
 * Create date variables for the current moment
 */
export function createDateVariables(): ScriptVariables['date'] {
  const now = new Date()

  return {
    today: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    time: now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    datetime: now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
  }
}

/**
 * Build ScriptVariables object from available data
 */
export function buildScriptVariables(params: {
  contact?: {
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    phone_number?: string | null
    email?: string | null
    company?: string | null
  } | null
  agent?: {
    full_name?: string | null
    email?: string | null
  } | null
  campaign?: {
    name?: string | null
  } | null
  organization?: {
    name?: string | null
  } | null
}): ScriptVariables {
  const { contact, agent, campaign, organization } = params

  // Compute full name if not provided
  const contactName = contact?.full_name ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
    null

  return {
    contact: {
      name: contactName,
      first_name: contact?.first_name || null,
      last_name: contact?.last_name || null,
      phone: contact?.phone_number || null,
      email: contact?.email || null,
      company: contact?.company || null,
    },
    agent: {
      name: agent?.full_name || null,
      email: agent?.email || null,
    },
    campaign: {
      name: campaign?.name || null,
    },
    organization: {
      name: organization?.name || null,
    },
    date: createDateVariables(),
  }
}

/**
 * Format a variable for insertion into a script
 * @param variableKey - The variable key (e.g., 'contact.name')
 * @param fallback - Optional fallback value
 */
export function formatVariable(variableKey: string, fallback?: string): string {
  if (fallback) {
    return `{{${variableKey}::${fallback}}}`
  }
  return `{{${variableKey}}}`
}
