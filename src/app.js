import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRoutes from './routes/health.routes.js';
import errorHandler from './middleware/errorHandler.js';

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
import authRoutes from './modules/auth/auth.routes.js';

app.use('/api/auth', authRoutes);
import doctorProfileRoutes from './modules/doctor-profiles/doctor-profile.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

app.use('/api/doctors', doctorProfileRoutes);
app.use('/api/admin', adminRoutes);
import appointmentRoutes from './modules/appointments/appointment.routes.js';

app.use('/api/appointments', appointmentRoutes);
import availabilityRoutes from './modules/availability/availability.routes.js';

app.use('/api/availability', availabilityRoutes);
