-- Extend phone_numbers table for self-service number management
-- Add columns for porting, verification, and campaign registry

-- Add new columns to phone_numbers table
ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS signalwire_phone_number_sid TEXT,
ADD COLUMN IF NOT EXISTS acquisition_method TEXT DEFAULT 'platform' CHECK (acquisition_method IN ('platform', 'ported', 'verified')),
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed')),
ADD COLUMN IF NOT EXISTS verification_code TEXT,
ADD COLUMN IF NOT EXISTS verification_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_verification_attempt TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS porting_request_id TEXT,
ADD COLUMN IF NOT EXISTS porting_status TEXT CHECK (porting_status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
ADD COLUMN IF NOT EXISTS porting_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS webhook_configured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS monthly_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS setup_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS billing_start_date TIMESTAMPTZ;

-- Create table for number porting requests
CREATE TABLE IF NOT EXISTS number_porting_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  current_provider TEXT,
  account_number TEXT,
  pin_code TEXT,
  authorized_contact_name TEXT NOT NULL,
  authorized_contact_email TEXT NOT NULL,
  authorized_contact_phone TEXT NOT NULL,
  billing_address JSONB NOT NULL, -- {street, city, state, zip, country}
  service_address JSONB, -- Optional separate service address
  signalwire_porting_id TEXT, -- SignalWire's porting request ID
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'in_progress', 'completed', 'failed', 'cancelled')),
  status_details JSONB DEFAULT '{}'::jsonb,
  loa_document_url TEXT, -- Letter of Authorization
  supporting_documents JSONB DEFAULT '[]'::jsonb, -- Array of document URLs
  requested_port_date TIMESTAMPTZ,
  actual_port_date TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique porting requests per number per organization
  CONSTRAINT unique_porting_request UNIQUE (organization_id, phone_number)
);

-- Create table for Campaign Registry brands (10DLC compliance)
CREATE TABLE IF NOT EXISTS campaign_registry_brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signalwire_brand_id TEXT UNIQUE,
  brand_name TEXT NOT NULL,
  legal_company_name TEXT NOT NULL,
  ein_tax_id TEXT, -- Encrypted or hashed
  business_type TEXT NOT NULL, -- sole_proprietorship, llc, corporation, etc.
  industry TEXT NOT NULL,
  website_url TEXT,
  address JSONB NOT NULL, -- {street, city, state, zip, country}
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  brand_relationship TEXT DEFAULT 'direct' CHECK (brand_relationship IN ('direct', 'agency')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'suspended')),
  approval_date TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique brand name per organization
  CONSTRAINT unique_brand_per_org UNIQUE (organization_id, brand_name)
);

-- Create table for Campaign Registry campaigns
CREATE TABLE IF NOT EXISTS campaign_registry_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES campaign_registry_brands(id) ON DELETE CASCADE,
  signalwire_campaign_id TEXT UNIQUE,
  campaign_name TEXT NOT NULL,
  use_case TEXT NOT NULL, -- marketing, customer_care, account_notifications, etc.
  use_case_description TEXT NOT NULL,
  message_samples JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of sample messages
  opt_in_keywords JSONB DEFAULT '[]'::jsonb,
  opt_out_keywords JSONB DEFAULT '["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]'::jsonb,
  help_keywords JSONB DEFAULT '["HELP", "INFO"]'::jsonb,
  help_message TEXT DEFAULT 'Reply STOP to opt out',
  opt_in_message TEXT,
  opt_out_message TEXT DEFAULT 'You have been unsubscribed. No more messages will be sent.',
  monthly_message_volume INTEGER DEFAULT 1000,
  subscriber_optin_flow TEXT NOT NULL, -- web_form, pos, paper, etc.
  subscriber_optin_flow_description TEXT NOT NULL,
  subscriber_optout_flow TEXT DEFAULT 'sms',
  age_gating BOOLEAN DEFAULT false,
  direct_lending BOOLEAN DEFAULT false,
  embedded_link BOOLEAN DEFAULT false,
  embedded_phone BOOLEAN DEFAULT false,
  affiliate_marketing BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'suspended')),
  approval_date TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique campaign name per brand
  CONSTRAINT unique_campaign_per_brand UNIQUE (brand_id, campaign_name)
);

