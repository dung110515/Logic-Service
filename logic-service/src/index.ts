/**
 * Application Entry Point
 * Khởi tạo Express server, Kafka consumer, Redis connection
 * Xử lý graceful shutdown
 */

import 'dotenv/config';
import app from './app';
import { config } from './config/env';
import { startConsumer, stopConsumer } from './kafka/consumer';
import { closeProducer } from './kafka/producer';
import { closeRedisConnection } from './lib/redis';

const PORT = config.port;

/**
 * Global state
 */
let server: ReturnType<typeof app.listen> | null = null;

/**
 * Khởi tạo ứng dụng
 */
async function startApp(): Promise<void> {
  try {
    console.log('🚀 Starting Logic Service...');
    console.log(`📝 Environment: ${config.nodeEnv}`);
    console.log(`🔧 Configuration loaded from .env`);

    // ===== Start Express Server =====
    server = app.listen(PORT, () => {
      console.log(`✅ ✅ Express server running on port ${PORT}`);
    });

    // ===== Start Kafka Consumer (non-blocking) =====
    try {
      console.log('📥 Initializing Kafka consumer...');
      await startConsumer();
      console.log('✅ Kafka consumer started');
    } catch (error) {
      console.error('❌ Error starting Kafka consumer:', error);
      // Không exit - server có thể chạy mà không có Kafka
      // Nhưng log warn để developer biết có issue
    }

    console.log('✅ ✅ ✅ Logic Service started successfully!');
  } catch (error) {
    console.error('❌ Fatal error starting app:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 * Tắt server, consumer, producer, Redis connection một cách an toàn
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n⏹️  Received ${signal}, shutting down gracefully...`);

  try {
    // 1. Tắt server (ngừng nhận request)
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          console.log('✅ Express server closed');
          resolve();
        });
      });
    }

    // 2. Tắt Kafka consumer
    await stopConsumer();

    // 3. Tắt Kafka producer
    await closeProducer();

    // 4. Tắt Redis connection
    await closeRedisConnection();

    console.log('✅ ✅ ✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Xử lý shutdown signals
 */
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Xử lý uncaught exceptions
 */
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

/**
 * Xử lý unhandled promise rejections
 */
process.on('unhandledRejection', (reason: any) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// ===== Start Application =====
startApp().catch((error) => {
  console.error('❌ Failed to start app:', error);
  process.exit(1);
});
