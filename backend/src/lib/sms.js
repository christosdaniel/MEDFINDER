import { config } from '../config.js';

/**
 * Send an SMS. The default "console" provider just logs the message, which is
 * enough for development. To go live, add a provider here (Hubtel, Arkesel,
 * mNotify, Twilio...) and set SMS_PROVIDER in .env.
 */
export async function sendSms(to, message) {
  if (config.sms.provider === 'console') {
    console.log(`[sms] to ${to}: ${message}`);
    return true;
  }
  console.warn(`[sms] provider "${config.sms.provider}" not implemented; message to ${to} not sent`);
  return false;
}
