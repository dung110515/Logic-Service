/**
 * Test Google Sheets Integration
 */

import { config } from './src/config/env';
import { readSheet, writeSheet, appendSheet } from './src/services/sheetsService';

const testGoogleSheets = async () => {
  try {
    console.log('🔍 Testing Google Sheets Integration...\n');

    // 1. Check configuration
    console.log('1️⃣ Checking configuration:');
    console.log(`   • GOOGLE_SHEET_ID: ${config.googleSheetId ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   • Credentials: ${config.googleCredentialsJson ? '✅ Loaded from file' : '❌ Missing'}`);

    if (!config.googleSheetId) {
      throw new Error('GOOGLE_SHEET_ID not configured in .env');
    }

    if (!config.googleCredentialsJson) {
      throw new Error('Google credentials not loaded. Check GOOGLE_CREDENTIALS_JSON_FILE path');
    }

    // 2. Verify credentials JSON is valid
    console.log('\n2️⃣ Verifying credentials format:');
    try {
      const creds = JSON.parse(config.googleCredentialsJson);
      console.log(`   • Service Account Email: ${creds.client_email}`);
      console.log(`   • Project ID: ${creds.project_id}`);
      console.log(`   ✅ Credentials JSON is valid`);
    } catch (error) {
      throw new Error(`Invalid credentials JSON: ${error}`);
    }

    // 3. Try to read from Google Sheet
    console.log('\n3️⃣ Attempting to read from Google Sheet:');
    try {
      const data = await readSheet(config.googleSheetId, 'Sheet1!A1:B5');
      console.log(`   ✅ Successfully read ${data.length} rows from sheet`);
      if (data.length > 0) {
        console.log(`   Sample data: ${JSON.stringify(data[0])}`);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not read sheet (may need to share with service account): ${error}`);
    }

    // 4. Try to write test data
    console.log('\n4️⃣ Attempting to write test data to Google Sheet:');
    try {
      const testData = [
        ['Test Column 1', 'Test Column 2'],
        ['Value A', 'Value B'],
        [`Timestamp: ${new Date().toISOString()}`, 'Integration Test'],
      ];
      await writeSheet(config.googleSheetId, 'Sheet1!A1', testData);
      console.log('   ✅ Successfully wrote test data to sheet');
    } catch (error) {
      console.log(`   ⚠️ Could not write to sheet: ${error}`);
    }

    // 5. Try to append data
    console.log('\n5️⃣ Attempting to append data to Google Sheet:');
    try {
      const appendData = [['Appended Data', new Date().toISOString()]];
      await appendSheet(config.googleSheetId, 'Sheet1!A:B', appendData);
      console.log('   ✅ Successfully appended data to sheet');
    } catch (error) {
      console.log(`   ⚠️ Could not append to sheet: ${error}`);
    }

    console.log('\n✅ Google Sheets integration test completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
};

testGoogleSheets();
