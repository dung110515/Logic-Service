/**
 * Sheets Service
 * Google Sheets API integration
 * Dùng để đồng bộ dữ liệu khóa học từ Google Sheets
 *
 * Hỗ trợ:
 * - Nhập danh sách sinh viên từ Sheet
 * - Xuất điểm từ cơ sở dữ liệu ra Sheet
 * - Đồng bộ bài tập, deadline, v.v.
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from '../config/env';

/**
 * Khởi tạo Google Sheets API client
 */
const initSheetsClient = (): ReturnType<typeof google.sheets> => {
  if (!config.googleCredentialsJson) {
    throw new Error('googleCredentialsJson không được cấu hình');
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

/**
 * Đọc dữ liệu từ Google Sheet
 *
 * @param sheetId - ID của Google Sheet
 * @param range - Range to read (ví dụ: "Sheet1!A1:C10")
 * @returns Dữ liệu từ sheet (2D array)
 */
export const readSheet = async (
  sheetId: string,
  range: string
): Promise<any[][]> => {
  try {
    const sheets = initSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    return response.data.values || [];
  } catch (error) {
    console.error('❌ Error reading sheet:', error);
    throw error;
  }
};

/**
 * Ghi dữ liệu vào Google Sheet
 *
 * @param sheetId - ID của Google Sheet
 * @param range - Range to write (ví dụ: "Sheet1!A1")
 * @param values - Dữ liệu để ghi (2D array)
 */
export const writeSheet = async (
  sheetId: string,
  range: string,
  values: any[][]
): Promise<void> => {
  try {
    const sheets = initSheetsClient();

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`✅ Written to sheet: ${range}`);
  } catch (error) {
    console.error('❌ Error writing to sheet:', error);
    throw error;
  }
};

/**
 * Append dữ liệu vào Google Sheet (thêm vào cuối)
 *
 * @param sheetId - ID của Google Sheet
 * @param range - Range where to start appending (ví dụ: "Sheet1!A:C")
 * @param values - Dữ liệu để append (2D array)
 */
export const appendSheet = async(
  sheetId: string,
  range: string,
  values: any[][]
): Promise<void> => {
  try {
    const sheets = initSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`✅ Appended to sheet: ${range}`);
  } catch (error) {
    console.error('❌ Error appending to sheet:', error);
    throw error;
  }
};

/**
 * Clear dữ liệu từ Google Sheet
 *
 * @param sheetId - ID của Google Sheet
 * @param range - Range to clear (ví dụ: "Sheet1!A1:C10")
 */
export const clearSheet = async (
  sheetId: string,
  range: string
): Promise<void> => {
  try {
    const sheets = initSheetsClient();

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range,
    });

    console.log(`✅ Cleared sheet: ${range}`);
  } catch (error) {
    console.error('❌ Error clearing sheet:', error);
    throw error;
  }
};

/**
 * TODO: Sync students từ Sheet vào DB
 * Thường gọi khi course bắt đầu
 */
export const syncStudentsFromSheet = async (
  sheetId: string,
  courseId: string
): Promise<void> => {
  try {
    console.log(`🔄 Syncing students from sheet ${sheetId} to course ${courseId}`);

    // 1. Read sheet (assuming headers: email, name, discordId)
    // 2. For each row: create/update User, create Enrollment
    // 3. Log results

    // TODO: Implement
    console.log('⚠️ syncStudentsFromSheet not implemented yet');
  } catch (error) {
    console.error('❌ Error syncing students:', error);
    throw error;
  }
};

/**
 * TODO: Export grades to Sheet
 * Thường gọi khi giáo viên yêu cầu xuất điểm
 */
export const exportGradesToSheet = async (
  sheetId: string,
  courseId: string
): Promise<void> => {
  try {
    console.log(`🔄 Exporting grades from course ${courseId} to sheet ${sheetId}`);

    // 1. Query all grades from DB
    // 2. Format data (student name, email, score, percentage)
    // 3. Write to sheet
    // 4. Log results

    // TODO: Implement
    console.log('⚠️ exportGradesToSheet not implemented yet');
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
