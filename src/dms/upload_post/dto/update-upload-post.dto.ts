import { PartialType } from "@nestjs/mapped-types";
import { CreateUploadPostDto } from "./create-upload-post.dto";

export class UpdateUploadPostDto extends PartialType(CreateUploadPostDto) {}
