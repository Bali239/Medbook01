import { stripe } from '../../integrations/stripe/stripe.js';
import Appointment from '../../models/Appointment.js';
import Payment from '../../models/Payment.js';
import SlotHold from '../../models/SlotHold.js';
import { NotFoundError, BadRequestError } from '../../errors/AppError.js';

export class PaymentService {
  async createCheckoutSession(patientId, data) {
    const { appointmentId } = data;
    const appointment = await Appointment.findById(appointmentId).populate('doctor');
    
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }
    if (appointment.patient.toString() !== patientId) {
      throw new BadRequestError('Not authorized');
    }
    if (appointment.paymentStatus === 'paid') {
      throw new BadRequestError('Appointment already paid');
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Appointment with Doctor`,
            },
            unit_amount: Math.round(appointment.fee * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/cancel`,
      metadata: {
        appointmentId: appointmentId.toString(),
        patientId: patientId.toString(),
      },
    });
    
    await Payment.create({
      appointment: appointmentId,
      amount: appointment.fee,
      stripeSessionId: session.id,
      status: 'pending',
    });
    
    return { sessionId: session.id, url: session.url };
  }
  
  async verifyPayment(sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      const appointment = await Appointment.findById(session.metadata.appointmentId);
      if (appointment) {
        appointment.paymentStatus = 'paid';
        appointment.status = 'confirmed';
        await appointment.save();
        
        await Payment.findOneAndUpdate(
          { stripeSessionId: sessionId },
          { status: 'succeeded', stripePaymentIntentId: session.payment_intent }
        );
        
        // Remove slot hold
        await SlotHold.deleteOne({
          doctor: appointment.doctor,
          appointmentDate: appointment.appointmentDate,
          startTime: appointment.startTime,
        });
      }
      return { success: true, appointmentId: appointment._id };
    }
    
    return { success: false };
  }
}
