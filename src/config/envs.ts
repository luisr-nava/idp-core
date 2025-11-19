import { Logger } from '@nestjs/common';
import 'dotenv/config';
import * as joi from 'joi';
interface EnvVars {
  PORT: number;
  DB_PORT: number;
  DB_PASSWORD: string;
  DB_NAME: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  FRONTEND_URL?: string;
}

const log = new Logger('EnvVars - ');
const envVarsSchema = joi
  .object({
    PORT: joi.number().port().required(),
    DB_PORT: joi.number().port().required(),
    DB_PASSWORD: joi.string().min(8).required(),
    DB_NAME: joi.string().min(3).max(63).required(),
    JWT_SECRET: joi
      .string()
      .min(32)
      .required()
      .messages({
        'string.min':
          'JWT_SECRET debe tener al menos 32 caracteres para ser seguro',
      }),
    RESEND_API_KEY: joi.string().pattern(/^re_/).required().messages({
      'string.pattern.base': 'RESEND_API_KEY debe comenzar con "re_"',
    }),
    GOOGLE_CLIENT_ID: joi.string().min(20).required(),
    GOOGLE_CLIENT_SECRET: joi.string().min(20).required(),
    GOOGLE_REDIRECT_URI: joi.string().uri().required(),
    FRONTEND_URL: joi.string().uri().optional(),
  })
  .unknown(true);

const { error, value } = envVarsSchema.validate(process.env);
if (error) {
  log.error(`Config validation error: ${error.message}`);
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars: EnvVars = value;

export const envs = {
  port: envVars.PORT,
  dbPort: envVars.DB_PORT,
  dbPassword: envVars.DB_PASSWORD,
  dbName: envVars.DB_NAME,
  jwtSecret: envVars.JWT_SECRET,
  resendApiKey: envVars.RESEND_API_KEY,
  googleClientId: envVars.GOOGLE_CLIENT_ID,
  googleClientSecret: envVars.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: envVars.GOOGLE_REDIRECT_URI,
  frontendUrl: envVars.FRONTEND_URL,
};
