CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN', 'TRAINING');

CREATE TYPE "CourseStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

CREATE TYPE "SubStatus" AS ENUM ('PENDING', 'GRADED');

CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'AI_ANSWERED', 'CLOSED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "userCode" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "discordServerId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "isAiIndexed" BOOLEAN NOT NULL DEFAULT false,
    "aiSummary" TEXT,
    "discordMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "rubricUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "aiScore" DOUBLE PRECISION,
    "aiSummary" TEXT,
    "status" "SubStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "gradedById" TEXT NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "questionsJson" JSONB,
    "timeLimitMins" INTEGER NOT NULL DEFAULT 15,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "webUrl" TEXT,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuizResult" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "answersJson" JSONB,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "aiAnswer" TEXT,
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

CREATE UNIQUE INDEX "User_userCode_key" ON "User"("userCode");

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

CREATE UNIQUE INDEX "Course_discordServerId_key" ON "Course"("discordServerId");

CREATE INDEX "Course_instructorId_idx" ON "Course"("instructorId");

CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

CREATE INDEX "Enrollment_userId_idx" ON "Enrollment"("userId");

CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

CREATE INDEX "Document_courseId_idx" ON "Document"("courseId");

CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

CREATE INDEX "Assignment_courseId_idx" ON "Assignment"("courseId");

CREATE UNIQUE INDEX "Submission_assignmentId_studentId_key" ON "Submission"("assignmentId", "studentId");

CREATE INDEX "Submission_assignmentId_idx" ON "Submission"("assignmentId");

CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

CREATE UNIQUE INDEX "Grade_submissionId_key" ON "Grade"("submissionId");

CREATE INDEX "Grade_submissionId_idx" ON "Grade"("submissionId");

CREATE INDEX "Grade_gradedById_idx" ON "Grade"("gradedById");

CREATE INDEX "Quiz_courseId_idx" ON "Quiz"("courseId");

CREATE INDEX "Quiz_documentId_idx" ON "Quiz"("documentId");

CREATE UNIQUE INDEX "QuizResult_quizId_studentId_key" ON "QuizResult"("quizId", "studentId");

CREATE INDEX "QuizResult_quizId_idx" ON "QuizResult"("quizId");

CREATE INDEX "QuizResult_studentId_idx" ON "QuizResult"("studentId");

CREATE INDEX "Ticket_studentId_idx" ON "Ticket"("studentId");

CREATE INDEX "Ticket_courseId_idx" ON "Ticket"("courseId");

ALTER TABLE "Course" ADD CONSTRAINT "Course_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Grade" ADD CONSTRAINT "Grade_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Grade" ADD CONSTRAINT "Grade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
