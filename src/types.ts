import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface NeoQuery extends DataQuery {
  queryText?: string;
  constant: number;
  tableName?: string;
  tableType?: number;
  rollupTable?: boolean;
  aggrFunc?: string;
  valueField?: string;
  valueType?: 'select' | 'input';
  timeField?: string;
  title?: string;
  filters?: Filter[];
}

export const DEFAULT_QUERY: Partial<NeoQuery> = {
  constant: 6.5,
  queryText: '',
  tableName: '',
  tableType: -1,
  rollupTable: true,
  aggrFunc: 'avg',
  valueField: '',
  valueType: 'select',
  timeField: '',
  title: '',
  filters: [],
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

export interface Filter {
  key: string;
  type: string;
  value: string;
  op: string;
  condition: string;
  isStr: boolean;
}

export const ColumnType = [
  { key: 4, value: 'SHORT' },
  { key: 5, value: 'VARCHAR' },
  { key: 6, value: 'DATETIME' },
  { key: 8, value: 'INTEGER' },
  { key: 12, value: 'LONG' },
  { key: 16, value: 'FLOAT' },
  { key: 20, value: 'DOUBLE' },
  { key: 32, value: 'IPV4' },
  { key: 36, value: 'IPV6' },
  { key: 49, value: 'TEXT' },
  { key: 53, value: 'CLOB' },
  { key: 57, value: 'BLOB' },
  { key: 97, value: 'BINARY' },
  { key: 104, value: 'USHORT' },
  { key: 108, value: 'UINTEGER' },
  { key: 112, value: 'ULONG' },
]

// SUM, COUNT, MIN, MAX, AVG, SUMSQ
export const TagAggrOpsNameList = [
  { value: 'none', label: 'none'},
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'avg', label: 'Avg' },
  { value: 'sumsq', label: 'Sumsq' },
]

export const LogAggrOpsNameList = [
  { value: 'none', label: 'none'},
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Avg' },
  { value: 'sumsq', label: 'Sumsq' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
  { value: 'stddev', label: 'Stddev' },
  { value: 'stddev_pop', label: 'Stddev_pop' },
  { value: 'variance', label: 'Variance' },
  { value: 'var_pop', label: 'Var_pop' },
]

export const StringAggrOpsNameList = [
  { value: 'none', label: 'none' },
  { value: 'count', label: 'Count' },
  { value: 'count(*)', label: 'Count(*)' },
]

export const conditionList = [
  { value: '=', label: '=' },
  { value: '<>', label: '<>' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: 'in', label: 'in'},
];