-- Create table for phone number to campaign assignments
CREATE TABLE IF NOT EXISTS phone_number_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaign_registry_campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique assignment per phone number
  CONSTRAINT unique_phone_campaign UNIQUE (phone_number_id, campaign_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_porting_requests_org ON number_porting_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_porting_requests_status ON number_porting_requests(status);
CREATE INDEX IF NOT EXISTS idx_porting_requests_phone ON number_porting_requests(phone_number);

CREATE INDEX IF NOT EXISTS idx_brands_org ON campaign_registry_brands(organization_id);
CREATE INDEX IF NOT EXISTS idx_brands_status ON campaign_registry_brands(status);
CREATE INDEX IF NOT EXISTS idx_brands_signalwire_id ON campaign_registry_brands(signalwire_brand_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaign_registry_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaign_registry_campaigns(brand_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaign_registry_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_phone_campaigns_org ON phone_number_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_phone_campaigns_phone ON phone_number_campaigns(phone_number_id);

-- Add RLS policies for all new tables
ALTER TABLE number_porting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_registry_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_registry_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_number_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS policies for number_porting_requests
CREATE POLICY "Organization members can view porting requests"
  ON number_porting_requests
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage porting requests"
  ON number_porting_requests
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('org_admin', 'super_admin')
    )
  );

-- RLS policies for campaign_registry_brands
CREATE POLICY "Organization members can view brands"
  ON campaign_registry_brands
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage brands"
  ON campaign_registry_brands
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('org_admin', 'super_admin')
    )
  );

-- RLS policies for campaign_registry_campaigns
CREATE POLICY "Organization members can view campaigns"
  ON campaign_registry_campaigns
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage campaigns"
  ON campaign_registry_campaigns
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('org_admin', 'super_admin')
    )
  );

-- RLS policies for phone_number_campaigns
CREATE POLICY "Organization members can view phone number campaigns"
  ON phone_number_campaigns
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can manage phone number campaigns"
  ON phone_number_campaigns
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('org_admin', 'super_admin')
    )
  );

-- Create functions for updating timestamps
CREATE OR REPLACE FUNCTION update_porting_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_brands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for auto-updating timestamps
CREATE TRIGGER update_porting_requests_updated_at
  BEFORE UPDATE ON number_porting_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_porting_requests_updated_at();

CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON campaign_registry_brands
  FOR EACH ROW
  EXECUTE FUNCTION update_brands_updated_at();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaign_registry_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_campaigns_updated_at();

-- Function to get organization phone numbers with extended info
CREATE OR REPLACE FUNCTION get_organization_phone_numbers(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  number TEXT,
  friendly_name TEXT,
  capabilities JSONB,
  status TEXT,
  is_primary BOOLEAN,
  provider TEXT,
  provider_id TEXT,
  signalwire_phone_number_sid TEXT,
  acquisition_method TEXT,
  verification_status TEXT,
  porting_status TEXT,
  webhook_configured BOOLEAN,
  monthly_cost DECIMAL,
  setup_cost DECIMAL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  campaign_count BIGINT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    pn.id,
    pn.number,
    pn.friendly_name,
    pn.capabilities,
    pn.status,
    pn.is_primary,
    pn.provider,
    pn.provider_id,
    pn.signalwire_phone_number_sid,
    pn.acquisition_method,
    pn.verification_status,
    pn.porting_status,
    pn.webhook_configured,
    pn.monthly_cost,
    pn.setup_cost,
    pn.created_at,
    pn.updated_at,
    COALESCE(pnc.campaign_count, 0) as campaign_count
  FROM phone_numbers pn
  LEFT JOIN (
    SELECT phone_number_id, COUNT(*) as campaign_count
    FROM phone_number_campaigns
    GROUP BY phone_number_id
  ) pnc ON pn.id = pnc.phone_number_id
  WHERE pn.organization_id = p_org_id
  ORDER BY pn.is_primary DESC, pn.created_at ASC;
$$;

-- Function to get organization brands with campaign count
CREATE OR REPLACE FUNCTION get_organization_brands(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  signalwire_brand_id TEXT,
  brand_name TEXT,
  legal_company_name TEXT,
  business_type TEXT,
  industry TEXT,
  status TEXT,
  approval_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  campaign_count BIGINT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    b.id,
    b.signalwire_brand_id,
    b.brand_name,
    b.legal_company_name,
    b.business_type,
    b.industry,
    b.status,
    b.approval_date,
    b.created_at,
    COALESCE(cc.campaign_count, 0) as campaign_count
  FROM campaign_registry_brands b
  LEFT JOIN (
    SELECT brand_id, COUNT(*) as campaign_count
    FROM campaign_registry_campaigns
    GROUP BY brand_id
  ) cc ON b.id = cc.brand_id
  WHERE b.organization_id = p_org_id
  ORDER BY b.created_at ASC;
$$;