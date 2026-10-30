import Specialty from '../../models/Specialty.js';
import { ConflictError, NotFoundError } from '../../errors/AppError.js';

const makeSlug = (name) => name
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export class SpecialtyService {
  async listActive() {
    return Specialty.find({ isActive: true })
      .select('name slug description')
      .sort({ sortOrder: 1, name: 1 })
      .lean();
  }

  async listAll() {
    return Specialty.find()
      .sort({ sortOrder: 1, name: 1 })
      .lean();
  }

  async create(data, adminId) {
    try {
      return await Specialty.create({ ...data, slug: makeSlug(data.name), createdBy: adminId });
    } catch (error) {
      if (error?.code === 11000) throw new ConflictError('A specialty with that name already exists');
      throw error;
    }
  }

  async update(id, data) {
    const update = { ...data };
    if (update.name) update.slug = makeSlug(update.name);

    try {
      const specialty = await Specialty.findByIdAndUpdate(id, { $set: update }, {
        new: true,
        runValidators: true,
      });
      if (!specialty) throw new NotFoundError('Specialty not found');
      return specialty;
    } catch (error) {
      if (error?.code === 11000) throw new ConflictError('A specialty with that name already exists');
      throw error;
    }
  }
}