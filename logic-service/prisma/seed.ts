import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  await prisma.grade.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.quizResult.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  const users = await prisma.user.createMany({
    data: [
      {
        discordId: '123456789',
        userCode: 'SV001',
        fullName: 'Nguyễn Văn A',
        email: 'nguyenvana@neu.edu.vn',
        role: 'STUDENT',
      },
      {
        discordId: '987654321',
        userCode: 'SV002',
        fullName: 'Trần Thị B',
        email: 'tranthib@neu.edu.vn',
        role: 'STUDENT',
      },
      {
        discordId: '111111111',
        userCode: 'GV001',
        fullName: 'Phạm Văn C',
        email: 'phamvanc@neu.edu.vn',
        role: 'TEACHER',
      },
    ],
  });

  console.log(`✅ Created ${users.count} users`);

  const teacher = await prisma.user.findUnique({
    where: { userCode: 'GV001' },
  });

  if (!teacher) throw new Error('Teacher not found');

  const course = await prisma.course.create({
    data: {
      code: 'INT3306',
      name: 'Service-Oriented Architecture',
      semester: 'HK1_2025-2026',
      discordServerId: 'guild123',
      instructorId: teacher.id,
      status: 'ACTIVE',
    },
  });

  console.log(`✅ Created course: ${course.code}`);

  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
  });

  const enrollments = await Promise.all(
    students.map((student) =>
      prisma.enrollment.create({
        data: {
          userId: student.id,
          courseId: course.id,
          status: 'active',
        },
      })
    )
  );

  console.log(`✅ Created ${enrollments.length} enrollments`);

  const document = await prisma.document.create({
    data: {
      courseId: course.id,
      uploadedById: teacher.id,
      fileName: 'Slide_Lec_01.pdf',
      fileUrl: 'https://example.com/slide1.pdf',
      fileType: 'pdf',
      aiSummary: 'Giới thiệu về SOA và microservices',
    },
  });

  console.log(`✅ Created document: ${document.fileName}`);

  const assignment = await prisma.assignment.create({
    data: {
      courseId: course.id,
      title: 'Build Simple REST API',
      deadline: new Date('2025-04-15'),
      maxScore: 10,
    },
  });

  console.log(`✅ Created assignment: ${assignment.title}`);

  const student = students[0];
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      fileUrl: 'https://example.com/submission1.zip',
      isLate: false,
      status: 'PENDING',
    },
  });

  console.log(`✅ Created submission for ${student.fullName}`);

  const grade = await prisma.grade.create({
    data: {
      submissionId: submission.id,
      score: 8.5,
      comment: 'Good implementation, needs error handling',
      gradedById: teacher.id,
    },
  });

  console.log(`✅ Created grade: ${grade.score}`);

  const quiz = await prisma.quiz.create({
    data: {
      courseId: course.id,
      documentId: document.id,
      title: 'Quiz 1: SOA Concepts',
      status: 'PUBLISHED',
      questionsJson: {
        questions: [
          {
            id: 'q1',
            text: 'What is SOA?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
          },
        ],
      },
    },
  });

  console.log(`✅ Created quiz: ${quiz.title}`);

  const quizResult = await prisma.quizResult.create({
    data: {
      quizId: quiz.id,
      studentId: student.id,
      score: 9.0,
      answersJson: { answers: ['A', 'B', 'A'] },
    },
  });

  console.log(`✅ Created quiz result: ${quizResult.score}`);

  const ticket = await prisma.ticket.create({
    data: {
      studentId: student.id,
      courseId: course.id,
      question: 'What is the difference between SOA and microservices?',
      status: 'AI_ANSWERED',
      aiAnswer: 'SOA is service-oriented architecture...',
    },
  });

  console.log(`✅ Created ticket: ${ticket.id.slice(0, 8)}`);

  console.log('\n✨ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
