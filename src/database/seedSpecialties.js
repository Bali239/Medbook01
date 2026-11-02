import Specialty from '../models/Specialty.js';

const defaultSpecialties = [
  ['Cardiology', 'Heart and cardiovascular care'],
  ['Dermatology', 'Skin, hair, and nail care'],
  ['Endocrinology', 'Hormone and metabolic disorders'],
  ['Gastroenterology', 'Digestive system care'],
  ['General Medicine', 'Primary adult medical care'],
  ['General Surgery', 'Surgical diagnosis and treatment'],
  ['Gynecology', 'Women’s reproductive health'],
  ['Internal Medicine', 'Adult disease prevention and treatment'],
  ['Nephrology', 'Kidney and renal care'],
  ['Neurology', 'Brain, nerve, and spinal care'],
  ['Obstetrics', 'Pregnancy and childbirth care'],
  ['Oncology', 'Cancer diagnosis and treatment'],
  ['Ophthalmology', 'Eye and vision care'],
  ['Orthopedics', 'Bone, joint, and muscle care'],
  ['Otolaryngology', 'Ear, nose, and throat care'],
  ['Pediatrics', 'Medical care for children'],
  ['Psychiatry', 'Mental health and behavioral care'],
  ['Pulmonology', 'Lung and respiratory care'],
  ['Radiology', 'Medical imaging and diagnosis'],
  ['Urology', 'Urinary tract and male reproductive care'],
];

const slugify = (value) => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export const seedSpecialties = async () => {
  if (Specialty.db.readyState !== 1) return;

  await Specialty.bulkWrite(defaultSpecialties.map(([name, description], sortOrder) => ({
    updateOne: {
      filter: { slug: slugify(name) },
      update: {
        $setOnInsert: {
          name,
          slug: slugify(name),
          description,
          sortOrder,
          isActive: true,
        },
      },
      upsert: true,
    },
  })));

  console.log(`Default medical specialties available: ${defaultSpecialties.length}`);
};
