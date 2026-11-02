import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { API_KEY_SCOPES } from "../../../api-keys/api-keys.constants";
import { RequireApiKeyScopes } from "../../../api-keys/decorators/require-api-key-scopes.decorator";
import { ApiKeyGuard } from "../../../api-keys/guards/api-key.guard";
import { AskClinicBeneficiariesService } from "./ask-clinic-beneficiaries.service";

/**
 * Ask Clinic / AAS Clinics — server-to-server beneficiary search.
 *
 * Auth: `x-api-key` against table `api_keys` (scopes: ask_clinic | ask_clinic.beneficiaries).
 * Legacy donation partner keys (`external_api_keys`) are not used here.
 *
 * Paths (aliases):
 * - GET /external/v1/beneficiaries?query=
 * - GET /api/v1/beneficiaries?query=
 *
 * Also accepts `search` as an alias for `query`.
 */
@Controller(["external/v1/beneficiaries", "api/v1/beneficiaries"])
@UseGuards(ApiKeyGuard)
@RequireApiKeyScopes(
  API_KEY_SCOPES.ASK_CLINIC,
  API_KEY_SCOPES.ASK_CLINIC_BENEFICIARIES,
)
export class AskClinicBeneficiariesController {
  constructor(private readonly service: AskClinicBeneficiariesService) {}

  @Get()
  async search(
    @Query("query") query: string,
    @Query("search") search: string,
    @Query("limit") limit: string,
    @Res() res: Response,
  ) {
    const q = query ?? search;
    try {
      const data = await this.service.search(q, Number(limit) || 20);
      // Spec allows bare array; wrap for consistency with other DMS APIs.
      return res.status(HttpStatus.OK).json({
        success: true,
        message: data.length
          ? `Found ${data.length} matching people`
          : "No matches found",
        data,
      });
    } catch (error: any) {
      const status =
        error?.status ||
        error?.statusCode ||
        HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error?.message || "Search failed",
        data: [],
      });
    }
  }
}
