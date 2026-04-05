import { FileUploadedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishAISummarizeDoc } from '../producer';

const SUPPORTED_AI_TYPES = ['pdf', 'docx', 'pptx', 'doc'];

export const handleFileUploaded = async (payload: FileUploadedPayload): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing file upload: ${data.fileName} (${data.fileId})`);

    if (!data.fileId || !data.fileName || !data.courseId || !data.uploadedBy) {
      console.warn('⚠️ Invalid file upload payload - missing required fields:', data);
      console.warn('Required fields: fileId, fileName, courseId, uploadedBy');
      return;
    }

    const document = await prisma.document.create({
      data: {
        courseId: data.courseId,
        uploadedById: data.uploadedBy,
        fileName: data.fileName,
        fileUrl: data.fileId,
        fileType: data.mimeType.split('/')[1] || 'unknown',
      },
    });

    console.log(`✅ Document saved to database: ${document.id}`);

    const mimeTypeLower = data.mimeType.toLowerCase();
    const needsAISummarization = SUPPORTED_AI_TYPES.some(type => mimeTypeLower.includes(type));

    if (needsAISummarization) {

      await publishAISummarizeDoc({
        source: 'logic-service',
        data: {
          documentId: document.id,
          courseId: data.courseId,
          content: data.fileName,
          language: 'vi',
        },
      });
      console.log(`📤 AI summarization requested for: ${document.id} (${data.mimeType})`);
    } else {
      console.log(`⏭️  Skipped AI summarization for: ${data.mimeType} (not supported)`);
    }

    console.log('✅ File processed successfully:', {
      documentId: document.id,
      fileName: data.fileName,
      courseId: data.courseId,
      needsAI: needsAISummarization,
    });
  } catch (error) {

    console.error('❌ Error in documentHandler:', error);

  }
};

export default handleFileUploaded;
