/**
 * Sheets Service - Google Sheets API Integration
 * ================================================
 * 
 * Mục đích:
 * - Đơn giản hóa việc tích hợp với Google Sheets API
 * - Hỗ trợ đọc dữ liệu khóa học từ Google Sheets
 * - Xuất điểm từ cơ sở dữ liệu ra Google Sheets
 * - Đồng bộ danh sách sinh viên, bài tập, deadline
 * 
 * Dùng bởi:
 * - init-handler: Khởi tạo khóa học từ Google Sheet
 * - gradingHandler: Xuất điểm đã chấm ra Sheet
 * - Manual sync scripts: Đồng bộ dữ liệu định kỳ
 * 
 * Google Sheets Setup:
 * 1. Create Google Cloud Project
 * 2. Enable Google Sheets API
 * 3. Create Service Account
 * 4. Download credentials JSON
 * 5. Set GOOGLE_CREDENTIALS_JSON env var
 * 
 * Data Format:
 * - Student sheet: [email, fullName, discordUserId]
 * - Grade sheet: [studentId, assignmentId, score, submissionId]
 * - Assignment sheet: [title, deadline, maxScore, rubricUrl]
 * 
 * Error Handling:
 * - Invalid credentials → throw error (service won't start)
 * - Network error → throw error (handler will retry)
 * - Permission denied → throw error (need to share sheet)
 * - Invalid range → fallback to empty array
 * 
 * Performance:
 * - Batch operations: Read 100+ rows at once
 * - No pagination needed: Google Sheets API handles it
 * - Consider caching if reading same sheet multiple times
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from '../config/env';

/**
 * Khởi Tạo Google Sheets API Client
 * ==================================
 * 
 * Đọc credentials từ environment variable
 * Khởi tạo JWT authentication để gọi Google Sheets API
 * 
 * Credentials format (JSON):
 * {
 *   "type": "service_account",
 *   "project_id": "...",
 *   "private_key_id": "...",
 *   "private_key": "-----BEGIN PRIVATE KEY-----...",
 *   "client_email": "...",
 *   "client_id": "...",
 *   "auth_uri": "...",
 *   "token_uri": "...",
 *   "auth_provider_x509_cert_url": "...",
 *   "client_x509_cert_url": "..."
 * }
 * 
 * @returns sheets - Google Sheets API client instance
 * @throws Error nếu credentials không được cấu hình hoặc invalid
 * 
 * @example
 * const sheets = initSheetsClient();
 * const result = await sheets.spreadsheets.values.get({...});
 */
const initSheetsClient = (): ReturnType<typeof google.sheets> => {
  // ===== Check Environment Variable =====
  // Lấy credentials JSON từ env var (được set khi deploy service)
  if (!config.googleCredentialsJson) {
    throw new Error('❌ googleCredentialsJson không được cấu hình!\nSet GOOGLE_CREDENTIALS_JSON env var');
  }

  try {
    // ===== Parse Credentials =====
    // Convert JSON string → object
    const credentials = JSON.parse(config.googleCredentialsJson);

    // ===== Create JWT Auth =====
    // Service account JWT: dùng private key để authenticate với Google API
    const auth = new JWT({
      email: credentials.client_email, // Service account email
      key: credentials.private_key, // Private key để sign requests
      scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Read/write sheets
    });

    // ===== Create Sheets Client =====
    // Trả về API client instance (ready to use)
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('❌ Error initializing Google Sheets client:', error);
    throw error;
  }
};

/**
 * Đọc Dữ Liệu Từ Google Sheet
 * ==========================
 * 
 * Lấy dữ liệu từ một range nhất định trong Google Sheet
 * Trả về mảng 2D (rows × columns)
 * 
 * Range Format:
 * - "Sheet1!A1:C10" → Cột A-C, hàng 1-10 từ Sheet1
 * - "Sheet1!A:C" → Cột A-C toàn bộ (từ Sheet1)
 * - "Sheet1" → Toàn bộ Sheet1
 * - "Sheet1!A1" → Single cell
 * 
 * @param sheetId - Google Sheet ID (lấy từ URL: docs.google.com/spreadsheets/d/{sheetId})
 * @param range - Range to read (ví dụ: "Sheet1!A1:C10", "Students!A:E")
 * @returns any[][] - Dữ liệu từ sheet (empty array nếu range trống)
 * 
 * @example
 * // Đọc danh sách sinh viên từ "Students" sheet, cột A-D
 * const studentData = await readSheet(
 *   '1BxiMVs0XRA5nFMoon89PBfVf3HQHkHGeDWgXs8k0',
 *   'Students!A2:D100'  // Skip header row (A2)
 * );
 * console.log(studentData);
 * // [
 * //   ['nguyenvana@student', 'Nguyễn Văn A', '123456789'],
 * //   ['voanb@student', 'Võ Oanh B', '987654321'],
 * //   ...
 * // ]
 */
