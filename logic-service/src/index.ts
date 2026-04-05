import 'dotenv/config';
import app from './app';
import { config } from './config/env';
import { startConsumer, stopConsumer } from './kafka/consumer';
import { closeProducer } from './kafka/producer';
import { closeRedisConnection } from './lib/redis';

const PORT = config.port;

let server: ReturnType<typeof app.listen> | null = null;

async function startApp(): Promise<void> {
  try {
    console.log('🚀 Starting Logic Service...');
    console.log(`📝 Environment: ${config.nodeEnv}`);
    console.log(`🔧 Configuration loaded from .env`);

    server = app.listen(PORT, () => {
      console.log(`✅ Express server running on port ${PORT}`);
      console.log(`   http://localhost:${PORT}/health`);
    });

    try {
      console.log('📥 Initializing Kafka consumer...');
      await startConsumer();
      console.log('✅ Kafka consumer started (subscribed to topics)');
    } catch (error) {

      console.error('❌ Warning: Kafka consumer failed, some event handlers disabled:', error);
    }

    console.log('✅ ✅ ✅ Logic Service ready for requests');
    console.log(`   ├─ HTTP: localhost:${PORT}`);
    console.log(`   ├─ Kafka: subscribed to event topics`);
    console.log(`   └─ Redis: connected to cache`);
  } catch (error) {
    console.error('❌ Fatal error starting app:', error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n⏹️  Nhận được ${signal}, đang tắt một cách duyên dáng...`);

  try {

    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          console.log('✅ Express server closed');
          resolve();
        });
      });
    }

    await stopConsumer();
    console.log('✅ Kafka consumer stopped');

    await closeProducer();
    console.log('✅ Kafka producer flushed');

    await closeRedisConnection();
    console.log('✅ Redis connection closed');

    console.log('✅ ✅ ✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception (fatal):', error);
  console.error('   Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('❌ Unhandled Promise Rejection (fatal):', reason);
  if (reason instanceof Error) {
    console.error('   Stack:', reason.stack);
  }
  process.exit(1);
});

startApp().catch((error) => {
  console.error('❌ Failed to start app:', error);
  process.exit(1);
});
