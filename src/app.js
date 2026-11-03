import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import healthRoutes from './routes/health.routes.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import doctorProfileRoutes from './modules/doctor-profiles/doctor-profile.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import appointmentRoutes from './modules/appointments/appointment.routes.js';
import availabilityRoutes from './modules/availability/availability.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import invoiceRoutes from './modules/payments/invoice.routes.js';
import stripeWebhookRoutes from './modules/payments/stripe-webhook.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import reviewRoutes from './modules/reviews/review.routes.js';
import patientProfileRoutes from './modules/patient-profiles/patient-profile.routes.js';
import doctorApplicationRoutes from './modules/doctor-applications/doctor-application.routes.js';
import doctorApplicationAdminRoutes from './modules/doctor-applications/doctor-application.admin.routes.js';
import specialtyRoutes from './modules/specialties/specialty.routes.js';
import registrationAuthorityRoutes from './modules/registration-authorities/registration-authority.routes.js';
import languageRoutes from './modules/languages/language.routes.js';
import { securityHeaders } from './middleware/securityHeaders.js';

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(securityHeaders);
app.use(cookieParser());

app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

app.use('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/doctor-applications', doctorApplicationRoutes);
app.use('/api/admin/doctor-applications', doctorApplicationAdminRoutes);
app.use('/api/specialties', specialtyRoutes);
app.use('/api/registration-authorities', registrationAuthorityRoutes);
app.use('/api/languages', languageRoutes);
app.use('/api/doctors', doctorProfileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/patient-profiles', patientProfileRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Not Found',
    path: req.originalUrl,
  });
});

app.use(errorHandler);

export default app;
