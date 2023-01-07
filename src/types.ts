import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface NeoQuery extends DataQuery {
  queryText?: string;
  constant: number;
}

export const DEFAULT_QUERY: Partial<NeoQuery> = {
  constant: 6.5,
};

/**
 * These are options configured for each DataSource instance
 */
export interface NeoDataSourceOptions extends DataSourceJsonData {
  address?: string;
  path?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface NeoSecureJsonData {
  apiKey?: string;
}
