import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ApiResponse } from '../../utils/apiResponse.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { createDoctorApplicationUploadSignature, verifyDoctorApplicationUpload } from '../../integrations/cloudinary/doctor-application-storage.js';
import { DoctorApplicationService } from './doctor-application.service.js';

const applicationService = new DoctorApplicationService();

const streamDocument = async (res, asset) => {
  res.set({
    'Content-Type': asset.contentType,
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  });
  await pipeline(Readable.fromWeb(asset.body), res);
};

export class DoctorApplicationController {
  getMine = catchAsync(async (req, res) => {
    const application = await applicationService.getMyApplication(req.user.id);
    ApiResponse.success(res, application, 'Doctor application retrieved successfully');
  });

  getStatus = catchAsync(async (req, res) => {
    const status = await applicationService.getMyStatus(req.user.id);
    ApiResponse.success(res, status, 'Doctor application status retrieved successfully');
  });

  saveDraft = catchAsync(async (req, res) => {
    const application = await applicationService.saveDraft(req.user.id, req.body);
    ApiResponse.success(res, application, 'Application draft saved successfully');
  });

  submit = catchAsync(async (req, res) => {
    const application = await applicationService.submit(req.user.id);
    ApiResponse.success(res, application, 'Doctor application submitted successfully');
  });

  createUploadSignature = catchAsync(async (req, res) => {
    await applicationService.assertCanUpload(req.user.id);
    const signature = createDoctorApplicationUploadSignature(req.user.id, req.body);
    ApiResponse.success(res, signature, 'Upload authorized');
  });

  confirmUpload = catchAsync(async (req, res) => {
    await applicationService.assertCanUpload(req.user.id);
    const asset = await verifyDoctorApplicationUpload(req.user.id, req.body);
    ApiResponse.success(res, asset, 'Upload verified successfully');
  });

  getMyPrivateAsset = catchAsync(async (req, res) => {
    const asset = await applicationService.getPrivateAssetForUser(req.user.id, req.params.publicId);
    await streamDocument(res, asset);
  });

  listForAdmin = catchAsync(async (req, res) => {
    const result = await applicationService.listForAdmin(req.query);
    ApiResponse.success(res, result, 'Doctor applications retrieved successfully');
  });

  getForAdmin = catchAsync(async (req, res) => {
    const application = await applicationService.getForAdmin(req.params.id);
    ApiResponse.success(res, application, 'Doctor application retrieved successfully');
  });

  review = catchAsync(async (req, res) => {
    const application = await applicationService.review(req.params.id, req.user.id, req.body);
    ApiResponse.success(res, application, 'Application review saved successfully');
  });

  getAdminPrivateAsset = catchAsync(async (req, res) => {
    const asset = await applicationService.getPrivateAssetForAdmin(req.params.id, req.params.publicId);
    await streamDocument(res, asset);
  });
}