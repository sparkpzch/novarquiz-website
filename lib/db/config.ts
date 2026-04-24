export type DatabaseProvider = 'docker' | 'neon';

const SUPPORTED_DATABASE_PROVIDERS = new Set<DatabaseProvider>(['docker', 'neon']);

export function getDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  return connectionString;
}

function inferDatabaseProviderFromUrl(connectionString: string): DatabaseProvider {
  return connectionString.includes('neon.tech') ? 'neon' : 'docker';
}

export function getDatabaseProvider(): DatabaseProvider {
  const configuredProvider = process.env.DB_PROVIDER?.trim().toLowerCase();

  if (!configuredProvider) {
    return inferDatabaseProviderFromUrl(getDatabaseUrl());
  }

  if (SUPPORTED_DATABASE_PROVIDERS.has(configuredProvider as DatabaseProvider)) {
    return configuredProvider as DatabaseProvider;
  }

  throw new Error(`Unsupported DB_PROVIDER "${configuredProvider}". Expected "docker" or "neon".`);
}

export function getDatabaseSslConfig() {
  return getDatabaseProvider() === 'neon' ? { rejectUnauthorized: false } : false;
}

export function getDatabaseConnectionOptions() {
  return {
    connectionString: getDatabaseUrl(),
    ssl: getDatabaseSslConfig(),
  };
}
