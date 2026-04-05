/**
 * Quiz Handler - Xử Lý Nộp Quiz Từ Web Service
 * ================================================
 * 
 * Mục đích:
 * - Nhận WEB_QUIZ_SUBMITTED message từ Web Service
 * - Lưu câu trả lời quiz vào database
 * - Tự động chấm điểm (multiple choice)
 * - Báo Analytics/Notification Service
 * - Notify sinh viên về kết quả
 * 
 * Message Flow:
 * Web User (browser)
 *   └── Submit Quiz
 *       └── Web Service
 *           └── WEB_QUIZ_SUBMITTED message (Kafka)
 *               └── Logic Service (this handler)
 *                   ├── Validate quiz
 *                   ├── Auto-grade (count correct answers)
 *                   ├── Save QuizResult
 *                   └── Publish notification
 * 
 * Kafka Message Format:
 * {
 *   "messageId": "msg-789",
 *   "timestamp": "2024-01-15T11:00:00Z",
 *   "source": "web-service",
 *   "data": {
 *     "submissionId": "sub-456",
 *     "studentId": "user-456",
 *     "quizId": "quiz-001",
 *     "courseId": "course-001",
 *     "answers": {
 *       "0": "A",
 *       "1": "B",
 *       "2": "C"
 *     },
 *     "submittedAt": "2024-01-15T10:55:00Z"
 *   }
 * }
 * 
 * Database Schema:
 * Quiz {
 *   id: String
 *   title: String
 *   courseId: String (FK)
 *   questionsJson: String (JSON array of questions)
 *   // Question format:
 *   // {
 *   //   "id": "q1",
 *   //   "text": "What is 2+2?",
 *   //   "options": ["3", "4", "5"],
 *   //   "correctAnswer": "4"
 *   // }
 * }
 * 
 * QuizResult {
 *   id: String
 *   studentId: String (FK)
 *   quizId: String (FK)
 *   answersJson: String (submitted answers)
 *   score: Int (number of correct answers)
 *   createdAt: DateTime
 * }
 * 
 * Auto-Grading Logic:
 * - For each question in answers:
 *   1. Find question in quiz.questionsJson
 *   2. Check if submitted answer === correctAnswer
 *   3. Increment score if correct
 * - Score = number of correct answers (not percentage)
 * - TODO: Add percentage calculation, letter grades
 * 
 * Error Handling:
 * - Invalid payload → log warning, skip
 * - Quiz not found → log warning, skip
 * - Grading logic error → set score to 0, continue
 * - DB error → log error, don't throw (keep consumer running)
 * 
 * Dùng bởi: kafkaConsumer (subscribes to WEB_QUIZ_SUBMITTED topic)
 */

import { WebQuizSubmittedPayload } from '../../types';
import { prisma } from '../../lib/prisma';
import { publishNotification } from '../producer';

/**
 * Xử Lý Quiz Được Nộp Từ Web
 * ==========================
 * 
 * Workflow:
 * 1. Validate payload (check required fields)
 * 2. Fetch quiz details (questions, correct answers)
 * 3. Auto-grade: đếm số câu trả lời đúng
 * 4. Save QuizResult record
 * 5. Publish notification để notify sinh viên
 * 6. Log kết quả
 * 
 * @param payload - WebQuizSubmittedPayload từ Kafka
 *   - messageId: unique message ID
 *   - timestamp: khi message được tạo
 *   - source: "web-service"
 *   - data: quiz submission info
 *     - submissionId: web submission ID
 *     - studentId: người nộp
 *     - quizId: ID quiz
 *     - courseId: ID khóa học
 *     - answers: {questionIndex: answer, ...}
 * 
 * @example
 * // Kafka message:
 * const payload = {
 *   messageId: 'msg-789',
 *   timestamp: '2024-01-15T11:00:00Z',
 *   source: 'web-service',
 *   data: {
 *     submissionId: 'sub-456',
 *     studentId: 'user-456',
 *     quizId: 'quiz-001',
 *     courseId: 'course-001',
 *     answers: {
 *       '0': 'A',  // Question 0, answer A
 *       '1': 'B',  // Question 1, answer B
 *       '2': 'C'   // Question 2, answer C
 *     }
 *   }
 * };
 * 
 * // Handler processes:
 * await handleWebQuizSubmitted(payload);
 * // ✅ Quiz result saved with score=2 (2 correct answers)
 * // ✅ Notification published to student
 */
