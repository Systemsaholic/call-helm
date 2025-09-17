import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function setupTestUser() {
  const email = 'playwright.test@example.com'
  const password = 'PlaywrightTest123!@#'
  
  try {
    // Check if user exists
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
    
    if (listError) {
      console.error('Error listing users:', listError)
      process.exit(1)
    }
    
    const existingUser = users?.find(u => u.email === email)
    
    if (existingUser) {
      console.log('Test user already exists:', email)
      
      // Update password to ensure it's correct
      await supabase.auth.admin.updateUserById(existingUser.id, {
        password: password
      })
      console.log('Test user password updated')
    } else {
      // Create new test user
      const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
      })
      
      if (error) {
        console.error('Error creating test user:', error)
        process.exit(1)
      }
      
      console.log('Test user created:', data.user?.email)
    }
    
    // Set up test organization
    const { data: { users: updatedUsers } } = await supabase.auth.admin.listUsers()
    const user = updatedUsers?.find(u => u.email === email)
    
    if (user) {
      // Check if user has an organization
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      
      if (!existingMember) {
        // Check if test organization already exists
        let org
        const { data: existingOrg } = await supabase
          .from('organizations')
          .select('*')
          .eq('slug', 'playwright-test-org')
          .single()
        
        if (existingOrg) {
          org = existingOrg
          console.log('Test organization already exists')
        } else {
          // Create test organization
          const { data: newOrg, error: orgError } = await supabase
            .from('organizations')
            .insert({
              name: 'Playwright Test Organization',
              slug: 'playwright-test-org',
              settings: {
                timezone: 'America/Los_Angeles',
                business_hours: {
                  start: '09:00',
                  end: '17:00'
                }
              }
            })
            .select()
            .single()
          
          if (orgError) {
            console.error('Error creating test organization:', orgError)
            process.exit(1)
          }
          org = newOrg
        }
        
        // Create profile for user first
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: email,
            full_name: 'Playwright Test User',
            updated_at: new Date().toISOString()
          })
          .select()
          .single()
        
        if (profileError && !profileError.message.includes('duplicate')) {
          console.error('Error creating profile:', profileError)
          // Don't exit - profile might already exist
        }
        
        // Add user to organization
        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: org.id,
            user_id: user.id,
            email: email,
            full_name: 'Playwright Test User',
            role: 'org_admin',
            status: 'active'
          })
        
        if (memberError) {
          console.error('Error adding user to organization:', memberError)
          process.exit(1)
        }
        
        console.log('Test organization created and user added')
      } else {
        console.log('Test user already has an organization')
      }
    }
    
    console.log('\n✅ Test user setup complete!')
    console.log('Email:', email)
    console.log('Password:', password)
    console.log('\nUpdate your .env.test.local file with:')
    console.log(`TEST_USER_EMAIL=${email}`)
    console.log(`TEST_USER_PASSWORD=${password}`)
    
  } catch (error) {
    console.error('Setup failed:', error)
    process.exit(1)
  }
}

setupTestUser()