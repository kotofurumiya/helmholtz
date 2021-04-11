export const getEnvsOrExit = <T extends string>(envKeys: ReadonlyArray<T>): Record<T, string> => {
  let lacksEnv = false;
  for (const envName of envKeys) {
    if (!process.env[envName]) {
      lacksEnv = true;
      console.error(`env variable not found: ${envName}`);
    }
  }

  if (lacksEnv) {
    process.exit(1);
  }

  const values = envKeys.reduce((map, key) => ({ ...map, [key]: process.env[key] }), {} as Record<T, string>);
  return values;
};
