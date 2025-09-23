-- Create area_codes table for city-to-area-code mapping
-- This enables users to search for phone numbers by city name

-- Drop existing tables if they exist
DROP TABLE IF EXISTS area_codes CASCADE;
DROP TABLE IF EXISTS area_code_update_log CASCADE;

-- Create the main area codes lookup table
CREATE TABLE area_codes (
  id SERIAL PRIMARY KEY,
  area_code VARCHAR(3) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state_province VARCHAR(100) NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX idx_area_codes_city ON area_codes(LOWER(city));
CREATE INDEX idx_area_codes_state_province ON area_codes(LOWER(state_province));
CREATE INDEX idx_area_codes_country ON area_codes(country_code);
CREATE INDEX idx_area_codes_area_code ON area_codes(area_code);
CREATE INDEX idx_area_codes_city_state ON area_codes(LOWER(city), LOWER(state_province));

-- Create a table to track update history
CREATE TABLE area_code_update_log (
  id SERIAL PRIMARY KEY,
  update_type VARCHAR(50) NOT NULL, -- 'manual', 'automated', 'initial'
  records_added INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  source VARCHAR(255), -- e.g., 'github.com/ravisorg/Area-Code-Geolocation-Database'
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a table to track search misses (for monitoring)
CREATE TABLE area_code_search_misses (
  id SERIAL PRIMARY KEY,
  city_searched VARCHAR(100),
  state_province VARCHAR(100),
  country_code VARCHAR(2),
  search_count INTEGER DEFAULT 1,
  last_searched TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(city_searched, state_province, country_code)
);

-- Function to get area codes for a city
CREATE OR REPLACE FUNCTION get_area_codes_for_city(
  p_city VARCHAR,
  p_state_province VARCHAR,
  p_country_code VARCHAR
) RETURNS TABLE (
  area_code VARCHAR,
  exact_match BOOLEAN
) AS $$
BEGIN
  -- First try exact match
  RETURN QUERY
  SELECT DISTINCT 
    ac.area_code,
    TRUE as exact_match
  FROM area_codes ac
  WHERE LOWER(ac.city) = LOWER(p_city)
    AND LOWER(ac.state_province) = LOWER(p_state_province)
    AND ac.country_code = p_country_code;
  
  -- If no exact match, try partial match
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT DISTINCT 
      ac.area_code,
      FALSE as exact_match
    FROM area_codes ac
    WHERE LOWER(ac.city) LIKE '%' || LOWER(p_city) || '%'
      AND LOWER(ac.state_province) = LOWER(p_state_province)
      AND ac.country_code = p_country_code
    LIMIT 10;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to log search misses
CREATE OR REPLACE FUNCTION log_area_code_search_miss(
  p_city VARCHAR,
  p_state_province VARCHAR,
  p_country_code VARCHAR
) RETURNS VOID AS $$
BEGIN
  INSERT INTO area_code_search_misses (city_searched, state_province, country_code, search_count, last_searched)
  VALUES (p_city, p_state_province, p_country_code, 1, NOW())
  ON CONFLICT (city_searched, state_province, country_code) 
  DO UPDATE SET 
    search_count = area_code_search_misses.search_count + 1,
    last_searched = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies
ALTER TABLE area_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_code_update_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_code_search_misses ENABLE ROW LEVEL SECURITY;

-- Area codes are public read
CREATE POLICY "Area codes are viewable by everyone" ON area_codes
  FOR SELECT USING (true);

-- Only admins can modify area codes
CREATE POLICY "Only admins can insert area codes" ON area_codes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND (raw_user_meta_data->>'role')::text = 'admin'
    )
  );

CREATE POLICY "Only admins can update area codes" ON area_codes
  FOR UPDATE WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND (raw_user_meta_data->>'role')::text = 'admin'
    )
  );

-- Update log is viewable by authenticated users
CREATE POLICY "Update log viewable by authenticated users" ON area_code_update_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- Search misses viewable by authenticated users
CREATE POLICY "Search misses viewable by authenticated users" ON area_code_search_misses
  FOR SELECT USING (auth.role() = 'authenticated');

-- Anyone can log a search miss
CREATE POLICY "Anyone can log search misses" ON area_code_search_misses
  FOR INSERT WITH CHECK (true);

-- Create a view for commonly searched cities
CREATE OR REPLACE VIEW popular_missing_cities AS
SELECT 
  city_searched,
  state_province,
  country_code,
  search_count,
  last_searched
FROM area_code_search_misses
WHERE search_count > 5
ORDER BY search_count DESC, last_searched DESC;

-- Grant permissions
GRANT SELECT ON area_codes TO anon, authenticated;
GRANT SELECT ON area_code_update_log TO authenticated;
GRANT SELECT, INSERT ON area_code_search_misses TO anon, authenticated;
GRANT SELECT ON popular_missing_cities TO authenticated;
GRANT EXECUTE ON FUNCTION get_area_codes_for_city TO anon, authenticated;
GRANT EXECUTE ON FUNCTION log_area_code_search_miss TO anon, authenticated;