/**
 * Test Google Sheets Integration - Find Sheet Names
 */

import { config } from './src/config/env';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const listSheets = async () => {
  try {
    console.log('🔍 Finding available sheets...\n');

    if (!config.googleSheetId) {
      throw new Error('GOOGLE_SHEET_ID not configured');
    }

    if (!config.googleCredentialsJson) {
      throw new Error('Google credentials not loaded');
    }

    const credentials = JSON.parse(config.googleCredentialsJson);
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get spreadsheet metadata to see all sheets
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: config.googleSheetId,
    });

    console.log(`📄 Spreadsheet: ${spreadsheet.data.properties?.title}\n`);
    console.log(`📋 Available sheets:`);

    const sheetNames = spreadsheet.data.sheets?.map((sheet: any) => ({
      name: sheet.properties?.title,
      id: sheet.properties?.sheetId,
    })) || [];

    sheetNames.forEach((sheet: any, index: number) => {
      console.log(`   ${index + 1}. "${sheet.name}" (ID: ${sheet.id})`);
    });

    if (sheetNames.length > 0) {
      const firstSheetName = sheetNames[0].name;
      console.log(`\n✅ Try using sheet name: "${firstSheetName}"`);

      // Test reading from the first sheet
      console.log(`\n🔍 Testing read from "${firstSheetName}"...`);
      const range = `${firstSheetName}!A1:B5`;
      console.log(`   Range: ${range}`);

      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: config.googleSheetId,
          range,
        });

        console.log(`   ✅ Success! Found ${response.data.values?.length || 0} rows`);
        if (response.data.values) {
          response.data.values.slice(0, 3).forEach((row: any, i: number) => {
            console.log(`      Row ${i + 1}: ${JSON.stringify(row)}`);
          });
        }
      } catch (error: any) {
        console.log(`   ⚠️ Error reading: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

listSheets();
