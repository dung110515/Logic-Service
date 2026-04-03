# Cấu Trúc Thư Mục và Nhiệm Vụ từng File

Tài liệu mô tả chi tiết chức năng và trách nhiệm của **mỗi file** trong dự án **Logic Service** (Dịch vụ Quản Lý Dữ Liệu) của hệ thống LMS.

---

## 📁 File Gốc (Root Level)

### `package.json`
**Nhiệm vụ**: Tệp cấu hình Node.js - liệt kê tất cả thư viện và kịch bản chạy

**Chi tiết**:
- **Dependencies** (thư viện chính): 
  - express (web framework)
  - kafkajs (Kafka message broker)
  - @prisma/client (ORM/thao tác DB)
  - ioredis (Redis client - bộ nhớ cache)
  - googleapis (Google Sheets API)
  - winston (ghi log)
  - zod (kiểm tra định dạng dữ liệu)
- **DevDependencies** (chỉ dùng khi develop):
  - typescript (biên dịch TS → JS)
  - ts-node (chạy trực tiếp file TS)
  - prisma (ORM CLI)
  - jest (framework viết test)
- **Scripts** (lệnh chạy): 
  - `npm run build` → biên dịch TypeScript
  - `npm run dev` → chạy dev server
  - `npm run start` → chạy production server
  - `npm run prisma:migrate` → tạo/cập nhật bảng trong DB
  - `npm run prisma:seed` → thêm dữ liệu mẫu vào DB

### `.env`
**Nhiệm vụ**: Lưu trữ các biến môi trường cần thiết cho ứng dụng (chỉ dùng local development)

