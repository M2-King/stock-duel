import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  // Global REST prefix (WS /game namespace is excluded automatically — it's not an HTTP route).
  app.setGlobalPrefix('api', {
    exclude: ['/health', '/'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: [
      'http://localhost:5173',
      /^https:\/\/.*\.netlify\.app$/,
      '*',
    ],
    credentials: false,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 Backend ready on http://0.0.0.0:${port}`, 'Bootstrap');
  Logger.log(`   WS:    ws://0.0.0.0:${port}/game`, 'Bootstrap');
  Logger.log(`   REST:  http://0.0.0.0:${port}/api/...`, 'Bootstrap');
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', e);
  process.exit(1);
});
