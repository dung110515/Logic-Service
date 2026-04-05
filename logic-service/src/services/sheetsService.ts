import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from '../config/env';

const initSheetsClient = (): ReturnType<typeof google.sheets> => {

  if (!config.googleCredentialsJson) {
    throw new Error('❌ googleCredentialsJson không được cấu hình!\nSet GOOGLE_CREDENTIALS_JSON env var');
  }

  try {

    const credentials = JSON.parse(config.googleCredentialsJson);

    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('❌ Error initializing Google Sheets client:', error);
    throw error;
  }
};

export const readSheet = async (
  sheetId: string,
  range: string
): Promise<any[][]> => {
  try {

    const sheets = initSheetsClient();

    console.log(`📖 Reading from sheet: ${sheetId} → ${range}`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    const data = response.data.values || [];
    console.log(`✅ Read ${data.length} rows from ${range}`);
    return data;
  } catch (error) {
    console.error(`❌ Error reading sheet ${sheetId}:`, error);
    throw error;
  }
};

export const writeSheet = async (
  sheetId: string,
  range: string,
  values: any[][]
): Promise<void> => {
  try {

    const sheets = initSheetsClient();

    console.log(`✏️ Writing to sheet: ${sheetId} → ${range} (${values.length} rows)`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`✅ Successfully written to sheet: ${range}`);
  } catch (error) {
    console.error(`❌ Error writing to sheet ${sheetId}:`, error);
    throw error;
  }
};

export const appendSheet = async(
  sheetId: string,
  range: string,
  values: any[][]
): Promise<void> => {
  try {

    const sheets = initSheetsClient();

    console.log(`➕ Appending to sheet: ${sheetId} → ${range} (${values.length} rows)`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`✅ Successfully appended to sheet: ${range}`);
  } catch (error) {
    console.error(`❌ Error appending to sheet ${sheetId}:`, error);
    throw error;
  }
};

export const clearSheet = async (
  sheetId: string,
  range: string
): Promise<void> => {
  try {

    const sheets = initSheetsClient();

    console.log(`🗑️ Clearing sheet: ${sheetId} → ${range}`);
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range,
    });

    console.log(`✅ Successfully cleared sheet: ${range}`);
  } catch (error) {
    console.error(`❌ Error clearing sheet ${sheetId}:`, error);
    throw error;
  }
};

export const syncStudentsFromSheet = async (
  sheetId: string,
  courseId: string
): Promise<void> => {
  try {
    console.log(`🔄 Syncing students from sheet ${sheetId} to course ${courseId}`);

    const studentData = await readSheet(sheetId, 'Sheet1!A2:C1000');

    if (!studentData || studentData.length === 0) {
      console.warn('⚠️ No student data found in sheet');
      return;
    }

    console.log('⚠️ syncStudentsFromSheet not fully implemented yet');
    console.log(`   Total rows in sheet: ${studentData.length}`);
    console.log('   TODO: Add Prisma calls to sync students & create enrollments');
  } catch (error) {
    console.error('❌ Error syncing students:', error);
    throw error;
  }
};

export const exportGradesToSheet = async (
  sheetId: string,
  courseId: string
): Promise<void> => {
  try {
    console.log(`🔄 Exporting grades from course ${courseId} to sheet ${sheetId}`);

    console.log('⚠️ exportGradesToSheet not fully implemented yet');
    console.log('   TODO: Add DB queries to fetch grades');
    console.log('   TODO: Calculate percentages and letter grades');
    console.log('   TODO: Call writeSheet() to export');
  } catch (error) {
    console.error('❌ Error exporting grades:', error);
    throw error;
  }
};

export default {
  readSheet,
  writeSheet,
  appendSheet,
  clearSheet,
  syncStudentsFromSheet,
  exportGradesToSheet,
};
