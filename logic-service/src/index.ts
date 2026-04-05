




























































import 'dotenv/config'; // Load .env vars FIRST
import app from './app';
import { config } from './config/env';
import { startConsumer, stopConsumer } from './kafka/consumer';
import { closeProducer } from './kafka/producer';
import { closeRedisConnection } from './lib/redis';

/**
 * Server Configuration
 * ====================
 */
const PORT = config.port;

/**
 * Global Server Instance
 * ======================
 * Stored here so we can close it during shutdown
 */
let server: ReturnType<typeof app.listen> | null = null;

/**
 * Start Application
 * =================
 * 
 * Workflow:
 * 1. Print startup info (env, port)
 * 2. Start Express server
 * 3. Start Kafka consumer (non-blocking)
 * 4. Log ready state
 * 
 * @throws Error if Express/Kafka startup fails
 * @returns Promise<void>
 */
async function startApp(): Promise<void> {
  try {
    console.log('🚀 Starting Logic Service...');
    console.log(`📝 Environment: ${config.nodeEnv}`);
    console.log(`🔧 Configuration loaded from .env`);

    // ===== Step 1: Start Express Server =====
    // Listen on PORT for HTTP requests
    server = app.listen(PORT, () => {
      console.log(`✅ Express server running on port ${PORT}`);
      console.log(`   http://localhost:${PORT}/health`);
    });

    // ===== Step 2: Start Kafka Consumer =====
    // Subscribe to Kafka topics (non-blocking)
    // This allows service to receive events from other services
    try {
      console.log('📥 Initializing Kafka consumer...');
      await startConsumer();
      console.log('✅ Kafka consumer started (subscribed to topics)');
    } catch (error) {
      // Don't exit if Kafka fails - service can work with just HTTP
      // But log warning so developer knows there's an issue
      console.error('❌ Warning: Kafka consumer failed, some event handlers disabled:', error);
    }

    // ===== Ready for Production =====
    console.log('✅ ✅ ✅ Logic Service ready for requests');
    console.log(`   ├─ HTTP: localhost:${PORT}`);
    console.log(`   ├─ Kafka: subscribed to event topics`);
    console.log(`   └─ Redis: connected to cache`);
  } catch (error) {
    console.error('❌ Fatal error starting app:', error);
    process.exit(1);
  }
}

/**
 * Graceful Shutdown
 * =================
 * 
 * Clean shutdown sequence (important for production):
 * 1. Stop accepting new HTTP requests
 * 2. Wait for in-flight requests to complete
 * 3. Drain Kafka consumer (finish processing messages)
 * 4. Flush Kafka producer (send pending messages)
 * 5. Close database connections
 * 6. Exit cleanly (exit code 0)
 * 
 * Called by: SIGTERM (Kubernetes), SIGINT (Ctrl+C)
 * 
 * @param signal - Signal name ("SIGTERM", "SIGINT")
 * @returns Promise<void>
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n⏹️  Received ${signal}, shutting down gracefully...`);

  try {
    // ===== Step 1: Close HTTP Server =====
    // Stop listening for new connections
    // Wait for in-flight requests to complete
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          console.log('✅ Express server closed');
          resolve();
        });
      });
    }

    // ===== Step 2: Stop Kafka Consumer =====
    // Leave consumer group gracefully
    // Commit last offsets
    await stopConsumer();
    console.log('✅ Kafka consumer stopped');

    // ===== Step 3: Close Kafka Producer =====
    // Flush pending messages
    // Close connections
    await closeProducer();
    console.log('✅ Kafka producer flushed');

    // ===== Step 4: Close Redis Connection =====
    // Important so Redis pool doesn't leak
    await closeRedisConnection();
    console.log('✅ Redis connection closed');

    console.log('✅ ✅ ✅ Graceful shutdown completed');
    process.exit(0); // Success exit
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1); // Error exit
  }
}

/**
 * Signal Handlers - Respond to OS Signals
 * =======================================
 */

/**
 * SIGTERM - Termination Signal
 * Sent by: Kubernetes, Docker, supervisors when container stops
 * Response: Start graceful shutdown
 */
process.on('SIGTERM', () => shutdown('SIGTERM'));

/**
 * SIGINT - Interruption Signal
 * Sent by: Ctrl+C in terminal
 * Response: Start graceful shutdown
 */
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Uncaught Exception Handler
 * ==========================
 * 
 * Catches unhandled errors that crash the process
 * This should rarely happen if error handling is proper
 * Log & exit to prevent undefined behavior
 */
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception (fatal):', error);
  console.error('   Stack:', error.stack);
  process.exit(1); // Exit immediately
});

/**
 * Unhandled Promise Rejection Handler
 * ===================================
 * 
 * Catches Promise rejections not handled by .catch()
 * Example: await operation() without try/catch
 * Log & exit to prevent undefined behavior
 */
process.on('unhandledRejection', (reason: any) => {
  console.error('❌ Unhandled Promise Rejection (fatal):', reason);
  if (reason instanceof Error) {
    console.error('   Stack:', reason.stack);
  }
  process.exit(1); // Exit immediately
});

/**
 * ===== START APPLICATION =====
 * Call startApp() to begin server startup
 * If startup fails, catch and exit
 */
startApp().catch((error) => {
  console.error('❌ Failed to start app:', error);
  process.exit(1);
});
