import { Controller, Post, Body, HttpCode, HttpStatus, Res, Get, UseGuards, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

interface LoginDto {
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    console.log('Login attempt for:', loginDto.email);
    
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    
    const result = await this.authService.login(user);
    console.log('Login successful, setting cookies...');
    
    // Set JWT in HTTP-only cookie
    const jwtCookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: 'lax' as const,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    };

    console.log('Setting JWT cookie with options:', jwtCookieOptions);
    response.cookie('jwt', result.token, jwtCookieOptions);

    console.log('Returning response with user data');
    return { 
      message: 'Login successful',
      user: result.user // Include user data in response
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    console.log('Logout request received, clearing cookies...');
    
    const cookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: 'lax' as const,
      path: '/'
    };

    response.clearCookie('jwt', cookieOptions);
    
    console.log('Cookies cleared');
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async getProfile(@Req() request: Request) {
    console.log('Profile request received, cookies:', request.cookies);
    const token = request.cookies?.jwt;
    const user = await this.authService.validateToken(token);
    return { user };
  }
} 