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
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
              padding: 20px;
              margin: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .code {
              font-size: 32px;
              font-weight: bold;
              color: #4CAF50;
              text-align: center;
              padding: 20px;
              background-color: #f0f0f0;
              border-radius: 5px;
              letter-spacing: 5px;
              margin: 20px 0;
            }
            .title {
              color: #333;
              text-align: center;
              margin-bottom: 20px;
            }
            .content {
              color: #666;
              line-height: 1.6;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              text-align: center;
              color: #999;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="title">¡Bienvenido a ${projectId}, ${fullName}!</h1>
            <div class="content">
              <p>Gracias por registrarte. Para verificar tu cuenta, por favor usa el siguiente código:</p>
              <div class="code">${code}</div>
              <p>Este código expirará en 24 horas.</p>
              <p>Si no solicitaste esta verificación, por favor ignora este email.</p>
            </div>
            <div class="footer">
              <p>© 2025 ${projectId} - Identity Provider</p>
              <p>Desarrollado por Luis Navarro</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
