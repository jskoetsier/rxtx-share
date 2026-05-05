import { configVariables } from "../../prisma/seed/config.variables";
import type { Timespan } from "src/utils/date.util";

type Categories = typeof configVariables;

type Entry = { type: string };

type ValueForEntry<E extends Entry> = E["type"] extends "boolean"
  ? boolean
  : E["type"] extends "number" | "filesize"
    ? number
    : E["type"] extends "timespan"
      ? Timespan
      : string;

/** Every `category.name` config key backed by the seed definition. */
export type ConfigKey = {
  [C in keyof Categories]: {
    [N in keyof Categories[C]]: `${C & string}.${N & string}`;
  }[keyof Categories[C]];
}[keyof Categories];

export type ConfigValueForKey<K extends ConfigKey> =
  K extends `${infer C}.${infer N}`
    ? C extends keyof Categories
      ? N extends keyof Categories[C]
        ? Categories[C][N] extends Entry
          ? ValueForEntry<Categories[C][N]>
          : never
        : never
      : never
    : never;

export type ConfigParsedValue = ConfigValueForKey<ConfigKey>;
