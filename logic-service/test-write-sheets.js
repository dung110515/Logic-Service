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
    const sheetName = 'Trang tính1';

    console.log('📝 Writing data to Google Sheet...\n');

    // 1. Write headers
    console.log('1️⃣ Writing headers...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:D1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Môn học', 'Sinh viên', 'Điểm', 'Ngày cập nhật']],
      },
    });
    console.log('   ✅ Headers written\n');

    // 2. Write sample data
    console.log('2️⃣ Writing sample data...');
    const sampleData = [
      ['Lập trình Python', 'Nguyễn Văn A', '8.5', new Date().toISOString()],
      ['Lập trình Python', 'Trần Thị B', '7.0', new Date().toISOString()],
      ['Cấu trúc dữ liệu', 'Lê Văn C', '8.0', new Date().toISOString()],
      ['Cấu trúc dữ liệu', 'Phạm Thị D', '7.5', new Date().toISOString()],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A2:D5`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: sampleData,
      },
    });
    console.log(`   ✅ Wrote ${sampleData.length} rows of data\n`);

    // 3. Append new row
    console.log('3️⃣ Appending a new row...');
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Cơ sở dữ liệu', 'Hoàng Văn E', '8.8', new Date().toISOString()]],
      },
    });
    console.log('   ✅ New row appended\n');

    // 4. Read back the data
    console.log('4️⃣ Reading data back from sheet...');
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:D10`,
    });

    console.log('   📊 Current sheet content:\n');
    readRes.data.values?.forEach((row, i) => {
      console.log(`      Row ${i}: ${JSON.stringify(row)}`);
    });

    console.log('\n✅ Google Sheets integration is fully operational!');
    console.log('\n💡 Your Logic Service can now:');
    console.log('   • Write grades, scores, and results to Google Sheets');
    console.log('   • Read student data, course information from Google Sheets');
    console.log('   • Sync data bidirectionally between database and Google Sheets');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();
