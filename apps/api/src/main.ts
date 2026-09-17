import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './env';

const env = loadEnv();
const app = await NestFactory.create(AppModule.forRoot(env));
app.enableCors({ origin: env.API_CORS_ORIGIN });
app.enableShutdownHooks();
await app.listen(env.API_PORT);
console.log(`api ouvindo em http://localhost:${env.API_PORT}`);