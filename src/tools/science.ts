/**
 * Science & Engineering Tools - Math, units, chemistry, physics
 * Provides tools for scientific calculations and conversions
 */

import type { Tool } from './index.js';

// Lazy load mathjs
let math: typeof import('mathjs') | null = null;

async function getMath() {
  if (!math) {
    math = await import('mathjs');
  }
  return math;
}

/**
 * Physical constants with their values and units
 */
const physicalConstants: Record<string, { value: number; unit: string; description: string }> = {
  c: { value: 299792458, unit: 'm/s', description: 'Speed of light in vacuum' },
  G: { value: 6.67430e-11, unit: 'm³/(kg·s²)', description: 'Gravitational constant' },
  h: { value: 6.62607015e-34, unit: 'J·s', description: 'Planck constant' },
  hbar: { value: 1.054571817e-34, unit: 'J·s', description: 'Reduced Planck constant' },
  e: { value: 1.602176634e-19, unit: 'C', description: 'Elementary charge' },
  me: { value: 9.1093837015e-31, unit: 'kg', description: 'Electron mass' },
  mp: { value: 1.67262192369e-27, unit: 'kg', description: 'Proton mass' },
  mn: { value: 1.67492749804e-27, unit: 'kg', description: 'Neutron mass' },
  NA: { value: 6.02214076e23, unit: '1/mol', description: 'Avogadro constant' },
  k: { value: 1.380649e-23, unit: 'J/K', description: 'Boltzmann constant' },
  R: { value: 8.314462618, unit: 'J/(mol·K)', description: 'Gas constant' },
  sigma: { value: 5.670374419e-8, unit: 'W/(m²·K⁴)', description: 'Stefan-Boltzmann constant' },
  epsilon0: { value: 8.8541878128e-12, unit: 'F/m', description: 'Vacuum permittivity' },
  mu0: { value: 1.25663706212e-6, unit: 'H/m', description: 'Vacuum permeability' },
  alpha: { value: 7.2973525693e-3, unit: '', description: 'Fine-structure constant' },
  atm: { value: 101325, unit: 'Pa', description: 'Standard atmosphere' },
  g: { value: 9.80665, unit: 'm/s²', description: 'Standard gravity' },
};

/**
 * Periodic table data (abbreviated)
 */
