import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard";
import { WebsiteDonationProjectsService } from "./website-donation-projects.service";
import { CreateWebsiteDonationProjectDto } from "./dto/create-website-donation-project.dto";
import { UpdateWebsiteDonationProjectDto } from "./dto/update-website-donation-project.dto";

@Controller("website-donation-projects")
@UseGuards(JwtGuard)
export class WebsiteDonationProjectsController {
  constructor(
    private readonly service: WebsiteDonationProjectsService,
  ) {}

  @Post()
  async create(@Body() dto: CreateWebsiteDonationProjectDto) {
    const data = await this.service.create(dto);
    return { success: true, data };
  }

  @Get()
  async findAll(
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @Query("search") search?: string,
  ) {
    const result = await this.service.findAll({ page, pageSize, search });
    return { success: true, ...result };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.service.findOne(+id);
    return { success: true, data };
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateWebsiteDonationProjectDto,
  ) {
    const data = await this.service.update(+id, dto);
    return { success: true, data };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.service.remove(+id);
    return { success: true, message: "Website donation project archived" };
  }
}