export const handleWebQuizSubmitted = async (
  payload: WebQuizSubmittedPayload
): Promise<void> => {
  try {
    const { data } = payload;

    console.log(`🔄 Processing quiz submission: ${data.submissionId} from student ${data.studentId}`);

    // ===== Step 1: Validate Payload =====
    // Check required fields: submissionId, studentId, quizId
    if (!data.submissionId || !data.studentId || !data.quizId) {
      console.warn('⚠️ Invalid quiz submission payload (missing required fields):', {
        submissionId: data.submissionId,
        studentId: data.studentId,
        quizId: data.quizId,
      });
      return; // Skip this message
    }

    // ===== Step 2: Fetch Quiz Details =====
    // Lấy quiz info từ DB (để access correct answers)
    const quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
      select: {
        id: true,
        title: true,
        questionsJson: true, // JSON array of question objects
      },
    });

    if (!quiz) {
      console.warn(`⚠️ Quiz not found: ${data.quizId}`);
      return; // Skip - quiz doesn't exist
    }

    // ===== Step 3: Auto-Grade (Count Correct Answers) =====
    // Vòng lặp qua từng question:
    // 1. Parse student's answer (from data.answers)
    // 2. Compare với correctAnswer trong quiz
    // 3. Increment score nếu đúng
    let score = 0;
    try {
      // Parse questions từ JSON (có thể là array hoặc JSON string)
      const questions = Array.isArray(quiz.questionsJson) 
        ? quiz.questionsJson 
        : JSON.parse(quiz.questionsJson as string);

      // Duyệt từng submitted answer
      Object.entries(data.answers).forEach(([questionIndex, answer]) => {
        const q = questions[parseInt(questionIndex)];
        if (q && q.correctAnswer === answer) {
          score++; // Increment score khi trả lời đúng
        }
      });

      console.log(`🔢 Auto-graded quiz: ${score}/${questions.length} correct`);
    } catch (e) {
      // Grading error: set score to 0 (don't throw, continue)
      console.warn('⚠️ Could not auto-grade quiz (JSON parse error):', e);
      score = 0;
    }

    // ===== Step 4: Save QuizResult =====
    // Tạo record trong DB với submitted answers + score
    const quizResult = await prisma.quizResult.create({
      data: {
        studentId: data.studentId,
        quizId: data.quizId,
        answersJson: JSON.stringify(data.answers), // Store answers as JSON
        score, // Number of correct answers
      },
    });

    console.log(`✅ Quiz result saved to database:`, {
      id: quizResult.id,
      studentId: data.studentId,
      quizId: data.quizId,
      score,
    });

    // ===== Step 5: Notify Student =====
    // Publish notification event để notify user biết kết quả
    await publishNotification({
      source: 'logic-service',
      data: {
        userId: data.studentId,
        title: 'Kết Quả Quiz', // Result
        content: `Quiz "${quiz.title}" của bạn đã được chấm: ${score} câu đúng`, // "Your quiz has been graded: X correct answers"
      },
    });

    console.log(`✅ Quiz submission processed successfully:`, {
      quizResultId: quizResult.id,
      studentId: data.studentId,
      quizTitle: quiz.title,
      score,
      totalQuestions: 'See quiz.questionsJson for count',
    });
  } catch (error) {
    // ===== Error Handling =====
    // Log error nhưng don't throw (để Kafka consumer tiếp tục)
    console.error('❌ Error in quizHandler:', error);
    // Don't throw - keep consumer running
  }
};

export default handleWebQuizSubmitted;
