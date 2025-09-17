import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TargetsService } from './targets.service';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { JwtGuard } from 'src/auth/jwt.guard';
import { PermissionsGuard, RequiredPermissions } from 'src/permissions';
import { User } from 'src/users/user.entity';
import { CurrentUser } from 'src/auth/current-user.decorator';

@Controller('program/targets')
// @UseGuards(JwtGuard, PermissionsGuard)

export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  // @RequiredPermissions(['program.targets.create', 'super_admin', 'programs_manager'])
  create(@Body() createTargetDto: CreateTargetDto, @CurrentUser() user: User) {
    return this.targetsService.create(createTargetDto, user);
  }

  @Get()
  // @RequiredPermissions(['program.targets.view', 'super_admin', 'programs_manager'])
  findAll() {
    return this.targetsService.findAll(); 
  }

  @Get(':id')
  // @RequiredPermissions(['program.targets.view', 'super_admin', 'programs_manager'])
  findOne(@Param('id') id: string) {
    return this.targetsService.findOne(+id);
  }

  @Patch(':id')
  // @RequiredPermissions(['program.targets.update', 'super_admin', 'programs_manager'])
  update(@Param('id') id: string, @Body() updateTargetDto: UpdateTargetDto, @CurrentUser() user: User) {
    return this.targetsService.update(+id, updateTargetDto, user);
  }

  @Delete(':id')
  // @RequiredPermissions(['program.targets.delete', 'super_admin', 'programs_manager'])
  remove(@Param('id') id: string) {
    return this.targetsService.remove(+id);
  }
}
