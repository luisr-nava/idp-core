import { Logger } from '@nestjs/common';
import 'dotenv/config';
import * as joi from 'joi';
interface EnvVars {
  PORT: number;
  DB_PORT: number;
  DB_PASSWORD: string;
  DB_NAME: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
}

const log = new Logger('EnvVars - ');
const envVarsSchema = joi
  .object({
    PORT: joi.number().required(),
    DB_PORT: joi.number().required(),
    DB_PASSWORD: joi.string().required(),
    DB_NAME: joi.string().required(),
    JWT_SECRET: joi.string().required(),
    GOOGLE_CLIENT_ID: joi.string().required(),
    GOOGLE_CLIENT_SECRET: joi.string().required(),
    GOOGLE_REDIRECT_URI: joi.string().required(),
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
  clientID: envVars.GOOGLE_CLIENT_ID,
  clientSecret: envVars.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: envVars.GOOGLE_REDIRECT_URI,
};
