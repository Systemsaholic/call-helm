export interface Database {
  public: {
    Tables: {
      subscription_plans: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          badge_text: string | null
          price_monthly: number
          price_annual: number
          features: Record<string, any>
          is_active: boolean
          created_at: string
          updated_at: string
        }
      }
      organizations: {
        Row: {
          id: string
          name: string
          subscription_tier: string
          subscription_plan_id: string | null
          subscription_status: string
          trial_days: number
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
      }
      usage_tracking: {
        Row: {
          id: string
          organization_id: string
          resource_type: string
          billing_period_start: string
          billing_period_end: string
          tier_included: number
          used_amount: number
          overage_amount: number
          created_at: string
          updated_at: string
        }
      }
      usage_events: {
        Row: {
          id: string
          organization_id: string
          resource_type: string
          amount: number
          unit_cost: number
          total_cost: number
          campaign_id: string | null
          agent_id: string | null
          contact_id: string | null
          call_attempt_id: string | null
          description: string
          metadata: Record<string, any>
          created_at: string
        }
      }
      phone_numbers: {
        Row: {
          id: string
          organization_id: string
          number: string
          friendly_name: string | null
          capabilities: Record<string, boolean>
          status: string
          is_primary: boolean
          provider: string
          provider_id: string | null
          created_at: string
          updated_at: string
        }
      }
    }
  }
}