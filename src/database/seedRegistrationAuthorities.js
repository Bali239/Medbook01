import RegistrationAuthority from '../models/RegistrationAuthority.js';

const defaultAuthorities = [
  'Pakistan Medical Commission (PMC)',
  'Pakistan Medical and Dental Council (PMDC)',
  'General Medical Council (GMC)',
  'Medical Council of India (MCI)',
  'Medical and Dental Council of Nigeria (MDCN)',
  'Saudi Commission for Health Specialties (SCFHS)',
  'Dubai Health Authority (DHA)',
  'Abu Dhabi Department of Health (DOH)',
  'Qatar Council for Healthcare Practitioners (QCHP)',
  'Other',
];

const slugify = (value) => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export const seedRegistrationAuthorities = async () => {
  if (RegistrationAuthority.db.readyState !== 1) return;

  await RegistrationAuthority.bulkWrite(defaultAuthorities.map((name, sortOrder) => ({
    updateOne: {
      filter: { slug: slugify(name) },
      update: {
        $setOnInsert: {
          name,
          slug: slugify(name),
          sortOrder,
          isActive: true,
        },
      },
      upsert: true,
    },
  })));

  console.log(`Default registration authorities available: ${defaultAuthorities.length}`);
};
