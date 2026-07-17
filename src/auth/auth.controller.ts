import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Get,
  UseGuards,
  Req,
} from "@nestjs/common";
import { Response, Request } from "express";
import { AuthService } from "./auth.service";
import { JwtGuard } from "./jwt.guard";
import { UsersService } from "../users/users.service";
import { ResetPasswordDto } from "../users/dto/reset-password.dto";
import { ChangePasswordDto } from "../users/dto/change-password.dto";

interface LoginDto {
  email: string;
  password: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    console.log("Login attempt for:", loginDto.email);

    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    const result = await this.authService.login(user);
    console.log("Login successful, setting cookies...");

    const jwtCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as
        | "none"
        | "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    };

    console.log("Setting JWT cookie with options:", jwtCookieOptions);
    response.cookie("jwt", result.token, jwtCookieOptions);

    console.log("Returning response with user data and permissions");
    return {
      message: "Login successful",
      token: result.token,
      user: result.user,
      permissions: result.permissions,
    };
  }

  /** Public: email a temporary password if the account exists. */
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ResetPasswordDto) {
    return this.usersService.forgotPassword(body.email);
  }

  /** Authenticated user changes their own password. */
  @Post("change-password")
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() request: Request,
  ) {
    const token = request.cookies?.jwt;
    const user = await this.authService.validateToken(token);
    return this.usersService.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    console.log("Logout request received, clearing cookies...");

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as
        | "none"
        | "lax",
      path: "/",
    };
    response.clearCookie("jwt", cookieOptions);

    console.log("Cookies cleared");
    return { message: "Logged out successfully" };
  }

  @Get("me")
  @UseGuards(JwtGuard)
  async getProfile(@Req() request: Request) {
    console.log("Profile request received, cookies:", request.cookies);
    const token = request.cookies?.jwt;
    const user = await this.authService.validateToken(token);

    const permissions = user.permissions?.permissions || {};

    const geographic = this.authService.getGeographicContextForUser(user);
    const geographicScope =
      await this.authService.getGeographicScopeSummaryForUser(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        department: user.department,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        dob: user.dob,
        address: user.address,
        cnic: user.cnic,
        gender: user.gender,
        joining_date: user.joining_date,
        emergency_contact: user.emergency_contact,
        blood_group: user.blood_group,
        ...geographic,
        geographic_scope: geographicScope,
      },
      permissions,
    };
  }
}
