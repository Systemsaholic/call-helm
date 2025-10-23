#!/usr/bin/env node
/**
 * Script to apply the 3CX integration migration
 * Uses Supabase service role key to execute SQL
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Running 3CX Integration Migration...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250130_3cx_integration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📊 SQL length:', migrationSQL.length, 'characters\n');

    // Execute the migration using rpc to run raw SQL
    // Note: This requires a custom SQL function or we need to break it into parts
    console.log('⚙️  Executing migration SQL...\n');

    // Split into individual statements for execution
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      try {
        // Execute using the REST API directly
        const { error } = await supabase.rpc('exec', {
          sql: stmt + ';'
        });

        if (error) {
          // Try alternative approach - some statements might need to be executed differently
          console.log(`⚠️  Statement ${i + 1}/${statements.length}: Using fallback method...`);

          // For CREATE TABLE, INDEX, POLICY statements, we can't use RPC
          // We'll need to document these for manual execution
          if (stmt.includes('CREATE TABLE') ||
              stmt.includes('CREATE INDEX') ||
              stmt.includes('CREATE POLICY') ||
              stmt.includes('ALTER TABLE') ||
              stmt.includes('DROP POLICY') ||
              stmt.includes('CREATE OR REPLACE FUNCTION') ||
              stmt.includes('DROP TRIGGER') ||
              stmt.includes('CREATE TRIGGER') ||
              stmt.includes('COMMENT ON TABLE')) {
            console.log(`ℹ️  DDL statement - needs manual execution via Dashboard`);
            errorCount++;
          } else {
            throw error;
          }
        } else {
          successCount++;
          console.log(`✓ Statement ${i + 1}/${statements.length} executed successfully`);
        }
      } catch (err) {
        errorCount++;
        console.error(`✗ Statement ${i + 1}/${statements.length} failed:`, err.message);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✓ Successful: ${successCount}`);
    console.log(`   ✗ Failed: ${errorCount}`);
    console.log(`   Total: ${statements.length}`);

    if (errorCount > 0) {
      console.log('\n⚠️  Some statements could not be executed via the API.');
      console.log('📝 Please run the migration manually via Supabase Dashboard:');
      console.log(`   https://supabase.com/dashboard/project/${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('.')[0].split('//')[1]}/sql/new`);
      console.log('\n   Copy and paste the contents of:');
      console.log(`   ${migrationPath}`);
    } else {
      console.log('\n✅ Migration completed successfully!');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