**Nội dung cần cấu hình**:
- `DATABASE_URL` → Địa chỉ kết nối PostgreSQL (ví dụ: postgresql://user:pass@localhost:5432/logic)
- `KAFKA_BROKER` → Địa chỉ Kafka broker (ví dụ: kafka:9092)
- `REDIS_URL` → Địa chỉ Redis (ví dụ: redis://localhost:6379)
- `PORT` → Cổng server chạy (mặc định 8003)
- `NODE_ENV` → Môi trường (development/production)
- `GOOGLE_CREDENTIALS_JSON` → JSON key cho Google Sheets API (Service Account)

### `.env.example`
**Nhiệm vụ**: File mẫu - hướng dẫn từng biến môi trường cần cấu hình

**Cách dùng**: 
```bash
cp .env.example .env
# Rồi chỉnh sửa .env với giá trị thực tế của bạn
```

### `tsconfig.json`
**Nhiệm vụ**: File cấu hình biên dịch TypeScript → JavaScript

**Cài đặt chính**:
- `target: ES2020` → Phiên bản JavaScript đầu ra (ES2020 là hiện đại, hỗ trợ async/await, arrow functions)
- `strict: true` → Bật chế độ strict - kiểm tra kiểu dữ liệu kỹ lưỡng (phát hiện lỗi sớm)
- `module: commonjs` → Định dạng module (Node.js sử dụng commonjs)
- `outDir: dist/` → Thư mục chứa file JavaScript sau biên dịch
- `rootDir: src/` → Thư mục chứa TypeScript nguồn

### `Dockerfile` (sẽ tạo sau)
**Nhiệm vụ**: File cấu hình để tạo Docker image cho production

**Chứa gì**:
- Cài đặt Node.js runtime
- Copy toàn bộ mã nguồn
- Cài dependencies
- Biên dịch TypeScript
- Chạy ứng dụng

---

## 📁 `/prisma` - Cơ Sở Dữ Liệu và Cập Nhật Dữ Liệu

### `prisma/schema.prisma`
**Nhiệm vụ**: Định nghĩa toàn bộ cấu trúc bảng trong cơ sở dữ liệu (10 bảng, 5 danh sách liệt kê)

**Chi tiết**:
- **10 Bảng (Models)**:
  1. `User` - Thông tin người dùng (sinh viên, giáo viên, admin)
  2. `Course` - Thông tin lớp học/khóa học
  3. `Enrollment` - Danh sách ai học lớp nào (liên kết SV với Course)
  4. `Document` - Tài liệu do giáo viên upload (slides, bài giảng)
  5. `Assignment` - Bài tập được giao cho sinh viên
  6. `Submission` - Bài nộp của sinh viên
  7. `Grade` - Điểm chính thức sau khi giáo viên chấm
  8. `Quiz` - Đề quiz/thi
  9. `QuizResult` - Kết quả làm quiz của sinh viên
  10. `Ticket` - Phiếu hỏi đáp từ sinh viên (Q&A)

- **5 Danh Sách Liệt Kê (Enums)**:
  1. `Role` - STUDENT (sinh viên), TEACHER (giáo viên), ADMIN, TRAINING
  2. `CourseStatus` - ACTIVE (hoạt động), ARCHIVED (lưu trữ), CLOSED (đã kết thúc)
  3. `SubStatus` - PENDING (chờ chấm), GRADED (đã chấm)
  4. `QuizStatus` - DRAFT (nháp), PUBLISHED (công bố), CLOSED (kết thúc)
  5. `TicketStatus` - OPEN (mở), AI_ANSWERED (AI đã trả lời), CLOSED (đóng)

- **Mối Quan Hệ**: Các bảng kết nối với nhau qua khóa ngoại (ví dụ: Submission → Assignment, Student)
- **Ràng Buộc**: Đảm bảo tính toàn vẹn (ví dụ: 1 sinh viên chỉ enroll 1 lần trong 1 lớp)
- **Index**: Tăng tốc độ truy vấn trên các cột thường dùng (discordId, courseId, userId)
- **Kết Nối**: PostgreSQL tại localhost:5432

### `prisma/migrations/0001_init/migration.sql`
**Nhiệm vụ**: Tệp SQL để tạo tất cả bảng trong PostgreSQL (được Prisma tạo tự động)

**Nội dung**:
- Xóa các enum cũ nếu có (tránh xung đột)
- Tạo kiểu dữ liệu mới cho các enum (Role, CourseStatus, v.v.)
- Tạo 10 bảng với tất cả cột, kiểu dữ liệu
- Tạo index trên các cột thường xuyên truy vấn (để tăng tốc độ)
- Tạo khóa ngoài liên kết giữa các bảng
- **Trạng thái**: Đã áp dụng (`npm run prisma:migrate` chạy lệnh này)

### `prisma/seed.ts`
**Nhiệm vụ**: Chương trình thêm dữ liệu mẫu vào cơ sở dữ liệu (để test ứng dụng)

**Dữ liệu mẫu được thêm**:
- **3 người dùng**: SV001 (sinh viên), SV002 (sinh viên), GV001 (giáo viên)
- **1 lớp học**: INT3306 (Lập trình Web)
- **1 Enrollment**: SV001 + SV002 tham gia lớp INT3306
- **1 Tài liệu**: Slide bài 1 được GV001 upload
- **1 Bài Tập**: Bài tập tuần 1
- **1 Bài Nộp**: SV001 nộp bài tập
- **1 Điểm**: GV001 chấm điểm cho SV001
- **1 Quiz**: Đề quiz tuần 1
- **1 Kết Quả Quiz**: SV001 làm quiz, được 8/10 điểm
- **1 Ticket**: SV001 hỏi câu hỏi, AI trả lời

**Cách chạy**: `npm run prisma:seed`

---

## 📁 `/src` - Mã Nguồn Ứng Dụng Chính

### `src/index.ts`
**Nhiệm vụ**: Điểm vào của chương trình - nơi khởi động toàn bộ ứng dụng

**Công việc chính**:
1. Tải biến môi trường từ file `.env`
2. Khởi tạo ứng dụng Express (từ `app.ts`)
3. Khởi tạo Kafka consumer (lắng nghe sự kiện từ các service khác)
4. Bắt đầu server lắng nghe trên cổng PORT
5. Xử lý lỗi và tắt máy chủ một cách an toàn (graceful shutdown)
6. Ghi log: "✅ Server running on port 8003"

### `src/app.ts`
**Nhiệm vụ**: Cấu hình Express web server - thiết lập middleware và route

**Công việc chính**:
- **Middleware** (xử lý trước khi đến route):
  - JSON parser - chuyển đổi JSON từ request thành object
  - Error handler - bắt lỗi nếu có
  - Auth validator - kiểm tra token X-Service-Token
- **Routes** (các endpoint REST API):
  - `GET /health` - kiểm tra máy chủ còn sống không
  - `/v1/users/*` - API liên quan người dùng
  - `/v1/courses/*` - API liên quan lớp học
  - `/v1/grades/*` - API liên quan điểm
- **Error Handler Middleware** - bắt tất cả lỗi không được xử lý
- **404 Handler** - trả lời khi endpoint không tồn tại

---

## 📁 `/src/config` - Cấu Hình Toàn Cục

### `src/config/constants.ts`
**Nhiệm vụ**: Lưu trữ tất cả hằng số (giá trị không thay đổi) được dùng trong cả ứng dụng

**Nội dung chính**:
- **KAFKA_TOPICS** - Danh sách 12 topic Kafka:
  - **Tiêu thụ (Consumer)** - Lắng nghe sự kiện từ các service:
    - `lms.discord.file.uploaded` - File được upload từ Discord
    - `lms.discord.submission.created` - Sinh viên nộp bài
    - `lms.discord.command.requested` - Gọi lệnh slash command
    - `lms.discord.ticket.created` - Tạo phiếu hỏi đáp
    - `lms.ai.response.quiz` - AI tạo xong đề quiz
    - `lms.ai.response.grade` - AI chấm xong bài
    - `lms.web.quiz.submitted` - Sinh viên nộp quiz từ Web
  - **Sản xuất (Producer)** - Gửi sự kiện cho các service:
    - `lms.ai.request.answer_ticket` - Yêu cầu AI trả lời câu hỏi
    - `lms.notification.send.dm` - Gửi tin nhắn riêng cho sinh viên
    - `lms.logic.process.submission` - Báo cho Analytics tính chuyên cần
    - `lms.discord.response` - Trả lời lựa chọn Discord
    - `lms.logic.process.grade` - Báo cho Analytics tính GPA
    - `lms.ai.request.summarize_doc` - Yêu cầu AI tóm tắt tài liệu

- **REDIS_TTL** - Thời gian lưu cache (tính bằng giây):
  - `COURSE_SERVER_TTL: 300` - Thời gian lưu mapping Server Discord → courseId (5 phút)
  - `USER_DISCORD_TTL: 600` - Thời gian lưu mapping Discord ID → userId (10 phút)
  - `QA_CACHE_TTL: 3600` - Thời gian lưu câu trả lời Q&A (1 giờ)
  - `COURSE_STATS_TTL: 120` - Thời gian lưu thống kê lớp (2 phút)

- **CONSUMER_GROUP** - Tên nhóm người tiêu thụ Kafka: `logic-service-group`

### `src/config/env.ts`
**Nhiệm vụ**: Kiểm tra và xử lý các biến môi trường từ `.env`

**Công việc chính**:
1. Kiểm tra xem các biến bắt buộc có được cấu hình không:
   - DATABASE_URL (địa chỉ PostgreSQL)
   - KAFKA_BROKER (địa chỉ Kafka)
   - REDIS_URL (địa chỉ Redis)
   - PORT (cổng server)
   - NODE_ENV (môi trường)
2. Ném lỗi nếu biến bắt buộc bị thiếu (dừng ứng dụng ngay)
3. Export object có chứa tất cả biến, kiểu dữ liệu đã được kiểm tra
4. Dùng trong toàn bộ ứng dụng: `import { config } from './config/env'`

---

## 📁 `/src/lib` - Kết Nối Cơ Sở Hạ Tầng (Database, Cache, v.v.)

### `src/lib/prisma.ts` ✅ (Đã tạo)
**Nhiệm vụ**: Kết nối và quản lý Prisma Client (công cụ thao tác database)

**Chi tiết**:
- Tạo **Singleton Pattern** - chỉ tạo 1 instance duy nhất của Prisma Client (tiết kiệm bộ nhớ)
- Tránh tạo nhiều kết nối (Memory leaks) - nguyên tắc trong Node.js
- Tự động ngắt kết nối khi ứng dụng tắt
- Bật ghi log trong chế độ development để dễ debug
- **Cách dùng**: `import { prisma } from './lib/prisma'; prisma.user.findUnique(...)`

### `src/lib/redis.ts` (Cần tạo)
**Nhiệm vụ**: Kết nối và quản lý Redis Client (bộ nhớ cache nhanh)

**Chi tiết**:
- Sử dụng thư viện `ioredis` để kết nối Redis
- Cấu hình: host, port, retry strategy (tái kết nối nếu lỗi)
- Các phương thức chính:
  - `get(key)` - Lấy giá trị từ cache
  - `set(key, value, 'EX', ttl)` - Lưu giá trị với thời gian hết hạn
  - `del(key)` - Xóa key khỏi cache
  - `expire(key, ttl)` - Đặt thời gian hết hạn cho key
- **Cách dùng**: `import { redis } from './lib/redis'; await redis.get('course:server:123')`

---

## 📁 `/src/middlewares` - Middleware Express (Xử Lý Trung Gian)

### `src/middlewares/auth.ts`
**Nhiệm vụ**: Kiểm tra xác thực - chỉ cho phép các service nội bộ gọi API

**Chi tiết**:
- Xác thực qua header `X-Service-Token` 
- Token là một khóa bí mật được cấu hình trong `.env`
- Khi request đến, kiểm tra header có chứa token hợp lệ không
- Nếu token **hợp lệ** → cho phép request tiếp tục → `next()`
- Nếu token **không hợp lệ hoặc thiếu** → trả lỗi 401 Unauthorized
- **Mục đích**: Chỉ Web Service, Proxy Service (các service nội bộ Docker network) mới gọi được /v1/* endpoints

### `src/middlewares/errorHandler.ts`
**Nhiệm vụ**: Bắt tất cả lỗi xảy ra trong ứng dụng - xử lý và trả lỗi dễ hiểu cho client

**Chi tiết**:
- Bắt mọi error/exception không được xử lý
- Ghi log chi tiết (file, line, stack trace - để developer debug)
- Trả lại JSON response dễ hiểu:
  - 400 Bad Request - khi dữ liệu không hợp lệ
  - 401 Unauthorized - khi chưa xác thực
  - 500 Server Error - khi lỗi bên server
- **Production**: Không gửi stack trace lại client (bảo mật)
- **Development**: Gửi stack trace để dễ debug

### `src/middlewares/validator.ts` (Tùy chọn)
**Nhiệm vụ**: Kiểm tra dữ liệu request (body, params, query) hợp lệ không

**Chi tiết**:
- Sử dụng thư viện `zod` để định nghĩa schema (quy tắc kiểm tra)
- Ví dụ: email phải có định dạng email, score phải là số từ 0-10
- Nếu dữ liệu **hợp lệ** → cho phép request tiếp tục
- Nếu dữ liệu **không hợp lệ** → trả lỗi 400 Bad Request với chi tiết lỗi

---

## 📁 `/src/kafka` - Kafka Producer & Consumer (Gửi và Nhận Sự Kiện)

### `src/kafka/consumer.ts`
**Nhiệm vụ**: Khởi tạo Kafka Consumer - lắng nghe sự kiện từ các service khác

**Chi tiết**:
1. **Khởi tạo Kafka Consumer**:
   - Sử dụng KafkaJS library
   - Kết nối tới Kafka broker (từ `.env`)
   - Định danh group: `logic-service-group` (để Kafka biết ai đang lắng nghe)

2. **Đăng ký lắng nghe 7 topic** (từ constants.ts):
   - `lms.discord.file.uploaded` → documentHandler
   - `lms.discord.submission.created` → submissionHandler
   - `lms.discord.ticket.created` → contextHandler
   - `lms.ai.response.grade` → gradeHandler
   - `lms.web.quiz.submitted` → quizHandler
   - `lms.discord.command.requested` → commandHandler
   - `lms.ai.response.quiz` → aiQuizHandler

3. **Message Handler - nhận sự kiện**:
   - Khi nhận message từ bất kỳ topic nào
   - **Tìm đúng handler** dựa trên topic (`HANDLER_MAP`)
   - **Gọi handler** để xử lý sự kiện
   - Nếu handler **thành công** → commit message (xóa khỏi queue)
   - Nếu handler **thất bại** → NACK message (đưa lại queue để retry)

4. **Cấu hình nâng cao**:
   - **No auto-commit**: Không tự động xóa message (kiểm soát thủ công)
   - **Retry strategy**: Thử lại nếu kết nối bị lỗi
   - **Error logging**: Ghi log chi tiết khi có lỗi

### `src/kafka/producer.ts`
**Nhiệm vụ**: Kafka Producer - gửi sự kiện cho các service khác

**Chi tiết**:
1. **Khởi tạo Kafka Producer**:
   - Sử dụng KafkaJS library
   - Kết nối tới Kafka broker (từ `.env`)

2. **Phương thức publish(topic, message)**:
   - **Input**: Tên topic và dữ liệu sự kiện
   - **Output**: Promise - thành công hay thất bại
   - **Mục đích**: Gửi message tới Kafka queue

3. **Retry logic** (tái cố gắng):
   - Lần 1: Gửi ngay
   - Lần 2: Chờ 1 giây, gửi lại
   - Lần 3: Chờ 2 giây, gửi lại
   - Lần 4: Chờ 4 giây, gửi lại
   - **Nếu vẫn thất bại**: Lưu vào bảng `Outbox` để retry sau

4. **Các phương thức helper** để gửi sự kiện cụ thể:
   - `publishAnswerTicket(ticketId, answersJson)` - Gửi câu trả lời cho phiếu Q&A
   - `publishNotification(userId, message)` - Gửi thông báo cho sinh viên
   - `publishProcessSubmission(submissionId)` - Báo Analytics tính chuyên cần
   - `publishDiscordResponse(discordId, response)` - Trả lời lựa chọn Discord
   - `publishProcessGrade(gradeId)` - Báo Analytics tính GPA
   - `publishSummarizeDoc(submissionId)` - Yêu cầu AI tóm tắt

5. **Fallback to Outbox**:
   - Nếu Kafka lỗi hoàn toàn → lưu vào bảng `NotificationOutbox` (sẽ tạo thêm sau)
   - Một background job sẽ định kỳ retry các message trong bảng này
   - **Mục đích**: Đảm bảo không mất sự kiện quan trọng

---

## 📁 `/src/kafka/handlers` - Handler Xử Lý Sự Kiện Kafka

**Định nghĩa chung**: Mỗi handler là một hàm `async function(message: KafkaMessage): Promise<void>`
- **Input**: Message từ Kafka topic (chứa dữ liệu sự kiện)
- **Output**: Không trả về gì (void) - nhưng thao tác database, gửi email, v.v.
- **Lỗi**: Ném exception nếu thất bại → Consumer sẽ NACK và retry

### `src/kafka/handlers/documentHandler.ts`
**Nhiệm vụ**: Xử lý khi giáo viên upload file tài liệu từ Discord

**Luồng xử lý**:
1. **Nhận sự kiện**: `lms.discord.file.uploaded` với dữ liệu:
   - `discordServerId` - Guild ID nơi upload
   - `fileUrl` - URL file từ Discord CDN
   - `fileName` - Tên file gốc
   - `uploaderDiscordId` - ID của giáo viên upload
   - `uploadedAt` - Thời gian upload

2. **Tra cứu thông tin**:
   - Dùng `discordServerId` → tìm `courseId` (cache trong Redis 5 phút)
   - Dùng `uploaderDiscordId` → tìm `userId` (cache trong Redis 10 phút)

3. **Xử lý file**:
   - Tải file từ Discord CDN
   - Upload file lên nơi lưu trữ persistent (S3/MinIO)
   - Lấy URL mới để dùng lâu dài

4. **Lưu vào database**:
   - `prisma.document.create()` với:
     - courseId, uploadedById, fileName, fileUrl
     - `isAiIndexed = false` (chưa được AI đọc)

5. **Thông báo**:
   - Publish `lms.discord.response` → Bot confirm "Upload thành công"

**Xử lý lỗi**:
- Nếu create document lỗi → NACK, retry sau
- Nếu duplicate key (P2002) → log warning, skip (idempotent)

### `src/kafka/handlers/submissionHandler.ts`
**Nhiệm vụ**: Xử lý khi sinh viên nộp bài từ Discord (/submit command)

**Luồng xử lý**:
1. **Nhận sự kiện**: `lms.discord.submission.created` với dữ liệu:
   - `assignmentId` - ID của bài tập
   - `studentDiscordId` - ID sinh viên nộp bài
   - `fileUrl` - Link bài nộp
   - `submittedAt` - Thời gian nộp

2. **Tra cứu & kiểm tra**:
   - Tìm `studentId` từ `studentDiscordId`
   - So sánh `submittedAt` với deadline → đặt cờ `isLate`
   - Lấy thông tin Course để tìm `instructorId`

3. **Lưu bài nộp**:
   - `prisma.submission.create()` với:
     - assignmentId, studentId, fileUrl, isLate
     - `status = PENDING` (chờ chấm)

4. **Gửi sự kiện tiếp theo**:
   - Publish `lms.logic.process.submission` → Analytics tính chuyên cần (bài nộp đúng hạn)
   - Publish `lms.ai.request.summarize_doc` → AI tóm tắt bài nộp

5. **Khi AI trả lời** (handler khác nhận `lms.ai.response.grade`):
   - UPDATE submission SET `aiScore, aiSummary`
   - Publish `lms.notification.send.dm` → Thông báo giáo viên có bài để chấm

**Xử lý lỗi**:
- Nếu connect database lỗi → Retry với exponential backoff

### `src/kafka/handlers/gradeHandler.ts`
**Nhiệm vụ**: Xử lý khi giáo viên xác nhận điểm (chấm bài)

**Luồng xử lý**:
1. **Nhận sự kiện**: Từ commandHandler (giáo viên gõ `/grade <studentId> <score>`)
   - `studentId` - Sinh viên nào
   - `submissionId` - Bài nộp nào
   - `score` - Điểm số (0-10)
   - `comment` - Nhận xét của giáo viên

2. **Kiểm tra**:
   - Tìm submission có `status = PENDING` (chưa chấm)
   - Tìm giáo viên đang chấm (từ JWT token)

3. **Lưu điểm**:
   - `prisma.grade.create()` với:
     - submissionId, score, comment, gradedById, gradedAt
   - UPDATE submission SET `status = GRADED` (đã chấm rồi)

4. **Gửi thông báo**:
   - Publish `lms.notification.send.dm` → Báo điểm cho sinh viên
   - Publish `lms.logic.process.grade` → Analytics tính GPA mới

**Xử lý lỗi**:
- Submission không tìm thấy → log error, publish error notification

### `src/kafka/handlers/quizHandler.ts`
**Nhiệm vụ**: Xử lý khi sinh viên nộp quiz từ Web Service

**Luồng xử lý**:
1. **Nhận sự kiện**: `lms.web.quiz.submitted` từ Web Service với:
   - `quizId` - ID quiz
   - `studentDiscordId` - ID sinh viên
   - `answersJson` - Câu trả lời JSON
   - `score` - Điểm tính tự động

2. **Tra cứu**:
   - Tìm `studentId` từ `studentDiscordId`

3. **Lưu kết quả**:
   - `prisma.quizResult.create()` với:
     - quizId, studentId, score, answersJson, completedAt
   - Constraint: `@@unique([quizId, studentId])` - mỗi sinh viên chỉ làm quiz 1 lần

4. **Thông báo**:
   - Publish `lms.notification.send.dm` → Gửi điểm quiz cho sinh viên
   - Publish `lms.logic.process.grade` → Analytics tính GPA

**Xử lý lỗi**:
- Duplicate constraint (P2002) → sinh viên làm quiz lần 2 → log warning, skip
- studentId lookup fail → log error

### `src/kafka/handlers/commandHandler.ts`
**Nhiệm vụ**: Xử lý Slash Command từ Discord Bot (ví dụ: /my_scores, /grade, /schedule)

**Nhận sự kiện**: `lms.discord.command.requested` với:
- `command`: Tên lệnh (grade, my_scores, class_stats, schedule, inspect)
- Các tham số khác tùy từng command

**Xử lý từng command**:

1. **`/grade studentId submissionId score comment`** → Gọi gradeHandler logic
   - Lưu điểm → trigger gradeHandler

2. **`/my_scores studentId`** → Xem tất cả điểm của 1 sinh viên
   - Query: `prisma.grade.findMany({ where: { submission: { studentId } } })`
   - Response: [{assignmentName, score, gradedAt}, ...]
   - Publish `lms.discord.response` → Bot format Nice và trả lời user

3. **`/class_stats courseId`** → Xem thống kê lớp
   - Query: Tổng sinh viên, tổng bài tập, tỷ lệ nộp bài, điểm trung bình
   - Cache trong Redis (TTL 2 phút)
   - Invalidate cache khi có Grade mới tạo
   - Publish `lms.discord.response` → Trả lời

4. **`/schedule courseId studentId`** → Xem lịch bài tập + quiz
   - Query: `prisma.assignment.findMany({ where: { courseId }, select: { title, deadline } })`
   - Query: `prisma.quiz.findMany({ where: { courseId }, select: { title, deadline } })`
   - Sort by deadline ascending (sắp xếp theo thời gian sớm nhất)
   - Publish `lms.discord.response`

5. **`/inspect submissionId`** → Xem chi tiết 1 bài nộp
   - Query: submission + grade + assignment + student info
   - Publish `lms.discord.response`

**Xử lý lỗi**:
- Command không hợp lệ → publish error response

### `src/kafka/handlers/contextHandler.ts`
**Nhiệm vụ**: Xử lý phiếu hỏi đáp từ sinh viên - chuẩn bị context tốt để AI trả lời

**Luồng xử lý** (phức tạp - cache + parallel queries):

1. **Nhận sự kiện**: `lms.discord.ticket.created` với:
   - `ticketId` - ID phiếu hỏi
   - `question` - Câu hỏi của sinh viên
   - `courseId` - Lớp nào
   - `studentDiscordId` - Sinh viên nào

2. **Kiểm tra cache**:
   - Hash question → tạo key cache_key
   - Kiểm tra Redis: `get('qa:cache:' + hash(question))`
   - **Nếu cache HIT** (tìm thấy câu trả lời cũ):
     - Lấy câu trả lời từ cache
     - `prisma.ticket.create()` với `status = AI_ANSWERED` (đã có câu trả lời)
     - Publish `lms.discord.response` → Bot trả lời ngay từ cache
     - **Kết thúc - không gọi AI Service**
   
   - **Nếu cache MISS** (không tìm thấy):
     - Tiếp tục bước 3

3. **Tạo ticket trong DB**:
   - `prisma.ticket.create()` với:
     - ticketId, studentId, courseId, question
     - `status = OPEN` (chờ AI trả lời)

4. **Build context - query 3 nguồn song song**:
   - **1. getDocuments(courseId)**: Lấy tài liệu khóa học
     - Query: `prisma.document.findMany({ courseId, isAiIndexed: true })`
     - Trả về: Tên file + tóm tắt AI
   - **2. getSimilarTickets(question, courseId)**: Lấy Q&A cũ tương tự
     - Query tất cả tickets đã trả lời
     - So sánh text similarity với question
     - Trả về top 3 similar tickets
   - **3. getStudentStats(studentId, courseId)**: Lấy thống kê sinh viên
     - Trung bình điểm, tỷ lệ nộp bài, điểm quiz trung bình

5. **Gửi cho AI**:
   - Publish `lms.ai.request.answer_ticket` với:
     ```json
     {
       "ticket_id": "...",
       "question": "...",
       "context": {
         "documents": [...],
         "similar_qa": [...],
         "student_stats": {...}
       }
     }
     ```

6. **Khi AI trả lời** (handler khác nhận `lms.ai.response*`):
   - UPDATE ticket SET aiAnswer (câu trả lời)
   - **Cache lại**: `set('qa:cache:' + hash(question), aiAnswer, 'EX', 3600)`
   - UPDATE ticket SET `status = AI_ANSWERED`
   - Publish `lms.discord.response` → Bot trả lời

**Xử lý lỗi**:
- Cache error → bỏ qua, tiếp tục query DB
- courseId/studentId lookup fail → log error

### `src/kafka/handlers/aiQuizHandler.ts`
**Nhiệm vụ**: Xử lý khi AI tạo xong đề quiz

**Luồng xử lý**:
1. **Nhận sự kiện**: `lms.ai.response.quiz` từ AI Service với:
   - `quizId` - ID quiz
   - `questionsJson` - Array các câu hỏi JSON
   - `generatedAt` - Thời gian tạo

2. **Cập nhật quiz**:
   - `prisma.quiz.update()` SET:
     - `questionsJson` - Lưu câu hỏi
     - `status = DRAFT` (chưa công bố - giáo viên cần approve trước)

3. **Thông báo**:
   - Publish `lms.discord.response` → Thông báo Bot "Quiz đã tạo, chờ GV duyệt"

**Xử lý lỗi**:
- Quiz không tìm thấy → log error

---

## 📁 `/src/routes` - REST API Routes

Tất cả routes có X-Service-Token auth header validation. Base path: `/v1`

### `src/routes/health.ts`
**Chức năng**: Health check endpoint (liveness/readiness)
- **Endpoint**: `GET /health`
- **Response**: 
  ```json
  {
    "status": "ok",
    "timestamp": "2026-04-01T10:30:00Z",
    "uptime": 1234,
    "database": "connected",
    "redis": "connected",
    "kafka": "connected"
  }
  ```
- **Purpose**: Docker health check, load balancer ping
- **No auth required** (internal only)

### `src/routes/users.ts`
**Chức năng**: User endpoints
- **Endpoints**:
  - `GET /v1/users/:discordId` - Lấy user info theo Discord ID
    - Response: { id, discordId, userCode, fullName, email, role, isActive }
  - `POST /v1/users/bind` - Bind Discord ID với Mã SV/GV (Auth Service call)
    - Payload: { discordId, userCode, fullName, email, role }
    - Action: prisma.user.create() or update
    - Response: Created/Updated user object
  - `PATCH /v1/users/:userId` - Update user status (chủ yếu isActive)
    - Payload: { isActive? }
    - Response: Updated user
- **Queries**: Query by discordId, userCode, email (indexed)
- **Error**: Validation (zod), 404 Not Found, 400 Bad Request

### `src/routes/courses.ts`
**Chức năng**: Course & enrollment endpoints
- **Endpoints**:
  - `GET /v1/courses/:courseId` - Course info
    - Response: { id, code, name, semester, discordServerId, status, instructorId }
  - `GET /v1/courses/:courseId/students` - Danh sách SV enrolled
    - Response: [{ userId, userCode, fullName, email, status }]
  - `GET /v1/courses/:courseId/stats` - Thống kê lớp
    - Response: { totalStudents, totalAssignments, submissionRate, averageScore, lastUpdated }
    - Cache: Redis (TTL 2 phút), invalidate on Grade/Submission creation
  - `GET /v1/courses/:courseId/assignments` - Danh sách assignment
    - Response: [{ id, title, deadline, maxScore, status }]
  - `POST /v1/courses` - Tạo course mới (từ Web/Admin)
    - Payload: { code, name, semester, discordServerId, instructorId }
    - Action: prisma.course.create()
  - `PATCH /v1/courses/:courseId` - Update course
  - `DELETE /v1/courses/:courseId` - Archive course (soft delete via status)
- **Caching**: Course ID ↔ discordServerId (Redis 5 phút)

### `src/routes/grades.ts`
**Chức năng**: Grade & submission endpoints
- **Endpoints**:
  - `GET /v1/grades/student/:studentId` - Toàn bộ điểm SV
    - Response: [{ id, assignmentId, submissionId, score, comment, gradedAt }]
  - `GET /v1/grades/:gradeId` - Chi tiết 1 điểm
  - `GET /v1/assignments/:assignmentId/submissions` - Danh sách bài nộp
    - Response: [{ id, studentId, studentCode, fileUrl, isLate, score, aiScore, status }]
  - `POST /v1/grades` - Giảng viên xác nhận điểm từ Web Dashboard
    - Payload: { submissionId, score, comment }
    - Action: prisma.grade.create(), UPDATE submission status = GRADED
    - Trigger: Publish lms.notification.send.dm, lms.logic.process.grade
  - `PATCH /v1/submissions/:submissionId` - Update submission status
- **Validations**: score 0-10, submissionId exists, gradedById = current user (teacher)

### `src/routes/quizzes.ts` (Additional para sa completeness)
**Chức năng**: Quiz endpoints
- **Endpoints**:
  - `GET /v1/quizzes/:quizId` - Quiz info
  - `GET /v1/quizzes/:quizId/results` - Kết quả quiz (Dashboard)
    - Response: [{ studentId, studentCode, score, completedAt }]
  - `PATCH /v1/quizzes/:quizId/publish` - GV approve quiz sau khi AI tạo
    - Payload: { approved: boolean }
    - Action: UPDATE quiz status = PUBLISHED, publish lms.discord.response
- **Caching**: Quiz questions JSON từ DB (không cache, real-time)

### `src/routes/tickets.ts` (Additional)
**Chức năng**: Q&A ticket endpoints
- **Endpoints**:
  - `GET /v1/tickets/:ticketId` - Ticket info + AI answer
  - `PATCH /v1/tickets/:ticketId/close` - Đóng ticket
    - Payload: { resolved: boolean }
    - Action: UPDATE ticket status = CLOSED, log interaction
- **Note**: Phần lớn logic trong contextHandler (Kafka)

---

## 📁 `/src/services` - Business Logic Services

### `src/services/contextService.ts`
**Chức năng**: Build context data cho AI Service từ database
- **Methods**:
  - `async getContext(courseId: string, studentId: string)`: Parallel query 3 sources
    1. `getDocuments(courseId)` - Lấy tài liệu course từ DB
       - Query: prisma.document.findMany({ courseId, isAiIndexed: true })
       - Return: [{ fileName, aiSummary, content (nếu có) }]
    2. `getSimilarTickets(question: string, courseId: string)` - Lấy Q&A cũ tương tự
       - Query: prisma.ticket.findMany({ courseId, status: AI_ANSWERED })
       - Filter candidates có aiAnswer, similarity check (string match hoặc embedding)
       - Return: [{ question, aiAnswer }] - top 3 most similar
    3. `getStudentStats(studentId: string, courseId: string)` - Lấy thống kê SV
       - Query: gradebook, assignment submission count, quiz average
       - Return: { avgScore, submissionRate, quizAvg }
  - `async buildPayload(ticket, context)` - Format context thành payload cho AI API
    - Return: Structured JSON với question + context data
- **Caching**: Kết quả query cache trong Redis (để optimize batch queries)
  - Key: `context:{studentId}:{courseId}` TTL 5 phút
  - Invalidate khi có Grade/Submission mới
- **Error handling**: DB connection error, empty results gracefully

### `src/services/sheetsService.ts`
**Chức năng**: Đồng bộ database → Google Sheets (1 chiều read-only)
- **Methods**:
  - `async syncGrades(gradeId: string)` - Khi Grade mới được tạo
    - Query: grade + submission + assignment + student info
    - Format: studentCode, assignmentTitle, score, gradedAt
    - Append to Sheet "Bảng điểm" (maintain existing rows)
    - Error handling: API rate limit → push vào Redis queue, retry sau 5 phút
  - `async syncQuizResults(quizResultId: string)` - Khi Quiz đóng
    - Query: quiz + quizResult + student
    - Format: studentCode, quizTitle, score, completedAt
    - Append to Sheet "Kết quả Quiz"
  - `async syncEnrollment(enrollmentId: string)` - Khi có enrollment mới
    - Format: studentCode, fullName, email, status
    - Append to Sheet "Danh sách lớp"
  - `async retryFailedSync()` - Retry từ Redis queue (batch update 5 phút/lần)
    - Query Redis queue, batch append same sheet
    - Log success/failure
- **Auth**: Google Service Account (googleapis library)
  - Load credentials từ process.env.GOOGLE_CREDENTIALS_JSON
  - Sheet ID từ process.env.GOOGLE_SHEET_ID
- **Idempotency**: Mỗi sync có unique row identifier (gradeId, quizResultId)
  - Tránh duplicate sync nếu retry
- **Logging**: winston logger, log mỗi lần sync (success/error)

---

## 📁 `/src/types` - TypeScript Type Definitions

### `src/types/index.ts`
**Chức năng**: Central export của tất cả custom types & interfaces
- **Kafka Message Types**:
  ```ts
  interface FileUploadedMessage {
    discordServerId: string;
    fileUrl: string;
    fileName: string;
    uploaderDiscordId: string;
    uploadedAt: Date;
  }
  // ... (7 more message types)
  ```
- **API Request/Response Types**:
  ```ts
  interface CreateGradeRequest {
    submissionId: string;
    score: number;
    comment?: string;
  }
  interface UserResponse {
    id: string;
    discordId: string;
    userCode: string | null;
    fullName: string;
    email: string | null;
    role: Role;
    isActive: boolean;
  }
  // ... (more response types)
  ```
- **Service Types**:
  ```ts
  interface ContextData {
    documents: DocumentSummary[];
    similarTickets: SimilarTicket[];
    studentStats: StudentStats;
  }
  // ... (more service types)
  ```
- **Utility Types**:
  - ApiResponse<T>, ErrorResponse, PaginatedResponse<T>
  - KafkaMessage generic wrapper
- **Enums**:
  - Import từ Prisma (Role, CourseStatus, etc.)

---

## 📁 `/dist` - Compiled JavaScript (Auto-generated)

### `dist/`
**Chức năng**: Output folder cho compiled TypeScript
- Generated by `npm run build` → tsc compiler
- Contains tất cả .js, .js.map, .d.ts.map files
- Ready to run với Node.js runtime
- Not tracked in Git (.gitignore)

---

## 📋 Summary Table

| Folder | File | Chức Năng | Phụ Thuộc |
|--------|------|---------|----------|
| / | package.json | Deps, scripts | - |
| / | .env | Biến môi trường | - |
| / | tsconfig.json | TS config | - |
| prisma/ | schema.prisma | DB schema | - |
| prisma/ | migrations/0001_init | DB DDL | schema.prisma |
| prisma/ | seed.ts | Test data | schema.prisma |
| src/ | index.ts | Entry point | app.ts, kafka/consumer.ts |
| src/ | app.ts | Express setup | routes/*, middlewares/* |
| src/config/ | constants.ts | Kafka topics, TTLs | - |
| src/config/ | env.ts | Env validation | - |
| src/lib/ | prisma.ts | DB client | @prisma/client |
| src/lib/ | redis.ts | Cache client | ioredis |
| src/middlewares/ | auth.ts | Token validation | - |
| src/middlewares/ | errorHandler.ts | Error catch-all | winston |
| src/kafka/ | consumer.ts | Message routing | handlers/* |
| src/kafka/ | producer.ts | Message publishing | kafkajs |
| src/kafka/handlers/ | documentHandler.ts | File upload | prisma, redis, producer |
| src/kafka/handlers/ | submissionHandler.ts | Assignment submit | prisma, producer |
| src/kafka/handlers/ | gradeHandler.ts | Grade confirm | prisma, producer |
| src/kafka/handlers/ | quizHandler.ts | Quiz result | prisma, producer |
| src/kafka/handlers/ | commandHandler.ts | /command routes | prisma, producer |
| src/kafka/handlers/ | contextHandler.ts | Q&A context build | prisma, redis, contextService |
| src/kafka/handlers/ | aiQuizHandler.ts | Quiz generation | prisma, producer |
| src/routes/ | health.ts | Health check | - |
| src/routes/ | users.ts | User CRUD | prisma, auth |
| src/routes/ | courses.ts | Course CRUD | prisma, redis, auth |
| src/routes/ | grades.ts | Grade CRUD | prisma, producer, auth |
| src/services/ | contextService.ts | Context aggregation | prisma, redis |
| src/services/ | sheetsService.ts | Google Sheets sync | googleapis, prisma, redis |
| src/types/ | index.ts | Type exports | - |

---

## 🔄 Data Flow Diagram

```
Discord Bot (Proxy Service)
         ↓
    Kafka Topics
         ↓
    src/kafka/consumer.ts (route to handler)
         ↓
    src/kafka/handlers/* (process + DB write)
         ↓
    src/lib/prisma.ts (write to PostgreSQL)
         ↓
    PostgreSQL (persist)

---

Internal Services (Web Service)
         ↓
    src/routes/* (REST API)
         ↓
    src/services/* (business logic)
         ↓
    src/lib/prisma.ts (query database)
         ↓
         PostgreSQL

---

Q&A Workflow:
    Bot → lms.discord.ticket.created
         ↓
    contextHandler {
       Check Redis cache
       If MISS:
          contextService.getContext() → 3 parallel queries
          Publish lms.ai.request.answer_ticket
      If HIT:
          Publish lms.discord.response (cached answer)
    }

---

Dashboard/Admin:
    Web Service
         ↓
    /v1/routes/* (REST API)
         ↓
    src/services/* 
         ↓
    PostgreSQL + Redis (cache stats)
         ↓
    Response JSON → Web UI
```

---

## 🛠️ Setup Commands

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with local values

# Migrate database
npm run prisma:migrate

# Seed test data
npm run prisma:seed

# Build TypeScript
npm run build

# Start development server
npm run dev

# Start production server (after npm run build)
npm start

# Run tests
npm test

# Watch for changes (dev)
npm run watch
```

---

## 📝 Notes

1. **Security**: X-Service-Token header validation trên tất cả /v1/* routes (internal only)
2. **Caching Strategy**: 
   - Course ↔ Discord Server: 5 phút
   - User Discord ID lookup: 10 phút
   - Q&A cache: 1 giờ
   - Course stats: 2 phút (invalidate on change)
3. **Idempotency**: Mỗi Kafka handler có idempotent logic (ignore duplicates)
4. **Error Handling**: Retry logic (1s → 2s → 4s exponential backoff), fallback to outbox table
5. **Logging**: Winston JSON logger, structured logs cho debugging
6. **Testing**: Jest unit tests cần tạo cho mỗi handler/service/route

---

**Last Updated**: April 1, 2026
**Project**: Logic Service (LMS Microservice)
**TypeScript**: ES2020, Strict Mode