export const readSheet = async (
  sheetId: string,
  range: string
): Promise<any[][]> => {
  try {
    // ===== Initialize API Client =====
    const sheets = initSheetsClient();

    // ===== Fetch Data =====
    console.log(`📖 Reading from sheet: ${sheetId} → ${range}`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    // Trả về data hoặc empty array nếu range trống
    const data = response.data.values || [];
    console.log(`✅ Read ${data.length} rows from ${range}`);
    return data;
  } catch (error) {
    console.error(`❌ Error reading sheet ${sheetId}:`, error);
    throw error;
  }
};

/**
 * Ghi Dữ Liệu Vào Google Sheet
 * ============================
 * 
 * Thay thế dữ liệu tại range nhất định
 * Nếu range chứa dữ liệu cũ, sẽ bị overwrite
 * 
 * @param sheetId - Google Sheet ID
 * @param range - Starting position (ví dụ: "Sheet1!A1", "Grades!B2")
 * @param values - Dữ liệu 2D để ghi (mảng rows)
 * @returns Promise<void>
 * 
 * @example
 * // Ghi điểm sinh viên vào sheet
 * await writeSheet(
 *   '1BxiMVs0XRA5nFMoon89PBfVf3HQHkHGeDWgXs8k0',
 *   'Grades!A1',
 *   [
 *     ['Student ID', 'Assignment 1', 'Assignment 2', 'Total'],
 *     ['101', '8.5', '9.0', '8.75'],
 *     ['102', '7.0', '8.0', '7.50'],
 *   ]
 * );
 */
export const writeSheet = async (
  sheetId: string,
  range: string,
  values: any[][]
): Promise<void> => {
  try {
    // ===== Initialize API Client =====
    const sheets = initSheetsClient();

    // ===== Write Data =====
    console.log(`✏️ Writing to sheet: ${sheetId} → ${range} (${values.length} rows)`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED', // Allow formulas (=SUM, etc)
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

/**
 * Append Dữ Liệu Vào Google Sheet
 * ===============================
 * 
 * Thêm dữ liệu vào cuối của range (không overwrite)
 * Tự động tìm dòng trống tiếp theo và append
 * 
 * @param sheetId - Google Sheet ID
 * @param range - Range to append to (ví dụ: "Sheet1!A:C" → append to columns A-C)
 * @param values - Dữ liệu 2D để thêm
 * @returns Promise<void>
 * 
 * @example
 * // Thêm kết quả grading mới vào cuối sheet
 * await appendSheet(
 *   '1BxiMVs0XRA5nFMoon89PBfVf3HQHkHGeDWgXs8k0',
 *   'Grades!A:D',
 *   [
 *     ['103', '8.0', '8.5', '8.25'],
 *   ]
 * );
 */
export const appendSheet = async(
  sheetId: string,
  range: string,
  values: any[][]
): Promise<void> => {
  try {
    // ===== Initialize API Client =====
    const sheets = initSheetsClient();

    // ===== Append Data =====
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

/**
 * Clear Dữ Liệu Từ Google Sheet
 * =============================
 * 
 * Xóa sạch dữ liệu tại range nhất định
 * Format: clear dữ liệu nhưng giữ lại công thức (nếu có)
 * 
 * @param sheetId - Google Sheet ID
 * @param range - Range to clear (ví dụ: "Sheet1!A1:C10", "Grades!A2:E")
 * @returns Promise<void>
 * 
 * @example
 * // Clear bảng điểm cũ trước khi re-export
 * await clearSheet(
 *   '1BxiMVs0XRA5nFMoon89PBfVf3HQHkHGeDWgXs8k0',
 *   'Grades!A2:D100'
 * );
 */
export const clearSheet = async (
  sheetId: string,
  range: string
): Promise<void> => {
  try {
    // ===== Initialize API Client =====
    const sheets = initSheetsClient();

    // ===== Clear Data =====
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


/**
 * Sync Sinh Viên Từ Google Sheet Vào Database
 * ===========================================
 * 
 * Workflow:
 * 1. Đọc danh sách sinh viên từ Google Sheet
 * 2. Với mỗi sinh viên: create/update trong DB
 * 3. Tạo Enrollment (ghi danh sinh viên vào khóa học)
 * 4. Log kết quả (thành công, lỗi, trùng lặp)
 * 
 * Sheet Format (Expected):
 * Header: email | fullName | discordUserId
 * Row 2+: student@university.edu | Nguyễn Văn A | 123456789
 * 
 * Dùng bởi: init-handler (khi setup khóa học mới)
 * 
 * @param sheetId - Google Sheet ID
 * @param courseId - ID khóa học trong database
 * @returns Promise<void>
 * 
 * @throws Error nếu sheet không tồn tại hoặc format sai
 * 
 * @example
 * // Sync sinh viên từ sheet vào course
 * await syncStudentsFromSheet(
 *   '1BxiMVs0XRA5nFMoon89PBfVf3HQHkHGeDWgXs8k0',
 *   'course-001'
 * );
 * // ✅ Synced 25 students to course-001
 * // ⚠️ 2 students already enrolled (skipped)
 * // ❌ 1 error: invalid email format
 */
export const syncStudentsFromSheet = async (
  sheetId: string,
  courseId: string
): Promise<void> => {
  try {
    console.log(`🔄 Syncing students from sheet ${sheetId} to course ${courseId}`);

    // ===== Step 1: Read Sheet =====
    // Assuming: Column A=email, B=fullName, C=discordUserId
    // Skip row 1 (header)
    const studentData = await readSheet(sheetId, 'Sheet1!A2:C1000');

    if (!studentData || studentData.length === 0) {
      console.warn('⚠️ No student data found in sheet');
      return;
    }

    // ===== Step 2-3: Process Each Student =====
    // TODO: Implement
    // For each row:
    //   1. Extract: email, fullName, discordUserId
    //   2. Validate email format
    //   3. Find or create User in DB
    //   4. Create Enrollment (link student to course)
    //   5. Track success/error count
    //
    // Example pseudo-code:
    // for (const student of studentData) {
    //   const [email, fullName, discordId] = student;
    //   try {
    //     const user = await prisma.user.upsert({
    //       where: { email },
    //       update: { fullName, discordId },
    //       create: { email, fullName, discordId },
    //     });
    //     await prisma.enrollment.create({
    //       data: { userId: user.id, courseId },
    //     });
    //     successCount++;
    //   } catch (error) {
    //     errorCount++;
    //     console.error(`❌ Failed to sync ${email}:`, error.message);
    //   }
    // }

    console.log('⚠️ syncStudentsFromSheet not fully implemented yet');
    console.log(`   Total rows in sheet: ${studentData.length}`);
    console.log('   TODO: Add Prisma calls to sync students & create enrollments');
  } catch (error) {
    console.error('❌ Error syncing students:', error);
    throw error;
  }
};

/**
 * Export Điểm Sang Google Sheet
 * ============================
 * 
 * Workflow:
 * 1. Lấy tất cả sinh viên trong khóa học
 * 2. Với mỗi sinh viên: tổng hợp điểm từ DB
 * 3. Format: studentId | name | email | totalScore | percentage | grade
 * 4. Ghi vào Google Sheet (overwrite old data)
 * 5. Log results
 * 
 * Dùng bởi: gradeHandler, manual export scripts
 * 
 * @param sheetId - Google Sheet ID
 * @param courseId - ID khóa học
 * @returns Promise<void>
 * 
 * @throws Error nếu course không tồn tại hoặc query failed
 * 
 * @example
 * // Export tất cả điểm từ course sang sheet
 * await exportGradesToSheet(
 *   '1BxiMVs0XRA5nFMoon89PBfVf3HQHkHGeDWgXs8k0',
 *   'course-001'
 * );
 * // ✅ Exported grades for 25 students to Grades sheet
 * // ℹ️ Range: Grades!A1:F26 (header + 25 students)
 */
export const exportGradesToSheet = async (
  sheetId: string,
  courseId: string
): Promise<void> => {
  try {
    console.log(`🔄 Exporting grades from course ${courseId} to sheet ${sheetId}`);

    // ===== Step 1: Fetch Grades from DB =====
    // TODO: Implement
    // Query: SELECT student.id, name, email, AVG(grade.score), ...
    //        FROM enrollments
    //        JOIN users ON students
    //        JOIN submissions ON course
    //        JOIN grades ON submission
    //        GROUP BY student

    // ===== Step 2: Format Data =====
    // TODO: Calculate:
    //   - Total points earned
    //   - Percentage (total / max_score * 100)
    //   - Grade letter (A, B, C, D, F)
    //
    // Format:
    // [
    //   ['Student ID', 'Name', 'Email', 'Total Score', 'Percentage', 'Grade'],
    //   ['101', 'Nguyễn Văn A', 'a@student.edu', '82.5', '82.5%', 'B'],
    //   ...
    // ]

    // ===== Step 3: Clear Old Data & Write =====
    // TODO: 
    // 1. await clearSheet(sheetId, 'Grades!A2:F1000')
    // 2. await writeSheet(sheetId, 'Grades!A1', data)

    console.log('⚠️ exportGradesToSheet not fully implemented yet');
    console.log('   TODO: Add DB queries to fetch grades');
    console.log('   TODO: Calculate percentages and letter grades');
    console.log('   TODO: Call writeSheet() to export');
  } catch (error) {
    console.error('❌ Error exporting grades:', error);
    throw error;
  }
};

/**
 * Export All Functions
 * ====================
 * 
 * Module exports cho sheets service
 * Dùng bởi:
 * - handlers (read student list, export grades)
 * - scripts (sync data, bulk import)
 * - routes (admin endpoints)
 */
export default {
  readSheet, // Đọc dữ liệu từ sheet
  writeSheet, // Ghi (overwrite) dữ liệu vào sheet
  appendSheet, // Thêm (append) dữ liệu vào cuối
  clearSheet, // Xóa dữ liệu từ range
  syncStudentsFromSheet, // Sync sinh viên từ sheet → DB
  exportGradesToSheet, // Export điểm từ DB → sheet
};
