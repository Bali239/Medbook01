import { ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import { getStripeClient } from '../../integrations/stripe/stripe.js';
import PatientProfile from '../../models/PatientProfile.js';
import User from '../../models/User.js';

export class StripeCustomerService {
  constructor({
    stripeClientProvider = getStripeClient,
    patientProfileModel = PatientProfile,
    userModel = User,
  } = {}) {
    this.stripeClientProvider = stripeClientProvider;
    this.patientProfileModel = patientProfileModel;
    this.userModel = userModel;
  }

  async getOrCreateForPatient(patientId) {
    const [user, profile] = await Promise.all([
      this.userModel.findById(patientId),
      this.patientProfileModel.findOne({ user: patientId })
        .select('+stripeCustomerId +stripeCustomerGeneration'),
    ]);

    if (!user || user.role !== 'patient' || !user.isActive) {
      throw new ForbiddenError('An active patient account is required.');
    }
    if (!profile) throw new NotFoundError('Complete your patient profile before payment.');

    const stripeClient = this.stripeClientProvider();
    let generation = profile.stripeCustomerGeneration || 0;
    if (profile.stripeCustomerId) {
      try {
        const customer = await stripeClient.customers.retrieve(profile.stripeCustomerId);
        if (!customer.deleted) {
          await stripeClient.customers.update(customer.id, {
            email: user.email,
            name: `${profile.firstName} ${profile.lastName}`.trim(),
            metadata: { patient_id: String(patientId) },
          });
          return customer;
        }
        generation += 1;
      } catch (error) {
        if (error.code !== 'resource_missing') throw error;
        generation += 1;
      }
    }

    const customer = await stripeClient.customers.create({
      email: user.email,
      name: `${profile.firstName} ${profile.lastName}`.trim(),
      metadata: { patient_id: String(patientId) },
    }, {
      idempotencyKey: `medbook-patient-${patientId}-customer-v${generation}`,
    });

    await this.patientProfileModel.updateOne(
      { user: patientId },
      { $set: { stripeCustomerId: customer.id, stripeCustomerGeneration: generation } },
    );
    return customer;
  }
}