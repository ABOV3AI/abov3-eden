/**
 * Analytics Tools - Data processing, CSV, statistics, and templating
 * Provides tools for data manipulation and analysis
 */

import type { Tool } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';

// Lazy load dependencies
let csvParse: any = null;
let csvStringify: any = null;
let Handlebars: any = null;

async function getCsvParse() {
  if (!csvParse) {
    const mod = await import('csv-parse/sync');
    csvParse = mod.parse;
  }
  return csvParse;
}

async function getCsvStringify() {
  if (!csvStringify) {
    const mod = await import('csv-stringify/sync');
    csvStringify = mod.stringify;
  }
  return csvStringify;
}

async function getHandlebars() {
  if (!Handlebars) {
    Handlebars = (await import('handlebars')).default;
  }
  return Handlebars!;
}

/**
 * Calculate basic statistics for an array of numbers
 */
function calculateStatistics(values: number[]): {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number[];
  min: number;
  max: number;
  range: number;
  variance: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
} {
  if (values.length === 0) {
    throw new Error('Cannot calculate statistics on empty array');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  // Median
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

  // Mode
  const frequency: Record<number, number> = {};
  let maxFreq = 0;
  for (const v of sorted) {
    frequency[v] = (frequency[v] || 0) + 1;
    maxFreq = Math.max(maxFreq, frequency[v]);
  }
  const mode = Object.entries(frequency)
    .filter(([_, freq]) => freq === maxFreq)
    .map(([val]) => Number(val));

  // Min, Max, Range
  const min = sorted[0];
  const max = sorted[count - 1];
  const range = max - min;

  // Variance and Standard Deviation
  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  // Quartiles
  const q1Index = Math.floor(count * 0.25);
  const q3Index = Math.floor(count * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  return {
    count, sum, mean, median, mode, min, max, range, variance, stdDev, q1, q3, iqr
  };
}

/**
 * Get value from object by path (e.g., "user.name")
 */
function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

/**
 * Set value in object by path
 */
function setByPath(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  const last = parts.pop()!;
  const target = parts.reduce((acc, part) => {
    if (acc[part] === undefined) acc[part] = {};
    return acc[part];
  }, obj);
  target[last] = value;
}

/**
 * Evaluate a simple condition
 */
function evaluateCondition(item: any, field: string, operator: string, value: any): boolean {
  const fieldValue = getByPath(item, field);

  switch (operator) {
    case '=':
    case '==':
    case 'eq':
      return fieldValue == value;
    case '===':
      return fieldValue === value;
    case '!=':
    case 'ne':
      return fieldValue != value;
    case '>':
    case 'gt':
      return fieldValue > value;
    case '>=':
    case 'gte':
      return fieldValue >= value;
    case '<':
    case 'lt':
      return fieldValue < value;
    case '<=':
    case 'lte':
      return fieldValue <= value;
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'startsWith':
      return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
    case 'endsWith':
      return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
    case 'matches':
      return new RegExp(value).test(String(fieldValue));
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    default:
      return false;
  }
}

export const analyticsTools: Tool[] = [
  {
    name: 'csv_parse',
    description: 'Parse CSV file or string to JSON array with configurable options',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to CSV file or CSV string content',
        },
        isFile: {
          type: 'boolean',
          description: 'Whether input is a file path (true) or string content (false). Default: true',
        },
        delimiter: {
          type: 'string',
          description: 'Column delimiter. Default: ","',
        },
        headers: {
          type: 'boolean',
          description: 'First row contains headers. Default: true',
        },
        skipEmpty: {
          type: 'boolean',
          description: 'Skip empty lines. Default: true',
        },
        trim: {
          type: 'boolean',
          description: 'Trim whitespace from values. Default: true',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom column names (overrides headers)',
        },
      },
      required: ['input'],
    },
    handler: async ({ input, isFile = true, delimiter = ',', headers = true, skipEmpty = true, trim = true, columns }) => {
      try {
        const parse = await getCsvParse();

        let csvContent = input;
        if (isFile) {
          const filePath = path.resolve(input);
          csvContent = await fs.readFile(filePath, 'utf-8');
        }

        const records = parse(csvContent, {
          delimiter,
          columns: columns || headers,
          skip_empty_lines: skipEmpty,
          trim,
          relax_column_count: true,
        });

        return {
          success: true,
          records,
          count: records.length,
          columns: records.length > 0 ? Object.keys(records[0]) : [],
        };
      } catch (error) {
        return { error: `Failed to parse CSV: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'csv_create',
    description: 'Create CSV file or string from JSON array',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects to convert to CSV',
        },
        output: {
          type: 'string',
          description: 'Output file path. If not provided, returns CSV string',
        },
        delimiter: {
          type: 'string',
          description: 'Column delimiter. Default: ","',
        },
        headers: {
          type: 'boolean',
          description: 'Include header row. Default: true',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Columns to include (in order). Default: all columns',
        },
      },
      required: ['data'],
    },
    handler: async ({ data, output, delimiter = ',', headers = true, columns }) => {
      try {
        const stringify = await getCsvStringify();

        const csvContent = stringify(data, {
          header: headers,
          delimiter,
          columns: columns,
        });

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, csvContent);
          return {
            success: true,
            output: outputPath,
            rows: data.length,
          };
        }

        return {
          success: true,
          csv: csvContent,
          rows: data.length,
        };
      } catch (error) {
        return { error: `Failed to create CSV: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'data_transform',
    description: 'Transform/map data array by applying transformations to fields',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects to transform',
        },
        transformations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'Source field path' },
              target: { type: 'string', description: 'Target field path' },
              operation: {
                type: 'string',
                enum: ['copy', 'rename', 'uppercase', 'lowercase', 'trim', 'toNumber', 'toString', 'toDate', 'concat', 'split', 'replace', 'default'],
                description: 'Transformation operation',
              },
              params: { type: 'object', description: 'Operation parameters' },
            },
          },
          description: 'Array of transformations to apply',
        },
        keepOther: {
          type: 'boolean',
          description: 'Keep fields not mentioned in transformations. Default: true',
        },
      },
      required: ['data', 'transformations'],
    },
    handler: async ({ data, transformations, keepOther = true }) => {
      try {
        const result = data.map((item: any) => {
          const newItem = keepOther ? { ...item } : {};

          for (const transform of transformations) {
            const sourceValue = getByPath(item, transform.source);
            const target = transform.target || transform.source;
            let newValue = sourceValue;

            switch (transform.operation) {
              case 'copy':
              case 'rename':
                newValue = sourceValue;
                break;
              case 'uppercase':
                newValue = String(sourceValue).toUpperCase();
                break;
              case 'lowercase':
                newValue = String(sourceValue).toLowerCase();
                break;
              case 'trim':
                newValue = String(sourceValue).trim();
                break;
              case 'toNumber':
                newValue = parseFloat(sourceValue) || 0;
                break;
              case 'toString':
                newValue = String(sourceValue);
                break;
              case 'toDate':
                newValue = new Date(sourceValue).toISOString();
                break;
              case 'concat':
                const fields = transform.params?.fields || [];
                const sep = transform.params?.separator || '';
                newValue = fields.map((f: string) => getByPath(item, f)).join(sep);
                break;
              case 'split':
                const delimiter = transform.params?.delimiter || ',';
                newValue = String(sourceValue).split(delimiter);
                break;
              case 'replace':
                const pattern = transform.params?.pattern || '';
                const replacement = transform.params?.replacement || '';
                newValue = String(sourceValue).replace(new RegExp(pattern, 'g'), replacement);
                break;
              case 'default':
                newValue = sourceValue ?? transform.params?.value;
                break;
            }

            setByPath(newItem, target, newValue);

            // Remove source if renamed
            if (transform.operation === 'rename' && transform.source !== target) {
              delete newItem[transform.source];
            }
          }

          return newItem;
        });

        return {
          success: true,
          data: result,
          count: result.length,
        };
      } catch (error) {
        return { error: `Failed to transform data: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'data_filter',
    description: 'Filter data array by conditions',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects to filter',
        },
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Field path to check' },
              operator: {
                type: 'string',
                enum: ['=', '==', '===', '!=', '>', '>=', '<', '<=', 'contains', 'startsWith', 'endsWith', 'matches', 'in', 'exists'],
                description: 'Comparison operator',
              },
              value: { type: 'string', description: 'Value to compare against (can be any type)' },
            },
          },
          description: 'Filter conditions (all must match - AND logic)',
        },
        logic: {
          type: 'string',
          enum: ['and', 'or'],
          description: 'How to combine conditions. Default: and',
        },
      },
      required: ['data', 'conditions'],
    },
    handler: async ({ data, conditions, logic = 'and' }) => {
      try {
        const result = data.filter((item: any) => {
          if (logic === 'and') {
            return conditions.every((cond: any) =>
              evaluateCondition(item, cond.field, cond.operator, cond.value)
            );
          } else {
            return conditions.some((cond: any) =>
              evaluateCondition(item, cond.field, cond.operator, cond.value)
            );
          }
        });

        return {
          success: true,
          data: result,
          count: result.length,
          totalInput: data.length,
          filtered: data.length - result.length,
        };
      } catch (error) {
        return { error: `Failed to filter data: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'data_aggregate',
    description: 'Aggregate/group data with operations like sum, avg, count, min, max',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects to aggregate',
        },
        groupBy: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to group by. If empty, aggregates all data',
        },
        aggregations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Field to aggregate' },
              operation: {
                type: 'string',
                enum: ['sum', 'avg', 'count', 'min', 'max', 'first', 'last', 'concat'],
                description: 'Aggregation operation',
              },
              alias: { type: 'string', description: 'Output field name' },
            },
          },
          description: 'Aggregation operations to perform',
        },
      },
      required: ['data', 'aggregations'],
    },
    handler: async ({ data, groupBy = [], aggregations }) => {
      try {
        // Group data
        const groups: Record<string, any[]> = {};

        for (const item of data) {
          const key = groupBy.length > 0
            ? groupBy.map(f => getByPath(item, f)).join('|||')
            : '__all__';

          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
        }

        // Aggregate each group
        const result = Object.entries(groups).map(([key, items]) => {
          const row: any = {};

          // Add group by fields
          if (groupBy.length > 0) {
            const keyParts = key.split('|||');
            groupBy.forEach((field, idx) => {
              row[field] = keyParts[idx];
            });
          }

          // Perform aggregations
          for (const agg of aggregations) {
            const values = items.map((item: any) => getByPath(item, agg.field));
            const numValues = values.map(Number).filter(v => !isNaN(v));
            const alias = agg.alias || `${agg.operation}_${agg.field}`;

            switch (agg.operation) {
              case 'sum':
                row[alias] = numValues.reduce((a, b) => a + b, 0);
                break;
              case 'avg':
                row[alias] = numValues.length > 0
                  ? numValues.reduce((a, b) => a + b, 0) / numValues.length
                  : 0;
                break;
              case 'count':
                row[alias] = items.length;
                break;
              case 'min':
                row[alias] = numValues.length > 0 ? Math.min(...numValues) : null;
                break;
              case 'max':
                row[alias] = numValues.length > 0 ? Math.max(...numValues) : null;
                break;
              case 'first':
                row[alias] = values[0];
                break;
              case 'last':
                row[alias] = values[values.length - 1];
                break;
              case 'concat':
                row[alias] = values.join(', ');
                break;
            }
          }

          return row;
        });

        return {
          success: true,
          data: result,
          groups: Object.keys(groups).length,
        };
      } catch (error) {
        return { error: `Failed to aggregate data: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'data_sort',
    description: 'Sort data array by one or more fields',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects to sort',
        },
        sortBy: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Field to sort by' },
              order: {
                type: 'string',
                enum: ['asc', 'desc'],
                description: 'Sort order. Default: asc',
              },
              type: {
                type: 'string',
                enum: ['string', 'number', 'date'],
                description: 'Value type for comparison. Default: auto-detect',
              },
            },
          },
          description: 'Sort criteria (in priority order)',
        },
      },
      required: ['data', 'sortBy'],
    },
    handler: async ({ data, sortBy }) => {
      try {
        const result = [...data].sort((a, b) => {
          for (const sort of sortBy) {
            let aVal = getByPath(a, sort.field);
            let bVal = getByPath(b, sort.field);
            const order = sort.order === 'desc' ? -1 : 1;

            // Type conversion
            if (sort.type === 'number') {
              aVal = Number(aVal) || 0;
              bVal = Number(bVal) || 0;
            } else if (sort.type === 'date') {
              aVal = new Date(aVal).getTime();
              bVal = new Date(bVal).getTime();
            } else if (typeof aVal === 'string' && typeof bVal === 'string') {
              // String comparison (case-insensitive)
              aVal = aVal.toLowerCase();
              bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return -1 * order;
            if (aVal > bVal) return 1 * order;
          }
          return 0;
        });

        return {
          success: true,
          data: result,
          count: result.length,
        };
      } catch (error) {
        return { error: `Failed to sort data: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'data_join',
    description: 'Join two datasets on a common field (like SQL JOIN)',
    inputSchema: {
      type: 'object',
      properties: {
        left: {
          type: 'array',
          items: { type: 'object' },
          description: 'Left dataset',
        },
        right: {
          type: 'array',
          items: { type: 'object' },
          description: 'Right dataset',
        },
        leftKey: {
          type: 'string',
          description: 'Join key field in left dataset',
        },
        rightKey: {
          type: 'string',
          description: 'Join key field in right dataset',
        },
        type: {
          type: 'string',
          enum: ['inner', 'left', 'right', 'full'],
          description: 'Join type. Default: inner',
        },
        prefix: {
          type: 'object',
          properties: {
            left: { type: 'string' },
            right: { type: 'string' },
          },
          description: 'Prefix for conflicting field names',
        },
      },
      required: ['left', 'right', 'leftKey', 'rightKey'],
    },
    handler: async ({ left, right, leftKey, rightKey, type = 'inner', prefix }) => {
      try {
        // Index right by key
        const rightIndex: Record<string, any[]> = {};
        for (const item of right) {
          const key = String(getByPath(item, rightKey));
          if (!rightIndex[key]) rightIndex[key] = [];
          rightIndex[key].push(item);
        }

        const result: any[] = [];
        const leftMatched = new Set<string>();

        // Process left side
        for (const leftItem of left) {
          const key = String(getByPath(leftItem, leftKey));
          const rightMatches = rightIndex[key] || [];
          leftMatched.add(key);

          if (rightMatches.length > 0) {
            for (const rightItem of rightMatches) {
              const merged = { ...leftItem };
              for (const [k, v] of Object.entries(rightItem)) {
                if (k in merged && prefix?.right) {
                  merged[prefix.right + k] = v;
                } else if (k in merged && prefix?.left) {
                  merged[prefix.left + k] = merged[k];
                  merged[k] = v;
                } else {
                  merged[k] = v;
                }
              }
              result.push(merged);
            }
          } else if (type === 'left' || type === 'full') {
            result.push({ ...leftItem });
          }
        }

        // Add unmatched right items for right/full join
        if (type === 'right' || type === 'full') {
          for (const rightItem of right) {
            const key = String(getByPath(rightItem, rightKey));
            if (!leftMatched.has(key)) {
              result.push({ ...rightItem });
            }
          }
        }

        return {
          success: true,
          data: result,
          count: result.length,
          leftCount: left.length,
          rightCount: right.length,
        };
      } catch (error) {
        return { error: `Failed to join data: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'data_pivot',
    description: 'Create a pivot table from data',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects to pivot',
        },
        rowField: {
          type: 'string',
          description: 'Field for row grouping',
        },
        columnField: {
          type: 'string',
          description: 'Field for column headers',
        },
        valueField: {
          type: 'string',
          description: 'Field to aggregate',
        },
        aggregation: {
          type: 'string',
          enum: ['sum', 'avg', 'count', 'min', 'max'],
          description: 'Aggregation function. Default: sum',
        },
      },
      required: ['data', 'rowField', 'columnField', 'valueField'],
    },
    handler: async ({ data, rowField, columnField, valueField, aggregation = 'sum' }) => {
      try {
        // Find unique column values
        const columnValues = [...new Set(data.map((item: any) => getByPath(item, columnField)))];

        // Group by row
        const rowGroups: Record<string, Record<string, number[]>> = {};

        for (const item of data) {
          const rowKey = String(getByPath(item, rowField));
          const colKey = String(getByPath(item, columnField));
          const value = Number(getByPath(item, valueField)) || 0;

          if (!rowGroups[rowKey]) rowGroups[rowKey] = {};
          if (!rowGroups[rowKey][colKey]) rowGroups[rowKey][colKey] = [];
          rowGroups[rowKey][colKey].push(value);
        }

        // Aggregate and build pivot table
        const result = Object.entries(rowGroups).map(([rowKey, columns]) => {
          const row: any = { [rowField]: rowKey };

          for (const colKey of columnValues) {
            const values = columns[String(colKey)] || [];

            if (values.length === 0) {
              row[String(colKey)] = null;
              continue;
            }

            switch (aggregation) {
              case 'sum':
                row[String(colKey)] = values.reduce((a, b) => a + b, 0);
                break;
              case 'avg':
                row[String(colKey)] = values.reduce((a, b) => a + b, 0) / values.length;
                break;
              case 'count':
                row[String(colKey)] = values.length;
                break;
              case 'min':
                row[String(colKey)] = Math.min(...values);
                break;
              case 'max':
                row[String(colKey)] = Math.max(...values);
                break;
            }
          }

          return row;
        });

        return {
          success: true,
          data: result,
          rows: Object.keys(rowGroups).length,
          columns: columnValues,
        };
      } catch (error) {
        return { error: `Failed to create pivot table: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'statistics',
    description: 'Calculate statistical measures for numeric data',
    inputSchema: {
      type: 'object',
      properties: {
        values: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of numbers to analyze',
        },
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of objects (alternative to values)',
        },
        field: {
          type: 'string',
          description: 'Field to extract from data objects',
        },
      },
      required: [],
    },
    handler: async ({ values, data, field }) => {
      try {
        let nums: number[];

        if (values && Array.isArray(values)) {
          nums = values.filter(v => typeof v === 'number' && !isNaN(v));
        } else if (data && field) {
          nums = data
            .map((item: any) => Number(getByPath(item, field)))
            .filter(v => !isNaN(v));
        } else {
          return { error: 'Provide either values array or data array with field' };
        }

        if (nums.length === 0) {
          return { error: 'No valid numeric values found' };
        }

        const stats = calculateStatistics(nums);

        return {
          success: true,
          statistics: stats,
        };
      } catch (error) {
        return { error: `Failed to calculate statistics: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'regex_match',
    description: 'Match and extract text using regular expressions',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to search in',
        },
        pattern: {
          type: 'string',
          description: 'Regular expression pattern',
        },
        flags: {
          type: 'string',
          description: 'Regex flags (g, i, m, etc.). Default: "g"',
        },
        groups: {
          type: 'boolean',
          description: 'Extract named/numbered capture groups. Default: true',
        },
      },
      required: ['text', 'pattern'],
    },
    handler: async ({ text, pattern, flags = 'g', groups = true }) => {
      try {
        const regex = new RegExp(pattern, flags);
        const matches: any[] = [];

        if (flags.includes('g')) {
          let match;
          while ((match = regex.exec(text)) !== null) {
            if (groups && match.groups) {
              matches.push({
                match: match[0],
                index: match.index,
                groups: match.groups,
                captures: match.slice(1),
              });
            } else {
              matches.push({
                match: match[0],
                index: match.index,
                captures: match.slice(1),
              });
            }
          }
        } else {
          const match = regex.exec(text);
          if (match) {
            matches.push({
              match: match[0],
              index: match.index,
              groups: match.groups || undefined,
              captures: match.slice(1),
            });
          }
        }

        return {
          success: true,
          matches,
          count: matches.length,
          pattern,
        };
      } catch (error) {
        return { error: `Failed to match regex: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'regex_replace',
    description: 'Replace text using regular expressions',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to search and replace in',
        },
        pattern: {
          type: 'string',
          description: 'Regular expression pattern',
        },
        replacement: {
          type: 'string',
          description: 'Replacement string (supports $1, $2, etc. for captures)',
        },
        flags: {
          type: 'string',
          description: 'Regex flags (g, i, m, etc.). Default: "g"',
        },
      },
      required: ['text', 'pattern', 'replacement'],
    },
    handler: async ({ text, pattern, replacement, flags = 'g' }) => {
      try {
        const regex = new RegExp(pattern, flags);
        const result = text.replace(regex, replacement);

        return {
          success: true,
          result,
          original: text,
          pattern,
          replacement,
        };
      } catch (error) {
        return { error: `Failed to replace: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'template_render',
    description: 'Render a Handlebars template with data',
    inputSchema: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          description: 'Handlebars template string or file path',
        },
        isFile: {
          type: 'boolean',
          description: 'Whether template is a file path. Default: false',
        },
        data: {
          type: 'object',
          description: 'Data object to render with',
        },
        output: {
          type: 'string',
          description: 'Output file path. If not provided, returns rendered string',
        },
      },
      required: ['template', 'data'],
    },
    handler: async ({ template, isFile = false, data, output }) => {
      try {
        const hbs = await getHandlebars();

        let templateContent = template;
        if (isFile) {
          const filePath = path.resolve(template);
          templateContent = await fs.readFile(filePath, 'utf-8');
        }

        const compiled = hbs.compile(templateContent);
        const rendered = compiled(data);

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, rendered);
          return {
            success: true,
            output: outputPath,
            length: rendered.length,
          };
        }

        return {
          success: true,
          rendered,
          length: rendered.length,
        };
      } catch (error) {
        return { error: `Failed to render template: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];
