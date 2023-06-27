import { DataQueryRequest } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import { NeoQuery } from '../types';
import { convertToMachbaseIntervalMs, isNumberType, checkValueBracket } from './common'

export const createQuery = (request: DataQueryRequest<NeoQuery>, targets: NeoQuery[]) => {
    const rangeFrom: string = (request.range.from.valueOf() * 1000000).toString(10);
    const rangeTo: string = (request.range.to.valueOf() * 1000000).toString(10);
    const intervalMs: string = convertToMachbaseIntervalMs(request.intervalMs);

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

        // Use subquery if more than one day
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

        // existed time field
        if (target.timeField !== '') {
            if (intervalMs.split(' ')[1] === 'msec' || groupByQuery === '') {
                isRollup = false;
            }
            // use rollup
            if (isRollup) {
                if (subQueryFlag) {
                    if (target.aggrFunc?.toUpperCase() === 'AVG') {
                    selectQuery = ' ' + target.aggrFunc + '(' + target.valueField + ') AS VALUE, SUM(' + target.valueField + ') AS SUMVAL, COUNT(' + target.valueField + ') AS CNTVAL'; 
                    }
                    rollupTimeQuery = target.timeField + ' ROLLUP ' + '1 hour' + ' AS TIME ';
                } else {
                    rollupTimeQuery = target.timeField + ' ROLLUP ' + intervalMs + ' AS TIME ';
                }
            // not use rollup
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

        // create time (where query)
        timeQuery = ' WHERE ' + target.timeField + ' BETWEEN FROM_TIMESTAMP(' + rangeFrom + ') AND FROM_TIMESTAMP(' + rangeTo + ') ';

        // create filter (and query)
        if (target.filters) {
            target.filters.map((v) => {
                if (!v.isStr && (v.key === 'none' || v.value === '')) {
                    return;
                }
                if (v.isStr && v.condition === '') {
                    return;
                }
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
                        if (!isNumberType(parseInt(v.type, 10)) && !v.value.startsWith('\'')) {
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

        // result query
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
            if (target.title !== '') {
                customTitle = '\'' + target.title + '\'';
            }
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
    return targets
}
