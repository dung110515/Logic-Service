import { TicketCreatedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishAIAnswerTicket } from '../producer';
import { getRedisClient, isRedisConnected } from '../../lib/redis';
import { getStudentCourseContext } from '../../services/contextService';

export const handleTicketCreated = async (
  payload: TicketCreatedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(
      `🔄 Processing question ticket: ${data.ticketId} from student ${data.studentId} in course ${data.courseId}`
    );

    if (!data.ticketId || !data.studentId || !data.courseId || !data.question) {
      console.warn('⚠️ Invalid ticket payload (missing required fields):', {
        ticketId: data.ticketId,
        studentId: data.studentId,
        courseId: data.courseId,
        hasQuestion: !!data.question,
      });
      return;
    }

    let cachedAnswer = null;
    if (isRedisConnected()) {
      const redis = getRedisClient();

      const questionHash = Buffer.from(data.question).toString('base64').substring(0, 50);
      const cacheKey = `qa:${data.courseId}:${questionHash}`;
      cachedAnswer = await redis.get(cacheKey);

      if (cachedAnswer) {
        console.log(`✅ Found cached answer for similar question`);

      }
    }

    const ticket = await prisma.ticket.create({
      data: {
        courseId: data.courseId,
        studentId: data.studentId,
        question: data.question,
        status: 'OPEN',
      },
    });

    console.log(`✅ Ticket saved to database:`, {
      id: ticket.id,
      courseId: data.courseId,
      studentId: data.studentId,
    });

    try {
      const context = await getStudentCourseContext(data.studentId, data.courseId);
      console.log(`✅ Course context fetched for course ${data.courseId}`);

      const contextStr = JSON.stringify(context);
      await publishAIAnswerTicket({
        source: 'logic-service',
        data: {
          ticketId: ticket.id,
          question: data.question,
          courseContext: contextStr,
        },
      });

      console.log(`📤 AI answer request published with context for ticket ${ticket.id}`);
    } catch (contextError) {

      console.warn('⚠️ Could not fetch course context, publishing without it:', contextError);

      await publishAIAnswerTicket({
        source: 'logic-service',
        data: {
          ticketId: ticket.id,
          question: data.question,
          courseContext: '{}',
        },
      });

      console.log(`📤 AI answer request published (without context)`);
    }

    console.log(`✅ Ticket processed successfully:`, {
      ticketId: ticket.id,
      studentId: data.studentId,
      courseId: data.courseId,
      questionLength: data.question.length,
    });
  } catch (error) {

    console.error('❌ Error in contextHandler:', error);

  }
};

export default handleTicketCreated;
