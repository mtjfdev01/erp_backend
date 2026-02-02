import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EmailTemplateService } from './email_template.service';
import { CreateEmailTemplateDto } from './dto/create-email_template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email_template.dto';

@Controller('email-template')
export class EmailTemplateController {
  constructor(private readonly emailTemplateService: EmailTemplateService) {}

  @Post()
  create(@Body() createEmailTemplateDto: CreateEmailTemplateDto) {
    return this.emailTemplateService.create(createEmailTemplateDto);
  }

  @Get()
  findAll() {
    return this.emailTemplateService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailTemplateService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEmailTemplateDto: UpdateEmailTemplateDto) {
    return this.emailTemplateService.update(+id, updateEmailTemplateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailTemplateService.remove(+id);
  }
}
