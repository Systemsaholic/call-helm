-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Custom types
CREATE TYPE user_role AS ENUM ('super_admin', 'org_admin', 'team_lead', 'agent', 'billing_admin');
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound', 'internal');
CREATE TYPE call_status AS ENUM ('answered', 'missed', 'voicemail', 'abandoned', 'busy', 'failed');
CREATE TYPE contact_status AS ENUM ('active', 'inactive', 'do_not_call');
CREATE TYPE call_list_status AS ENUM ('active', 'paused', 'completed', 'archived');
CREATE TYPE subscription_tier AS ENUM ('starter', 'professional', 'enterprise');

-- Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    subscription_tier subscription_tier DEFAULT 'starter',
    subscription_status VARCHAR(50) DEFAULT 'trialing',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    trial_ends_at TIMESTAMPTZ,
    agent_limit INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an index on slug for faster lookups
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    phone VARCHAR(50),
    is_system_admin BOOLEAN DEFAULT FALSE,
    onboarded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members (links users to organizations)
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role user_role DEFAULT 'agent',
    extension VARCHAR(20),
    department VARCHAR(100),
    team_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- Teams table
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    lead_member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key for team_id after teams table is created
ALTER TABLE organization_members 
ADD CONSTRAINT fk_member_team 
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Contacts table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(255) GENERATED ALWAYS AS (
        COALESCE(first_name || ' ', '') || COALESCE(last_name, '')
    ) STORED,
    phone_number VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    company VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    status contact_status DEFAULT 'active',
    tags TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for contact searches
CREATE INDEX idx_contacts_phone ON contacts(phone_number);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_full_name ON contacts USING gin(full_name gin_trgm_ops);

-- Calls table
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    direction call_direction NOT NULL,
    caller_number VARCHAR(50) NOT NULL,
    called_number VARCHAR(50) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration INTEGER, -- in seconds
    status call_status NOT NULL,
    recording_url TEXT,
    transcription TEXT,
    ai_summary TEXT,
    ai_sentiment VARCHAR(50),
    ai_keywords TEXT[],
    ai_score DECIMAL(3,2), -- 0.00 to 1.00
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for call queries
CREATE INDEX idx_calls_org_time ON calls(organization_id, start_time DESC);
CREATE INDEX idx_calls_member ON calls(member_id);
CREATE INDEX idx_calls_contact ON calls(contact_id);

-- Call recordings storage reference
CREATE TABLE call_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    duration INTEGER,
    format VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call lists (campaigns)
CREATE TABLE call_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    status call_list_status DEFAULT 'active',
    assigned_to UUID[] DEFAULT '{}', -- Array of member IDs
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call list contacts (many-to-many)
CREATE TABLE call_list_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_list_id UUID NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    last_called_at TIMESTAMPTZ,
    call_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(call_list_id, contact_id)
);

-- Invitations table
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'agent',
    token UUID DEFAULT uuid_generate_v4(),
    invited_by UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity logs
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for activity logs
CREATE INDEX idx_activity_logs_org ON activity_logs(organization_id, created_at DESC);

-- Row Level Security (RLS) Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_list_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's organization IDs
CREATE OR REPLACE FUNCTION get_user_organizations(user_uuid UUID)
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = user_uuid AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user has role in organization
CREATE OR REPLACE FUNCTION has_role_in_org(
    user_uuid UUID,
    org_uuid UUID,
    required_role user_role
) RETURNS BOOLEAN AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT role INTO user_role_val
    FROM organization_members
    WHERE user_id = user_uuid 
    AND organization_id = org_uuid 
    AND is_active = TRUE;
    
    IF user_role_val IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Role hierarchy: super_admin > org_admin > team_lead > billing_admin > agent
    RETURN CASE
        WHEN required_role = 'agent' THEN TRUE
        WHEN required_role = 'billing_admin' AND user_role_val IN ('billing_admin', 'team_lead', 'org_admin', 'super_admin') THEN TRUE
        WHEN required_role = 'team_lead' AND user_role_val IN ('team_lead', 'org_admin', 'super_admin') THEN TRUE
        WHEN required_role = 'org_admin' AND user_role_val IN ('org_admin', 'super_admin') THEN TRUE
        WHEN required_role = 'super_admin' AND user_role_val = 'super_admin' THEN TRUE
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for organizations
CREATE POLICY "Users can view organizations they belong to"
    ON organizations FOR SELECT
    USING (id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Org admins can update their organization"
    ON organizations FOR UPDATE
    USING (has_role_in_org(auth.uid(), id, 'org_admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

-- RLS Policies for organization_members
CREATE POLICY "Users can view members in their organizations"
    ON organization_members FOR SELECT
    USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Org admins can manage members"
    ON organization_members FOR ALL
    USING (has_role_in_org(auth.uid(), organization_id, 'org_admin'));

-- RLS Policies for contacts
CREATE POLICY "Users can view contacts in their organizations"
    ON contacts FOR SELECT
    USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Users can create contacts in their organizations"
    ON contacts FOR INSERT
    WITH CHECK (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Users can update contacts in their organizations"
    ON contacts FOR UPDATE
    USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Team leads can delete contacts"
    ON contacts FOR DELETE
    USING (has_role_in_org(auth.uid(), organization_id, 'team_lead'));

-- RLS Policies for calls
CREATE POLICY "Users can view calls in their organizations"
    ON calls FOR SELECT
    USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Users can create calls in their organizations"
    ON calls FOR INSERT
    WITH CHECK (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Users can update their own calls"
    ON calls FOR UPDATE
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        AND (member_id IN (SELECT id FROM organization_members WHERE user_id = auth.uid())
        OR has_role_in_org(auth.uid(), organization_id, 'team_lead'))
    );

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_call_lists_updated_at BEFORE UPDATE ON call_lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_call_list_contacts_updated_at BEFORE UPDATE ON call_list_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();