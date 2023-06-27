import React, { ChangeEvent, useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import {
    IconButton,
    Select,
    InlineLabel,
    Input,
    // LegacyForms,
    Checkbox,
} from '@grafana/ui';

import { DataSource } from '../datasource';
import {
    NeoDataSourceOptions,
    NeoQuery,
    Filter,
    TagAggrOpsNameList,
    LogAggrOpsNameList,
    StringAggrOpsNameList,
    conditionList,
} from '../types';
import { isNumberType, isTagTable } from '../utils/common';

type Props = QueryEditorProps<DataSource, NeoQuery, NeoDataSourceOptions>;

export const QueryEditor: React.FC<Props> = (props) => {
    const { onChange, onRunQuery, query, datasource } = props;
    const {
        aggrFunc,
        tableName,
        rollupTable,
        valueField,
        valueType,
        timeField,
        title,
    } = query;

    const [isAggr, setIsAggr] = useState<boolean>(valueType === 'select' ? false : true);
    const [isRollup, setIsRollup] = useState<boolean>(true);
    const [showRollup, setShowRollup] = useState<boolean>(true);  // show rollup checkbox ui
    const [columnType, setColumnType] = useState<number>(0);
    const [tableNameList, setTableNameList] = useState([]);
    const [columnNameList, setColumnNameList] = useState([]);
    const [filterList, setFilterList] = useState<Filter[]>([
        { key: 'none', type: '', value: '', op: '=', condition: '', isStr: false }
    ])

    useEffect(() => {
        getTables();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        onChange({ ...query, filters: filterList })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterList])

    const onInitTable = (reFresh?: boolean) => {
        onChange({ ...query });
        if (reFresh) {
            onRunQuery();
        }
    }
    const onChangeValueField = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({
            ...query,
            valueField: event.target.value,
        })
    }
    const onChangeValueFieldWithAggr = (aSelected: { label: string, value: string, type: number }) => {
        onChange({ ...query, valueField: aSelected.value, aggrFunc: 'none' });
        setColumnType(aSelected.type);
    }
    const onChangeTimeField = (aSelected: { label: string, value: string }) => {
        onChange({ ...query, timeField: aSelected.value})
    }
    const onChangeRollup = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...query, rollupTable: event.target.checked })
        setIsRollup(event.target.checked);
    }
    const onChangeTitle = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...query, title: event.target.value })   
    }
    const onTableNameChange = (event: any) => {
        getColumns(event.value, event.type);
        if (query.filters) {
            if (query.filters[0].value === '') {
                setFilterList([
                    { key: 'none', type: '', value: '', op: '=', condition: '', isStr: false }
                ])
            } else {
                setFilterList(query.filters)
            }
        }
        setIsRollup(isTagTable(event.type));
        setShowRollup(isTagTable(event.type))
        // onRunQuery();
    };
    const onAggrFuncChange = (aAggr: { label: string, value: string }) => {
        onChange({ ...query, aggrFunc: aAggr.value });
    };

    const getTables = async () => {
        const result = await datasource.getTablesQuery(query);
        let transData: any = [];
        if (result.length > 0) {
            result.forEach((item: any) => {
                if (item.name === 'name') {
                    item.values.buffer.forEach((name: string, index: number) => {
                        if (!transData[index]) {
                            transData[index] = {};
                        }
                        transData[index].label = name;
                        transData[index].value = name;
                    });
                } else if (item.name === 'type') {
                    item.values.buffer.forEach((type: string, index: number) => {
                        if (!transData[index]) {
                            transData[index] = {};
                        }
                        transData[index].type = type;
                    });
                }
            });
            setTableNameList(transData);
        }
        // Set table settings back to them if they exist
        if (query.tableName !== '') {
            onTableNameChange(transData.find((v: any) => v.value === query.tableName))
        }
    }
    const getColumns = async (tableName: string, type: number) => {
        const newQuery = { ...query, tableName: tableName }
        const sameTable: boolean = tableName === query.tableName;
        const result = await datasource.getColumnsQuery(newQuery, type);
        let transData: any = [];
        if (result.length > 0) {
            result.forEach((item: any) => {
                if (item.name === 'name') {
                    item.values.buffer.forEach((name: string, index: number) => {
                        if (!transData[index]) {
                            transData[index] = {};
                        }
                        transData[index].label = name;
                        transData[index].value = name;
                    });
                } else if (item.name === 'type') {
                    item.values.buffer.forEach((type: string, index: number) => {
                        if (!transData[index]) {
                            transData[index] = {};
                        }
                        transData[index].type = type;
                    });
                } else if (item.name === 'length') {
                    item.values.buffer.forEach((length: string, index: number) => {
                        if (!transData[index]) {
                            transData[index] = {};
                        }
                        transData[index].leng = length;
                    });
                }
            });
            
            // query value init
            const numberColumn = sameTable && query.valueField ? transData.find((v: any) => v.value === query.valueField) : transData.find((v: any) => isNumberType(v.type));
            transData.unshift({
                label: 'none',
                value: 'none',
                type: 0,
                leng: 0,
            })
            setColumnNameList(transData);
            const isDateType = transData.filter((v: any) => v.type === 6).length > 0;
            onChange({
                ...query,
                tableName: tableName,
                tableType: type,
                valueField: numberColumn.value,
                timeField: sameTable && query.timeField ? query.timeField : isDateType ? transData.filter((v: any) => v.type === 6)[0].value : null,
                aggrFunc: sameTable && query.aggrFunc ? query.aggrFunc : 'avg',
                rollupTable: isTagTable(type) ? true : false,
                title: query.title ?? '',
            })
            setColumnType(numberColumn.type)

            if (!(query.filters && (query.filters[0].value !== '' || query.filters[0].condition !== ''))) {
                if (isTagTable(type)) {
                    const tempList = filterList;
                    // init to columns of varchar type
                    const isVarcharType = transData.filter((v: any) => v.type === 5).length > 0;
                    if (isVarcharType) {
                        tempList[0].key = transData.filter((v: any) => v.type === 5)[0].value
                    }
                    setFilterList(tempList)
                }
            }
        }
    }

    const toggleIsAggr = (aggr: boolean) => {
        if (aggr) {
            onChange({ ...query, aggrFunc: '', valueType: 'input' });
        } else {
            onChange({ ...query, aggrFunc: '', valueType: 'select' });
        }
        setIsAggr(aggr)
    }

    // function is create AND query ui
    const createFilterSection = () => {
        const addFilter = () => {
            setFilterList((prev) => [...prev, {
                key: 'none',
                type: '',
                value: '',
                op: '=',
                condition: '',
                isStr: false,
            }])
        }
        const deleteFilter = (index: number) => {
            if (filterList.length > 1) {
                setFilterList(filterList.filter((_, i) => i !== index))
            } else {
                setFilterList([{ key: 'none', type: '', value: '', op: '=', condition: '', isStr: filterList[0].isStr }])
            };
        }

        const onChangeKey = (v: any, index: number) => {
            const newList = [...filterList];
            newList[index] = {
                ...newList[index],
                key: v.value,
                type: v.type,
            }
            setFilterList(newList);
        }
        const onChangeValue = (event: ChangeEvent<HTMLInputElement>, index: number) => {
            const newList = [...filterList];
            newList[index] = {
                ...newList[index],
                value: event.target.value,
            }
            setFilterList(newList);
        }
        const onChangeOperator = (v: any, index: number) => {
            const newList = [...filterList];
            newList[index] = {
                ...newList[index],
                op: v.value,
            }
            setFilterList(newList);
        }
        const onChangeCondition = (event: ChangeEvent<HTMLInputElement>, index: number) => {
            const newList = [...filterList];
            newList[index] = {
                ...newList[index],
                condition: event.target.value,
            }
            setFilterList(newList);
        }
        const toggleIsStr = (index: number) => {
            const newList = [...filterList];
            newList[index] = {
                ...newList[index],
                isStr: !newList[index].isStr,
            }
            setFilterList(newList);
        }

        return filterList.map((v, index) => (
            <div key={v.key+index} className="gf-form" style={{ display: 'flex', alignItems: 'center' }}>
                <InlineLabel width={12}>
                    <span>{ index === 0 ? 'Filter' : 'AND' }</span>
                    {index === 0 ? <IconButton className='plus' name={'plus'} onClick={addFilter} /> : null}
                </InlineLabel>
                <div style={{width: 27.5 * 8, marginRight: 5, display: v.isStr ? 'none' : ''}}>
                    <Select width={27.5} value={filterList[index].key} options={columnNameList} onChange={(v: any) => onChangeKey(v, index)} />
                </div>
                <div style={{width: 12 * 8, marginRight: 5, display: v.isStr ? 'none' : ''}}>
                    <Select width={12} value={filterList[index].op} options={conditionList} onChange={(v: any) => onChangeOperator(v, index)} />
                </div>
                <div style={{width: 50 * 8, marginRight: 5, display: v.isStr ? 'none' : ''}}>
                    <Input width={50} value={filterList[index].value} onChange={(v: any) => onChangeValue(v, index)} />
                </div>
                <div style={{width: 90.75 * 8, marginRight: 5, display: !v.isStr ? 'none' : ''}}>
                    <Input width={90.75} value={filterList[index].condition} onChange={(v: any) => onChangeCondition(v, index)} />
                </div>
                <InlineLabel width={4}>
                    <IconButton className='exchange-alt' name={'exchange-alt'} onClick={() => toggleIsStr(index)} />
                </InlineLabel>
                <InlineLabel width={4}>
                    <IconButton className='times' name={'times'} onClick={() => deleteFilter(index)} />
                </InlineLabel>
            </div>
        ))
    }

    return (
        <div className="gf-form-group">
            <div className="gf-form">
                {/* from 구문 */}
                <InlineLabel width={12}>
                    <span>Table</span>
                </InlineLabel>
                <div style={{width: 35.5 * 8, marginRight: 5}}>
                    <Select width={35.5} value={tableName} options={tableNameList} onChange={onTableNameChange} />
                </div>
                <InlineLabel width={4}>
                    <IconButton className='sync' name={'sync'} onClick={ () => onInitTable(true)} />
                </InlineLabel>

                {/* title */}
                <InlineLabel width={12}>
                    <span>Title</span>
                </InlineLabel>
                <div style={{width: 32.5 * 8, marginRight: 5}}>
                    <Input width={32.5} value={title} onChange={onChangeTitle} />
                </div>
            </div>
            <div className="gf-form" style={{ display: 'flex', alignItems: 'center' }}>
                {/* select 구문 */}
                {
                    !isAggr ? 
                        <>
                            <InlineLabel width={12}>
                                <span>Value</span>
                            </InlineLabel>
                            <div style={{width: 40 * 8, marginRight: 5}}>
                                <Select width={40} value={valueField} options={columnNameList.filter((v: any) => v.label !== 'none')} onChange={(v: any) => onChangeValueFieldWithAggr(v)} />
                            </div>
                            <InlineLabel width={12}>
                                <span>Aggregator</span>
                            </InlineLabel>
                            <div style={{width: 28 * 8, marginRight: 5}}>
                                <Select width={28} value={aggrFunc} options={
                                    isNumberType(columnType) ? isRollup ? TagAggrOpsNameList : LogAggrOpsNameList : StringAggrOpsNameList
                                } onChange={(v: any) => onAggrFuncChange(v)} />
                            </div>
                        </>
                        :
                        <>
                            <InlineLabel width={12}>
                                <span>Value</span>
                            </InlineLabel>
                            <div style={{width: 81.10 * 8, marginRight: 5}}>
                                <Input width={81.10} value={valueField} onChange={onChangeValueField} />
                            </div>
                        </>
                }
                <InlineLabel width={4}>
                    <IconButton className='exchange-alt' name={'exchange-alt'} onClick={() => toggleIsAggr(!isAggr)} />
                </InlineLabel>
            </div>

            {/* time field */}
            <div className="gf-form" style={{ display: 'flex', alignItems: 'center' }}>
                <InlineLabel width={12}>
                    <span>TimeField</span>
                </InlineLabel>
                <div style={{width: 40 * 8, marginRight: 5}}>
                    <Select width={40} value={timeField} options={columnNameList.filter((column: any) => column.type === 6)} onChange={(v: any) => onChangeTimeField(v)} />
                </div>
                <div style={{ display: showRollup ? '' : 'none'}}>
                    <Checkbox value={rollupTable} label={'use rollup'} onChange={onChangeRollup} />
                </div>
            </div>

            {/* filter */}
            {createFilterSection()}
      </div>
    )
}
