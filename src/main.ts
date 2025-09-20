import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Define allowed origins
  const allowedOrigins = [
    'http://localhost:5173', // Local development
    'http://127.0.0.1:5173', // Local development alternative
    'https://unique-kangaroo-920e66.netlify.app', // Your Netlify URL
    'https://29b8-103-131-212-77.ngrok-free.app', // Your specific ngrok URL
    'http://localhost:3001', // Special origin - bypasses JWT authentication (see ConditionalJwtGuard)
    'https://mtjf-donations.vercel.app'
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // During development, allow all localhost origins
      if (process.env.NODE_ENV !== 'production' && 
          (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        console.log('Development mode: Allowing origin:', origin);
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        console.log('Allowed origin:', origin);
        callback(null, true);
      } else {
        console.log('Blocked by CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'Cookie'],
    exposedHeaders: ['Set-Cookie', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  // Add a middleware to log all requests
  app.use((req, res, next) => {
    console.log('Incoming request:', {
      method: req.method,
      url: req.url,
      origin: req.headers.origin,
      headers: req.headers
    });
    next();
  });
  
  app.use(cookieParser());
  
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log('Allowed origins:', allowedOrigins);
}
bootstrap();
