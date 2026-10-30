import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';
import { BadRequestError } from '../../errors/AppError.js';

const imageFormats = ['jpg', 'jpeg', 'png', 'webp'];
const documentFormats = [...imageFormats, 'pdf'];

const purposes = {
  profile_picture: { private: false, imageOnly: true, maxBytes: 5 * 1024 * 1024, folder: 'profile' },
  clinic_image: { private: false, imageOnly: true, maxBytes: 8 * 1024 * 1024, folder: 'clinic' },
  qualification: { private: true, imageOnly: false, maxBytes: 15 * 1024 * 1024, folder: 'verification' },
  cnic: { private: true, imageOnly: true, maxBytes: 8 * 1024 * 1024, folder: 'verification' },
  registration_certificate: { private: true, imageOnly: false, maxBytes: 15 * 1024 * 1024, folder: 'verification' },
  medical_degree: { private: true, imageOnly: false, maxBytes: 15 * 1024 * 1024, folder: 'verification' },
  recent_photograph: { private: true, imageOnly: true, maxBytes: 8 * 1024 * 1024, folder: 'verification' },
  postgraduate_certificate: { private: true, imageOnly: false, maxBytes: 15 * 1024 * 1024, folder: 'verification' },
  supporting_document: { private: true, imageOnly: false, maxBytes: 15 * 1024 * 1024, folder: 'verification' },
};

const getConfig = () => {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new BadRequestError('Cloudinary storage is not configured');
  }

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: env.CLOUDINARY_API_KEY.trim(),
    api_secret: env.CLOUDINARY_API_SECRET.trim(),
    secure: true,
  });

  return cloudinary;
};

const extensionFor = (fileName) => fileName.toLowerCase().split('.').pop() || '';

const expectedResourceType = (format) => (format === 'pdf' ? 'raw' : 'image');

const makePublicId = (userId, purpose, format) => {
  const prefix = purpose === 'profile_picture'
    ? 'doctor-profile'
    : purpose === 'clinic_image'
      ? 'doctor-clinic'
      : 'doctor-verification';
  const suffix = format === 'pdf' ? '.pdf' : '';
  return `${prefix}-${userId}-${randomUUID()}${suffix}`;
};

export const createDoctorApplicationUploadSignature = (userId, { purpose, fileName, mimeType, bytes }) => {
  const rule = purposes[purpose];
  const safeName = fileName?.trim();
  const extension = extensionFor(safeName || '');
  const mimeFormats = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf'],
  };

  if (!rule || !safeName || safeName.length > 200) {
    throw new BadRequestError('Unsupported doctor application file purpose or file name');
  }
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > rule.maxBytes) {
    throw new BadRequestError(`File must be smaller than ${Math.floor(rule.maxBytes / (1024 * 1024))} MB`);
  }
  if (!mimeFormats[mimeType]?.includes(extension)) {
    throw new BadRequestError('File extension and media type are not supported');
  }
  if (rule.imageOnly && !imageFormats.includes(extension)) {
    throw new BadRequestError('This document must be an image');
  }

  const client = getConfig();
  const format = extension;
  const resourceType = expectedResourceType(format);
  const deliveryType = rule.private ? 'authenticated' : 'upload';
  const assetFolder = `medbook/doctors/${userId}/${rule.folder}`;
  const publicId = makePublicId(userId, purpose, format);
  const context = `owner_id=${userId}|purpose=${purpose}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    asset_folder: assetFolder,
    public_id: publicId,
    type: deliveryType,
    overwrite: false,
    allowed_formats: (rule.imageOnly ? imageFormats : documentFormats).join(','),
    max_file_size: rule.maxBytes,
    context,
    timestamp,
  };

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME.trim(),
    apiKey: env.CLOUDINARY_API_KEY.trim(),
    resourceType,
    deliveryType,
    publicId,
    assetFolder,
    timestamp,
    signature: client.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET.trim()),
    allowedFormats: rule.imageOnly ? imageFormats : documentFormats,
    maxBytes: rule.maxBytes,
    context,
    originalName: safeName,
    purpose,
  };
};

export const verifyDoctorApplicationUpload = async (userId, { publicId, purpose, originalName }) => {
  const rule = purposes[purpose];
  const expectedPrefix = purpose === 'profile_picture'
    ? `doctor-profile-${userId}-`
    : purpose === 'clinic_image'
      ? `doctor-clinic-${userId}-`
      : `doctor-verification-${userId}-`;

  if (!rule || typeof publicId !== 'string' || !publicId.startsWith(expectedPrefix)) {
    throw new BadRequestError('Invalid doctor application asset reference');
  }

  const client = getConfig();
  const resourceType = publicId.endsWith('.pdf') ? 'raw' : 'image';
  const deliveryType = rule.private ? 'authenticated' : 'upload';
  let resource;

  try {
    resource = await client.api.resource(publicId, { resource_type: resourceType, type: deliveryType });
  } catch {
    throw new BadRequestError('Uploaded file could not be verified');
  }

  const format = String(resource.format || '').toLowerCase();
  const acceptedFormats = rule.imageOnly ? imageFormats : documentFormats;
  if (
    resource.public_id !== publicId
    || resource.resource_type !== resourceType
    || resource.type !== deliveryType
    || resource.context?.custom?.owner_id !== String(userId)
    || resource.context?.custom?.purpose !== purpose
    || !acceptedFormats.includes(format)
    || resource.bytes < 1
    || resource.bytes > rule.maxBytes
  ) {
    try {
      await client.uploader.destroy(publicId, { resource_type: resourceType, type: deliveryType, invalidate: true });
    } catch (error) {
      console.error('Unable to remove invalid doctor application upload', error.message);
    }
    throw new BadRequestError('Uploaded file did not meet the application storage requirements');
  }

  const reference = {
    publicId,
    format,
    bytes: resource.bytes,
    originalName: originalName?.trim().slice(0, 200) || 'Uploaded document',
    resourceType,
    uploadedAt: resource.created_at ? new Date(resource.created_at) : new Date(),
  };

  if (purpose === 'profile_picture') {
    return {
      ...reference,
      resourceType: 'image',
      url: client.url(publicId, { secure: true, resource_type: 'image', type: 'upload' }),
    };
  }

  return reference;
};

export const verifyDoctorApplicationAsset = async (userId, asset, purpose) => (
  verifyDoctorApplicationUpload(userId, {
    publicId: asset.publicId,
    purpose,
    originalName: asset.originalName,
  })
);

export const removeDoctorApplicationAsset = async ({ publicId, resourceType, purpose, userId }) => {
  const rule = purposes[purpose];
  if (!rule || !publicId?.startsWith(`${purpose === 'profile_picture' ? 'doctor-profile' : purpose === 'clinic_image' ? 'doctor-clinic' : 'doctor-verification'}-${userId}-`)) {
    throw new BadRequestError('Invalid doctor application asset reference');
  }

  const client = getConfig();
  return client.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: rule.private ? 'authenticated' : 'upload',
    invalidate: true,
  });
};

export const fetchPrivateDoctorApplicationAsset = async (asset) => {
  if (!asset?.publicId || !['image', 'raw'].includes(asset.resourceType)) {
    throw new BadRequestError('Invalid private document reference');
  }

  const client = getConfig();
  const url = client.utils.private_download_url(asset.publicId, asset.format, {
    resource_type: asset.resourceType,
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 60,
    attachment: false,
  });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new BadRequestError('Private document is temporarily unavailable');
  }

  return {
    body: response.body,
    contentType: asset.resourceType === 'raw' ? 'application/pdf' : `image/${asset.format === 'jpg' ? 'jpeg' : asset.format}`,
  };
};