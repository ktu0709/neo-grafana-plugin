import { ColumnType } from '../types';

// function that converts interval numbers into a format that fits the database
export const convertToMachbaseIntervalMs = (intervalMs: number) => {
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
// Function to check if column type is numeric
export const isNumberType = (type: number) => {
    const colType = ColumnType.find(item => item.key === type);
    const Numbers = ['SHORT', 'INTEGER', 'LONG', 'FLOAT', 'DOUBLE', 'USHORT', 'UINTEGER', 'ULONG'];
    if (colType && Numbers.some((item) => item === colType.value)) {
        return true;
    } else {
        return false;
    }
}
// check table type (0 is log, 6 is tag)
export const isTagTable = (type: number) => {
    if (type === 6) {
        return true;
    } else if (type === 0) {
        return false;
    }
    return false;
}
// checking bracket in value
export const checkValueBracket = (value: string) => {
    if (value.includes('(') && value.includes(')')) {
        return true;
    } else {
        return false;
    }
}