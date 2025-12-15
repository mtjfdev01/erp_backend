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
    'http://localhost:3001', // Special origin - bypasses JWT authentication (see ConditionalJwtGuard)
    'http://localhost:3000', 
    'https://donation.mtjfoundation.org',
    'http://31.97.223.158:8081',
    'https://mtjf-erp.vercel.app',
    'http://localhost:3002',
    'http://192.168.0.106:5173',
    'https://mtjf-site.vercel.app',
    '18.143.123.75' // EOceans IP
    ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // During development, allow all localhost origins
      if (process.env.NODE_ENV !== 'production' && 
          (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') )) {
        console.log('Development mode: Allowing origin:', origin);
        return callback(null, true);
      }
      
      // Check if origin matches any allowed base domains (including subpaths)
      const isAllowedOrigin = allowedOrigins.some(allowedOrigin => {
        // Exact match
        if (origin === allowedOrigin) return true;
        
        // Check if origin starts with allowed origin (for subpaths)
        if (origin.startsWith(allowedOrigin + '/')) return true;
        
        return false;
      });
      
      if (isAllowedOrigin) {
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
      // origin: req.headers.origin,
      // headers: req.headers
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
