import z from 'zod';

import packageJSON from './package.json';

// Single unified environment schema
const envSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']),
  EXPO_PUBLIC_NAME: z.string(),
  EXPO_PUBLIC_SCHEME: z.string(),
  EXPO_PUBLIC_BUNDLE_ID: z.string(),
  EXPO_PUBLIC_PACKAGE: z.string(),
  EXPO_PUBLIC_VERSION: z.string(),
  EXPO_PUBLIC_API_URL: z.string().url().optional(),
  EXPO_PUBLIC_CAMERA_BASE_URL: z.string().url(),
  EXPO_PUBLIC_OTA_BACKEND_URL: z.string().url().optional(),
  EXPO_PUBLIC_EAS_PROJECT_ID: z.string(),
  EXPO_PUBLIC_SLUG: z.string(),
  EXPO_PUBLIC_ASSOCIATED_DOMAIN: z.string().url().optional(),
  EXPO_PUBLIC_VAR_NUMBER: z.number(),
  EXPO_PUBLIC_VAR_BOOL: z.boolean(),

  // only available for app.config.ts usage
  APP_BUILD_ONLY_VAR: z.string().optional(),
});

// Config records per environment
const EXPO_PUBLIC_APP_ENV = (process.env.EXPO_PUBLIC_APP_ENV
  ?? 'development') as z.infer<typeof envSchema>['EXPO_PUBLIC_APP_ENV'];

const BUNDLE_IDS = {
  development: 'com.wificamera.development',
  preview: 'com.wificamera.preview',
  production: 'com.wificamera',
} as const;

const PACKAGES = {
  development: 'com.wificamera.development',
  preview: 'com.wificamera.preview',
  production: 'com.wificamera',
} as const;

const SCHEMES = {
  development: 'wificameraApp',
  preview: 'wificameraApp.preview',
  production: 'wificameraApp',
} as const;

const NAME = 'WifiCamera';

// Default LAN base URL for the legacy WifiCamera firmware's HTTP API
// (the camera's own micro-server typically listens at 192.168.1.1:8999).
// Override per environment via EXPO_PUBLIC_CAMERA_BASE_URL.
const DEFAULT_CAMERA_BASE_URL = 'http://192.168.1.1:8999';

// Check if strict validation is required (before prebuild)
const STRICT_ENV_VALIDATION = process.env.STRICT_ENV_VALIDATION === '1';

// Build env object
const _env: z.infer<typeof envSchema> = {
  EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_NAME: NAME,
  EXPO_PUBLIC_SCHEME: SCHEMES[EXPO_PUBLIC_APP_ENV],
  EXPO_PUBLIC_BUNDLE_ID: BUNDLE_IDS[EXPO_PUBLIC_APP_ENV],
  EXPO_PUBLIC_PACKAGE: PACKAGES[EXPO_PUBLIC_APP_ENV],
  EXPO_PUBLIC_VERSION: packageJSON.version,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_CAMERA_BASE_URL:
    process.env.EXPO_PUBLIC_CAMERA_BASE_URL ?? DEFAULT_CAMERA_BASE_URL,
  EXPO_PUBLIC_OTA_BACKEND_URL:
    process.env.EXPO_PUBLIC_OTA_BACKEND_URL ?? 'http://170.106.80.91:7788',
  EXPO_PUBLIC_EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '13d38557-f618-4a12-812f-4505aea6929f',
  EXPO_PUBLIC_SLUG: process.env.EXPO_PUBLIC_SLUG ?? 'wificamera',
  EXPO_PUBLIC_ASSOCIATED_DOMAIN: process.env.EXPO_PUBLIC_ASSOCIATED_DOMAIN,
  EXPO_PUBLIC_VAR_NUMBER: Number(process.env.EXPO_PUBLIC_VAR_NUMBER ?? 0),
  EXPO_PUBLIC_VAR_BOOL: process.env.EXPO_PUBLIC_VAR_BOOL === 'true',
  APP_BUILD_ONLY_VAR: process.env.APP_BUILD_ONLY_VAR,
};

function getValidatedEnv(env: z.infer<typeof envSchema>) {
  const parsed = envSchema.safeParse(env);

  if (parsed.success === false) {
    const errorMessage
      = `❌ Invalid environment variables:${
        JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)
      }\n❌ Missing variables in .env file for APP_ENV=${EXPO_PUBLIC_APP_ENV}`
      + `\n💡 Tip: If you recently updated the .env file, try restarting with -c flag to clear the cache.`;

    if (STRICT_ENV_VALIDATION) {
      console.error(errorMessage);
      throw new Error('Invalid environment variables');
    }
  }
  else {
    console.log('✅ Environment variables validated successfully');
  }

  return parsed.success ? parsed.data : env;
}

const Env = STRICT_ENV_VALIDATION ? getValidatedEnv(_env) : _env;

export default Env;
