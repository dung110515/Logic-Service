/**
 * Document Handler
 * Xử lý: FILE_UPLOADED message từ Discord Proxy Service
 * 
 * Workflow:
 * 1. Nhận file metadata từ Discord
 * 2. Lưu vào Document table
 * 3. Gửi request tới AI Service để tóm tắt nếu cần
 * 4. Cache metadata trong Redis
 */

import { FileUploadedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishAISummarizeDoc } from '../producer';

export const handleFileUploaded = async (payload: FileUploadedPayload): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing file upload: ${data.fileName} (${data.fileId})`);

    // ===== Validate payload =====
    if (!data.fileId || !data.fileName || !data.courseId || !data.uploadedBy) {
      console.warn('⚠️ Invalid file upload payload:', data);
      return;
    }

    // ===== Save to Database =====
    const document = await prisma.document.create({
      data: {
        courseId: data.courseId,
        uploadedById: data.uploadedBy,
        fileName: data.fileName,
        fileUrl: data.fileId, // Assume fileId is the URL or key
        fileType: data.mimeType.split('/')[1] || 'unknown', // Extract from mimeType
      },
    });

    console.log(`✅ Document saved: ${document.id}`);

    // ===== Trigger AI Summarization (if file is PDF, DOCX, PPTX) =====
    const aiSummarizeTypes = ['pdf', 'docx', 'pptx', 'doc'];
    if (aiSummarizeTypes.includes(data.mimeType.toLowerCase())) {
      await publishAISummarizeDoc({
        source: 'logic-service',
        data: {
          documentId: document.id,
          courseId: data.courseId,
          content: data.fileName,
          language: 'vi',
        },
      });
      console.log(`📤 AI summarization requested for: ${document.id}`);
    }

    console.log('✅ File processed:', {
      documentId: document.id,
      fileName: data.fileName,
      courseId: data.courseId,
    });
  } catch (error) {
    console.error('❌ Error in documentHandler:', error);
    // Không throw - để consumer tiếp tục xử lý messages tiếp theo
  }
};

export default handleFileUploaded;
