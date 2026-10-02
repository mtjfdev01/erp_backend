import { ObjectLiteral, Repository, SelectQueryBuilder } from "typeorm";
import type { LookupProfile } from "./lookup-profiles.constants";

export type LookupOption = {
  value: string;
  label: string;
};

export type EntityLookupParams = {
  search?: string;
  limit?: number;
  /** When true and `activeColumn` is set, filter active rows only. */
  activeOnly?: boolean;
};

export function clampLookupLimit(
  limit: number | undefined,
  profile: Pick<LookupProfile, "defaultLimit" | "maxLimit">,
): number {
  const requested = Number(limit ?? profile.defaultLimit);
  if (!Number.isFinite(requested) || requested <= 0) {
    return profile.defaultLimit;
  }
  return Math.min(Math.floor(requested), profile.maxLimit);
}

export function toLookupOptions<T extends Record<string, unknown>>(
  rows: T[],
  profile: Pick<LookupProfile, "valueField" | "labelField"> & {
    labelFallback?: (row: T) => string;
  },
): LookupOption[] {
  return rows.map((row) => {
    const value = row[profile.valueField];
    const labelRaw = row[profile.labelField];
    const label =
      labelRaw != null && String(labelRaw).trim() !== ""
        ? String(labelRaw)
        : (profile.labelFallback?.(row) ?? String(value ?? ""));
    return { value: String(value ?? ""), label };
  });
}

export function selectEntityFields(
  alias: string,
  fields: readonly string[],
): string[] {
  return fields.map((field) => `${alias}.${field}`);
}

export type ListEntityLookupConfig<T extends ObjectLiteral> = {
  profile: LookupProfile;
  alias?: string;
  /** Columns matched with ILIKE when `params.search` is set. Defaults to [labelField]. */
  searchFields?: string[];
  orderBy?: string;
  /** Default true — applies `{alias}.is_archived = false`. */
  excludeArchived?: boolean;
  /** When set and `params.activeOnly !== false`, filters `{alias}.{activeColumn} = true`. */
  activeColumn?: string | null;
  labelFallback?: (row: Record<string, unknown>) => string;
  extraWhere?: (qb: SelectQueryBuilder<T>, alias: string) => void;
};

/**
 * Shared slim id/label lookup used by GET /{resource}/lookup endpoints.
 */
export async function listEntityLookup<T extends ObjectLiteral>(
  repo: Repository<T>,
  config: ListEntityLookupConfig<T>,
  params?: EntityLookupParams,
): Promise<LookupOption[]> {
  const alias = config.alias || "e";
  const profile = config.profile;
  const take = clampLookupLimit(params?.limit, profile);
  const qb = repo
    .createQueryBuilder(alias)
    .select(selectEntityFields(alias, profile.fields))
    .orderBy(
      `${alias}.${config.orderBy || profile.labelField}`,
      "ASC",
    )
    .take(take);

  if (config.excludeArchived !== false) {
    qb.andWhere(`${alias}.is_archived = false`);
  }

  if (config.activeColumn && params?.activeOnly !== false) {
    qb.andWhere(`${alias}.${config.activeColumn} = true`);
  }

  const search = params?.search?.trim();
  if (search) {
    const fields =
      config.searchFields?.length > 0
        ? config.searchFields
        : [profile.labelField];
    const clauses = fields.map(
      (field, i) => `${alias}.${field} ILIKE :lkSearch${i}`,
    );
    const bindings: Record<string, string> = {};
    fields.forEach((_, i) => {
      bindings[`lkSearch${i}`] = `%${search}%`;
    });
    qb.andWhere(`(${clauses.join(" OR ")})`, bindings);
  }

  config.extraWhere?.(qb, alias);

  const rows = await qb.getMany();
  return toLookupOptions(rows as unknown as Array<Record<string, unknown>>, {
    valueField: profile.valueField,
    labelField: profile.labelField,
    labelFallback: config.labelFallback,
  });
}
