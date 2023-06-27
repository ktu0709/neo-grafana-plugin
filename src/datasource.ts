import { DataSourceInstanceSettings, CoreApp, DataQueryRequest, DataQueryResponse, DataFrameView, SelectableValue } from '@grafana/data';
import { DataSourceWithBackend } from '@grafana/runtime';

import { NeoQuery, NeoDataSourceOptions, DEFAULT_QUERY } from './types';
import { merge, Observable, of, lastValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { createQuery } from './utils/createQuery';

export class DataSource extends DataSourceWithBackend<NeoQuery, NeoDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<NeoDataSourceOptions>) {
    super(instanceSettings);
  }

  query(request: DataQueryRequest<NeoQuery>): Observable<DataQueryResponse> {
    const results: Array<Observable<DataQueryResponse>> = [];
    let targets: NeoQuery[] = [];

    targets = createQuery(request, targets);

    if (targets.length) {
      results.push(
        super.query({
          ...request,
          targets,
        })
      );
    }

    // convert result to grafana format
    if (results.length) {
      // With a single query just return the results
      if (results.length === 1) {
        return results[0];
      }
      return merge(...results);
    }
    return of(); // nothing
  }

  runQuery(query: NeoQuery, maxDataPoints?: number): Observable<DataQueryResponse> {
    return super.query({
      targets: [query],
    } as DataQueryRequest<NeoQuery>);
  }

  async getTablesQuery(target: NeoQuery) {
    let queryStmt = '';

    queryStmt = `SELECT decode(s.DBID, -1, s.NAME, m.MOUNTDB || '.' || s.OWNER || '.' || s.NAME) AS name, s.type AS type `;
    queryStmt += 'FROM (SELECT t.NAME AS name, t.type AS type, u.NAME AS owner, t.DATABASE_ID AS dbid FROM m$sys_tables t, m$sys_users u ';
    queryStmt += 'WHERE t.USER_ID = u.USER_ID AND (t.TYPE = 0 OR t.TYPE = 6) ORDER BY dbid, name) s ';
    queryStmt += 'LEFT OUTER JOIN V$STORAGE_MOUNT_DATABASES m ON s.DBID = m.BACKUP_TBSID ORDER BY name'

    target.queryText = queryStmt;

    const result = this.runQuery(target).pipe(
      map((res) => {
        if (res.data.length) {
          const tables:any = new DataFrameView<SelectableValue<string>>(res.data[0]);
          // console.log('getTables query res ', tables)
          return tables.data.fields;
        }
        throw `${res.error}`;
      })
    )
    return lastValueFrom(result)
  }

  async getColumnsQuery(target: NeoQuery, type: number) {
    let queryStmt = '';

    queryStmt = 'SELECT name, type, length ';
    queryStmt += 'from m$sys_columns ';
    queryStmt += `where table_id = (SELECT ID FROM M$SYS_TABLES WHERE NAME = '${target.tableName?.toUpperCase()}') `;
    queryStmt += `AND DATABASE_ID = (SELECT DATABASE_ID FROM M$SYS_TABLES WHERE NAME = '${target.tableName?.toUpperCase()}') `;
    queryStmt += 'AND ID < 65530 ORDER BY ID'

    target.queryText = queryStmt;

    const result = this.runQuery(target).pipe(
      map((res) => {
        if (res.data.length) {
          const columns:any = new DataFrameView<SelectableValue<string>>(res.data[0]);
          // console.log('getColumns query res ', columns)
          return columns.data.fields;
        }
        throw `${res.error}`;
      })
    )
    return lastValueFrom(result)
  }

  getDefaultQuery(_: CoreApp): Partial<NeoQuery> {
    return DEFAULT_QUERY
  }
}