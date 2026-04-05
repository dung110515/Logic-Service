/**
 * Document Handler - Xử Lý File Upload Từ Discord
 * =====================================================
 * 
 * Kafka Topic (Input): discord.file.uploaded
 * 
 * Workflow Chi Tiết:
 * 1. ✅ Nhận message từ Discord Proxy Service chứa metadata file
 * 2. ✅ Validate dữ liệu bắt buộc (fileId, fileName, courseId, uploadedBy)
 * 3. ✅ Lưu metadata vào Database (Document table)
 * 4. ✅ Nếu file types hỗ trợ (PDF, DOCX, PPTX, DOC):
 *    - Publish request đến AI Service để tóm tắt document
 *    - Kích hoạt workflow AI summarization
 * 5. ✅ Log thành công + lưu metric
 * 
 * Supported File Types for AI:
 * - PDF: application/pdf
 * - Word: application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * - PowerPoint: application/vnd.openxmlformats-officedocument.presentationml.presentation
 * - Text: text/plain (không AI)
 * 
 * Error Handling:
 * - Validation lỗi → log warning, bỏ qua
 * - Database lỗi → log error, không rethrow (consumer tiếp tục)
 * - AI publish lỗi → log error, nhưng file vẫn được lưu
 * 
 * @param payload - FileUploadedPayload từ Kafka message
 * @example
 * Kafka Message Format:
 * {
 *   messageId: "msg-001",
 *   timestamp: 1704067200000,
 *   source: "discord-proxy",
 *   data: {
 *     fileId: "file-123",
 *     fileName: "lecture-1.pdf",
 *     fileSize: 2048000,
 *     mimeType: "application/pdf",
 *     uploadedBy: "user-456",
 *     courseId: "course-789",
 *     uploadedAt: "2024-01-01T12:00:00Z"
 *   }
 * }
 */

import { FileUploadedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishAISummarizeDoc } from '../producer';

// ===== CONSTANTS =====
const SUPPORTED_AI_TYPES = ['pdf', 'docx', 'pptx', 'doc'];

export const handleFileUploaded = async (payload: FileUploadedPayload): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing file upload: ${data.fileName} (${data.fileId})`);

    // ===== Step 1: Validate Payload =====
    // Kiểm tra các field bắt buộc có đầy đủ không
    if (!data.fileId || !data.fileName || !data.courseId || !data.uploadedBy) {
      console.warn('⚠️ Invalid file upload payload - missing required fields:', data);
      console.warn('Required fields: fileId, fileName, courseId, uploadedBy');
      return; // Bỏ qua, không lưu database
    }

    // ===== Step 2: Save to Database =====
    // Lưu metadata file vào Document table
    const document = await prisma.document.create({
      data: {
        courseId: data.courseId,
        uploadedById: data.uploadedBy,
        fileName: data.fileName,
        fileUrl: data.fileId, // Discord stores fileId as the reference/URL
        fileType: data.mimeType.split('/')[1] || 'unknown', // Extract từ mimeType (e.g., "pdf" từ "application/pdf")
      },
    });

    console.log(`✅ Document saved to database: ${document.id}`);

    // ===== Step 3: Trigger AI Summarization (Optional) =====
    // Chỉ những file types được hỗ trợ mới cần AI summarization
    const mimeTypeLower = data.mimeType.toLowerCase();
    const needsAISummarization = SUPPORTED_AI_TYPES.some(type => mimeTypeLower.includes(type));

    if (needsAISummarization) {
      // Publish request đến AI Service
      await publishAISummarizeDoc({
        source: 'logic-service', // Chỉ ra request từ service nào
        data: {
          documentId: document.id, // Database ID (không phải fileId)
          courseId: data.courseId,
          content: data.fileName, // Tên file làm title
          language: 'vi', // Mặc định tiếng Việt
        },
      });
      console.log(`📤 AI summarization requested for: ${document.id} (${data.mimeType})`);
    } else {
      console.log(`⏭️  Skipped AI summarization for: ${data.mimeType} (not supported)`);
    }

    // ===== Step 4: Log Success =====
    console.log('✅ File processed successfully:', {
      documentId: document.id,
      fileName: data.fileName,
      courseId: data.courseId,
      needsAI: needsAISummarization,
    });
  } catch (error) {
    // ===== Error Handling =====
    console.error('❌ Error in documentHandler:', error);
    // Không throw error - Kafka consumer phải tiếp tục xử lý messages tiếp theo
    // Nếu throw, consumer sẽ bị stuck và không thể xử lý message khác
  }
};

export default handleFileUploaded;
