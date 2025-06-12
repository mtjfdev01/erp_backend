import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    return await this.usersService.validateUser(email, password);
  }

  async login(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
    };

    // We don't need to return the token as it will be set in cookie by the controller
    const token = await this.jwtService.signAsync(payload);

    return {
      token, // This will be set as cookie by controller
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        department: user.department,
      }
    };
  }

  async validateToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      const user = await this.usersService.findByEmail(payload.email);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }
      return user;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
} 