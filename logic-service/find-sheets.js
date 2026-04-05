const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

(async () => {
  try {
    const credsPath = path.resolve(__dirname, 'credentials/service-account-key.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));

    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = '145vEsm451eFb9H8tcfSI4XPOomBzi_2EMFU026X-WA4';

    const res = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });

    console.log('📄 Spreadsheet:', res.data.properties.title);
    console.log('\n📋 Available sheets:');
    res.data.sheets.forEach((sheet, i) => {
      console.log(`   ${i+1}. "${sheet.properties.title}"`);
    });

    const firstSheetName = res.data.sheets[0].properties.title;
    console.log(`\n🔍 Testing read from "${firstSheetName}"...`);

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${firstSheetName}!A1:C10`,
    });

    console.log(`✅ Successfully read ${readRes.data.values?.length || 0} rows from sheet`);

  } catch (error) {
    console.error('Error:', error.message);
  }
})();
