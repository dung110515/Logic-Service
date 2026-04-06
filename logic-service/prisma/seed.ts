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

  const userSeeds = [
    { userCode: 'GV001', fullName: 'Teacher 01', role: 'TEACHER' as const },
    { userCode: 'GV002', fullName: 'Teacher 02', role: 'TEACHER' as const },
    { userCode: 'AD001', fullName: 'Admin 01', role: 'ADMIN' as const },
    { userCode: 'TR001', fullName: 'Training 01', role: 'TRAINING' as const },
    { userCode: 'SV001', fullName: 'Student 01', role: 'STUDENT' as const },
    { userCode: 'SV002', fullName: 'Student 02', role: 'STUDENT' as const },
    { userCode: 'SV003', fullName: 'Student 03', role: 'STUDENT' as const },
    { userCode: 'SV004', fullName: 'Student 04', role: 'STUDENT' as const },
    { userCode: 'SV005', fullName: 'Student 05', role: 'STUDENT' as const },
    { userCode: 'SV006', fullName: 'Student 06', role: 'STUDENT' as const },
  ];

  const users = [];
  for (let i = 0; i < userSeeds.length; i += 1) {
    const seed = userSeeds[i];
    const user = await prisma.user.create({
      data: {
        discordId: `discord-${String(i + 1).padStart(3, '0')}`,
        userCode: seed.userCode,
        fullName: seed.fullName,
        email: `${seed.userCode.toLowerCase()}@example.edu`,
        role: seed.role,
      },
    });
    users.push(user);
  }
  console.log(`✅ Created ${users.length} users`);

  const teachers = users.filter((u) => u.role === 'TEACHER');
  const students = users.filter((u) => u.role === 'STUDENT');

  const courses = [];
  for (let i = 0; i < 10; i += 1) {
    const instructor = teachers[i % teachers.length];
    const course = await prisma.course.create({
      data: {
        code: `INT33${String(i + 1).padStart(2, '0')}`,
        name: `Course ${String(i + 1).padStart(2, '0')}`,
        semester: 'HK1_2026-2027',
        discordServerId: `guild-${String(i + 1).padStart(3, '0')}`,
        instructorId: instructor.id,
        status: 'ACTIVE',
      },
    });
    courses.push(course);
  }
  console.log(`✅ Created ${courses.length} courses`);

  const enrollments = [];
  for (let i = 0; i < 10; i += 1) {
    const student = students[i % students.length];
    const course = courses[i];
    const enrollment = await prisma.enrollment.create({
      data: {
        userId: student.id,
        courseId: course.id,
        status: 'active',
      },
    });
    enrollments.push(enrollment);
  }
  console.log(`✅ Created ${enrollments.length} enrollments`);

  const documents = [];
  for (let i = 0; i < 10; i += 1) {
    const course = courses[i];
    const document = await prisma.document.create({
      data: {
        courseId: course.id,
        uploadedById: course.instructorId,
        fileName: `Lecture_${String(i + 1).padStart(2, '0')}.pdf`,
        fileUrl: `https://example.com/files/lecture-${i + 1}.pdf`,
        fileType: 'pdf',
        isAiIndexed: true,
        aiSummary: `AI summary for course ${course.code}`,
      },
    });
    documents.push(document);
  }
  console.log(`✅ Created ${documents.length} documents`);

  const assignments = [];
  for (let i = 0; i < 10; i += 1) {
    const course = courses[i];
    const assignment = await prisma.assignment.create({
      data: {
        courseId: course.id,
        title: `Assignment ${String(i + 1).padStart(2, '0')}`,
        deadline: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        maxScore: 10,
      },
    });
    assignments.push(assignment);
  }
  console.log(`✅ Created ${assignments.length} assignments`);

  const submissions = [];
  for (let i = 0; i < 10; i += 1) {
    const student = students[i % students.length];
    const assignment = assignments[i];
    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        fileUrl: `https://example.com/submissions/submission-${i + 1}.zip`,
        isLate: false,
        status: 'GRADED',
      },
    });
    submissions.push(submission);
  }
  console.log(`✅ Created ${submissions.length} submissions`);

  const grades = [];
  for (let i = 0; i < 10; i += 1) {
    const course = courses[i];
    const grade = await prisma.grade.create({
      data: {
        submissionId: submissions[i].id,
        score: 6 + (i % 5),
        comment: `Feedback for submission ${i + 1}`,
        gradedById: course.instructorId,
      },
    });
    grades.push(grade);
  }
  console.log(`✅ Created ${grades.length} grades`);

  const quizzes = [];
  for (let i = 0; i < 10; i += 1) {
    const course = courses[i];
    const quiz = await prisma.quiz.create({
      data: {
        courseId: course.id,
        documentId: documents[i].id,
        title: `Quiz ${String(i + 1).padStart(2, '0')}`,
        status: 'PUBLISHED',
        timeLimitMins: 15 + i,
        deadline: new Date(Date.now() + (i + 2) * 24 * 60 * 60 * 1000),
        questionsJson: {
          questions: [
            {
              id: `q-${i + 1}-1`,
              text: `Question ${i + 1}A`,
              options: ['A', 'B', 'C', 'D'],
              correctAnswer: 'A',
            },
          ],
        },
      },
    });
    quizzes.push(quiz);
  }
  console.log(`✅ Created ${quizzes.length} quizzes`);

  const quizResults = [];
  for (let i = 0; i < 10; i += 1) {
    const student = students[i % students.length];
    const quizResult = await prisma.quizResult.create({
      data: {
        quizId: quizzes[i].id,
        studentId: student.id,
        score: 5 + (i % 6),
        answersJson: { answers: ['A', 'B', 'C'] },
      },
    });
    quizResults.push(quizResult);
  }
  console.log(`✅ Created ${quizResults.length} quiz results`);

  const tickets = [];
  for (let i = 0; i < 10; i += 1) {
    const student = students[i % students.length];
    const ticket = await prisma.ticket.create({
      data: {
        studentId: student.id,
        courseId: courses[i].id,
        question: `Question ticket #${i + 1} for course ${courses[i].code}`,
        status: i % 2 === 0 ? 'AI_ANSWERED' : 'OPEN',
        aiAnswer: i % 2 === 0 ? `Auto answer for ticket #${i + 1}` : null,
      },
    });
    tickets.push(ticket);
  }
  console.log(`✅ Created ${tickets.length} tickets`);

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
