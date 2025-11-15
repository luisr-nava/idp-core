import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { envs } from '@/config';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.resend = new Resend(envs.resendApiKey);
  }

  async sendVerificationEmail(email: string, code: string, fullName: string, projectId: string) {
    try {
      // Obtener la plantilla HTML
      const emailTemplate = await this.getEmailTemplate(code, fullName, projectId);

      const { data, error } = await this.resend.emails.send({
        from: `${projectId} <onboarding@resend.dev>`,
        to: [email],
        subject: `Verificación de cuenta - ${projectId}`,
        html: emailTemplate,
      });

      if (error) {
        this.logger.error(`Error al enviar email a ${email}:`, error);
        throw error;
      }

      this.logger.log(`Email de verificación enviado a ${email} - ID: ${data?.id}`);
      return { success: true, emailId: data?.id };
    } catch (error) {
      this.logger.error(`Error al enviar email a ${email}:`, error);
      throw error;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
    fullName: string,
    projectId: string,
  ) {
    try {
      const emailTemplate = await this.getPasswordResetTemplate(
        resetLink,
        fullName,
        projectId,
      );

      const { data, error } = await this.resend.emails.send({
        from: `${projectId} <onboarding@resend.dev>`,
        to: [email],
        subject: `Recuperación de contraseña - ${projectId}`,
        html: emailTemplate,
      });

      if (error) {
        this.logger.error(
          `Error al enviar email de recuperación a ${email}:`,
          error,
        );
        throw error;
      }

      this.logger.log(
        `Email de recuperación de contraseña enviado a ${email} - ID: ${data?.id}`,
      );
      return { success: true, emailId: data?.id };
    } catch (error) {
      this.logger.error(
        `Error al enviar email de recuperación a ${email}:`,
        error,
      );
      throw error;
    }
  }

  private async getEmailTemplate(
    code: string,
    fullName: string,
    projectId: string,
  ): Promise<string> {
    // TODO: Llamar al servicio externo para obtener la plantilla
    // Por ahora, retorno una plantilla básica
    return `
     <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Email Verification</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
              font-family: Arial, sans-serif;
            }

            .container {
              width: 100%;
              max-width: 600px;
              margin: 0 auto;
              background: #ffffff;
              padding: 24px;
              border-radius: 12px;
              border-top: 6px solid #b317cf;
            }

            h1 {
              color: #b317cf;
              text-align: center;
              margin-bottom: 20px;
              font-size: 22px;
            }

            .content {
              color: #444444;
              font-size: 15px;
              line-height: 1.6;
            }

            .code {
              font-size: 34px;
              font-weight: bold;
              color: #ffffff;
              background-color: #b317cf;
              padding: 16px 0;
              text-align: center;
              border-radius: 8px;
              letter-spacing: 8px;
              margin: 24px 0;
            }

            /* BOTÓN */
            .button {
              display: block;
              width: 100%;
              max-width: 260px;
              margin: 0 auto;
              background-color: #b317cf;
              color: #ffffff !important;
              text-decoration: none;
              text-align: center;
              padding: 14px 0;
              border-radius: 8px;
              font-size: 16px;
              font-weight: bold;
            }

            .footer {
              text-align: center;
              font-size: 12px;
              color: #999;
              margin-top: 32px;
              border-top: 1px solid #eee;
              padding-top: 18px;
            }

            @media (min-width: 600px) {
              h1 { font-size: 26px; }
              .code { font-size: 40px; }
            }
          </style>
        </head>

        <body>
          <div style="padding: 16px;">
            <div class="container">
              <h1>¡Bienvenido a ${projectId}, ${fullName}!</h1>

              <div class="content">
                <p>Gracias por registrarte. Para activar tu cuenta, ingresá el siguiente código:</p>

                <div class="code">${code}</div>

                <p>O podés hacer clic en el siguiente botón para ir directamente a la página de verificación:</p>

                <!-- 🔥 BOTÓN CON REDIRECCIÓN -->
                <a
                  href=""
                  class="button"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Verificar mi cuenta
                </a>

              </div>
              
              <div class="footer">
                  <p style="margin-top:18px;">Este código es válido durante 24 horas.</p>
                © 2025 ${projectId} — Identity Provider<br />
                Desarrollado por Luis Navarro
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async getPasswordResetTemplate(
    resetLink: string,
    fullName: string,
    projectId: string,
  ): Promise<string> {
    // TODO: Llamar al servicio externo para obtener la plantilla
    // Por ahora, retorno una plantilla básica
    return `
     <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Recuperación de contraseña</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
              font-family: Arial, sans-serif;
            }

            .container {
              width: 100%;
              max-width: 600px;
              margin: 0 auto;
              background: #ffffff;
              padding: 24px;
              border-radius: 12px;
              border-top: 6px solid #b317cf;
            }

            h1 {
              color: #b317cf;
              text-align: center;
              margin-bottom: 20px;
              font-size: 22px;
            }

            .content {
              color: #444444;
              font-size: 15px;
              line-height: 1.6;
            }

            .button {
              display: block;
              width: 100%;
              max-width: 260px;
              margin: 24px auto;
              background-color: #b317cf;
              color: #ffffff !important;
              text-decoration: none;
              text-align: center;
              padding: 14px 0;
              border-radius: 8px;
              font-size: 16px;
              font-weight: bold;
            }

            .footer {
              text-align: center;
              font-size: 12px;
              color: #999;
              margin-top: 32px;
              border-top: 1px solid #eee;
              padding-top: 18px;
            }

            @media (min-width: 600px) {
              h1 { font-size: 26px; }
            }
          </style>
        </head>

        <body>
          <div style="padding: 16px;">
            <div class="container">
              <h1>Recuperación de contraseña</h1>

              <div class="content">
                <p>Hola ${fullName},</p>

                <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${projectId}.</p>

                <p>Hacé clic en el siguiente botón para crear una nueva contraseña:</p>

                <a
                  href="${resetLink}"
                  class="button"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Restablecer contraseña
                </a>

                <p style="font-size: 13px; color: #666;">
                  Si no podés hacer clic en el botón, copiá y pegá el siguiente enlace en tu navegador:
                </p>
                <p style="font-size: 13px; word-break: break-all; color: #b317cf;">
                  ${resetLink}
                </p>

                <p style="margin-top: 24px; font-size: 13px; color: #666;">
                  <strong>Si no solicitaste este cambio,</strong> podés ignorar este correo de forma segura. Tu contraseña no se modificará.
                </p>
              </div>

              <div class="footer">
                <p style="margin-top:18px;">Este enlace es válido durante 1 hora.</p>
                © 2025 ${projectId} — Identity Provider<br />
                Desarrollado por Luis Navarro
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
