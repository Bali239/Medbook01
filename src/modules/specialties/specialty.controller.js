import { SpecialtyService } from './specialty.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const specialtyService = new SpecialtyService();

export class SpecialtyController {
  listActive = catchAsync(async (req, res) => {
    const specialties = await specialtyService.listActive();
    ApiResponse.success(res, specialties, 'Specialties retrieved successfully');
  });

  listAll = catchAsync(async (req, res) => {
    const specialties = await specialtyService.listAll();
    ApiResponse.success(res, specialties, 'Specialties retrieved successfully');
  });

  create = catchAsync(async (req, res) => {
    const specialty = await specialtyService.create(req.body, req.user.id);
    ApiResponse.success(res, specialty, 'Specialty created successfully', 201);
  });

  update = catchAsync(async (req, res) => {
    const specialty = await specialtyService.update(req.params.id, req.body);
    ApiResponse.success(res, specialty, 'Specialty updated successfully');
  });
}