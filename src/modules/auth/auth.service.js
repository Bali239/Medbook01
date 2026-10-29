import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import { BadRequestError, UnauthorizedError } from '../../errors/AppError.js';

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

export class AuthService {
  async register(data) {
    const { name, email, password, role } = data;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role === 'doctor' ? 'doctor' : 'patient',
    });
    
    const token = signToken(user._id);
    
    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
  
  async login(data) {
    const { email, password } = data;
    
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Incorrect email or password');
    }
    
    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated');
    }
    
    const token = signToken(user._id);
    
    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
