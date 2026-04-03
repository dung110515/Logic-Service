# Database Setup Guide

## Overview
Logic Service sử dụng **PostgreSQL** + **Prisma ORM** để quản lý database.

## Architecture
- **10 Models**: User, Course, Enrollment, Document, Assignment, Submission, Grade, Quiz, QuizResult, Ticket
- **5 Enums**: Role, CourseStatus, SubStatus, QuizStatus, TicketStatus
- **Relationships**: 1-to-many, many-to-many patterns với proper cascade settings

## Setup Steps

### 1. Configure PostgreSQL
Chỉnh sửa `.env`:
```bash
DATABASE_URL=postgresql://username:password@localhost:5432/logic_service_db
```

Hoặc dùng Docker:
```bash
docker run -d \
  --name postgres-logic \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=logic_service_db \
  -p 5432:5432 \
  postgres:14-alpine
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Apply Migrations
```bash
npm run prisma:migrate
```

Hoặc chi tiết hơn:
```bash
npx prisma migrate dev --name init
```

Lệnh này sẽ:
- Tạo database tables từ `migration.sql`
- Generate Prisma Client
- Seed data (nếu có)

### 4. Generate Prisma Client
```bash
npm run prisma:generate
```

## Schema Overview

### Core Models
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **User** | Student/Teacher/Admin accounts | discordId, userCode, role |
| **Course** | Learning course | code, semester, discordServerId |
| **Enrollment** | Student enrollment | userId, courseId (unique) |
| **Document** | Course materials | fileName, fileUrl, aiSummary |
| **Assignment** | Assignments/Tasks | title, deadline, maxScore |
| **Submission** | Student submissions | fileUrl, isLate, status |
| **Grade** | Official grades | score, comment, gradedBy |
| **Quiz** | Exams/Tests | questionsJson, status, deadline |
| **QuizResult** | Quiz answers | score, answersJson (unique per quiz/student) |
| **Ticket** | Q&A support | question, aiAnswer, status |

## Important Constraints
- `@@unique([userId, courseId])` on Enrollment - 1 student per course only
- `@@unique([assignmentId, studentId])` on Submission
- `@unique` on Grade.submissionId - 1 grade per submission
- `@@unique([quizId, studentId])` on QuizResult - take quiz once

## Relations
- User → Course (instructor)
- User → Enrollment → Course
- User → Submission ← Assignment ← Course
- User → Grade ← Submission
- Quiz → QuizResult → User
- Ticket → Course + User

## Useful Commands
```bash
# View database
npx prisma studio

# Reset database (⚠️ DANGER)
npx prisma migrate reset

# Check migrations status
npx prisma migrate status

# Generate types only (no database change)
npx prisma generate
```

## Next Steps
1. Connect to database and test with `npm run prisma studio`
2. Implement seed data in `prisma/seed/`
3. Use generated Prisma Client in services
