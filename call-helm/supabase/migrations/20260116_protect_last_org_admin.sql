-- Migration: Protect the last org_admin in an organization
-- Ensures no organization can exist without at least one org_admin

-- Function to check if this is the last org_admin in the organization
CREATE OR REPLACE FUNCTION check_last_org_admin()
RETURNS TRIGGER AS $$
DECLARE
  admin_count INTEGER;
  org_id UUID;
BEGIN
  -- Determine the organization_id based on operation
  IF TG_OP = 'DELETE' THEN
    org_id := OLD.organization_id;
  ELSE
    org_id := COALESCE(NEW.organization_id, OLD.organization_id);
  END IF;

  -- For DELETE: Check if we're deleting an org_admin
  IF TG_OP = 'DELETE' AND OLD.role = 'org_admin' AND OLD.status = 'active' THEN
    -- Count remaining active org_admins (excluding the one being deleted)
    SELECT COUNT(*) INTO admin_count
    FROM organization_members
    WHERE organization_id = org_id
      AND role = 'org_admin'
      AND status = 'active'
      AND id != OLD.id;

    IF admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot delete the last org_admin. Every organization must have at least one org_admin.';
    END IF;
  END IF;

  -- For UPDATE: Check if we're demoting the last org_admin or deactivating them
  IF TG_OP = 'UPDATE' THEN
    -- Case 1: Changing role from org_admin to something else
    IF OLD.role = 'org_admin' AND NEW.role != 'org_admin' AND OLD.status = 'active' THEN
      SELECT COUNT(*) INTO admin_count
      FROM organization_members
      WHERE organization_id = org_id
        AND role = 'org_admin'
        AND status = 'active'
        AND id != OLD.id;

      IF admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot change role of the last org_admin. Every organization must have at least one org_admin.';
      END IF;
    END IF;

    -- Case 2: Deactivating an org_admin (changing status from active to something else)
    IF OLD.role = 'org_admin' AND OLD.status = 'active' AND NEW.status != 'active' THEN
      SELECT COUNT(*) INTO admin_count
      FROM organization_members
      WHERE organization_id = org_id
        AND role = 'org_admin'
        AND status = 'active'
        AND id != OLD.id;

      IF admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot deactivate the last org_admin. Every organization must have at least one org_admin.';
      END IF;
    END IF;
  END IF;

  -- Return appropriate value based on operation
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for DELETE operations
DROP TRIGGER IF EXISTS protect_last_org_admin_delete ON organization_members;
CREATE TRIGGER protect_last_org_admin_delete
  BEFORE DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION check_last_org_admin();

-- Create trigger for UPDATE operations
DROP TRIGGER IF EXISTS protect_last_org_admin_update ON organization_members;
CREATE TRIGGER protect_last_org_admin_update
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION check_last_org_admin();

-- Add a comment for documentation
COMMENT ON FUNCTION check_last_org_admin() IS 'Prevents deletion or demotion of the last org_admin in an organization. Ensures every organization always has at least one active org_admin.';
