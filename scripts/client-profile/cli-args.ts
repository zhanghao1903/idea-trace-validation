export interface ParsedArgs {
  values: Map<string, string[]>;
  flags: Set<string>;
}

export const parseArgs = (
  argv: readonly string[],
  valueOptions: readonly string[],
  flagOptions: readonly string[],
): ParsedArgs => {
  const allowedValues = new Set(valueOptions);
  const allowedFlags = new Set(flagOptions);
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (allowedFlags.has(argument)) {
      if (flags.has(argument)) throw new Error("CLI_OPTION_DUPLICATE");
      flags.add(argument);
      continue;
    }
    if (!allowedValues.has(argument)) throw new Error("CLI_OPTION_INVALID");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error("CLI_VALUE_REQUIRED");
    const prior = values.get(argument) ?? [];
    prior.push(value);
    values.set(argument, prior);
    index += 1;
  }
  return { values, flags };
};

export const requiredValue = (args: ParsedArgs, name: string): string => {
  const values = args.values.get(name) ?? [];
  if (values.length !== 1) throw new Error("CLI_VALUE_REQUIRED");
  return values[0] as string;
};

export const optionalValue = (
  args: ParsedArgs,
  name: string,
): string | undefined => {
  const values = args.values.get(name) ?? [];
  if (values.length > 1) throw new Error("CLI_OPTION_DUPLICATE");
  return values[0];
};

export const repeatedValues = (args: ParsedArgs, name: string): string[] =>
  args.values.get(name) ?? [];
