import { DataSourceInstanceSettings, CoreApp } from '@grafana/data';
import { DataSourceWithBackend } from '@grafana/runtime';

import { NeoQuery, NeoDataSourceOptions, DEFAULT_QUERY } from './types';

export class DataSource extends DataSourceWithBackend<NeoQuery, NeoDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<NeoDataSourceOptions>) {
    super(instanceSettings);
  }

  getDefaultQuery(_: CoreApp): Partial<NeoQuery> {
    return DEFAULT_QUERY
  }
}
