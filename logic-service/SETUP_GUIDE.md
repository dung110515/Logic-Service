# Logic Service - Setup Guide

## ✅ What's Ready

### 1. **TypeScript Project**
- ✅ `tsconfig.json` configured (strict mode, ES2020)
- ✅ `package.json` with all dependencies
- ✅ Dependencies installed (467 packages)

### 2. **Database (Prisma + PostgreSQL)**
- ✅ `prisma/schema.prisma` (10 models + 5 enums)
- ✅ `prisma/migrations/0001_init/migration.sql` ready
- ✅ Prisma Client generated
- ✅ Seed data prepared (`prisma/seed.ts`)

### 3. **Infrastructure**
- ✅ Docker Compose file configured:
  - PostgreSQL (port 5432)
  - Kafka + Zookeeper (port 9094)
  - Redis (port 6379)
  - MinIO (port 9000)
  - pgAdmin (port 5050)
  - Kafka UI (port 8080)

## ⚙️ Environment Setup

### Step 0: Configure .env File

Copy từ `.env.example` và chỉnh sửa các biến bắt buộc:

```bash
cp .env.example .env
# Chỉnh sửa .env với giá trị thực tế
```

#### Biến Môi Trường Bắt Buộc

| Biến | Mô Tả | Ví Dụ | Ghi Chú |
|------|-------|-------|--------|
| **NODE_ENV** | Môi trường chạy | `development` | development / staging / production |
| **PORT** | Cổng server | `8003` | Express lắng nghe cổng này |
| **SERVICE_TOKEN_SECRET** | Secret key xác thực | `your-secret-key-min-16-chars` | Bắt buộc ở production (>=16 ký tự), dev có fallback tạm |
| **DATABASE_URL** | PostgreSQL/MySQL connection | `postgresql://soa:soa@localhost:5432/logic` | Phải bắt đầu bằng `postgresql://` hoặc `mysql://` |
| **KAFKA_BROKER** | Kafka broker address | `localhost:9094` | Docker internal: `kafka:9092` |
| **REDIS_URL** | Redis connection | `redis://localhost:6379/0` | Phải bắt đầu bằng `redis://` hoặc `rediss://` |

#### Biến Tùy Chọn (Optional)

| Biến | Mục Đích | Khi Dùng |
|------|---------|---------|
| `GOOGLE_CREDENTIALS_JSON` | Google Sheets API auth | Khi cần sync dữ liệu lên Google Sheets |
| `GOOGLE_SHEET_ID` | Google Sheet ID | Khi cần sync dữ liệu lên Google Sheets |
| `LOG_LEVEL` | Mức ghi log | `info` (mặc định) hoặc `debug` để chi tiết hơn |
| `LOG_TO_FILE` | Ghi log vào file | `true/false` (mặc định: false) |
| `MINIO_ENDPOINT` | MinIO S3 server | Khi cần backup file từ Discord |
| `MINIO_ACCESS_KEY` | MinIO access key | Dùng kèm MinIO |
| `MINIO_SECRET_KEY` | MinIO secret key | Dùng kèm MinIO |
| `MINIO_BUCKET` | MinIO bucket name | Dùng kèm MinIO |

#### Ví Dụ .env (Local Development)

```env
# Node.js
NODE_ENV=development
PORT=8003
SERVICE_TOKEN_SECRET=your-secret-key-minimum-16-characters-long

# Database - PostgreSQL
DATABASE_URL=postgresql://soa:soa@localhost:5432/logic

# Message Broker - Kafka
KAFKA_BROKER=localhost:9094
# KAFKA_USERNAME=
# KAFKA_PASSWORD=

# Cache
REDIS_URL=redis://localhost:6379/0

# Google Sheets (Optional)
# GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
# GOOGLE_SHEET_ID=1A2B3C4D5E...

# Logging
LOG_LEVEL=info
LOG_TO_FILE=false

# MinIO (Optional)
# MINIO_ENDPOINT=http://localhost:9000
# MINIO_ACCESS_KEY=minioadmin
# MINIO_SECRET_KEY=minioadmin
# MINIO_BUCKET=lms-files
```

