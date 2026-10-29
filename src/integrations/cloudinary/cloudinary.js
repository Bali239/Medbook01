import crypto from 'crypto';
import { env } from '../../config/env.js';
import { BadRequestError } from '../../errors/AppError.js';

const getCloudinaryConfig = () => {
  if (
    !env.CLOUDINARY_CLOUD_NAME
    || !env.CLOUDINARY_API_KEY
    || !env.CLOUDINARY_API_SECRET
  ) {
    throw new BadRequestError('Profile image storage is not configured');
  }

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME.trim(),
    apiKey: env.CLOUDINARY_API_KEY.trim(),
    apiSecret: env.CLOUDINARY_API_SECRET.trim(),
  };
};

const signParameters = (parameters, apiSecret) => {
  const payload = Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${payload}${apiSecret}`)
    .digest('hex');
};

export const createProfileImageSignature = (userId) => {
  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'medbook/patient-profiles';
  const publicId = `patient-${userId}-${timestamp}`;
  const parameters = { folder, public_id: publicId, timestamp };

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    folder,
    publicId,
    timestamp,
    signature: signParameters(parameters, config.apiSecret),
  };
};

export const deleteProfileImage = async (publicId) => {
  if (!publicId || !env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY) {
    return;
  }
  if (!env.CLOUDINARY_API_SECRET) return;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParameters({ public_id: publicId, timestamp }, env.CLOUDINARY_API_SECRET);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: env.CLOUDINARY_API_KEY,
    signature,
  });
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`,
    { method: 'POST', body },
  );

  if (!response.ok) {
    throw new Error('Cloudinary image deletion failed');
  }
};

export const validateProfileImage = async ({ publicId, url }, userId) => {
  const config = getCloudinaryConfig();
  const expectedPrefix = `medbook/patient-profiles/patient-${userId}-`;
  if (!publicId.startsWith(expectedPrefix)) {
    throw new BadRequestError('Invalid profile image reference');
  }
  if (!url.startsWith(`https://res.cloudinary.com/${config.cloudName}/`)) {
    throw new BadRequestError('Invalid profile image URL');
  }

  const credentials = Buffer
    .from(`${config.apiKey}:${config.apiSecret}`)
    .toString('base64');
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/upload?public_ids[]=${encodeURIComponent(publicId)}`,
    { headers: { Authorization: `Basic ${credentials}` } },
  );
  if (!response.ok) {
    throw new BadRequestError('Profile image could not be verified');
  }

  const result = await response.json();
  const resource = result.resources?.[0];
  const allowedFormats = ['jpg', 'jpeg', 'png', 'webp'];
  if (
    !resource
    || !allowedFormats.includes(resource.format)
    || resource.bytes > 5 * 1024 * 1024
  ) {
    try {
      await deleteProfileImage(publicId);
    } catch (error) {
      console.error('Unable to remove invalid patient profile image', error.message);
    }
    throw new BadRequestError('Profile image must be JPG, PNG, or WebP and 5 MB or smaller');
  }
};
