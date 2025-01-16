import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { UnauthorizedExceptionFilter } from './customFilters/unauthorized-exception.filter';

const port = process.env.PORT ?? 5000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new UnauthorizedExceptionFilter());
  //app.useGlobalFilters()
  app.enableCors({
    origin: '*', // Allow requests from any origin
    methods: 'GET,HEAD', // Specify allowed HTTP methods
    allowedHeaders: 'Content-Type, Authorization', // Specify allowed headers
  });
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}
bootstrap();