**⚠️ Lưu ý**:
- `SERVICE_TOKEN_SECRET` bắt buộc khi chạy production. Ở development nếu thiếu sẽ dùng fallback local (không dùng cho môi trường thật).
- `DATABASE_URL` chỉ chấp nhận prefix `postgresql://` hoặc `mysql://`.
- `REDIS_URL` chỉ chấp nhận prefix `redis://` hoặc `rediss://`.

---

## 🚀 Quick Start

### Step 1: Start Docker Infrastructure
```bash
cd d:\Class\SOA
docker-compose up -d
```

Wait for all containers to be ready (check `docker ps`)

### Step 2: Apply Database Migrations
```bash
cd logic-service
npx prisma migrate resolve --applied 0001_init
```

Or for interactive migration:
```bash
npm run prisma:migrate
```

### Step 3: Seed Sample Data (Optional)
```bash
npm run prisma:seed
```

### Step 4: View Database (Optional)
```bash
npx prisma studio
```
Opens http://localhost:5555 to browse/edit data

## 📋 Database Models

| Model | Purpose |
|-------|---------|
| **User** | Student/Teacher/Admin accounts |
| **Course** | Learning courses |
| **Enrollment** | Student enrollment |
| **Document** | Course materials |
| **Assignment** | Tasks/Assignments |
| **Submission** | Student submissions |
| **Grade** | Official grades |
| **Quiz** | Exams/Tests |
| **QuizResult** | Quiz answers |
| **Ticket** | Q&A support |

## 🔧 Useful Commands

### Database
```bash
npx prisma studio        # View/edit data GUI
npx prisma migrate status # Check migration status
npx prisma db push       # Push schema to DB
npx prisma db reset      # Reset database (⚠️ DANGER)
```

### Development
```bash
npm run dev              # Start dev server (ts-node)
npm run build            # Compile TypeScript
npm run watch            # Watch & compile
npm run seed             # Seed sample data
```

### Docker
```bash
docker-compose up -d     # Start containers
docker-compose down      # Stop containers
docker-compose logs      # View logs
docker ps                # List running containers
```

## 🐘 PostgreSQL Connection

**Inside Docker:**
- Host: `postgres`
- Port: `5432`
- User: `soa`
- Password: `soa`
- Database: `logic`

**From Host Machine:**
- Host: `localhost`
- Port: `5432`
- User: `soa`
- Password: `soa`
- Database: `logic`

## 📊 Environment Variables

Located in `.env`:
```env
PORT=8003
NODE_ENV=development
KAFKA_BROKER=kafka:9092
DATABASE_URL=postgresql://soa:soa@localhost:5432/logic
```

## ✨ Next Steps

1. **Create application code** in `src/` (TypeScript)
2. **Implement API routes** using Express
3. **Add Kafka consumers/producers**
4. **Write unit & integration tests**
5. **Set up CI/CD pipeline**

## 📚 Structure

```
logic-service/
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── migrations/         # Migration history
│   └── seed.ts            # Seed data
├── src/
│   ├── index.ts           # Entry point
│   ├── app.ts             # Express app
│   ├── config/            # Configuration
│   ├── lib/               # Libraries (DB, Redis, etc)
│   ├── kafka/             # Kafka setup
│   ├── middlewares/       # Express middlewares
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── types/             # TypeScript types
│   └── utils/             # Utilities
├── tests/                 # Test files
├── package.json
├── tsconfig.json
├── .env                   # Environment variables
└── Dockerfile             # Container image
```

## 🆘 Troubleshooting

### Can't connect to PostgreSQL?
```bash
# Check if container is running
docker ps | grep postgres

# View logs
docker logs postgres-logic

# Restart container
docker restart postgres-logic
```

### Prisma migration fails?
```bash
# Reset migrations (⚠️ DANGER - clears data)
npx prisma migrate reset

# Or resolve manually
npx prisma migrate resolve --rolled-back "migration_name"
```

### Docker images won't pull?
- Check internet connection
- Ensure Docker Hub is accessible
- Try: `docker pull postgres:16`

## 📞 Support

For issues or questions about this setup, refer to:
- [Prisma Docs](https://www.prisma.io/docs)
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
