import DoctorProfile from '../../models/DoctorProfile.js';
import { NotFoundError } from '../../errors/AppError.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const publicDoctorProfile = (profile) => {
  const specialty = profile.specialtyId && typeof profile.specialtyId === 'object'
    ? { id: profile.specialtyId._id, name: profile.specialtyId.name, slug: profile.specialtyId.slug }
    : { id: profile.specialtyId || null, name: profile.specialty, slug: null };

  return {
    id: profile._id,
    userId: profile.user,
    fullName: profile.fullName,
    profilePicture: profile.profilePicture || null,
    specialty,
    subSpecialty: profile.subSpecialty || '',
    professionalTitle: profile.professionalTitle || '',
    appointmentDurationMinutes: profile.appointmentDurationMinutes || null,
    clinicTimeZone: profile.clinicTimeZone || null,
    registrationNumber: profile.licenseNumber,
    registrationAuthority: profile.registrationAuthority || '',
    qualifications: profile.qualificationDetails?.length
      ? profile.qualificationDetails
      : (profile.qualifications || []).map((degreeName) => ({ degreeName })),
    experience: profile.experience,
    experiences: profile.experiences || [],
    languages: profile.languages || [],
    biography: profile.bio || '',
    clinic: {
      name: profile.clinicName || '',
      address: profile.clinicAddress || '',
      city: profile.clinicCity || '',
      locality: profile.clinicLocality || '',
      postalCode: profile.clinicPostalCode || '',
      phoneNumber: profile.clinicPhoneNumber || '',
      googleMapsUrl: profile.clinicGoogleMapsUrl || '',
    },
    clinicLocations: profile.clinicLocations || [],
    consultationFee: profile.consultationFee,
    consultationFeePaisa: profile.consultationFeePaisa ?? Math.round(profile.consultationFee * 100),
    approvedAt: profile.approvedAt || null,
  };
};

export class DoctorProfileService {
  async getProfile(userId) {
    const profile = await DoctorProfile.findOne({ user: userId });
    if (!profile) {
      throw new NotFoundError('Profile not found');
    }
    return profile;
  }
  
  async getAllProfiles(filters = {}) {
    const query = { status: 'approved' };
    if (filters.specialty) {
      const specialtyFilter = escapeRegex(String(filters.specialty).slice(0, 100));
      query.$or = [{ specialty: { $regex: specialtyFilter, $options: 'i' } }];
      if (/^[a-f\d]{24}$/i.test(String(filters.specialty))) {
        query.$or.push({ specialtyId: filters.specialty });
      }
    }
    if (filters.search) {
      query.fullName = { $regex: escapeRegex(String(filters.search).slice(0, 100)), $options: 'i' };
    }
    
    const profiles = await DoctorProfile.find(query)
      .populate('specialtyId', 'name slug')
      .sort('-createdAt');
    return profiles.map(publicDoctorProfile);
  }
  
  async getPublicProfile(id) {
    const profile = await DoctorProfile.findOne({ _id: id, status: 'approved' })
      .populate('specialtyId', 'name slug');
    if (!profile) {
      throw new NotFoundError('Doctor not found');
    }
    return publicDoctorProfile(profile);
  }
}