const periodicTable: Record<string, {
  name: string;
  number: number;
  symbol: string;
  mass: number;
  category: string;
  period: number;
  group: number;
  electronConfig: string;
}> = {
  H: { name: 'Hydrogen', number: 1, symbol: 'H', mass: 1.008, category: 'nonmetal', period: 1, group: 1, electronConfig: '1s¹' },
  He: { name: 'Helium', number: 2, symbol: 'He', mass: 4.0026, category: 'noble gas', period: 1, group: 18, electronConfig: '1s²' },
  Li: { name: 'Lithium', number: 3, symbol: 'Li', mass: 6.94, category: 'alkali metal', period: 2, group: 1, electronConfig: '[He] 2s¹' },
  Be: { name: 'Beryllium', number: 4, symbol: 'Be', mass: 9.0122, category: 'alkaline earth', period: 2, group: 2, electronConfig: '[He] 2s²' },
  B: { name: 'Boron', number: 5, symbol: 'B', mass: 10.81, category: 'metalloid', period: 2, group: 13, electronConfig: '[He] 2s² 2p¹' },
  C: { name: 'Carbon', number: 6, symbol: 'C', mass: 12.011, category: 'nonmetal', period: 2, group: 14, electronConfig: '[He] 2s² 2p²' },
  N: { name: 'Nitrogen', number: 7, symbol: 'N', mass: 14.007, category: 'nonmetal', period: 2, group: 15, electronConfig: '[He] 2s² 2p³' },
  O: { name: 'Oxygen', number: 8, symbol: 'O', mass: 15.999, category: 'nonmetal', period: 2, group: 16, electronConfig: '[He] 2s² 2p⁴' },
  F: { name: 'Fluorine', number: 9, symbol: 'F', mass: 18.998, category: 'halogen', period: 2, group: 17, electronConfig: '[He] 2s² 2p⁵' },
  Ne: { name: 'Neon', number: 10, symbol: 'Ne', mass: 20.180, category: 'noble gas', period: 2, group: 18, electronConfig: '[He] 2s² 2p⁶' },
  Na: { name: 'Sodium', number: 11, symbol: 'Na', mass: 22.990, category: 'alkali metal', period: 3, group: 1, electronConfig: '[Ne] 3s¹' },
  Mg: { name: 'Magnesium', number: 12, symbol: 'Mg', mass: 24.305, category: 'alkaline earth', period: 3, group: 2, electronConfig: '[Ne] 3s²' },
  Al: { name: 'Aluminum', number: 13, symbol: 'Al', mass: 26.982, category: 'post-transition metal', period: 3, group: 13, electronConfig: '[Ne] 3s² 3p¹' },
  Si: { name: 'Silicon', number: 14, symbol: 'Si', mass: 28.085, category: 'metalloid', period: 3, group: 14, electronConfig: '[Ne] 3s² 3p²' },
  P: { name: 'Phosphorus', number: 15, symbol: 'P', mass: 30.974, category: 'nonmetal', period: 3, group: 15, electronConfig: '[Ne] 3s² 3p³' },
  S: { name: 'Sulfur', number: 16, symbol: 'S', mass: 32.06, category: 'nonmetal', period: 3, group: 16, electronConfig: '[Ne] 3s² 3p⁴' },
  Cl: { name: 'Chlorine', number: 17, symbol: 'Cl', mass: 35.45, category: 'halogen', period: 3, group: 17, electronConfig: '[Ne] 3s² 3p⁵' },
  Ar: { name: 'Argon', number: 18, symbol: 'Ar', mass: 39.948, category: 'noble gas', period: 3, group: 18, electronConfig: '[Ne] 3s² 3p⁶' },
  K: { name: 'Potassium', number: 19, symbol: 'K', mass: 39.098, category: 'alkali metal', period: 4, group: 1, electronConfig: '[Ar] 4s¹' },
  Ca: { name: 'Calcium', number: 20, symbol: 'Ca', mass: 40.078, category: 'alkaline earth', period: 4, group: 2, electronConfig: '[Ar] 4s²' },
  Fe: { name: 'Iron', number: 26, symbol: 'Fe', mass: 55.845, category: 'transition metal', period: 4, group: 8, electronConfig: '[Ar] 3d⁶ 4s²' },
  Cu: { name: 'Copper', number: 29, symbol: 'Cu', mass: 63.546, category: 'transition metal', period: 4, group: 11, electronConfig: '[Ar] 3d¹⁰ 4s¹' },
  Zn: { name: 'Zinc', number: 30, symbol: 'Zn', mass: 65.38, category: 'transition metal', period: 4, group: 12, electronConfig: '[Ar] 3d¹⁰ 4s²' },
  Br: { name: 'Bromine', number: 35, symbol: 'Br', mass: 79.904, category: 'halogen', period: 4, group: 17, electronConfig: '[Ar] 3d¹⁰ 4s² 4p⁵' },
  Ag: { name: 'Silver', number: 47, symbol: 'Ag', mass: 107.87, category: 'transition metal', period: 5, group: 11, electronConfig: '[Kr] 4d¹⁰ 5s¹' },
  I: { name: 'Iodine', number: 53, symbol: 'I', mass: 126.90, category: 'halogen', period: 5, group: 17, electronConfig: '[Kr] 4d¹⁰ 5s² 5p⁵' },
  Au: { name: 'Gold', number: 79, symbol: 'Au', mass: 196.97, category: 'transition metal', period: 6, group: 11, electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s¹' },
  Pb: { name: 'Lead', number: 82, symbol: 'Pb', mass: 207.2, category: 'post-transition metal', period: 6, group: 14, electronConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²' },
  U: { name: 'Uranium', number: 92, symbol: 'U', mass: 238.03, category: 'actinide', period: 7, group: 3, electronConfig: '[Rn] 5f³ 6d¹ 7s²' },
};

/**
 * Unit conversion definitions
 */
const unitConversions: Record<string, Record<string, number | string>> = {
  length: {
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    um: 1e-6,
    nm: 1e-9,
    mi: 1609.344,
    yd: 0.9144,
    ft: 0.3048,
    in: 0.0254,
    nmi: 1852,
    ly: 9.461e15,
    au: 1.496e11,
  },
  mass: {
    kg: 1,
    g: 0.001,
    mg: 1e-6,
    ug: 1e-9,
    t: 1000,
    lb: 0.453592,
    oz: 0.0283495,
    st: 6.35029,
    ton: 907.185,
    tonne: 1000,
  },
  temperature: {
    K: 'special',
    C: 'special',
    F: 'special',
  },
  time: {
    s: 1,
    ms: 0.001,
    us: 1e-6,
    ns: 1e-9,
    min: 60,
    h: 3600,
    day: 86400,
    week: 604800,
    year: 31557600,
  },
  area: {
    m2: 1,
    km2: 1e6,
    cm2: 1e-4,
    mm2: 1e-6,
    ha: 10000,
    acre: 4046.86,
    ft2: 0.092903,
    in2: 0.00064516,
    mi2: 2.59e6,
  },
  volume: {
    m3: 1,
    L: 0.001,
    mL: 1e-6,
    cm3: 1e-6,
    gal: 0.00378541,
    qt: 0.000946353,
    pt: 0.000473176,
    fl_oz: 2.9574e-5,
    cup: 0.000236588,
    ft3: 0.0283168,
    in3: 1.6387e-5,
  },
  speed: {
    'm/s': 1,
    'km/h': 0.277778,
    'mi/h': 0.44704,
    'ft/s': 0.3048,
    knot: 0.514444,
    c: 299792458,
    mach: 343,
  },
  pressure: {
    Pa: 1,
    kPa: 1000,
    MPa: 1e6,
    bar: 100000,
    atm: 101325,
    psi: 6894.76,
    mmHg: 133.322,
    torr: 133.322,
  },
  energy: {
    J: 1,
    kJ: 1000,
    MJ: 1e6,
    cal: 4.184,
    kcal: 4184,
    Wh: 3600,
    kWh: 3.6e6,
    eV: 1.6022e-19,
    BTU: 1055.06,
  },
  power: {
    W: 1,
    kW: 1000,
    MW: 1e6,
    hp: 745.7,
    'BTU/h': 0.293071,
  },
  force: {
    N: 1,
    kN: 1000,
    lbf: 4.44822,
    dyn: 1e-5,
    kgf: 9.80665,
  },
  angle: {
    rad: 1,
    deg: Math.PI / 180,
    grad: Math.PI / 200,
    arcmin: Math.PI / 10800,
    arcsec: Math.PI / 648000,
    rev: 2 * Math.PI,
  },
  data: {
    bit: 1,
    byte: 8,
    KB: 8192,
    MB: 8388608,
    GB: 8589934592,
    TB: 8796093022208,
    Kib: 1024,
    Mib: 1048576,
    Gib: 1073741824,
  },
};

/**
 * Convert temperature between units
 */
function convertTemperature(value: number, from: string, to: string): number {
  // First convert to Kelvin
  let kelvin: number;
  switch (from.toUpperCase()) {
    case 'K':
      kelvin = value;
      break;
    case 'C':
      kelvin = value + 273.15;
      break;
    case 'F':
      kelvin = (value + 459.67) * 5 / 9;
      break;
    default:
      throw new Error(`Unknown temperature unit: ${from}`);
  }

  // Then convert from Kelvin to target
  switch (to.toUpperCase()) {
    case 'K':
      return kelvin;
    case 'C':
      return kelvin - 273.15;
    case 'F':
      return kelvin * 9 / 5 - 459.67;
    default:
      throw new Error(`Unknown temperature unit: ${to}`);
  }
}

/**
 * Parse chemical formula and extract elements
 */
function parseFormula(formula: string): Record<string, number> {
  const elements: Record<string, number> = {};
  const regex = /([A-Z][a-z]?)(\d*)/g;
  let match;

  while ((match = regex.exec(formula)) !== null) {
    const element = match[1];
    const count = match[2] ? parseInt(match[2]) : 1;
    elements[element] = (elements[element] || 0) + count;
  }

  return elements;
}

export const scienceTools: Tool[] = [
  {
    name: 'math_evaluate',
    description: 'Evaluate mathematical expressions with support for functions, units, and complex numbers',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "sin(pi/4)", "2^10", "sqrt(144)")',
        },
        precision: {
          type: 'number',
          description: 'Number of decimal places. Default: 10',
        },
      },
      required: ['expression'],
    },
    handler: async ({ expression, precision = 10 }) => {
      try {
        const mjs = await getMath();

        // Evaluate the expression
        const result = mjs.evaluate(expression);

        // Format result
        let formattedResult: string | number;
        if (typeof result === 'number') {
          formattedResult = Number(result.toFixed(precision));
        } else if (mjs.typeOf(result) === 'Complex') {
          formattedResult = mjs.format(result, { precision });
        } else if (mjs.typeOf(result) === 'Unit') {
          formattedResult = mjs.format(result, { precision });
        } else {
          formattedResult = mjs.format(result, { precision });
        }

        return {
          success: true,
          expression,
          result: formattedResult,
          type: mjs.typeOf(result),
        };
      } catch (error) {
        return { error: `Failed to evaluate expression: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'math_symbolic',
    description: 'Perform symbolic math operations (simplify, derivative, expand)',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression',
        },
        operation: {
          type: 'string',
          enum: ['simplify', 'derivative', 'expand', 'rationalize'],
          description: 'Operation to perform. Default: simplify',
        },
        variable: {
          type: 'string',
          description: 'Variable for derivative. Default: x',
        },
      },
      required: ['expression'],
    },
    handler: async ({ expression, operation = 'simplify', variable = 'x' }) => {
      try {
        const mjs = await getMath();

        let result: string;

        switch (operation) {
          case 'simplify':
            result = mjs.simplify(expression).toString();
            break;
          case 'derivative':
            result = mjs.derivative(expression, variable).toString();
            break;
          case 'expand':
            // Use simplify with expand rules
            result = mjs.simplify(expression, [
              'n1*n2 -> n1*n2',
              'n*(n1+n2) -> n*n1 + n*n2',
              '(n1+n2)*n -> n1*n + n2*n',
            ]).toString();
            break;
          case 'rationalize':
            result = mjs.rationalize(expression).toString();
            break;
          default:
            return { error: `Unknown operation: ${operation}` };
        }

        return {
          success: true,
          expression,
          operation,
          result,
          variable: operation === 'derivative' ? variable : undefined,
        };
      } catch (error) {
        return { error: `Failed to perform symbolic operation: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'unit_convert',
    description: 'Convert between units of measurement (length, mass, temperature, time, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        value: {
          type: 'number',
          description: 'Value to convert',
        },
        from: {
          type: 'string',
          description: 'Source unit (e.g., "km", "lb", "C")',
        },
        to: {
          type: 'string',
          description: 'Target unit (e.g., "mi", "kg", "F")',
        },
        category: {
          type: 'string',
          enum: ['length', 'mass', 'temperature', 'time', 'area', 'volume', 'speed', 'pressure', 'energy', 'power', 'force', 'angle', 'data'],
          description: 'Unit category. Auto-detected if not provided',
        },
      },
      required: ['value', 'from', 'to'],
    },
    handler: async ({ value, from, to, category }) => {
      try {
        // Handle temperature specially
        if (['K', 'C', 'F'].includes(from.toUpperCase()) || ['K', 'C', 'F'].includes(to.toUpperCase())) {
          const result = convertTemperature(value, from, to);
          return {
            success: true,
            value,
            from,
            to,
            result: Math.round(result * 1e10) / 1e10,
            category: 'temperature',
          };
        }

        // Find the category
        let foundCategory = category;
        if (!foundCategory) {
          for (const [cat, units] of Object.entries(unitConversions)) {
            if (from in units && to in units) {
              foundCategory = cat;
              break;
            }
          }
        }

        if (!foundCategory) {
          return { error: `Could not find conversion between ${from} and ${to}. Please specify category.` };
        }

        const units = unitConversions[foundCategory];
        if (!units || !(from in units) || !(to in units)) {
          return { error: `Units ${from} or ${to} not found in category ${foundCategory}` };
        }

        const fromFactor = units[from] as number;
        const toFactor = units[to] as number;

        // Convert: value * fromFactor gives base unit, divide by toFactor gives target
        const result = (value * fromFactor) / toFactor;

        return {
          success: true,
          value,
          from,
          to,
          result: Math.round(result * 1e10) / 1e10,
          category: foundCategory,
        };
      } catch (error) {
        return { error: `Failed to convert units: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'physics_constants',
    description: 'Get physical constants (speed of light, Planck constant, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        constant: {
          type: 'string',
          description: 'Constant name (c, G, h, e, me, mp, NA, k, R, etc.) or "list" for all',
        },
      },
      required: ['constant'],
    },
    handler: async ({ constant }) => {
      try {
        if (constant === 'list' || constant === 'all') {
          return {
            success: true,
            constants: Object.entries(physicalConstants).map(([symbol, data]) => ({
              symbol,
              ...data,
            })),
          };
        }

        const data = physicalConstants[constant];
        if (!data) {
          return {
            error: `Unknown constant: ${constant}. Use "list" to see available constants.`,
            availableConstants: Object.keys(physicalConstants),
          };
        }

        return {
          success: true,
          symbol: constant,
          ...data,
        };
      } catch (error) {
        return { error: `Failed to get constant: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'periodic_table',
    description: 'Query periodic table data for elements',
    inputSchema: {
      type: 'object',
      properties: {
        element: {
          type: 'string',
          description: 'Element symbol (e.g., "H", "Fe", "Au") or "list" for all',
        },
        property: {
          type: 'string',
          enum: ['all', 'mass', 'number', 'category', 'electronConfig'],
          description: 'Specific property to retrieve. Default: all',
        },
      },
      required: ['element'],
    },
    handler: async ({ element, property = 'all' }) => {
      try {
        if (element === 'list' || element === 'all') {
          return {
            success: true,
            elements: Object.values(periodicTable).sort((a, b) => a.number - b.number),
          };
        }

        // Try to find by symbol or name
        let data = periodicTable[element];
        if (!data) {
          // Search by name
          const found = Object.values(periodicTable).find(
            e => e.name.toLowerCase() === element.toLowerCase()
          );
          if (found) data = found;
        }

        if (!data) {
          return {
            error: `Unknown element: ${element}`,
            availableElements: Object.keys(periodicTable).slice(0, 20),
          };
        }

        if (property !== 'all') {
          return {
            success: true,
            element: data.symbol,
            [property]: (data as any)[property],
          };
        }

        return {
          success: true,
          ...data,
        };
      } catch (error) {
        return { error: `Failed to query periodic table: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'chemistry_formula',
    description: 'Parse chemical formula and calculate molecular weight',
    inputSchema: {
      type: 'object',
      properties: {
        formula: {
          type: 'string',
          description: 'Chemical formula (e.g., "H2O", "C6H12O6", "NaCl")',
        },
      },
      required: ['formula'],
    },
    handler: async ({ formula }) => {
      try {
        const elements = parseFormula(formula);

        // Calculate molecular weight
        let molecularWeight = 0;
        const composition: { element: string; count: number; mass: number; percentage?: number }[] = [];

        for (const [symbol, count] of Object.entries(elements)) {
          const elementData = periodicTable[symbol];
          if (!elementData) {
            return { error: `Unknown element: ${symbol}` };
          }

          const mass = elementData.mass * count;
          molecularWeight += mass;
          composition.push({
            element: symbol,
            count,
            mass: Math.round(mass * 1000) / 1000,
          });
        }

        // Calculate percentages
        for (const comp of composition) {
          comp.percentage = Math.round((comp.mass / molecularWeight) * 10000) / 100;
        }

        return {
          success: true,
          formula,
          molecularWeight: Math.round(molecularWeight * 1000) / 1000,
          unit: 'g/mol',
          composition,
          elementCount: Object.keys(elements).length,
          totalAtoms: Object.values(elements).reduce((a, b) => a + b, 0),
        };
      } catch (error) {
        return { error: `Failed to parse formula: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'statistics_advanced',
    description: 'Advanced statistical calculations (regression, correlation, distributions)',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['correlation', 'regression', 'zscore', 'percentile', 'normal_probability'],
          description: 'Statistical operation to perform',
        },
        x: {
          type: 'array',
          items: { type: 'number' },
          description: 'X values (for correlation/regression)',
        },
        y: {
          type: 'array',
          items: { type: 'number' },
          description: 'Y values (for correlation/regression)',
        },
        values: {
          type: 'array',
          items: { type: 'number' },
          description: 'Data values (for zscore/percentile)',
        },
        value: {
          type: 'number',
          description: 'Single value (for zscore/percentile/normal_probability)',
        },
        mean: {
          type: 'number',
          description: 'Mean (for normal_probability)',
        },
        stdDev: {
          type: 'number',
          description: 'Standard deviation (for normal_probability)',
        },
      },
      required: ['operation'],
    },
    handler: async ({ operation, x, y, values, value, mean, stdDev }) => {
      try {
        const mjs = await getMath();

        switch (operation) {
          case 'correlation': {
            if (!x || !y || x.length !== y.length) {
              return { error: 'X and Y arrays of equal length required for correlation' };
            }

            const n = x.length;
            const sumX = x.reduce((a, b) => a + b, 0);
            const sumY = y.reduce((a, b) => a + b, 0);
            const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
            const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
            const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

            const correlation = (n * sumXY - sumX * sumY) /
              Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

            let strength: string;
            const absR = Math.abs(correlation);
            if (absR >= 0.9) strength = 'very strong';
            else if (absR >= 0.7) strength = 'strong';
            else if (absR >= 0.5) strength = 'moderate';
            else if (absR >= 0.3) strength = 'weak';
            else strength = 'very weak';

            return {
              success: true,
              operation: 'correlation',
              correlation: Math.round(correlation * 10000) / 10000,
              rSquared: Math.round(correlation * correlation * 10000) / 10000,
              strength,
              direction: correlation >= 0 ? 'positive' : 'negative',
              n,
            };
          }

          case 'regression': {
            if (!x || !y || x.length !== y.length) {
              return { error: 'X and Y arrays of equal length required for regression' };
            }

            const n = x.length;
            const sumX = x.reduce((a, b) => a + b, 0);
            const sumY = y.reduce((a, b) => a + b, 0);
            const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
            const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;

            // R-squared
            const yMean = sumY / n;
            const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
            const ssResidual = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
            const rSquared = 1 - ssResidual / ssTotal;

            return {
              success: true,
              operation: 'regression',
              equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`,
              slope: Math.round(slope * 10000) / 10000,
              intercept: Math.round(intercept * 10000) / 10000,
              rSquared: Math.round(rSquared * 10000) / 10000,
              n,
            };
          }

          case 'zscore': {
            if (!values || value === undefined) {
              return { error: 'Values array and value required for zscore' };
            }

            const m = mjs.mean(values) as number;
            const s = mjs.std(values) as number;
            const zscore = (value - m) / s;

            return {
              success: true,
              operation: 'zscore',
              value,
              mean: Math.round(m * 10000) / 10000,
              stdDev: Math.round(s * 10000) / 10000,
              zscore: Math.round(zscore * 10000) / 10000,
            };
          }

          case 'percentile': {
            if (!values || value === undefined) {
              return { error: 'Values array and value required for percentile' };
            }

            const sorted = [...values].sort((a, b) => a - b);
            const count = sorted.filter(v => v <= value).length;
            const percentile = (count / sorted.length) * 100;

            return {
              success: true,
              operation: 'percentile',
              value,
              percentile: Math.round(percentile * 100) / 100,
              rank: count,
              total: sorted.length,
            };
          }

          case 'normal_probability': {
            if (value === undefined || mean === undefined || stdDev === undefined) {
              return { error: 'Value, mean, and stdDev required for normal_probability' };
            }

            // Calculate CDF using error function approximation
            const z = (value - mean) / stdDev;
            const cdf = 0.5 * (1 + erf(z / Math.sqrt(2)));

            return {
              success: true,
              operation: 'normal_probability',
              value,
              mean,
              stdDev,
              zscore: Math.round(z * 10000) / 10000,
              probabilityLessThan: Math.round(cdf * 10000) / 10000,
              probabilityGreaterThan: Math.round((1 - cdf) * 10000) / 10000,
            };
          }

          default:
            return { error: `Unknown operation: ${operation}` };
        }
      } catch (error) {
        return { error: `Failed to perform statistical operation: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'matrix_operations',
    description: 'Perform matrix operations (multiply, inverse, determinant, eigenvalues)',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['multiply', 'inverse', 'determinant', 'transpose', 'add', 'eigenvalues'],
          description: 'Matrix operation',
        },
        matrixA: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' },
          },
          description: 'First matrix (2D array)',
        },
        matrixB: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' },
          },
          description: 'Second matrix (for multiply/add)',
        },
      },
      required: ['operation', 'matrixA'],
    },
    handler: async ({ operation, matrixA, matrixB }) => {
      try {
        const mjs = await getMath();

        const A = mjs.matrix(matrixA);
        let result: any;

        switch (operation) {
          case 'multiply':
            if (!matrixB) return { error: 'matrixB required for multiplication' };
            result = mjs.multiply(A, mjs.matrix(matrixB));
            break;
          case 'add':
            if (!matrixB) return { error: 'matrixB required for addition' };
            result = mjs.add(A, mjs.matrix(matrixB));
            break;
          case 'inverse':
            result = mjs.inv(A);
            break;
          case 'determinant':
            result = mjs.det(A);
            break;
          case 'transpose':
            result = mjs.transpose(A);
            break;
          case 'eigenvalues':
            const eigs = mjs.eigs(A);
            return {
              success: true,
              operation,
              eigenvalues: (eigs.values as any).toArray(),
            };
          default:
            return { error: `Unknown operation: ${operation}` };
        }

        // Format result
        const formattedResult = typeof result === 'number'
          ? result
          : result.toArray();

        return {
          success: true,
          operation,
          result: formattedResult,
        };
      } catch (error) {
        return { error: `Failed to perform matrix operation: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'number_base_convert',
    description: 'Convert numbers between bases (binary, octal, decimal, hexadecimal)',
    inputSchema: {
      type: 'object',
      properties: {
        value: {
          type: 'string',
          description: 'Number to convert (as string)',
        },
        fromBase: {
          type: 'number',
          description: 'Source base (2-36). Default: 10',
        },
        toBase: {
          type: 'number',
          description: 'Target base (2-36). Default: 16',
        },
      },
      required: ['value'],
    },
    handler: async ({ value, fromBase = 10, toBase = 16 }) => {
      try {
        // Parse from source base
        const decimal = parseInt(value, fromBase);

        if (isNaN(decimal)) {
          return { error: `Invalid number "${value}" in base ${fromBase}` };
        }

        // Convert to target base
        const result = decimal.toString(toBase).toUpperCase();

        // Format for common bases
        const baseNames: Record<number, string> = {
          2: 'binary',
          8: 'octal',
          10: 'decimal',
          16: 'hexadecimal',
        };

        return {
          success: true,
          input: value,
          fromBase,
          fromBaseName: baseNames[fromBase] || `base-${fromBase}`,
          toBase,
          toBaseName: baseNames[toBase] || `base-${toBase}`,
          result,
          decimal,
        };
      } catch (error) {
        return { error: `Failed to convert base: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];

/**
 * Error function approximation (for normal distribution)
 */
function erf(x: number): number {
  // Approximation using Abramowitz and Stegun formula 7.1.26
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}
