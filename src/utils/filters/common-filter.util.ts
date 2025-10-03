import { SelectQueryBuilder } from 'typeorm';

export interface FilterPayload {
  search?: string;
  status?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  [key: string]: any; // Allow any additional fields
}

/**
 * Applies common filtering logic to a TypeORM QueryBuilder
 * @param queryBuilder - The existing QueryBuilder to modify
 * @param filters - Filter payload object
 * @param searchFields - Array of entity fields to search in
 * @param entityAlias - The alias of the main entity (default: 'entity')
 */
export function applyCommonFilters(
  queryBuilder: SelectQueryBuilder<any>,
  filters: FilterPayload,
  searchFields: string[],
  entityAlias: string = 'entity'
): void {
  if (!filters || Object.keys(filters).length === 0) {
    return;
  }

  // Apply search filter
  if (filters.search && filters.search.trim() !== '') {
    applySearchFilter(queryBuilder, filters.search, searchFields, entityAlias);
  }

  // Apply equality filters for all other fields except search, date, start_date, end_date
  const excludeFields = ['search', 'date', 'start_date', 'end_date'];
  Object.keys(filters).forEach(field => {
    if (!excludeFields.includes(field) && filters[field] !== undefined && filters[field] !== '') {
      applyEqualityFilter(queryBuilder, field, filters[field], entityAlias);
    }
  });

  // Apply date filtering
  applyDateFilter(queryBuilder, filters, entityAlias);
}

/**
 * Applies search filter across multiple fields
 */
function applySearchFilter(
  queryBuilder: SelectQueryBuilder<any>,
  searchTerm: string,
  searchFields: string[],
  entityAlias: string
): void {
  if (!searchFields || searchFields.length === 0) {
    return;
  }

  const searchConditions = searchFields.map(field => {
    const fieldPath = field.includes('.') ? field : `${entityAlias}.${field}`;
    return `LOWER(${fieldPath}) LIKE LOWER(:searchTerm)`;
  });

  queryBuilder.andWhere(`(${searchConditions.join(' OR ')})`, {
    searchTerm: `%${searchTerm}%`
  });
}

/**
 * Applies equality filter for a single field
 */
function applyEqualityFilter(
  queryBuilder: SelectQueryBuilder<any>,
  field: string,
  value: any,
  entityAlias: string
): void {
  const fieldPath = field.includes('.') ? field : `${entityAlias}.${field}`;
  const paramName = `filter_${field}`;
  
  queryBuilder.andWhere(`${fieldPath} = :${paramName}`, {
    [paramName]: value
  });
}

/**
 * Applies date filtering logic
 */
function applyDateFilter(
  queryBuilder: SelectQueryBuilder<any>,
  filters: FilterPayload,
  entityAlias: string
): void {
  const dateField = `${entityAlias}.date`;
  
  // If both start_date and end_date are provided
  if (filters.start_date && filters.end_date) {
    queryBuilder.andWhere(`${dateField} BETWEEN :startDate AND :endDate`, {
      startDate: filters.start_date,
      endDate: filters.end_date
    });
  }
  // If only start_date is provided
  else if (filters.start_date && !filters.end_date) {
    queryBuilder.andWhere(`${dateField} >= :startDate`, {
      startDate: filters.start_date
    });
  }
  // If only end_date is provided
  else if (filters.end_date && !filters.start_date) {
    queryBuilder.andWhere(`${dateField} <= :endDate`, {
      endDate: filters.end_date
    });
  }
  // If only date is provided (exact match)
  else if (filters.date) {
    queryBuilder.andWhere(`${dateField} = :exactDate`, {
      exactDate: filters.date
    });
  }
}

/**
 * Helper function to create a QueryBuilder with common filters applied
 * @param repository - TypeORM Repository
 * @param entityAlias - Alias for the main entity
 * @param filters - Filter payload
 * @param searchFields - Fields to search in
 * @param relations - Optional relations to join
 */
export function createFilteredQuery<T>(
  repository: any,
  entityAlias: string,
  filters: FilterPayload,
  searchFields: string[],
  relations: string[] = []
): SelectQueryBuilder<T> {
  const queryBuilder = repository.createQueryBuilder(entityAlias);
  
  // Add relations
  relations.forEach(relation => {
    queryBuilder.leftJoinAndSelect(`${entityAlias}.${relation}`, relation);
  });
  
  // Apply common filters
  applyCommonFilters(queryBuilder, filters, searchFields, entityAlias);
  
  return queryBuilder;
}
