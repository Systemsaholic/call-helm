#!/usr/bin/env tsx

/**
 * Script to import area code data from GitHub
 * Source: https://github.com/ravisorg/Area-Code-Geolocation-Database
 * 
 * Usage: 
 *   pnpm tsx scripts/import-area-codes.ts
 * 
 * This script should be run:
 * - Initially after creating the area_codes table
 * - Every 6 months to update the data
 */

import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// GitHub raw URLs for the CSV files
const DATA_URLS = {
  us: 'https://raw.githubusercontent.com/ravisorg/Area-Code-Geolocation-Database/master/us-area-code-cities.csv',
  ca: 'https://raw.githubusercontent.com/ravisorg/Area-Code-Geolocation-Database/master/ca-area-code-cities.csv'
}

async function downloadFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    https.get(url, (response) => {
      response.on('data', (chunk) => {
        data += chunk
      })
      response.on('end', () => {
        resolve(data)
      })
      response.on('error', reject)
    })
  })
}

async function parseCSV(csvContent: string, countryCode: string) {
  // Parse CSV - the format is:
  // Area Code, City Name, State/Province Name, Country Code, Latitude, Longitude
  const records = parse(csvContent, {
    columns: false,
    skip_empty_lines: true
  })

  return records.map((record: any[]) => ({
    area_code: record[0]?.trim(),
    city: record[1]?.trim(),
    state_province: record[2]?.trim(),
    country_code: countryCode,
    latitude: parseFloat(record[4]) || null,
    longitude: parseFloat(record[5]) || null
  })).filter((record: any) => 
    record.area_code && 
    record.city && 
    record.state_province
  )
}

async function importData() {
  console.log('Starting area code import...')
  
  let totalImported = 0
  let totalErrors = 0

  try {
    // Clear existing data (optional - comment out if you want to append)
    console.log('Clearing existing area codes...')
    const { error: deleteError } = await supabase
      .from('area_codes')
      .delete()
      .neq('id', 0) // Delete all records

    if (deleteError) {
      console.error('Error clearing existing data:', deleteError)
      // Continue anyway - might be first import
    }

    // Import US area codes
    console.log('\nDownloading US area codes...')
    const usData = await downloadFile(DATA_URLS.us)
    const usRecords = await parseCSV(usData, 'US')
    console.log(`Parsed ${usRecords.length} US area codes`)

    // Import in batches to avoid timeouts
    const batchSize = 100
    for (let i = 0; i < usRecords.length; i += batchSize) {
      const batch = usRecords.slice(i, i + batchSize)
      const { error } = await supabase
        .from('area_codes')
        .insert(batch)

      if (error) {
        console.error(`Error importing US batch ${i / batchSize}:`, error)
        totalErrors += batch.length
      } else {
        totalImported += batch.length
        process.stdout.write(`\rImported ${totalImported} records...`)
      }
    }

    // Import Canadian area codes
    console.log('\n\nDownloading Canadian area codes...')
    const caData = await downloadFile(DATA_URLS.ca)
    const caRecords = await parseCSV(caData, 'CA')
    console.log(`Parsed ${caRecords.length} Canadian area codes`)

    for (let i = 0; i < caRecords.length; i += batchSize) {
      const batch = caRecords.slice(i, i + batchSize)
      const { error } = await supabase
        .from('area_codes')
        .insert(batch)

      if (error) {
        console.error(`Error importing CA batch ${i / batchSize}:`, error)
        totalErrors += batch.length
      } else {
        totalImported += batch.length
        process.stdout.write(`\rImported ${totalImported} records...`)
      }
    }

    // Log the update
    const { error: logError } = await supabase
      .from('area_code_update_log')
      .insert({
        update_type: 'manual',
        records_added: totalImported,
        records_updated: 0,
        records_deleted: 0,
        source: 'github.com/ravisorg/Area-Code-Geolocation-Database',
        notes: `Initial import of US and Canadian area codes`
      })

    if (logError) {
      console.error('\nError logging update:', logError)
    }

    console.log('\n\nImport completed!')
    console.log(`Total records imported: ${totalImported}`)
    if (totalErrors > 0) {
      console.log(`Total errors: ${totalErrors}`)
    }

    // Show some sample data
    const { data: sampleData } = await supabase
      .from('area_codes')
      .select('area_code, city, state_province, country_code')
      .limit(5)

    console.log('\nSample imported data:')
    console.table(sampleData)

    // Test the function
    console.log('\nTesting get_area_codes_for_city function...')
    const { data: ottawaTest } = await supabase
      .rpc('get_area_codes_for_city', {
        p_city: 'Ottawa',
        p_state_province: 'Ontario',
        p_country_code: 'CA'
      })
    
    console.log('Ottawa area codes:', ottawaTest?.map((r: any) => r.area_code).join(', '))

  } catch (error) {
    console.error('Fatal error during import:', error)
    process.exit(1)
  }
}

// Run the import
importData().then(() => {
  console.log('\nImport process complete!')
  console.log('\n📅 Set a reminder to run this script again in 6 months')
  console.log('   Next update due:', new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString())
  process.exit(0)
}).catch((error) => {
  console.error('Import failed:', error)
  process.exit(1)
})