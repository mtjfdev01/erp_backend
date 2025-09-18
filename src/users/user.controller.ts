import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserWithPermissionsDto } from './dto/update-user-with-permissions.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePasswordByAdminDto } from './dto/change-password-by-admin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetNewPasswordDto } from './dto/set-new-password.dto';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequiredPermissions } from '../permissions/decorators/require-permission.decorator';

@Controller('users')
@UseGuards(JwtGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequiredPermissions(['users.create', 'super_admin'])
  async create(@Body() createUserDto: CreateUserDto, @CurrentUser() user: User) {
    return this.usersService.createFromDto(createUserDto, user);
  }

  @Get()
  @RequiredPermissions(['users.list_view', 'read_only_user_manager', 'read_only_super_admin', 'super_admin'])
  async findAll(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
    @Query('sortField') sortField: string = 'created_at',
    @Query('sortOrder') sortOrder: string = 'DESC',
    @Query('search') search: string = '',
    @Query('department') department: string = '',
    @Query('role') role: string = '',
    @Query('isActive') isActive: string = ''
  ) {
    return this.usersService.findAll({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      sortField,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
      search,
      department,
      role,
      isActive: isActive ? isActive === 'true' : undefined
    });
  }

  @Get(':id')
  @RequiredPermissions(['users.view', 'read_only_user_manager', 'read_only_super_admin', 'super_admin'])
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  @RequiredPermissions(['users.update', 'super_admin'])
  async update(@Param('id') id: string, @Body() updateDto: UpdateUserWithPermissionsDto, @CurrentUser() user: User) {
    return this.usersService.update(+id, updateDto, user);
  }

  @Delete(':id')
  @RequiredPermissions(['users.delete', 'super_admin'])
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.usersService.remove(+id, user);
  }

  // Password change endpoint (user changes their own password)
  @Post('change-password')
  @RequiredPermissions(['users.update', 'super_admin'])
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() user: User
  ) {
    return this.usersService.changePassword(user.id, changePasswordDto.currentPassword, changePasswordDto.newPassword);
  }

  // Admin changes another user's password
  @Post(':id/change-password')
  @RequiredPermissions(['users.update', 'super_admin'])
  async changePasswordByAdmin(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordByAdminDto,
    @CurrentUser() currentUser: User
  ) {
    return this.usersService.changePasswordByAdmin(currentUser, +id, changePasswordDto.newPassword);
  }

  // // Dedicated Permission Management Endpoints
  // @Get(':id/permissions')
  // @RequiredPermissions(['users.view_permissions', 'super_admin'])
  // async getUserPermissions(@Param('id') id: string) {
  //   return this.usersService.getUserPermissions(+id);
  // }

  // @Patch(':id/permissions')
  // @RequiredPermissions(['users.update_permissions', 'super_admin'])
  // async updateUserPermissions(
  //   @Param('id') id: string, 
  //   @Body() permissions: Record<string, any>,
  //   @CurrentUser() currentUser: User
  // ) {
  //   return this.usersService.updateUserPermissions(+id, permissions, currentUser);
  // }

  // @Post(':id/permissions/template')
  // @RequiredPermissions(['users.update_permissions', 'super_admin'])
  // async applyPermissionTemplate(
  //   @Param('id') id: string,
  //   @Body() body: { template: string },
  //   @CurrentUser() currentUser: User
  // ) {
  //   return this.usersService.applyPermissionTemplate(+id, body.template, currentUser);
  // }

  // // Password change endpoint
  // @Post('change-password')
  // @RequiredPermissions(['users.update', 'super_admin'])
  // async changePassword(
  //   @Body() changePasswordDto: ChangePasswordDto,
  //   @CurrentUser() user: User
  // ) {
  //   return this.usersService.changePassword(user.id, changePasswordDto);
  // }

  // // Password reset request endpoint (no auth required)
  // @Post('reset-password')
  // @UseGuards() // No guards for password reset
  // async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
  //   return this.usersService.resetPassword(resetPasswordDto);
  // }

  // // Set new password after reset (no auth required)
  // @Post('set-new-password')
  // @UseGuards() // No guards for setting new password
  // async setNewPassword(@Body() setNewPasswordDto: SetNewPasswordDto) {
  //   return this.usersService.setNewPassword(setNewPasswordDto);
  // }
}
