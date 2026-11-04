import EmailDelivery from '../../models/EmailDelivery.js';
import Appointment from '../../models/Appointment.js';
import { sendEmail } from '../auth/email.service.js';

export class EmailDeliveryService {
  constructor({ deliveryModel = EmailDelivery, appointmentModel = Appointment, emailSender = sendEmail, now = Date.now, logger = console } = {}) {
    this.deliveryModel = deliveryModel;
    this.appointmentModel = appointmentModel;
    this.emailSender = emailSender;
    this.now = now;
    this.logger = logger;
  }

  async enqueue(data) {
    try {
      return await this.deliveryModel.findOneAndUpdate(
        { dedupeKey: data.dedupeKey },
        { $setOnInsert: { ...data, status: 'queued', nextAttemptAt: new Date(this.now()) } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      return this.deliveryModel.findOne({ dedupeKey: data.dedupeKey });
    }
  }

  async processNext() {
    const now = new Date(this.now());
    const delivery = await this.deliveryModel.findOneAndUpdate(
      {
        $or: [
          { status: 'queued', nextAttemptAt: { $lte: now } },
          { status: 'failed', nextAttemptAt: { $lte: now } },
          { status: 'processing', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: { status: 'processing', leaseExpiresAt: new Date(this.now() + 60_000) },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    ).select('+to +text +html +appointmentReminderFor');
    if (!delivery) return false;

    try {
      if (delivery.appointmentReminderFor) {
        const appointment = await this.appointmentModel.findById(delivery.appointmentReminderFor).select('status');
        if (appointment?.status !== 'confirmed') {
          await this.deliveryModel.updateOne(
            { _id: delivery._id, status: 'processing' },
            {
              $set: { status: 'skipped', skippedAt: new Date(this.now()) },
              $unset: { leaseExpiresAt: 1, lastError: 1, to: 1, text: 1, html: 1 },
            },
          );
          return true;
        }
      }
      const result = await this.emailSender({
        to: delivery.to,
        subject: delivery.subject,
        text: delivery.text,
        html: delivery.html,
      });
      const delivered = result?.delivered !== false;
      await this.deliveryModel.updateOne(
        { _id: delivery._id, status: 'processing' },
        {
          $set: delivered
            ? { status: 'sent', sentAt: new Date(this.now()) }
            : { status: 'skipped', skippedAt: new Date(this.now()) },
          $unset: { leaseExpiresAt: 1, lastError: 1, to: 1, text: 1, html: 1 },
        },
      );
    } catch (error) {
      const delayMs = Math.min(60 * 60_000, 1000 * (2 ** Math.min(delivery.attempts, 12)));
      await this.deliveryModel.updateOne(
        { _id: delivery._id, status: 'processing' },
        {
          $set: {
            status: 'failed',
            nextAttemptAt: new Date(this.now() + delayMs),
            lastError: /^[a-z0-9_]{1,60}$/i.test(error?.code || '') ? error.code : 'email_delivery_failed',
          },
          $unset: { leaseExpiresAt: 1 },
        },
      );
      this.logger.error('Email delivery failed', { code: delivery.lastError || 'email_delivery_failed' });
    }
    return true;
  }
}
