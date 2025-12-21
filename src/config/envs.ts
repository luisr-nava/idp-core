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
  ALLOWED_APP_KEYS: string;
  FRONTEND_URL?: string;
  STRIPE_API_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
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
    ALLOWED_APP_KEYS: joi
      .string()
      .required()
      .messages({ 'any.required': 'ALLOWED_APP_KEYS es obligatorio' }),
    FRONTEND_URL: joi.string().uri().optional(),
    STRIPE_API_KEY: joi.string().optional(),
    STRIPE_WEBHOOK_SECRET: joi.string().optional(),
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
  allowedAppKeys: envVars.ALLOWED_APP_KEYS.split(',')
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean),
  frontendUrl: envVars.FRONTEND_URL,
  stripeApiKey: envVars.STRIPE_API_KEY,
  stripeWebhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
};
