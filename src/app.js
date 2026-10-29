import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRoutes from './routes/health.routes.js';
import errorHandler from './middleware/errorHandler.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import authRoutes from './modules/auth/auth.routes.js';
import doctorProfileRoutes from './modules/doctor-profiles/doctor-profile.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import appointmentRoutes from './modules/appointments/appointment.routes.js';
import availabilityRoutes from './modules/availability/availability.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import reviewRoutes from './modules/reviews/review.routes.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Not Found',
    path: req.originalUrl,
  });
});

app.use(errorHandler);

export default app;


app.use('/api/auth', authRoutes);

app.use('/api/doctors', doctorProfileRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/appointments', appointmentRoutes);

app.use('/api/availability', availabilityRoutes);

app.use('/api/payments', paymentRoutes);

app.use('/api/notifications', notificationRoutes);

app.use('/api/reviews', reviewRoutes);

app.use(securityHeaders);
