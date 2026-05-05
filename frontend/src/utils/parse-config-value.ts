import type Config from "../types/config.type";
import type { ParsedConfigValue } from "../types/config.type";
import type { Timespan } from "../types/timespan.type";

function stringToTimespan(value: string): Timespan {
  return {
    value: parseInt(value.split(" ")[0], 10),
    unit: value.split(" ")[1],
  } as Timespan;
}

/**
 * Parse a public `/api/configs` row by key. Edge-safe: no axios or other Node-only
 * imports—safe for Next.js middleware.
 */
export function parseConfigValue(
  key: string,
  configVariables: Config[],
): ParsedConfigValue {
  if (!configVariables?.length) {
    throw new Error(`Config variable ${key} not found`);
  }

  const configVariable = configVariables.filter(
    (variable) => variable.key == key,
  )[0];

  if (!configVariable) throw new Error(`Config variable ${key} not found`);

  const value = configVariable.value ?? configVariable.defaultValue;

  if (configVariable.type == "number" || configVariable.type == "filesize")
    return parseInt(value, 10);
  if (configVariable.type == "boolean") return value == "true";
  if (configVariable.type == "string" || configVariable.type == "text")
    return value;
  if (configVariable.type == "timespan") return stringToTimespan(value);

  throw new Error(
    `Unsupported config type ${configVariable.type} for key ${key}`,
  );
}
