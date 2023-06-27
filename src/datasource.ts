import { DataSourceInstanceSettings, CoreApp, DataQueryRequest, DataQueryResponse, DataFrameView, SelectableValue } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { NeoQuery, NeoDataSourceOptions, DEFAULT_QUERY, ColumnType } from './types';
import { merge, Observable, of, lastValueFrom } from 'rxjs';
import { map } from 'rxjs/operators'

export class DataSource extends DataSourceWithBackend<NeoQuery, NeoDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<NeoDataSourceOptions>) {
    super(instanceSettings);
  }

  convertToMachbaseInterval(intervalString: string): string {
    if (intervalString === '') {
      return '';
    }

    let interval_regex = /(\d+(?:\.\d+)?)([Mwdhmsy])/;
    let interval_regex_ms = /(\d+(?:\.\d+)?)(ms)/;
    let matches: RegExpMatchArray | null = intervalString.match(interval_regex_ms);
    let value  = '';
    let unit = '';

    if (!matches) {
      matches = intervalString.match(interval_regex);
    }
    if (!matches) {
      return '';
    }

    value = matches[1];
    unit = matches[2];

    switch (unit) {
      case 'ms':
        value = Math.ceil(parseInt(value, 10) / 1000).toString(10);
        unit = 'msec';
        break;
      case 's':
        unit = 'sec';
        break;
      case 'm':
        unit = 'min';
        break;
      case 'h':
        unit = 'hour';
        break;
      case 'd':
        unit = 'day';
        break;
      default:
        console.log("Unknown interval ", intervalString);
        break;
    }
    return (value + ' ' + unit);
  };

  isNumberType(type: number) {
    const colType = ColumnType.find(item => item.key === type);
    const Numbers = ['SHORT', 'INTEGER', 'LONG', 'FLOAT', 'DOUBLE', 'USHORT', 'UINTEGER', 'ULONG'];
    if (colType && Numbers.some((item) => item === colType.value)) {
        return true;
    } else {
        return false;
    }
  }

  convertToMachbaseIntervalMs(intervalMs: number) {
    let ms = '';
    let unit = '';
    if (intervalMs < 1000) {
      ms = intervalMs.toString();
      unit = 'msec';
    } else if (intervalMs < 60 * 1000) {
      ms = Math.ceil(intervalMs / 1000).toString();
      unit = 'sec';
    } else if (intervalMs < 60 * 60 * 1000) {
      ms = Math.ceil(intervalMs / 1000 / 60).toString();
      unit = 'min';
    } else if (intervalMs < 60 * 60 * 24 * 1000) {
      ms = Math.ceil(intervalMs / 1000 / 60 / 60).toString();
      unit = 'hour';
    } else {
      ms = Math.ceil(intervalMs / 1000 / 60 / 60 / 24).toString();
      unit = 'day'
    }
    return ms + ' ' + unit;
  }


  query(request: DataQueryRequest<NeoQuery>): Observable<DataQueryResponse> {
    const results: Array<Observable<DataQueryResponse>> = [];
    const targets: NeoQuery[] = [];

    let queryStmt = '';
    let maxDataPoints = 5000;
    const rangeFrom: string = (request.range.from.valueOf() * 1000000).toString(10);
    const rangeTo: string = (request.range.to.valueOf() * 1000000).toString(10);
    const intervalMs: string = this.convertToMachbaseIntervalMs(request.intervalMs);
    const interval: string = this.convertToMachbaseInterval(request.interval);
    
    if (request.maxDataPoints) {
      maxDataPoints = request.maxDataPoints;
    }
    
    for (const target of request.targets) {
      let subQueryFlag = false;
      let isRollup = target.rollupTable;
      let customTitle = '';

      // query var
      let selectQuery = '';
      let rollupTimeQuery = '';
      let timeQuery = '';
      let andQuery = '';
      let groupByQuery = '';
      let orderByQuery = '';
      let limitQuery = '';
      let baseQuery = '';
      let resultQuery = '';

      const andQueryList: string[] = [];

      // 하루 이상일 경우 subquery 사용
      if (request.intervalMs >= 60 * 60 * 24 * 1000) {
        subQueryFlag = true;
      }

      if (target.hide) {
        continue;
      }

      // check Time Column exists
      if (!target.timeField || target.timeField === '') {
        continue;
      }

      // setting title
      customTitle = target.title ? '\''+target.title+'\'' : '';
      if (target.valueType === 'select') { 
        customTitle = 'VALUE';
      }

      // check raw data for aggr
      if (checkValueBracket(target.valueField!) && target.valueType === 'input') {
        selectQuery = ' ' + target.valueField;
        if (customTitle !== '') {
          selectQuery += ' AS ' + customTitle;
        }
        groupByQuery = 'GROUP BY TIME';
      } else if (target.aggrFunc !== '' && target.aggrFunc !== 'none') {
        if (target.aggrFunc === 'count(*)') {
          selectQuery = ' ' + target.aggrFunc + ' AS VALUE ';
        } else if (target.aggrFunc === 'first' || target.aggrFunc === 'last') {
          selectQuery = ' ' + target.aggrFunc + '('+ target.timeField + ',' + target.valueField + ') AS VALUE ';
        } else {
          selectQuery = ' ' + target.aggrFunc + '(' + target.valueField + ') ';
          if (customTitle !== '') {
            selectQuery += ' AS ' + customTitle;
          }
        }
        groupByQuery = 'GROUP BY TIME';
      } else {
        selectQuery = ' ' + target.valueField;
        if (customTitle !== '') {
          selectQuery += ' AS ' + customTitle;
        }
        rollupTimeQuery = target.timeField + ' AS TIME ';
      }

      // time이 존재
      if (target.timeField !== '') {
        if (intervalMs.split(' ')[1] === 'msec' || groupByQuery === '') {
          isRollup = false;
        }
        // 롤업 사용되는 경우?
        if (isRollup) {
          if (subQueryFlag) {
            if (target.aggrFunc?.toUpperCase() === 'AVG') {
              selectQuery = ' ' + target.aggrFunc + '(' + target.valueField + ') AS VALUE, SUM(' + target.valueField + ') AS SUMVAL, COUNT(' + target.valueField + ') AS CNTVAL'; 
            }
            rollupTimeQuery = target.timeField + ' ROLLUP ' + '1 hour' + ' AS TIME ';
          } else {
            rollupTimeQuery = target.timeField + ' ROLLUP ' + intervalMs + ' AS TIME ';
          }
          // 롤업 사용안되는 경우
        } else {
          if (subQueryFlag) {
            const nanoSec = request.intervalMs * 1000 * 1000;
            rollupTimeQuery = `${target.timeField} / ${nanoSec} * ${nanoSec} AS TIME`;
          } else {
            const intervalSplit = intervalMs.split(' ');
            rollupTimeQuery = 'DATE_TRUNC(\'' + intervalSplit[1] + '\', ' + target.timeField + ', ' + intervalSplit[0] + ') AS TIME ';
          }
        }
      }

      // time (where query)
      timeQuery = ' WHERE ' + target.timeField + ' BETWEEN FROM_TIMESTAMP(' + rangeFrom + ') AND FROM_TIMESTAMP(' + rangeTo + ') ';

      // filter (and query)
      if (target.filters) {
        target.filters.map((v) => {
          if (!v.isStr && (v.key === 'none' || v.value === '')) return;
          if (v.isStr && v.condition === '') return;
          if (!v.isStr) {
            let queryStr = '';
            if (v.op === 'in') {
              v.value = v.value.split(',').map((val) => {
                const trimVal = val.trim();
                return trimVal.startsWith('\'') ? trimVal : '\'' + trimVal + '\'';
              }).join(',');
              v.value = '(' + v.value + ')';
              queryStr = ' AND ' + v.key + ' ' + v.op + ' ' + v.value;
            } else {
              queryStr = ' AND ' + v.key + v.op;
              if (!this.isNumberType(parseInt(v.type)) && !v.value.startsWith('\'')) {
                queryStr += '\''+v.value+'\'';
              } else {
                queryStr += v.value;
              }
            }
            andQueryList.push(queryStr+' ');
          } else {
            andQueryList.push(' AND '+v.condition+' ');
          }
        })
        andQuery = andQueryList.join(' ');
      }

      // order by query
      orderByQuery = ' ORDER BY TIME ';
      
      // limit query
      if (groupByQuery === '' || request.maxDataPoints === 0) {
        limitQuery = 'LIMIT 5000';
      } else {
        limitQuery = 'LIMIT ' + request.maxDataPoints! * 2;
      }

      // base query
      baseQuery = rollupTimeQuery + ', ' + selectQuery + ' FROM ' + target.tableName + timeQuery + andQuery + groupByQuery;

      // query 완성 단계
      if (target.valueType === 'input') {
        resultQuery = 'SELECT ' + baseQuery + ' ' + orderByQuery + ' ' + limitQuery;
      } else {
        customTitle = '\'' + target.aggrFunc + '(' + target.valueField + ')' + '\'';
        // if (target.aggrFunc === 'count(*)') {
        //   customTitle = '\'' + target.aggrFunc + '\'';
        // }
        if (target.aggrFunc === 'none') {
          customTitle = '\'' + target.valueField + '\'';
        }
        if (target.tableType === 6 && target.aggrFunc !== 'none' && target.filters && target.filters.length > 0 && (target.filters[0].value !== '' && target.filters[0].key !== 'none') && !target.filters[0].isStr) {
          customTitle = '\"' + target.filters[0].value + '(' + target.aggrFunc + ')\"';
        }
        if (target.title !== '') customTitle = '\'' + target.title + '\'';
  
        if (isRollup && subQueryFlag) {
          const nanoSec = request.intervalMs * 1000 * 1000;
          if (target.aggrFunc === 'sum' || target.aggrFunc === 'sumsq' || target.aggrFunc === 'count') {
            resultQuery = `SELECT TIME / ${nanoSec} * ${nanoSec} AS TIME, SUM(VALUE) AS ${customTitle} FROM (SELECT ${baseQuery}) ${groupByQuery} ${orderByQuery} ${limitQuery}`
          } else if (target.aggrFunc === 'min' || target.aggrFunc === 'max') {
            resultQuery = `SELECT TIME / ${nanoSec} * ${nanoSec} AS TIME, ${target.aggrFunc}(VALUE) AS ${customTitle} FROM (SELECT ${baseQuery}) ${groupByQuery} ${orderByQuery} ${limitQuery}`
          } else if (target.aggrFunc === 'avg') {
            resultQuery = `SELECT TIME / ${nanoSec} * ${nanoSec} AS TIME, SUM(SUMVAL) / SUM(CNTVAL) AS ${customTitle} FROM (SELECT ${baseQuery}) ${groupByQuery} ${orderByQuery} ${limitQuery}`
          }
        } else {
          // SELECT TIME AS TIME, VALUE AS {{TITLE}} FROM ({{BASEQUERY}}) {{ORDERBY}} {{LIMIT}}
          resultQuery = 'SELECT TIME AS TIME, VALUE AS '+ customTitle + ' FROM (SELECT ' + baseQuery + ') ' + orderByQuery + ' ' + limitQuery;
        }
      }

      // console.log('result query ', resultQuery)

      // Interpolate variables. set default format to 'sqlstring'. use 'raw' in numeric var name (ex : ${servers:raw})
      target.queryText = getTemplateSrv().replace(resultQuery, request.scopedVars, 'sqlstring');
      targets.push(target);
    }

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

const checkValueBracket = (value: string) => {
  if (value.includes('(') && value.includes(')')) {
    return true;
  } else {
    return false;
  }
}